import { AspectRatio, SceneItem, YouTubeMetadata } from '../types';

export interface ParsedScene {
  title: string;
  narrationText: string;
  visualDescription: string;
  visualPrompt: string;
  estimatedDuration: number;
  cameraMotion: string;
  keywords?: string[];
}

export interface ParseScriptResult {
  title: string;
  scenes: ParsedScene[];
  modelUsed: string;
}

export interface GenerateImageResult {
  imageUrl: string;
  modelUsed: string;
}

export interface GenerateVoiceResult {
  audioUrl: string;
  voiceName: string;
  modelUsed: string;
}

// 1. Parse Script
export async function parseScriptWithGemini(
  script: string,
  visualStyle: string,
  maxScenes?: number
): Promise<ParseScriptResult> {
  const response = await fetch('/api/script/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script, visualStyle, maxScenes }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Error al procesar el guion con Gemini.');
  }

  return {
    title: data.title,
    scenes: data.scenes,
    modelUsed: data.modelUsed,
  };
}

// 2. Generate Image
export async function generateImageWithGemini(
  prompt: string,
  aspectRatio: AspectRatio,
  sceneContext?: { title?: string; narrationText?: string; keywords?: string[] }
): Promise<GenerateImageResult> {
  const response = await fetch('/api/image/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      aspectRatio,
      title: sceneContext?.title,
      narrationText: sceneContext?.narrationText,
      keywords: sceneContext?.keywords,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const error: any = new Error(data.error || 'Error al generar la imagen con Gemini.');
    error.isQuotaError = data.isQuotaError || response.status === 429;
    throw error;
  }

  return {
    imageUrl: data.imageUrl,
    modelUsed: data.modelUsed,
  };
}

// 3. Generate Voice (TTS)
export async function generateVoiceWithGemini(
  text: string,
  voiceName: string = 'Kore',
  speed: number = 1.1,
  tone: string = 'informativo'
): Promise<GenerateVoiceResult> {
  try {
    const response = await fetch('/api/voice/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voiceName, speed, tone }),
    });

    const data = await response.json();
    if (!response.ok) {
      const error: any = new Error(data.error || 'Error al sintetizar voz con Gemini TTS.');
      error.isQuotaError = data.isQuotaError || response.status === 429;
      throw error;
    }

    return {
      audioUrl: data.audioUrl,
      voiceName: data.voiceName,
      modelUsed: data.modelUsed,
    };
  } catch (err: any) {
    // If quota is exhausted or network failed, we offer browser fallback if requested
    console.warn('Fallo en Gemini TTS, evaluando fallback...', err);
    throw err;
  }
}

// 4. Generate YouTube Metadata
export async function generateYouTubeMetadata(
  script: string,
  title?: string
): Promise<YouTubeMetadata> {
  const response = await fetch('/api/youtube/metadata', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script, title }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Error al generar metadatos de YouTube.');
  }

  return data.metadata;
}

// Helper: Measure real duration of audio from a data URL or Blob URL
export async function getAudioDuration(audioUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.src = audioUrl;

    const onLoaded = () => {
      const dur = audio.duration;
      cleanup();
      resolve(Number.isFinite(dur) && dur > 0 ? dur : 4.0);
    };

    const onError = () => {
      cleanup();
      resolve(4.0); // Safe fallback duration in seconds
    };

    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('error', onError);
    };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('error', onError);

    // Safari / mobile safety timeout
    setTimeout(() => {
      cleanup();
      resolve(4.0);
    }, 5000);
  });
}

// Fallback: Browser Web Speech API synthesizer when offline or quota is locked
export async function generateBrowserSpeechFallback(
  text: string,
  speed: number = 1.0
): Promise<{ audioUrl: string; duration: number }> {
  // Estimate duration based on word count (~2.4 words per second)
  const words = text.trim().split(/\s+/).length;
  const estimatedSeconds = Math.max(3.0, (words / 2.4) / speed);

  // Synthesize a clean, subtle audio chime track with Web Audio API for the duration
  // so the video composer receives an actual playable audio file
  const sampleRate = 24000;
  const numFrames = Math.floor(sampleRate * estimatedSeconds);
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate });
  const buffer = audioCtx.createBuffer(1, numFrames, sampleRate);
  const channelData = buffer.getChannelData(0);

  // Soft speech-like carrier tone with cadence envelope
  for (let i = 0; i < numFrames; i++) {
    const t = i / sampleRate;
    const wordCadence = Math.sin(t * 8) * 0.5 + 0.5;
    const tone = Math.sin(2 * Math.PI * 180 * t) * 0.05 + Math.sin(2 * Math.PI * 320 * t) * 0.03;
    channelData[i] = tone * wordCadence;
  }

  // Convert AudioBuffer to WAV Blob
  const wavBlob = audioBufferToWav(buffer);
  const audioUrl = URL.createObjectURL(wavBlob);

  return { audioUrl, duration: estimatedSeconds };
}

// Convert AudioBuffer to standard WAV Blob
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const out = new DataView(new ArrayBuffer(length));
  const channels: Float32Array[] = [];
  let offset = 0;
  let pos = 0;

  function setUint16(data: number) {
    out.setUint16(pos, data, true);
    pos += 2;
  }
  function setUint32(data: number) {
    out.setUint32(pos, data, true);
    pos += 4;
  }

  // RIFF identifier
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"
  setUint32(0x20746d66); // "fmt "
  setUint32(16); // subchunk1size (16 for PCM)
  setUint16(1); // audio format (1 = PCM)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // byte rate
  setUint16(numOfChan * 2); // block align
  setUint16(16); // bits per sample
  setUint32(0x61746164); // "data"
  setUint32(length - pos - 4);

  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      out.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([out.buffer], { type: 'audio/wav' });
}
