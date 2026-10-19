import React, { useState } from 'react';
import {
  ArrowLeft,
  Sparkles,
  Volume2,
  Music,
  Upload,
  Layers,
  Smartphone,
  Monitor,
  HelpCircle,
  Play,
  Check,
  AlertCircle
} from 'lucide-react';
import { AspectRatio, BackgroundMusicConfig, VideoProject } from '../types';
import { DEMO_SCRIPTS, GEMINI_VOICES, VISUAL_PRESETS } from '../utils/constants';
import { PRESET_TRACKS } from '../services/audioLibrary';
import { generateVoiceWithGemini, enhanceScriptWithGemini } from '../services/geminiService';
import { useToast } from '../components/Toast';

interface NewProjectViewProps {
  initialData?: { title: string; script: string };
  onCancel: () => void;
  onGenerate: (projectConfig: Partial<VideoProject>, testMode: boolean) => void;
}

export const NewProjectView: React.FC<NewProjectViewProps> = ({
  initialData,
  onCancel,
  onGenerate,
}) => {
  const [title, setTitle] = useState(initialData?.title || '');
  const [script, setScript] = useState(initialData?.script || '');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [selectedPresetId, setSelectedPresetId] = useState('whiteboard');
  const [visualStyle, setVisualStyle] = useState(VISUAL_PRESETS[0].prompt);
  const [voiceName, setVoiceName] = useState('Kore');
  const [voiceSpeed, setVoiceSpeed] = useState(1.1);
  const [voiceTone, setVoiceTone] = useState<'informativo' | 'curioso' | 'dramático' | 'entusiasta'>('informativo');
  
  // Music Config
  const [musicType, setMusicType] = useState<'preset' | 'custom' | 'none'>('preset');
  const [presetTrackId, setPresetTrackId] = useState('lofi-chill');
  const [musicVolume, setMusicVolume] = useState(0.25);
  const [customFile, setCustomFile] = useState<{ name: string; url: string } | null>(null);

  // Audio sample preview state
  const [isPlayingSample, setIsPlayingSample] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const { showToast } = useToast();
  const [isEnhancingScript, setIsEnhancingScript] = useState(false);

  const handleEnhanceScript = async () => {
    if (!script.trim()) {
      showToast('Escribe primero algunas ideas o borrador para que la IA lo optimice.', 'info');
      return;
    }
    setIsEnhancingScript(true);
    try {
      const res = await enhanceScriptWithGemini(script, voiceTone);
      if (res.title && !title.trim()) {
        setTitle(res.title);
      }
      setScript(res.enhancedScript);
      showToast('¡Guion optimizado y estructurado con éxito por Gemini!', 'success');
    } catch (err: any) {
      showToast('No se pudo optimizar con IA. Puedes usar el formato manual o un ejemplo.', 'error');
    } finally {
      setIsEnhancingScript(false);
    }
  };

  const handlePresetSelect = (presetId: string) => {
    setSelectedPresetId(presetId);
    const found = VISUAL_PRESETS.find((p) => p.id === presetId);
    if (found) {
      setVisualStyle(found.prompt);
    }
  };

  const handleCustomAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setCustomFile({ name: file.name, url });
      setMusicType('custom');
    }
  };

  const playVoiceSample = async () => {
    if (isPlayingSample && currentAudio) {
      currentAudio.pause();
      setIsPlayingSample(false);
      return;
    }

    setSampleError(null);
    setIsPlayingSample(true);

    try {
      const sampleText = `Hola, soy ${voiceName}. Así narraré las escenas de tu video con inteligencia artificial.`;
      const result = await generateVoiceWithGemini(sampleText, voiceName, voiceSpeed, voiceTone);
      const audio = new Audio(result.audioUrl);
      setCurrentAudio(audio);
      audio.onended = () => setIsPlayingSample(false);
      audio.onerror = () => {
        setIsPlayingSample(false);
        setSampleError('No se pudo reproducir la muestra');
      };
      await audio.play();
    } catch (err: any) {
      console.warn('Error al reproducir muestra de voz:', err);
      // Fallback with browser speech synthesis if offline
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(
          `Hola, soy la voz de ${voiceName} para tu video.`
        );
        utterance.lang = 'es-ES';
        utterance.rate = voiceSpeed;
        utterance.onend = () => setIsPlayingSample(false);
        utterance.onerror = () => setIsPlayingSample(false);
        window.speechSynthesis.speak(utterance);
      } else {
        setIsPlayingSample(false);
        setSampleError('Error al sintetizar muestra de voz.');
      }
    }
  };

  const handleStartGeneration = (testMode: boolean) => {
    if (!script.trim()) {
      showToast('Por favor escribe o pega un guion antes de generar el video.', 'error');
      return;
    }

    const selectedTrack = PRESET_TRACKS.find((t) => t.id === presetTrackId);
    const musicConfig: BackgroundMusicConfig = {
      id: musicType === 'custom' ? 'custom' : presetTrackId,
      name:
        musicType === 'custom'
          ? customFile?.name || 'Música personalizada'
          : musicType === 'none'
          ? 'Sin música'
          : selectedTrack?.name || 'Lo-Fi Chill Hop',
      type: musicType,
      volume: musicVolume,
      presetType: selectedTrack?.presetType || 'lofi',
      customFileName: customFile?.name,
      customAudioUrl: customFile?.url,
    };

    onGenerate(
      {
        title: title.trim() || 'Video de AutoVideo IA',
        rawScript: script,
        aspectRatio,
        visualStyle,
        voiceName,
        voiceSpeed,
        voiceTone,
        music: musicConfig,
      },
      testMode
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-36">
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 py-3.5 bg-slate-950/85 backdrop-blur-md border-b border-slate-800/80 pt-safe">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white p-1 rounded-lg transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver</span>
        </button>
        <span className="text-sm font-bold text-white">Nuevo Proyecto</span>
        <div className="w-12"></div>
      </header>

      {/* Form Content */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 space-y-7">
        {/* Title Field */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            Título del video
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej: 5 Hábitos para duplicar tu productividad"
            className="w-full rounded-xl border border-slate-800 bg-slate-900/90 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition"
          />
        </div>

        {/* Script Textarea & Guide */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Guion en español
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleEnhanceScript}
                disabled={isEnhancingScript}
                className="flex items-center gap-1 rounded-lg bg-indigo-600/30 border border-indigo-500/40 px-2 py-1 text-[11px] font-bold text-indigo-300 hover:bg-indigo-600/50 active:scale-95 transition"
                title="Estructura y optimiza automáticamente tus notas con Gemini 3.8 Flash"
              >
                <Sparkles className={`w-3 h-3 ${isEnhancingScript ? 'animate-spin text-amber-400' : 'text-amber-400'}`} />
                <span>{isEnhancingScript ? 'Mejorando...' : 'Mejorar con IA'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTitle(DEMO_SCRIPTS[0].title);
                  setScript(DEMO_SCRIPTS[0].script);
                  showToast('Ejemplo cargado con éxito', 'info');
                }}
                className="text-[11px] font-semibold text-slate-400 hover:text-white transition px-1"
              >
                Cargar ejemplo
              </button>
            </div>
          </div>

          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            rows={8}
            placeholder={`Pega tu guion aquí...\n\n## Escena 1\nIMAGEN: Un muñeco de palitos sorprendido mirando el reloj.\nEl tiempo pasa volando cuando estamos distraídos.\n\n## Escena 2\nIMAGEN: Un calendario con metas tachadas.\nPero hoy vas a aprender cómo tomar el control total.`}
            className="w-full rounded-xl border border-slate-800 bg-slate-900/90 p-4 text-sm font-mono text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition leading-relaxed"
          ></textarea>

          {/* Script Rules Callout */}
          <div className="mt-2.5 rounded-xl border border-slate-800/90 bg-slate-900/40 p-3.5 flex items-start gap-2.5 text-xs text-slate-400">
            <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-slate-300">Reglas automáticas del guion:</p>
              <p>• Las líneas con <code className="text-indigo-300 font-bold">IMAGEN:</code> son guías para el dibujo y <strong className="text-slate-200">NO se narran</strong>.</p>
              <p>• Los títulos con <code className="text-indigo-300 font-bold">##</code> o <code className="text-indigo-300 font-bold">NÚMERO</code> separan automáticamente cada escena.</p>
            </div>
          </div>
        </div>

        {/* Format Selector: 16:9 vs 9:16 */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            Formato de video
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setAspectRatio('16:9')}
              className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition ${
                aspectRatio === '16:9'
                  ? 'border-indigo-500 bg-indigo-950/40 text-white shadow-md'
                  : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="w-10 h-10 rounded-lg bg-indigo-600/20 flex items-center justify-center text-indigo-400">
                <Monitor className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">16:9 Horizontal</div>
                <div className="text-[11px] text-slate-400">YouTube clásico y TV</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setAspectRatio('9:16')}
              className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition ${
                aspectRatio === '9:16'
                  ? 'border-indigo-500 bg-indigo-950/40 text-white shadow-md'
                  : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="w-10 h-10 rounded-lg bg-violet-600/20 flex items-center justify-center text-violet-400">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">9:16 Vertical</div>
                <div className="text-[11px] text-slate-400">Shorts, TikTok y Reels</div>
              </div>
            </button>
          </div>
        </div>

        {/* Visual Style Selector & Editor */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Estilo visual de las imágenes
            </label>
            <span className="text-[11px] text-slate-500">Editable</span>
          </div>

          {/* Preset Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
            {VISUAL_PRESETS.map((preset) => {
              const isSelected = selectedPresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handlePresetSelect(preset.id)}
                  className={`flex flex-col p-2.5 rounded-xl border text-left transition ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-950/40 text-white shadow-sm'
                      : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span className="text-xs font-bold text-white">{preset.name}</span>
                  <span className="text-[10px] text-indigo-400 mt-0.5">{preset.badge}</span>
                </button>
              );
            })}
          </div>

          <textarea
            value={visualStyle}
            onChange={(e) => setVisualStyle(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-slate-800 bg-slate-900/90 p-3 text-xs text-slate-300 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          ></textarea>
        </div>

        {/* Voice & Speech Controls */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-indigo-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Voz de Gemini TTS
              </h3>
            </div>

            <button
              type="button"
              onClick={playVoiceSample}
              disabled={isPlayingSample}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600/30 border border-indigo-500/40 px-2.5 py-1 text-xs font-semibold text-indigo-300 hover:bg-indigo-600/50 active:scale-95 transition"
            >
              <Play className={`w-3 h-3 ${isPlayingSample ? 'animate-spin' : 'fill-current'}`} />
              <span>{isPlayingSample ? 'Sintetizando...' : 'Escuchar muestra'}</span>
            </button>
          </div>

          {sampleError && (
            <p className="text-xs text-rose-400">{sampleError}</p>
          )}

          {/* Voice Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {GEMINI_VOICES.map((v) => {
              const isSelected = voiceName === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVoiceName(v.id)}
                  className={`flex flex-col p-2.5 rounded-xl border text-left transition ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-950/60 text-white'
                      : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{v.name}</span>
                    <span className="text-[10px] text-slate-400">{v.gender}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 line-clamp-1">{v.style}</span>
                </button>
              );
            })}
          </div>

          {/* Voice Speed & Tone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                <span>Velocidad de narración</span>
                <span className="font-bold text-indigo-400 font-mono">{voiceSpeed.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.9"
                max="1.3"
                step="0.05"
                value={voiceSpeed}
                onChange={(e) => setVoiceSpeed(parseFloat(e.target.value))}
                className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Tono emocional</label>
              <select
                value={voiceTone}
                onChange={(e) => setVoiceTone(e.target.value as any)}
                className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="informativo">Informativo y claro</option>
                <option value="curioso">Curioso e intrigante</option>
                <option value="dramático">Dramático y emotivo</option>
                <option value="entusiasta">Entusiasta y motivador</option>
              </select>
            </div>
          </div>
        </div>

        {/* Background Music Selector */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Music className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Música de fondo & Ducking
            </h3>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setMusicType('preset')}
              className={`p-2.5 rounded-xl border text-center text-xs font-semibold transition ${
                musicType === 'preset'
                  ? 'border-indigo-500 bg-indigo-950/60 text-white'
                  : 'border-slate-800 bg-slate-900 text-slate-400'
              }`}
            >
              Pistas incluidas
            </button>
            <button
              type="button"
              onClick={() => setMusicType('custom')}
              className={`p-2.5 rounded-xl border text-center text-xs font-semibold transition ${
                musicType === 'custom'
                  ? 'border-indigo-500 bg-indigo-950/60 text-white'
                  : 'border-slate-800 bg-slate-900 text-slate-400'
              }`}
            >
              Subir archivo
            </button>
            <button
              type="button"
              onClick={() => setMusicType('none')}
              className={`p-2.5 rounded-xl border text-center text-xs font-semibold transition ${
                musicType === 'none'
                  ? 'border-indigo-500 bg-indigo-950/60 text-white'
                  : 'border-slate-800 bg-slate-900 text-slate-400'
              }`}
            >
              Sin música
            </button>
          </div>

          {musicType === 'preset' && (
            <div className="grid grid-cols-2 gap-2">
              {PRESET_TRACKS.map((track) => (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => setPresetTrackId(track.id)}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    presetTrackId === track.id
                      ? 'border-indigo-500 bg-indigo-950/40 text-white'
                      : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-bold text-white">{track.name}</div>
                  <div className="text-[10px] text-slate-400">{track.genre} · {track.tempo}</div>
                </button>
              ))}
            </div>
          )}

          {musicType === 'custom' && (
            <div>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl p-4 cursor-pointer bg-slate-900/60 transition">
                <Upload className="w-6 h-6 text-indigo-400 mb-1" />
                <span className="text-xs font-semibold text-white">
                  {customFile ? customFile.name : 'Toca para subir un archivo .mp3 o .wav'}
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5">Audio libre de derechos</span>
                <input
                  type="file"
                  accept="audio/mp3,audio/wav,audio/mpeg"
                  onChange={handleCustomAudioUpload}
                  className="hidden"
                />
              </label>
            </div>
          )}

          {musicType !== 'none' && (
            <div className="pt-2 border-t border-slate-800">
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>Volumen de la música (con ducking automático al hablar)</span>
                <span className="font-bold text-indigo-400 font-mono">
                  {Math.round(musicVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.6"
                step="0.05"
                value={musicVolume}
                onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
          )}
        </div>
      </main>

      {/* Sticky Bottom Thumb Zone Actions */}
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-safe bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent border-t border-slate-800/60 z-30">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center gap-3">
          <button
            type="button"
            onClick={() => handleStartGeneration(true)}
            className="w-full sm:w-1/2 h-12 rounded-xl border border-indigo-500/30 bg-indigo-950/50 hover:bg-indigo-900/40 text-indigo-200 text-xs font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Probar con 2 escenas (Ahorra cuota)</span>
          </button>

          <button
            type="button"
            onClick={() => handleStartGeneration(false)}
            className="w-full sm:w-1/2 h-12 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition"
          >
            <Check className="w-4 h-4" />
            <span>Generar video completo</span>
          </button>
        </div>
      </div>
    </div>
  );
};
