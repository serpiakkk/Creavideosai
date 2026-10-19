import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  Download,
  Share2,
  FileText,
  Music,
  ImageIcon,
  Sparkles,
  Check,
  Copy,
  Film,
  X,
  Volume2,
  Sliders,
  CheckCircle2
} from 'lucide-react';
import JSZip from 'jszip';
import { VideoProject, YouTubeMetadata } from '../types';
import { VideoComposer } from '../services/videoComposer';
import { generateYouTubeMetadata } from '../services/geminiService';
import { useToast } from '../components/Toast';

interface PreviewExportViewProps {
  project: VideoProject;
  onEditScenes: () => void;
  onBack: () => void;
}

export const PreviewExportView: React.FC<PreviewExportViewProps> = ({
  project,
  onEditScenes,
  onBack,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const composerRef = useRef<VideoComposer | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(
    project.scenes.reduce((acc, s) => acc + (s.duration || 4), 0)
  );
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);

  const { showToast } = useToast();

  // Audio Testing & Normalization States
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [voiceBooster, setVoiceBooster] = useState(1.45); // 145% normalized volume
  const [audioStatusText, setAudioStatusText] = useState('Voz normalizada lista');

  // Export States
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFileName, setDownloadFileName] = useState('');

  // YouTube SEO Modal State
  const [showYouTubeModal, setShowYouTubeModal] = useState(false);
  const [isGeneratingSEO, setIsGeneratingSEO] = useState(false);
  const [youtubeMetadata, setYoutubeMetadata] = useState<YouTubeMetadata | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Thumbnail Generator Modal State
  const [showThumbnailModal, setShowThumbnailModal] = useState(false);
  const thumbnailCanvasRef = useRef<HTMLCanvasElement>(null);

  // Initialize Composer
  useEffect(() => {
    if (!canvasRef.current) return;

    const composer = new VideoComposer(canvasRef.current, project, (state) => {
      setIsPlaying(state.isPlaying);
      setCurrentTime(state.currentTime);
      setTotalDuration(state.totalDuration);
      setCurrentSceneIndex(state.currentSceneIndex);
      setIsTestingVoice(state.isVoicePlaying);
    });

    composer.voiceVolumeBooster = voiceBooster;
    composerRef.current = composer;
    composer.preloadAssets();

    return () => {
      composer.destroy();
    };
  }, [project]);

  const togglePlay = async () => {
    if (!composerRef.current) return;
    await composerRef.current.resumeAudioContext();
    if (isPlaying) {
      composerRef.current.pause();
    } else {
      composerRef.current.play();
    }
  };

  const handleSeek = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (composerRef.current) {
      await composerRef.current.resumeAudioContext();
      composerRef.current.seek(time);
    }
  };

  const handleRestart = async () => {
    if (!composerRef.current) return;
    await composerRef.current.resumeAudioContext();
    composerRef.current.seek(0);
    composerRef.current.play();
  };

  // Dedicated Button: "Escuchar voz" to test audio before exporting (as requested by user)
  const handleTestVoice = async () => {
    if (!composerRef.current) return;
    setAudioStatusText('Comprobando audio de voz normalizado...');
    await composerRef.current.resumeAudioContext();
    await composerRef.current.playSceneVoice(currentSceneIndex);
    setTimeout(() => {
      setAudioStatusText('Voz normalizada comprobada');
    }, 2500);
  };

  const handleVoiceBoosterChange = (newBooster: number) => {
    setVoiceBooster(newBooster);
    if (composerRef.current) {
      composerRef.current.voiceVolumeBooster = newBooster;
    }
  };

  // 1. Export Video
  const handleExportVideo = async () => {
    if (!composerRef.current || isExportingVideo) return;
    await composerRef.current.resumeAudioContext();
    setIsExportingVideo(true);
    setExportProgress(0);

    try {
      const { blob, mimeType } = await composerRef.current.exportVideo((pct) => {
        setExportProgress(pct);
      });

      const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const safeTitle = (project.title || 'autovideo')
        .toLowerCase()
        .replace(/[^a-z0-9]/gi, '_')
        .slice(0, 30);
      const fileName = `${safeTitle}.${extension}`;

      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setDownloadFileName(fileName);

      // Auto trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('¡Video exportado y descargado con éxito!', 'success');
    } catch (err) {
      console.error('Error al exportar video:', err);
      showToast('Hubo un inconveniente al empaquetar el video. Intenta de nuevo.', 'error');
    } finally {
      setIsExportingVideo(false);
    }
  };

  // 2. Export Subtitles (.SRT)
  const handleExportSrt = () => {
    if (!composerRef.current) return;
    const srtText = composerRef.current.exportSrt();
    const blob = new Blob([srtText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title || 'subtitulos'}.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Subtítulos .SRT descargados con éxito', 'success');
  };

  // 3. Export Audio Only (WAV)
  const handleExportAudio = () => {
    const firstAudioScene = project.scenes.find((s) => s.audioUrl);
    if (!firstAudioScene?.audioUrl) {
      showToast('No hay audios disponibles para descargar.', 'error');
      return;
    }
    const a = document.createElement('a');
    a.href = firstAudioScene.audioUrl;
    a.download = `${project.title || 'narracion'}_audio.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Pista de audio descargada', 'success');
  };

  // 4. Export Images as ZIP
  const handleExportImagesZip = async () => {
    const zip = new JSZip();
    let count = 0;

    for (let i = 0; i < project.scenes.length; i++) {
      const scene = project.scenes[i];
      if (scene.imageUrl) {
        const base64Data = scene.imageUrl.split(',')[1];
        if (base64Data) {
          const ext = scene.imageUrl.includes('svg') ? 'svg' : 'png';
          zip.file(`escena_${i + 1}.${ext}`, base64Data, { base64: true });
          count++;
        }
      }
    }

    if (count === 0) {
      showToast('No hay imágenes disponibles para descargar.', 'error');
      return;
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title || 'imagenes'}_escenas.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Archivo ZIP con todas las imágenes descargado', 'success');
  };

  // 5. Share Video
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: project.title,
          text: `Mira este video creado con AutoVideo IA: "${project.title}"`,
          url: window.location.href,
        });
      } catch {}
    } else {
      navigator.clipboard.writeText(window.location.href);
      showToast('¡Enlace del proyecto copiado al portapapeles!', 'info');
    }
  };

  // 6. Generate YouTube SEO Metadata
  const handleGenerateYouTubeSEO = async () => {
    setShowYouTubeModal(true);
    if (youtubeMetadata) return;
    setIsGeneratingSEO(true);

    try {
      const metadata = await generateYouTubeMetadata(project.rawScript, project.title);
      setYoutubeMetadata(metadata);
    } catch (err: any) {
      console.error(err);
      showToast('Error al generar metadatos de YouTube con Gemini.', 'error');
    } finally {
      setIsGeneratingSEO(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // 7. Render 16:9 Thumbnail Generator
  const openThumbnailModal = () => {
    setShowThumbnailModal(true);
    setTimeout(() => {
      drawThumbnail();
    }, 100);
  };

  const drawThumbnail = () => {
    const canvas = thumbnailCanvasRef.current;
    if (!canvas) return;
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const mainImgSrc = project.scenes.find((s) => s.imageUrl)?.imageUrl;

    const renderText = () => {
      const gradient = ctx.createLinearGradient(0, 0, 1280, 720);
      gradient.addColorStop(0, 'rgba(0,0,0,0.3)');
      gradient.addColorStop(0.7, 'rgba(0,0,0,0.65)');
      gradient.addColorStop(1, 'rgba(15,23,42,0.95)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 1280, 720);

      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 16;
      ctx.strokeRect(8, 8, 1264, 704);

      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.roundRect(80, 80, 240, 56, 16);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 24px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('¡REVELADO!', 200, 117);

      const rawTitle = project.title || 'CÓMO LOGRAR TUS METAS';
      const upperTitle = rawTitle.toUpperCase();
      ctx.font = '900 68px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'left';

      ctx.lineWidth = 14;
      ctx.strokeStyle = '#000000';
      ctx.strokeText(upperTitle.slice(0, 28), 80, 280);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(upperTitle.slice(0, 28), 80, 280);

      if (upperTitle.length > 28) {
        ctx.strokeText(upperTitle.slice(28, 56), 80, 360);
        ctx.fillStyle = '#facc15';
        ctx.fillText(upperTitle.slice(28, 56), 80, 360);
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = '800 32px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('EN SOLO 3 PASOS', 80, 480);
    };

    if (mainImgSrc) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.drawImage(img, 0, 0, 1280, 720);
        renderText();
      };
      img.src = mainImgSrc;
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 1280, 720);
      renderText();
    }
  };

  const downloadThumbnail = () => {
    const canvas = thumbnailCanvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `miniatura_${project.title || 'video'}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-28">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 py-3.5 bg-slate-950/85 backdrop-blur-md border-b border-slate-800/80 pt-safe">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Inicio</span>
        </button>

        <span className="text-sm font-bold text-white truncate max-w-[200px]">
          {project.title}
        </span>

        <button
          onClick={onEditScenes}
          className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
        >
          <Film className="w-3.5 h-3.5" />
          <span>Editar escenas</span>
        </button>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-5 space-y-6">
        {/* Video Canvas Container */}
        <div className="relative w-full rounded-2xl bg-black border border-slate-800/80 overflow-hidden shadow-2xl flex flex-col items-center justify-center">
          <div
            className={`relative flex items-center justify-center w-full ${
              project.aspectRatio === '9:16'
                ? 'max-w-[340px] sm:max-w-[380px] aspect-[9/16]'
                : 'max-w-3xl aspect-video'
            }`}
          >
            <canvas ref={canvasRef} className="w-full h-full object-contain rounded-xl" />

            {!isPlaying && (
              <button
                onClick={togglePlay}
                className="absolute inset-0 flex items-center justify-center bg-black/35 hover:bg-black/45 transition group"
              >
                <div className="w-16 h-16 rounded-full bg-indigo-600/90 text-white flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                  <Play className="w-7 h-7 ml-1 fill-current" />
                </div>
              </button>
            )}
          </div>

          {/* Player Controls Bar */}
          <div className="w-full bg-slate-900/90 border-t border-slate-800 p-3 sm:p-4 flex flex-col gap-2.5">
            {/* Scrubber */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-slate-400 font-semibold w-10 text-right">
                {formatSeconds(currentTime)}
              </span>

              <input
                type="range"
                min="0"
                max={totalDuration || 1}
                step="0.1"
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 accent-indigo-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
              />

              <span className="text-xs font-mono text-slate-400 font-semibold w-10">
                {formatSeconds(totalDuration)}
              </span>
            </div>

            {/* Buttons Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePlay}
                  className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center transition"
                  title={isPlaying ? 'Pausa' : 'Reproducir'}
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5 fill-current" />}
                </button>

                <button
                  onClick={handleRestart}
                  className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
                  title="Reiniciar"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">
                  Escena <strong className="text-white">{currentSceneIndex + 1}</strong> de {project.scenes.length}
                </span>

                <button
                  onClick={handleShare}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Compartir</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Audio Verification & Normalization Control Bar */}
        <div className="rounded-2xl border border-indigo-500/20 bg-slate-900/70 p-4 sm:p-5 space-y-3.5 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center shrink-0">
                <Volume2 className={`w-5 h-5 ${isTestingVoice ? 'animate-pulse text-indigo-300' : ''}`} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Audio Normalizado & Comprobación de Voz
                </h4>
                <div className="flex items-center gap-2 mt-0.5">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span className="text-[11px] text-slate-300">{audioStatusText}</span>
                </div>
              </div>
            </div>

            {/* User Requested: "Escuchar voz" button to test audio before exporting */}
            <button
              onClick={handleTestVoice}
              className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs font-bold text-white shadow-md active:scale-95 transition"
            >
              <Volume2 className="w-4 h-4 fill-current" />
              <span>Escuchar voz de escena #{currentSceneIndex + 1}</span>
            </button>
          </div>

          {/* Voice Volume Normalization Booster */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              <span>Potencia de voz en el video:</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleVoiceBoosterChange(1.0)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
                  voiceBooster === 1.0
                    ? 'border-indigo-500 bg-indigo-950/60 text-white'
                    : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                100% (Estándar)
              </button>
              <button
                onClick={() => handleVoiceBoosterChange(1.35)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
                  voiceBooster === 1.35
                    ? 'border-indigo-500 bg-indigo-950/60 text-white'
                    : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                135% (Recomendado)
              </button>
              <button
                onClick={() => handleVoiceBoosterChange(1.6)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
                  voiceBooster === 1.6
                    ? 'border-indigo-500 bg-indigo-950/60 text-white'
                    : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                160% (Máxima claridad)
              </button>
            </div>
          </div>
        </div>

        {/* Primary Export Actions */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">Descargar y Exportar Video</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Mezcla de voz y música en un solo Web Audio stream capturado directamente por MediaRecorder
              </p>
            </div>
          </div>

          {/* Export Video Button & Progress */}
          <div>
            <button
              onClick={handleExportVideo}
              disabled={isExportingVideo}
              className="w-full h-13 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 active:scale-[0.98] transition"
            >
              <Download className={`w-5 h-5 ${isExportingVideo ? 'animate-bounce' : ''}`} />
              <span>
                {isExportingVideo
                  ? `Renderizando video con voz y música (${exportProgress}%)...`
                  : 'Descargar Video Completo (MP4 / WebM)'}
              </span>
            </button>

            {isExportingVideo && (
              <div className="mt-2.5 w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-indigo-500 to-violet-500 h-full transition-all duration-200"
                  style={{ width: `${exportProgress}%` }}
                ></div>
              </div>
            )}
          </div>

          {/* Separate Downloads Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800/80">
            <button
              onClick={handleExportAudio}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:border-slate-700 transition"
            >
              <Music className="w-4 h-4 text-violet-400" />
              <span>Audio Narración (.wav)</span>
            </button>

            <button
              onClick={handleExportSrt}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:border-slate-700 transition"
            >
              <FileText className="w-4 h-4 text-emerald-400" />
              <span>Subtítulos (.srt)</span>
            </button>

            <button
              onClick={handleExportImagesZip}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:border-slate-700 transition"
            >
              <ImageIcon className="w-4 h-4 text-amber-400" />
              <span>Todas las Imágenes (.zip)</span>
            </button>
          </div>
        </div>

        {/* Extras & Creators Toolbox */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Herramientas extras para YouTube y Redes
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={handleGenerateYouTubeSEO}
              className="flex items-start gap-3 rounded-xl border border-indigo-500/20 bg-indigo-950/30 hover:bg-indigo-950/50 p-3.5 text-left transition"
            >
              <div className="w-9 h-9 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Generar SEO para YouTube</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Títulos con alto CTR, descripción con marcas de tiempo y etiquetas.
                </div>
              </div>
            </button>

            <button
              onClick={openThumbnailModal}
              className="flex items-start gap-3 rounded-xl border border-violet-500/20 bg-violet-950/30 hover:bg-violet-950/50 p-3.5 text-left transition"
            >
              <div className="w-9 h-9 rounded-lg bg-violet-600/20 text-violet-400 flex items-center justify-center shrink-0">
                <ImageIcon className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Generar Miniatura 16:9</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Crea una miniatura de alto impacto con texto gigante y el arte del video.
                </div>
              </div>
            </button>
          </div>
        </div>
      </main>

      {/* YouTube SEO Modal */}
      {showYouTubeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-slate-100 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowYouTubeModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <h3 className="text-base font-bold text-white">SEO Automático para YouTube</h3>
            </div>

            {isGeneratingSEO ? (
              <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
                <span>Creando títulos con alto CTR y descripción optimizada...</span>
              </div>
            ) : youtubeMetadata ? (
              <div className="space-y-5 text-xs">
                {/* Titles */}
                <div>
                  <label className="font-bold text-slate-300 block mb-2">Títulos sugeridos (alto CTR):</label>
                  <div className="space-y-2">
                    {youtubeMetadata.titles.map((title, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200"
                      >
                        <span className="font-semibold">{title}</span>
                        <button
                          onClick={() => copyToClipboard(title, `title_${idx}`)}
                          className="p-1 text-slate-400 hover:text-indigo-400"
                          title="Copiar título"
                        >
                          {copiedKey === `title_${idx}` ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-bold text-slate-300">Descripción completa:</label>
                    <button
                      onClick={() => copyToClipboard(youtubeMetadata.description, 'desc')}
                      className="text-[11px] text-indigo-400 hover:underline flex items-center gap-1"
                    >
                      {copiedKey === 'desc' ? '¡Copiado!' : 'Copiar descripción'}
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={youtubeMetadata.description}
                    rows={6}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-slate-300 font-mono text-[11px]"
                  />
                </div>

                {/* Tags */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-bold text-slate-300">Etiquetas (Tags):</label>
                    <button
                      onClick={() => copyToClipboard(youtubeMetadata.tags.join(', '), 'tags')}
                      className="text-[11px] text-indigo-400 hover:underline flex items-center gap-1"
                    >
                      {copiedKey === 'tags' ? '¡Copiado!' : 'Copiar etiquetas'}
                    </button>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 text-[11px] leading-relaxed">
                    {youtubeMetadata.tags.join(', ')}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Thumbnail Modal */}
      {showThumbnailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-slate-100 relative">
            <button
              onClick={() => setShowThumbnailModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <ImageIcon className="w-5 h-5 text-indigo-400" />
              <h3 className="text-base font-bold text-white">Generador de Miniatura 16:9</h3>
            </div>

            <div className="aspect-video w-full rounded-xl overflow-hidden border border-slate-800 mb-4 bg-slate-950">
              <canvas ref={thumbnailCanvasRef} className="w-full h-full object-contain" />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">1280x720 formato YouTube</span>
              <button
                onClick={downloadThumbnail}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs font-bold text-white transition shadow-md"
              >
                <Download className="w-4 h-4" />
                <span>Descargar Miniatura (.png)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
