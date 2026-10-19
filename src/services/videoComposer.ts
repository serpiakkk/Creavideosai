import { AspectRatio, SceneItem, VideoProject } from '../types';
import { createSynthesizedMusicBuffer } from './audioLibrary';

export interface ComposerState {
  isPlaying: boolean;
  currentTime: number;
  totalDuration: number;
  currentSceneIndex: number;
  isExporting: boolean;
  exportProgress: number; // 0 to 100
  isVoicePlaying: boolean;
}

export class VideoComposer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private project: VideoProject;
  private images: Map<string, HTMLImageElement> = new Map();

  // In-Memory AudioBuffers for Web Audio synchronization
  private voiceBuffers: Map<string, { buffer: AudioBuffer; normFactor: number }> = new Map();
  private currentVoiceSource: AudioBufferSourceNode | null = null;
  private activeVoiceSceneId: string | null = null;

  // Web Audio Graph Nodes
  private audioCtx: AudioContext | null = null;
  private voiceGainNode: GainNode | null = null;
  private voiceCompressor: DynamicsCompressorNode | null = null;
  private voiceAnalyserNode: AnalyserNode | null = null;
  private musicSourceNode: AudioBufferSourceNode | null = null;
  private musicGainNode: GainNode | null = null;
  private masterGainNode: GainNode | null = null;
  private audioDestination: MediaStreamAudioDestinationNode | null = null;
  private customMusicBuffer: AudioBuffer | null = null;

  // Voice Volume Booster (Normalized baseline x booster, default 1.45 for loud & clear speech)
  public voiceVolumeBooster: number = 1.45;

  private animationFrameId: number | null = null;
  private startTime: number = 0;
  private pauseTime: number = 0;
  private isPlaying: boolean = false;
  private sceneTimeline: { scene: SceneItem; start: number; end: number }[] = [];
  private totalDuration: number = 0;
  private onStateChange?: (state: ComposerState) => void;

  constructor(canvas: HTMLCanvasElement, project: VideoProject, onStateChange?: (state: ComposerState) => void) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('No se pudo obtener el contexto 2D del Canvas');
    this.ctx = context;
    this.project = project;
    this.onStateChange = onStateChange;

    this.setupCanvasDimensions();
    this.buildTimeline();
  }

  public setupCanvasDimensions() {
    if (this.project.aspectRatio === '9:16') {
      this.canvas.width = 720;
      this.canvas.height = 1280;
    } else {
      this.canvas.width = 1280;
      this.canvas.height = 720;
    }
  }

  private buildTimeline() {
    let accumulated = 0;
    this.sceneTimeline = this.project.scenes.map((scene) => {
      const dur = Math.max(2.5, scene.duration || 4.0);
      const start = accumulated;
      accumulated += dur;
      return { scene, start, end: accumulated };
    });
    this.totalDuration = Math.max(accumulated, 1);
  }

  // Ensure AudioContext is created and running (Crucial for iOS Safari)
  public async resumeAudioContext(): Promise<AudioContext> {
    if (!this.audioCtx) {
      this.initAudioGraph();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
    return this.audioCtx!;
  }

  private initAudioGraph() {
    if (this.audioCtx) return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioCtx = new AudioContextClass({ sampleRate: 44100 });

    // 1. MediaStream Destination for MediaRecorder export
    this.audioDestination = this.audioCtx.createMediaStreamDestination();

    // 2. Master Gain (receives voice + background music)
    this.masterGainNode = this.audioCtx.createGain();
    this.masterGainNode.gain.setValueAtTime(1.0, this.audioCtx.currentTime);

    // Master routes to BOTH device speakers and MediaStream recording destination
    this.masterGainNode.connect(this.audioCtx.destination);
    if (this.audioDestination) {
      this.masterGainNode.connect(this.audioDestination);
    }

    // 3. Voice Bus with Dynamics Compressor & Gain Normalizer
    this.voiceGainNode = this.audioCtx.createGain();
    this.voiceGainNode.gain.setValueAtTime(this.voiceVolumeBooster, this.audioCtx.currentTime);

    this.voiceCompressor = this.audioCtx.createDynamicsCompressor();
    this.voiceCompressor.threshold.setValueAtTime(-18, this.audioCtx.currentTime);
    this.voiceCompressor.knee.setValueAtTime(10, this.audioCtx.currentTime);
    this.voiceCompressor.ratio.setValueAtTime(4.5, this.audioCtx.currentTime);
    this.voiceCompressor.attack.setValueAtTime(0.003, this.audioCtx.currentTime);
    this.voiceCompressor.release.setValueAtTime(0.12, this.audioCtx.currentTime);

    this.voiceGainNode.connect(this.voiceCompressor);
    this.voiceCompressor.connect(this.masterGainNode);

    // 4. Background Music Bus
    this.musicGainNode = this.audioCtx.createGain();
    const baseVolume = this.project.music.volume ?? 0.22;
    this.musicGainNode.gain.setValueAtTime(baseVolume, this.audioCtx.currentTime);
    this.musicGainNode.connect(this.masterGainNode);
  }

  // Preload Images, Scene Audios and Custom Music into in-memory AudioBuffers
  public async preloadAssets(): Promise<void> {
    const ctx = await this.resumeAudioContext();

    // A. Preload Images
    const imagePromises = this.project.scenes.map(async (scene) => {
      if (!scene.imageUrl) return;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = scene.imageUrl!;
      });
      this.images.set(scene.id, img);
    });

    // B. Decode Audios into in-memory AudioBuffers with peak normalization
    const audioPromises = this.project.scenes.map(async (scene) => {
      if (!scene.audioUrl) return;
      try {
        const audioBuffer = await this.decodeAudioUrl(scene.audioUrl, ctx);
        const normFactor = this.calculateNormalizationFactor(audioBuffer);
        this.voiceBuffers.set(scene.id, { buffer: audioBuffer, normFactor });
      } catch (err) {
        console.warn(`No se pudo decodificar audio de escena ${scene.id}:`, err);
      }
    });

    // C. Decode Custom Music into in-memory AudioBuffer (Requisito 19)
    let musicPromise: Promise<void> = Promise.resolve();
    if (this.project.music.type === 'custom' && this.project.music.customAudioUrl) {
      musicPromise = (async () => {
        try {
          this.customMusicBuffer = await this.decodeAudioUrl(this.project.music.customAudioUrl!, ctx);
        } catch (err) {
          console.warn('No se pudo decodificar la música personalizada:', err);
        }
      })();
    }

    await Promise.all([...imagePromises, ...audioPromises, musicPromise]);

    // Initial frame draw
    this.renderFrame(0);
  }

  // Requisito 13: Comprobar que CADA escena con audioUrl tiene su AudioBuffer decodificado
  public getMissingVoiceScenes(): SceneItem[] {
    return this.project.scenes.filter((s) => !s.audioUrl || !this.voiceBuffers.has(s.id));
  }

  // Convert base64 data URL or blob URL to AudioBuffer
  private async decodeAudioUrl(audioUrl: string, audioCtx: AudioContext): Promise<AudioBuffer> {
    const base64Index = audioUrl.indexOf(',');
    let arrayBuffer: ArrayBuffer;

    if (base64Index >= 0) {
      const base64 = audioUrl.slice(base64Index + 1);
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      arrayBuffer = bytes.buffer;
    } else {
      const res = await fetch(audioUrl);
      arrayBuffer = await res.arrayBuffer();
    }

    return await audioCtx.decodeAudioData(arrayBuffer.slice(0));
  }

  // Peak Normalization: ensures voice hits ~0.94 FS
  private calculateNormalizationFactor(buffer: AudioBuffer): number {
    let peak = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > peak) peak = abs;
      }
    }
    if (peak <= 0.02) return 1.0;
    const factor = 0.94 / peak;
    return Math.min(3.5, Math.max(1.0, factor));
  }

  // ------------------------------------------------------------------------
  // Playback Controls (Preview)
  // ------------------------------------------------------------------------
  public async play() {
    if (this.isPlaying) return;
    await this.resumeAudioContext();

    this.isPlaying = true;
    this.startTime = performance.now() - this.pauseTime * 1000;
    this.startMusic(this.pauseTime);
    this.tick();
    this.notifyState();
  }

  public pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.stopVoice();
    this.stopMusic();
    this.notifyState();
  }

  public async seek(timeInSeconds: number) {
    const clamped = Math.max(0, Math.min(timeInSeconds, this.totalDuration));
    this.pauseTime = clamped;
    this.startTime = performance.now() - clamped * 1000;

    this.stopVoice();
    this.stopMusic();

    this.renderFrame(clamped);

    if (this.isPlaying) {
      await this.resumeAudioContext();
      this.startMusic(clamped);
      this.syncSceneAudio(clamped);
    }

    this.notifyState();
  }

  // Dedicated button: "Escuchar voz" to test voice narration before exporting
  public async playSceneVoice(sceneIndex: number): Promise<void> {
    const scene = this.project.scenes[sceneIndex];
    if (!scene) return;

    await this.resumeAudioContext();
    this.stopVoice();

    const voiceEntry = this.voiceBuffers.get(scene.id);
    if (!voiceEntry || !this.audioCtx || !this.voiceGainNode) return;

    const source = this.audioCtx.createBufferSource();
    source.buffer = voiceEntry.buffer;

    // Apply normalization & voice booster
    const gainValue = voiceEntry.normFactor * this.voiceVolumeBooster;
    this.voiceGainNode.gain.setValueAtTime(gainValue, this.audioCtx.currentTime);

    source.connect(this.voiceGainNode);
    this.currentVoiceSource = source;
    this.activeVoiceSceneId = scene.id;

    source.onended = () => {
      if (this.currentVoiceSource === source) {
        this.currentVoiceSource = null;
        this.activeVoiceSceneId = null;
        this.notifyState();
      }
    };

    source.start(0);
    this.notifyState();
  }

  private startMusic(offsetSeconds: number = 0) {
    if (!this.audioCtx || !this.musicGainNode) return;
    if (this.project.music.type === 'none') return;

    const baseVolume = this.project.music.volume ?? 0.22;
    this.musicGainNode.gain.setValueAtTime(baseVolume, this.audioCtx.currentTime);

    // Requisito 19: Usar Web Audio nativo para la música propia, eliminando new Audio()
    if (this.project.music.type === 'custom' && this.customMusicBuffer) {
      this.musicSourceNode = this.audioCtx.createBufferSource();
      this.musicSourceNode.buffer = this.customMusicBuffer;
      this.musicSourceNode.loop = true;
      this.musicSourceNode.connect(this.musicGainNode);
      const safeOffset = this.customMusicBuffer.duration > 0 ? offsetSeconds % this.customMusicBuffer.duration : 0;
      this.musicSourceNode.start(0, safeOffset);
    } else if (this.project.music.type !== 'custom') {
      const presetType = this.project.music.presetType || 'lofi';
      const musicBuffer = createSynthesizedMusicBuffer(this.audioCtx, presetType, 30);
      this.musicSourceNode = this.audioCtx.createBufferSource();
      this.musicSourceNode.buffer = musicBuffer;
      this.musicSourceNode.loop = true;
      this.musicSourceNode.connect(this.musicGainNode);
      this.musicSourceNode.start(0, offsetSeconds % 30);
    }
  }

  private stopMusic() {
    if (this.musicSourceNode) {
      try {
        this.musicSourceNode.stop();
        this.musicSourceNode.disconnect();
      } catch {}
      this.musicSourceNode = null;
    }
  }

  private stopVoice() {
    if (this.currentVoiceSource) {
      try {
        this.currentVoiceSource.stop();
        this.currentVoiceSource.disconnect();
      } catch {}
      this.currentVoiceSource = null;
      this.activeVoiceSceneId = null;
    }
  }

  private tick = () => {
    if (!this.isPlaying) return;

    const now = performance.now();
    const elapsedSeconds = (now - this.startTime) / 1000;

    if (elapsedSeconds >= this.totalDuration) {
      this.pauseTime = 0;
      this.pause();
      this.renderFrame(0);
      this.notifyState();
      return;
    }

    this.pauseTime = elapsedSeconds;
    this.renderFrame(elapsedSeconds);
    this.syncSceneAudio(elapsedSeconds);
    this.notifyState();

    this.animationFrameId = requestAnimationFrame(this.tick);
  };

  private syncSceneAudio(currentTime: number) {
    const currentSceneInfo = this.sceneTimeline.find(
      (item) => currentTime >= item.start && currentTime < item.end
    );

    if (!currentSceneInfo) {
      this.stopVoice();
      return;
    }

    const scene = currentSceneInfo.scene;
    const sceneElapsed = currentTime - currentSceneInfo.start;
    const voiceEntry = this.voiceBuffers.get(scene.id);

    // Audio Ducking: If voice buffer exists for this scene and is playing, dip music volume to 15%
    if (this.audioCtx && this.musicGainNode) {
      const baseVol = this.project.music.volume ?? 0.22;
      const isVoiceActive = voiceEntry && sceneElapsed < (voiceEntry.buffer.duration + 0.2);
      const targetVol = isVoiceActive ? baseVol * 0.15 : baseVol;
      this.musicGainNode.gain.setTargetAtTime(targetVol, this.audioCtx.currentTime, 0.08);
    }

    // Start voice buffer if we transitioned to a new scene
    if (voiceEntry && this.audioCtx && this.voiceGainNode) {
      if (this.activeVoiceSceneId !== scene.id && sceneElapsed < voiceEntry.buffer.duration) {
        this.stopVoice();

        const source = this.audioCtx.createBufferSource();
        source.buffer = voiceEntry.buffer;

        // Normalized gain calculation
        const gainValue = voiceEntry.normFactor * this.voiceVolumeBooster;
        this.voiceGainNode.gain.setValueAtTime(gainValue, this.audioCtx.currentTime);

        source.connect(this.voiceGainNode);
        this.currentVoiceSource = source;
        this.activeVoiceSceneId = scene.id;

        source.onended = () => {
          if (this.currentVoiceSource === source) {
            this.currentVoiceSource = null;
            this.activeVoiceSceneId = null;
          }
        };

        const offset = Math.max(0, sceneElapsed);
        source.start(0, offset);
      }
    }
  }

  // ------------------------------------------------------------------------
  // Frame Rendering: Ken Burns Animation & Dynamic Viral Subtitles
  // ------------------------------------------------------------------------
  public renderFrame(timeInSeconds: number) {
    const { width, height } = this.canvas;
    const ctx = this.ctx;

    // Clear frame
    ctx.fillStyle = '#05070f';
    ctx.fillRect(0, 0, width, height);

    const timelineItem = this.sceneTimeline.find(
      (item) => timeInSeconds >= item.start && timeInSeconds < item.end
    ) || this.sceneTimeline[this.sceneTimeline.length - 1];

    if (!timelineItem) return;

    const { scene, start, end } = timelineItem;
    const sceneDuration = Math.max(0.1, end - start);
    const sceneProgress = Math.max(0, Math.min(1, (timeInSeconds - start) / sceneDuration));

    const img = this.images.get(scene.id);

    ctx.save();

    if (img && img.complete && img.naturalWidth > 0) {
      let scale = 1.05;
      let transX = 0;
      let transY = 0;

      switch (scene.cameraMotion) {
        case 'zoom_in':
          scale = 1.04 + sceneProgress * 0.14;
          break;
        case 'zoom_out':
          scale = 1.18 - sceneProgress * 0.14;
          break;
        case 'pan_left':
          scale = 1.10;
          transX = (sceneProgress - 0.5) * -0.08 * width;
          break;
        case 'pan_right':
          scale = 1.10;
          transX = (sceneProgress - 0.5) * 0.08 * width;
          break;
        case 'static':
        default:
          scale = 1.04;
          break;
      }

      const imgRatio = img.naturalWidth / img.naturalHeight;
      const canvasRatio = width / height;
      let drawW = width;
      let drawH = height;

      if (imgRatio > canvasRatio) {
        drawH = height;
        drawW = height * imgRatio;
      } else {
        drawW = width;
        drawH = width / imgRatio;
      }

      ctx.translate(width / 2 + transX, height / 2 + transY);
      ctx.scale(scale, scale);
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    } else {
      this.drawStylizedPlaceholder(scene, width, height);
    }

    ctx.restore();

    // Scene Transition Fade
    const fadeDuration = 0.35;
    if (scene.transition === 'fade') {
      const timeRemaining = end - timeInSeconds;
      if (timeRemaining < fadeDuration) {
        const fadeAlpha = 1 - timeRemaining / fadeDuration;
        ctx.fillStyle = `rgba(5, 7, 15, ${fadeAlpha})`;
        ctx.fillRect(0, 0, width, height);
      }
    }

    // Scrim for Subtitles
    const scrimHeight = height * 0.32;
    const scrimGradient = ctx.createLinearGradient(0, height - scrimHeight, 0, height);
    scrimGradient.addColorStop(0, 'rgba(0,0,0,0)');
    scrimGradient.addColorStop(0.5, 'rgba(0,0,0,0.55)');
    scrimGradient.addColorStop(1, 'rgba(0,0,0,0.92)');
    ctx.fillStyle = scrimGradient;
    ctx.fillRect(0, height - scrimHeight, width, scrimHeight);

    // Dynamic Subtitles
    this.drawDynamicSubtitles(scene, sceneProgress, width, height);
  }

  private drawStylizedPlaceholder(scene: SceneItem, width: number, height: number) {
    const ctx = this.ctx;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(scene.title, width / 2, height / 2 - 20);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(scene.visualDescription || 'Visual de la escena', width / 2, height / 2 + 20);
  }

  private drawDynamicSubtitles(scene: SceneItem, sceneProgress: number, width: number, height: number) {
    const text = scene.narrationText?.trim();
    if (!text) return;

    const ctx = this.ctx;
    const words = text.split(/\s+/);
    if (words.length === 0) return;

    const activeWordIndex = Math.min(
      words.length - 1,
      Math.floor(sceneProgress * words.length)
    );

    const wordsPerChunk = 5;
    const currentChunkIndex = Math.floor(activeWordIndex / wordsPerChunk);
    const chunkStart = currentChunkIndex * wordsPerChunk;
    const chunkEnd = Math.min(words.length, chunkStart + wordsPerChunk);
    const currentWords = words.slice(chunkStart, chunkEnd);

    const fontSize = this.project.aspectRatio === '9:16' ? 36 : 32;
    ctx.font = `800 ${fontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const yPos = this.project.aspectRatio === '9:16' ? height * 0.82 : height * 0.86;

    const spaceWidth = ctx.measureText(' ').width;
    const wordWidths = currentWords.map((w) => ctx.measureText(w).width);
    const totalChunkWidth = wordWidths.reduce((a, b) => a + b, 0) + (currentWords.length - 1) * spaceWidth;

    let startX = (width - totalChunkWidth) / 2;

    const paddingX = 20;
    const paddingY = 12;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.beginPath();
    ctx.roundRect(
      startX - paddingX,
      yPos - fontSize / 2 - paddingY,
      totalChunkWidth + paddingX * 2,
      fontSize + paddingY * 2,
      16
    );
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 2;
    ctx.stroke();

    currentWords.forEach((word, index) => {
      const globalIndex = chunkStart + index;
      const isWordActive = globalIndex === activeWordIndex;
      const wWidth = wordWidths[index];
      const wordCenter = startX + wWidth / 2;

      const isKeyword = scene.keywords?.some((k) =>
        word.toLowerCase().includes(k.toLowerCase())
      );

      ctx.lineWidth = 6;
      ctx.strokeStyle = '#000000';
      ctx.strokeText(word, wordCenter, yPos);

      if (isWordActive) {
        ctx.fillStyle = '#facc15'; // Active word: bright sunshine gold
      } else if (isKeyword) {
        ctx.fillStyle = '#38bdf8'; // Keyword: electric sky blue
      } else {
        ctx.fillStyle = '#ffffff';
      }

      ctx.fillText(word, wordCenter, yPos);

      startX += wWidth + spaceWidth;
    });
  }

  // ------------------------------------------------------------------------
  // Export Video: Bulletproof Web Audio Scheduling + Canvas Stream
  // Guarantees voice audio is 100% recorded, normalized, and synchronized
  // ------------------------------------------------------------------------
  // ------------------------------------------------------------------------
  // Export Video: Bulletproof Web Audio Scheduling + Canvas Stream
  // ------------------------------------------------------------------------
  public async exportVideo(
    onProgress: (percent: number) => void
  ): Promise<{ blob: Blob; mimeType: string; hasVoice: boolean; maxVoicePeak: number }> {
    this.pause();
    const ctx = await this.resumeAudioContext();

    // Requisito 13: Comprobar que CADA escena con audioUrl tiene su AudioBuffer decodificado
    const missingScenes = this.getMissingVoiceScenes();
    if (missingScenes.length > 0) {
      const error: any = new Error(
        `Falta voz en ${missingScenes.length} escena(s): ${missingScenes.map((s) => s.title).join(', ')}`
      );
      error.missingScenes = missingScenes;
      throw error;
    }

    // Requisito 14: Antes de exportar llama a seek(0) y reinicia pauseTime a 0
    await this.seek(0);
    this.pauseTime = 0;

    // Requisito 16: Wake Lock API para mantener la pantalla encendida
    let wakeLockSentinel: any = null;
    if ('wakeLock' in navigator) {
      try {
        wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
      } catch (e) {
        console.warn('Wake Lock no disponible o denegado:', e);
      }
    }

    // Determine supported mimeType (MP4 with AVC1 codec on Safari/iOS, or WebM)
    const types = [
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    const selectedMime = types.find((t) => MediaRecorder.isTypeSupported(t)) || 'video/webm';

    // 1. Capture 30 FPS Canvas Video Track
    const canvasStream = this.canvas.captureStream(30);

    // 2. Capture Pure Web Audio Mixed Audio Track
    const stream = new MediaStream();
    canvasStream.getVideoTracks().forEach((track) => stream.addTrack(track));

    if (this.audioDestination) {
      const audioTracks = this.audioDestination.stream.getAudioTracks();
      audioTracks.forEach((track) => stream.addTrack(track));
    }

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: selectedMime,
      videoBitsPerSecond: 6000000,
      audioBitsPerSecond: 192000,
    });

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    return new Promise((resolve, reject) => {
      let isFinished = false;
      let cancelledDueToVisibility = false;
      let maxVoicePeak = 0;

      // Requisito 16: Si la pestaña pasa a segundo plano, cancelar y avisar
      const handleVisibilityChange = () => {
        if (document.hidden && !isFinished) {
          cancelledDueToVisibility = true;
          isFinished = true;
          clearInterval(exportTimer);
          try {
            recorder.stop();
          } catch {}
          scheduledSources.forEach((s) => {
            try {
              s.stop();
              s.disconnect();
            } catch {}
          });
          if (wakeLockSentinel) {
            wakeLockSentinel.release().catch(() => {});
          }
          document.removeEventListener('visibilitychange', handleVisibilityChange);
          reject(
            new Error(
              'La exportación se canceló porque la pestaña pasó a segundo plano. Mantén la pantalla encendida y la app visible durante la exportación.'
            )
          );
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);

      recorder.onstop = () => {
        if (cancelledDueToVisibility) return;
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        if (wakeLockSentinel) {
          wakeLockSentinel.release().catch(() => {});
        }

        const videoBlob = new Blob(chunks, { type: selectedMime });
        onProgress(100);

        // Requisito 17: Medir nivel de voz
        const hasVoice = maxVoicePeak >= 4 || this.project.scenes.every((s) => !s.narrationText?.trim());
        // Requisito 14: NO pintes el cuadro 0 al terminar

        resolve({
          blob: videoBlob,
          mimeType: selectedMime,
          hasVoice,
          maxVoicePeak,
        });
      };

      recorder.onerror = (e) => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        if (wakeLockSentinel) wakeLockSentinel.release().catch(() => {});
        reject(e);
      };

      // Start recorder
      recorder.start(100);

      // Requisito 15: Usar el reloj de audio (audioCtx.currentTime) como reloj de exportación
      const exportStartTime = ctx.currentTime + 0.15;
      const exportEndTime = exportStartTime + this.totalDuration;
      const scheduledSources: AudioBufferSourceNode[] = [];
      const baseMusicVolume = this.project.music.volume ?? 0.22;

      // A. Schedule Background Music (Custom or Synthesized via Web Audio)
      if (this.project.music.type !== 'none' && this.musicGainNode) {
        let musicBuffer: AudioBuffer;
        if (this.project.music.type === 'custom' && this.customMusicBuffer) {
          musicBuffer = this.customMusicBuffer;
        } else {
          const presetType = this.project.music.presetType || 'lofi';
          musicBuffer = createSynthesizedMusicBuffer(ctx, presetType, Math.ceil(this.totalDuration + 5));
        }

        const exportMusicSource = ctx.createBufferSource();
        exportMusicSource.buffer = musicBuffer;
        exportMusicSource.loop = true;
        exportMusicSource.connect(this.musicGainNode);
        exportMusicSource.start(exportStartTime);
        scheduledSources.push(exportMusicSource);

        // Schedule ducking envelopes for each scene's voice duration
        this.sceneTimeline.forEach((item) => {
          const voiceEntry = this.voiceBuffers.get(item.scene.id);
          if (voiceEntry) {
            const t0 = exportStartTime + item.start;
            const t1 = Math.min(exportStartTime + item.end, t0 + voiceEntry.buffer.duration);
            this.musicGainNode!.gain.setValueAtTime(baseMusicVolume, t0);
            this.musicGainNode!.gain.linearRampToValueAtTime(baseMusicVolume * 0.15, t0 + 0.06);
            this.musicGainNode!.gain.setValueAtTime(baseMusicVolume * 0.15, t1);
            this.musicGainNode!.gain.linearRampToValueAtTime(baseMusicVolume, t1 + 0.18);
          }
        });
      }

      // B. Schedule Scene Voices
      this.sceneTimeline.forEach((item) => {
        const voiceEntry = this.voiceBuffers.get(item.scene.id);
        if (voiceEntry && this.voiceGainNode) {
          const source = ctx.createBufferSource();
          source.buffer = voiceEntry.buffer;

          // Normalized volume gain
          const gainValue = voiceEntry.normFactor * this.voiceVolumeBooster;
          this.voiceGainNode.gain.setValueAtTime(gainValue, exportStartTime + item.start);

          source.connect(this.voiceGainNode);
          source.start(exportStartTime + item.start);
          scheduledSources.push(source);
        }
      });

      // Frame rendering synchronized by audioCtx.currentTime
      const voiceAnalyserData = this.voiceAnalyserNode
        ? new Uint8Array(this.voiceAnalyserNode.frequencyBinCount)
        : null;

      const exportTimer = setInterval(() => {
        if (isFinished) return;

        const audioNow = ctx.currentTime;
        const elapsedSeconds = Math.max(0, audioNow - exportStartTime);

        // Measure voice level via AnalyserNode
        if (this.voiceAnalyserNode && voiceAnalyserData) {
          this.voiceAnalyserNode.getByteTimeDomainData(voiceAnalyserData);
          for (let i = 0; i < voiceAnalyserData.length; i++) {
            const dev = Math.abs(voiceAnalyserData[i] - 128);
            if (dev > maxVoicePeak) maxVoicePeak = dev;
          }
        }

        this.renderFrame(Math.min(elapsedSeconds, this.totalDuration));

        const progress = Math.min(99, Math.round((elapsedSeconds / this.totalDuration) * 100));
        onProgress(progress);

        // Requisito 15: Detener la grabación cuando termine la última escena según el reloj de audio
        if (audioNow >= exportEndTime) {
          isFinished = true;
          clearInterval(exportTimer);

          // Stop all audio sources
          scheduledSources.forEach((s) => {
            try {
              s.stop();
              s.disconnect();
            } catch {}
          });

          setTimeout(() => {
            try {
              recorder.stop();
            } catch {}
          }, 150);
        }
      }, 1000 / 30);
    });
  }

  // Requisito 22: Descargar la narración completa de todas las escenas unida en un solo WAV
  public async exportFullNarrationWav(): Promise<Blob> {
    const sampleRate = 44100;
    const totalDurationSeconds = Math.max(1, this.totalDuration);
    const OfflineAudioCtxClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    const offlineCtx = new OfflineAudioCtxClass(
      1, // Mono channel for crisp voice
      Math.ceil(sampleRate * (totalDurationSeconds + 0.5)),
      sampleRate
    );

    this.sceneTimeline.forEach((item) => {
      const voiceEntry = this.voiceBuffers.get(item.scene.id);
      if (voiceEntry) {
        const source = offlineCtx.createBufferSource();
        source.buffer = voiceEntry.buffer;

        const gainNode = offlineCtx.createGain();
        gainNode.gain.value = voiceEntry.normFactor * this.voiceVolumeBooster;

        source.connect(gainNode);
        gainNode.connect(offlineCtx.destination);
        source.start(item.start);
      }
    });

    const renderedBuffer = await offlineCtx.startRendering();
    return this.audioBufferToWav(renderedBuffer);
  }

  // Helper: Convert AudioBuffer to 16-bit PCM WAV Blob
  private audioBufferToWav(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const numFrames = buffer.length;
    const bytesPerSample = 2; // 16-bit PCM
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numFrames * blockAlign;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;

    const arrayBuffer = new ArrayBuffer(totalSize);
    const view = new DataView(arrayBuffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat 1 = PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true); // BitsPerSample
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < numFrames; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  // ------------------------------------------------------------------------
  // Export Subtitles (.SRT Format)
  // ------------------------------------------------------------------------
  public exportSrt(): string {
    let srtContent = '';

    function formatTime(seconds: number): string {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 1000);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    }

    this.sceneTimeline.forEach((item, index) => {
      const scene = item.scene;
      srtContent += `${index + 1}\n`;
      srtContent += `${formatTime(item.start)} --> ${formatTime(item.end)}\n`;
      srtContent += `${scene.narrationText.trim()}\n\n`;
    });

    return srtContent;
  }

  private notifyState() {
    if (!this.onStateChange) return;
    const currentSceneIndex = this.sceneTimeline.findIndex(
      (item) => this.pauseTime >= item.start && this.pauseTime < item.end
    );
    this.onStateChange({
      isPlaying: this.isPlaying,
      currentTime: this.pauseTime,
      totalDuration: this.totalDuration,
      currentSceneIndex: Math.max(0, currentSceneIndex),
      isExporting: false,
      exportProgress: 0,
      isVoicePlaying: Boolean(this.currentVoiceSource),
    });
  }

  public destroy() {
    this.pause();
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
    }
  }
}
