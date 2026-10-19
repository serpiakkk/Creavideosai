import React, { useState } from 'react';
import {
  ArrowLeft,
  Play,
  RotateCw,
  Plus,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Volume2,
  Sparkles,
  Film,
  Eye,
  Check,
  AlertCircle
} from 'lucide-react';
import { CameraMotion, SceneItem, SceneTransition, VideoProject } from '../types';
import { saveProject } from '../services/db';
import { generateImageWithGemini, generateVoiceWithGemini, getAudioDuration } from '../services/geminiService';

interface EditorViewProps {
  project: VideoProject;
  onProjectUpdated: (project: VideoProject) => void;
  onPreviewExport: () => void;
  onBack: () => void;
}

export const EditorView: React.FC<EditorViewProps> = ({
  project,
  onProjectUpdated,
  onPreviewExport,
  onBack,
}) => {
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);
  const [isRegeneratingImage, setIsRegeneratingImage] = useState(false);
  const [isRegeneratingVoice, setIsRegeneratingVoice] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const currentScene = project.scenes[selectedSceneIndex] || project.scenes[0];

  const updateScene = async (updatedFields: Partial<SceneItem>) => {
    if (!currentScene) return;
    const newScenes = [...project.scenes];
    newScenes[selectedSceneIndex] = {
      ...currentScene,
      ...updatedFields,
    };
    const updatedProj = { ...project, scenes: newScenes };
    onProjectUpdated(updatedProj);
    await saveProject(updatedProj);
  };

  const handleRegenerateImage = async () => {
    if (!currentScene || isRegeneratingImage) return;
    setIsRegeneratingImage(true);
    setStatusMessage('Generando nueva imagen con Gemini...');

    try {
      const res = await generateImageWithGemini(
        currentScene.visualPrompt,
        project.aspectRatio,
        {
          title: currentScene.title,
          narrationText: currentScene.narrationText,
          keywords: currentScene.keywords,
        }
      );
      await updateScene({ imageUrl: res.imageUrl, status: 'ready' });
      setStatusMessage('¡Imagen actualizada con éxito!');
    } catch (err: any) {
      console.error(err);
      setStatusMessage(`Error: ${err?.message || 'No se pudo regenerar la imagen'}`);
    } finally {
      setIsRegeneratingImage(false);
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  const handleRegenerateVoice = async () => {
    if (!currentScene || isRegeneratingVoice) return;
    setIsRegeneratingVoice(true);
    setStatusMessage('Sintetizando voz en off con Gemini TTS...');

    try {
      const res = await generateVoiceWithGemini(
        currentScene.narrationText,
        project.voiceName,
        project.voiceSpeed,
        project.voiceTone
      );
      const measuredDuration = await getAudioDuration(res.audioUrl);
      await updateScene({
        audioUrl: res.audioUrl,
        duration: Math.max(2.5, measuredDuration),
        status: 'ready',
      });
      setStatusMessage('¡Voz actualizada con duración exacta!');
    } catch (err: any) {
      console.error(err);
      setStatusMessage(`Error: ${err?.message || 'No se pudo regenerar la voz'}`);
    } finally {
      setIsRegeneratingVoice(false);
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  const handlePlayVoice = () => {
    if (!currentScene?.audioUrl) return;
    const audio = new Audio(currentScene.audioUrl);
    audio.volume = 1.0;
    setIsPlayingAudio(true);
    audio.onended = () => setIsPlayingAudio(false);
    audio.onerror = () => setIsPlayingAudio(false);
    audio.play().catch(() => setIsPlayingAudio(false));
  };

  const handleMoveScene = async (direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? selectedSceneIndex - 1 : selectedSceneIndex + 1;
    if (targetIndex < 0 || targetIndex >= project.scenes.length) return;

    const newScenes = [...project.scenes];
    const [moved] = newScenes.splice(selectedSceneIndex, 1);
    newScenes.splice(targetIndex, 0, moved);

    // Re-index orders
    newScenes.forEach((s, idx) => (s.order = idx));

    setSelectedSceneIndex(targetIndex);
    const updatedProj = { ...project, scenes: newScenes };
    onProjectUpdated(updatedProj);
    await saveProject(updatedProj);
  };

  const handleDuplicateScene = async () => {
    if (!currentScene) return;
    const duplicated: SceneItem = {
      ...currentScene,
      id: `scene_${Date.now()}`,
      title: `${currentScene.title} (Copia)`,
      order: selectedSceneIndex + 1,
    };

    const newScenes = [...project.scenes];
    newScenes.splice(selectedSceneIndex + 1, 0, duplicated);
    newScenes.forEach((s, idx) => (s.order = idx));

    setSelectedSceneIndex(selectedSceneIndex + 1);
    const updatedProj = { ...project, scenes: newScenes };
    onProjectUpdated(updatedProj);
    await saveProject(updatedProj);
  };

  const handleDeleteScene = async () => {
    if (project.scenes.length <= 1) {
      alert('El video debe tener al menos una escena.');
      return;
    }

    const newScenes = project.scenes.filter((_, idx) => idx !== selectedSceneIndex);
    newScenes.forEach((s, idx) => (s.order = idx));

    const nextIndex = Math.max(0, selectedSceneIndex - 1);
    setSelectedSceneIndex(nextIndex);
    const updatedProj = { ...project, scenes: newScenes };
    onProjectUpdated(updatedProj);
    await saveProject(updatedProj);
  };

  const handleAddScene = async () => {
    const newScene: SceneItem = {
      id: `scene_${Date.now()}`,
      order: project.scenes.length,
      title: `Escena ${project.scenes.length + 1}`,
      narrationText: 'Escribe aquí la narración de la nueva escena.',
      visualDescription: 'Descripción de la escena',
      visualPrompt: `${project.visualStyle}, cartoon scene, clean background.`,
      duration: 4.0,
      cameraMotion: 'zoom_in',
      transition: 'fade',
      status: 'pending',
    };

    const newScenes = [...project.scenes, newScene];
    setSelectedSceneIndex(newScenes.length - 1);
    const updatedProj = { ...project, scenes: newScenes };
    onProjectUpdated(updatedProj);
    await saveProject(updatedProj);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-28">
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 py-3.5 bg-slate-950/85 backdrop-blur-md border-b border-slate-800/80 pt-safe">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Inicio</span>
        </button>

        <span className="text-sm font-bold text-white truncate max-w-[200px]">
          Editor de Escenas
        </span>

        <button
          onClick={onPreviewExport}
          className="flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-xs font-bold text-white shadow-md transition"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Vista Previa</span>
        </button>
      </header>

      {/* Main Grid: Horizontal Timeline on top/mobile, Editor below */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-5 space-y-6">
        {/* Status Toast Banner if any */}
        {statusMessage && (
          <div className="rounded-xl bg-indigo-950/80 border border-indigo-500/40 p-3 text-xs text-indigo-300 flex items-center gap-2 shadow-lg">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Horizontal Timeline Strip */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-indigo-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Línea de Tiempo ({project.scenes.length} escenas)
              </h2>
            </div>
            <button
              onClick={handleAddScene}
              className="flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Añadir escena</span>
            </button>
          </div>

          <div className="flex items-center gap-3 overflow-x-auto pb-3 pt-1 scrollbar-thin">
            {project.scenes.map((scene, idx) => {
              const isSelected = idx === selectedSceneIndex;
              return (
                <button
                  key={scene.id}
                  onClick={() => setSelectedSceneIndex(idx)}
                  className={`relative flex flex-col shrink-0 w-28 sm:w-32 rounded-xl border text-left overflow-hidden transition-all ${
                    isSelected
                      ? 'border-indigo-500 ring-2 ring-indigo-500/30 scale-102 bg-slate-900'
                      : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 opacity-75 hover:opacity-100'
                  }`}
                >
                  <div className="relative aspect-video w-full bg-slate-950 flex items-center justify-center overflow-hidden">
                    {scene.imageUrl ? (
                      <img
                        src={scene.imageUrl}
                        alt={scene.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-[10px] text-slate-500">Sin imagen</span>
                    )}

                    <div className="absolute top-1 left-1 rounded bg-black/70 px-1 text-[9px] font-mono text-white">
                      #{idx + 1}
                    </div>

                    <div className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[9px] font-mono text-slate-300">
                      {scene.duration.toFixed(1)}s
                    </div>
                  </div>

                  <div className="p-2">
                    <div className="text-[11px] font-bold text-white truncate">
                      {scene.title || `Escena ${idx + 1}`}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Scene Detailed Editor */}
        {currentScene && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-6 shadow-xl">
            {/* Top Toolbar of Scene: Reorder, Duplicate, Delete */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <span className="text-xs font-mono text-indigo-400 font-bold uppercase">
                  Escena #{selectedSceneIndex + 1}
                </span>
                <input
                  type="text"
                  value={currentScene.title}
                  onChange={(e) => updateScene({ title: e.target.value })}
                  className="block text-base font-bold text-white bg-transparent border-b border-transparent hover:border-slate-700 focus:border-indigo-500 focus:outline-none transition mt-0.5"
                />
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleMoveScene('up')}
                  disabled={selectedSceneIndex === 0}
                  className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 rounded-lg hover:bg-slate-800"
                  title="Mover hacia adelante"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleMoveScene('down')}
                  disabled={selectedSceneIndex === project.scenes.length - 1}
                  className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 rounded-lg hover:bg-slate-800"
                  title="Mover hacia atrás"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDuplicateScene}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                  title="Duplicar escena"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDeleteScene}
                  className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800"
                  title="Eliminar escena"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Split layout: Image Preview & Prompt on Left, Narration & Motion on Right */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: Visual Asset & Prompt */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Imagen de la escena
                  </label>
                  <button
                    onClick={handleRegenerateImage}
                    disabled={isRegeneratingImage}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600/30 border border-indigo-500/40 px-2.5 py-1 text-xs font-semibold text-indigo-300 hover:bg-indigo-600/50 active:scale-95 transition"
                  >
                    <RotateCw className={`w-3 h-3 ${isRegeneratingImage ? 'animate-spin' : ''}`} />
                    <span>{isRegeneratingImage ? 'Dibujando...' : 'Regenerar imagen'}</span>
                  </button>
                </div>

                <div className="relative aspect-video w-full rounded-xl bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center">
                  {currentScene.imageUrl ? (
                    <img
                      src={currentScene.imageUrl}
                      alt={currentScene.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="text-xs text-slate-500">Sin imagen generada</div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Prompt visual para Gemini (puedes ajustarlo antes de regenerar):
                  </label>
                  <textarea
                    value={currentScene.visualPrompt}
                    onChange={(e) => updateScene({ visualPrompt: e.target.value })}
                    rows={3}
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/90 p-2.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                  ></textarea>
                </div>
              </div>

              {/* Right Column: Narration, Voice, Animation & Subtitles */}
              <div className="space-y-4">
                {/* Narration Textarea */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Texto de narración y subtítulos
                    </label>
                    <div className="flex items-center gap-1.5">
                      {currentScene.audioUrl && (
                        <button
                          onClick={handlePlayVoice}
                          disabled={isPlayingAudio}
                          className="flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 px-2 py-0.5 rounded bg-slate-800"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>{isPlayingAudio ? 'Reproduciendo...' : 'Escuchar'}</span>
                        </button>
                      )}
                      <button
                        onClick={handleRegenerateVoice}
                        disabled={isRegeneratingVoice}
                        className="flex items-center gap-1 text-[11px] font-semibold text-violet-400 hover:text-violet-300 px-2 py-0.5 rounded bg-slate-800"
                      >
                        <Volume2 className={`w-3 h-3 ${isRegeneratingVoice ? 'animate-pulse' : ''}`} />
                        <span>{isRegeneratingVoice ? 'Grabando...' : 'Regenerar voz'}</span>
                      </button>
                    </div>
                  </div>

                  <textarea
                    value={currentScene.narrationText}
                    onChange={(e) => updateScene({ narrationText: e.target.value })}
                    rows={4}
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/90 p-3 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 leading-relaxed"
                  ></textarea>
                </div>

                {/* Duration & Camera Motion Controls */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Efecto de cámara (Ken Burns)
                    </label>
                    <select
                      value={currentScene.cameraMotion}
                      onChange={(e) => updateScene({ cameraMotion: e.target.value as CameraMotion })}
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="zoom_in">Zoom Lento Adelante (In)</option>
                      <option value="zoom_out">Zoom Lento Atrás (Out)</option>
                      <option value="pan_left">Paneo Izquierda</option>
                      <option value="pan_right">Paneo Derecha</option>
                      <option value="static">Ninguno (Fijo)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Transición</label>
                    <select
                      value={currentScene.transition}
                      onChange={(e) => updateScene({ transition: e.target.value as SceneTransition })}
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="fade">Desvanecido suave (Fade)</option>
                      <option value="cut">Corte directo (Cut)</option>
                    </select>
                  </div>
                </div>

                {/* Duration slider */}
                <div>
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Duración de la escena</span>
                    <span className="font-bold text-indigo-400 font-mono">
                      {currentScene.duration.toFixed(1)} segundos
                    </span>
                  </div>
                  <input
                    type="range"
                    min="2.0"
                    max="15.0"
                    step="0.5"
                    value={currentScene.duration}
                    onChange={(e) => updateScene({ duration: parseFloat(e.target.value) })}
                    className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Floating Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-safe bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent border-t border-slate-800/60 z-30">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <button
            onClick={onBack}
            className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
          >
            Volver al Inicio
          </button>

          <button
            onClick={onPreviewExport}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 px-5 py-2.5 text-xs font-bold text-white shadow-lg active:scale-95 transition"
          >
            <Eye className="w-4 h-4" />
            <span>Ver Video y Exportar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
