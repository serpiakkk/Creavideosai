import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCw,
  Sparkles,
  ArrowRight,
  Image as ImageIcon,
  Volume2,
  ShieldAlert,
  Play
} from 'lucide-react';
import { SceneItem, VideoProject } from '../types';
import { saveProject } from '../services/db';
import {
  generateImageWithGemini,
  generateVoiceWithGemini,
  getAudioDuration,
  parseScriptWithGemini,
} from '../services/geminiService';

interface GeneratingViewProps {
  project: VideoProject;
  testMode?: boolean;
  onProjectUpdated: (project: VideoProject) => void;
  onComplete: () => void;
  onCancel: () => void;
}

export const GeneratingView: React.FC<GeneratingViewProps> = ({
  project: initialProject,
  testMode = false,
  onProjectUpdated,
  onComplete,
  onCancel,
}) => {
  const [project, setProject] = useState<VideoProject>(initialProject);
  const [currentStepText, setCurrentStepText] = useState('Iniciando generador inteligente...');
  const [overallProgress, setOverallProgress] = useState(0);
  const [isPausedDueToQuota, setIsPausedDueToQuota] = useState(false);
  const [estimatedResumeTime, setEstimatedResumeTime] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const isCancelledRef = useRef(false);

  // Sync state upward
  const updateProjectState = async (updated: VideoProject) => {
    setProject(updated);
    onProjectUpdated(updated);
    await saveProject(updated);
  };

  // Helper delay between calls to respect free tier RPM limits
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const startPipeline = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    isCancelledRef.current = false;
    setIsPausedDueToQuota(false);

    let currentProject = { ...project };

    try {
      // Step A: Parse Script if scenes are empty or need creation
      if (currentProject.scenes.length === 0) {
        setCurrentStepText('Analizando guion y estructurando escenas con Gemini...');
        setOverallProgress(10);

        const parseResult = await parseScriptWithGemini(
          currentProject.rawScript,
          currentProject.visualStyle,
          testMode ? 2 : undefined
        );

        const newScenes: SceneItem[] = parseResult.scenes.map((s, idx) => ({
          ...s,
          id: `scene_${Date.now()}_${idx}`,
          order: idx,
          cameraMotion: (s.cameraMotion as any) || 'zoom_in',
          transition: 'fade',
          status: 'pending',
          duration: s.estimatedDuration || 4.0,
        }));

        currentProject = {
          ...currentProject,
          title: currentProject.title || parseResult.title,
          scenes: newScenes,
          status: 'generating',
        };

        await updateProjectState(currentProject);
        // Short rest to prevent burst limit
        await delay(2500);
      }

      // Step B: Iterate over scenes sequentially
      const totalScenes = currentProject.scenes.length;

      for (let i = 0; i < totalScenes; i++) {
        if (isCancelledRef.current) break;

        const scene = currentProject.scenes[i];

        // Skip scenes that are already ready (prevents wasting quota on resume)
        if (scene.status === 'ready' && scene.imageUrl && scene.audioUrl) {
          continue;
        }

        // 1. Generate Image for Scene
        if (!scene.imageUrl) {
          setCurrentStepText(`Dibujando escena ${i + 1} de ${totalScenes}...`);
          scene.status = 'generating_image';
          await updateProjectState({ ...currentProject });

          try {
            const imgRes = await generateImageWithGemini(
              scene.visualPrompt,
              currentProject.aspectRatio,
              {
                title: scene.title,
                narrationText: scene.narrationText,
                keywords: scene.keywords,
              }
            );
            scene.imageUrl = imgRes.imageUrl;
            scene.status = 'generating_voice';
            await updateProjectState({ ...currentProject });
          } catch (err: any) {
            console.error(`Error generando imagen para escena ${i + 1}:`, err);
            scene.status = 'error';
            scene.errorMessage = 'Error en ilustración. Toca reintentar.';
            await updateProjectState({ ...currentProject });
            continue;
          }

          // Delay moderado
          await delay(testMode ? 1200 : 2000);
        }

        if (isCancelledRef.current) break;

        // 2. Generate Voice Narration for Scene
        if (!scene.audioUrl) {
          setCurrentStepText(`Grabando voz para escena ${i + 1} de ${totalScenes}...`);
          scene.status = 'generating_voice';
          await updateProjectState({ ...currentProject });

          try {
            const voiceRes = await generateVoiceWithGemini(
              scene.narrationText,
              currentProject.voiceName,
              currentProject.voiceSpeed,
              currentProject.voiceTone
            );
            scene.audioUrl = voiceRes.audioUrl;
            // Requisito 3: Duración de escena = max(2.5, duración de la voz + 0.3 s)
            const measuredDuration = await getAudioDuration(voiceRes.audioUrl);
            scene.duration = Math.max(2.5, measuredDuration + 0.3);
            scene.status = 'ready';
            await updateProjectState({ ...currentProject });
          } catch (err: any) {
            console.warn(`Error de voz en escena ${i + 1}:`, err);
            if (err?.isQuotaError) {
              // Requisito 1: NO marques la escena como lista: pausa el proceso, guarda el progreso, muestra el aviso de cuota
              scene.status = 'pending';
              await updateProjectState({ ...currentProject });
              handleQuotaExhausted(currentProject);
              return;
            } else {
              scene.status = 'error';
              scene.errorMessage = 'Error en la voz.';
              await updateProjectState({ ...currentProject });
              continue;
            }
          }

          // Politeness delay
          await delay(3000);
        }

        // Calculate progress percentage
        const readyScenes = currentProject.scenes.filter((s) => s.status === 'ready').length;
        const progressPct = Math.round(15 + (readyScenes / totalScenes) * 85);
        setOverallProgress(progressPct);
      }

      // Check if all scenes are ready
      const allReady = currentProject.scenes.every((s) => s.status === 'ready');
      if (allReady) {
        currentProject.status = 'ready';
        setCurrentStepText('¡Video completo generado con éxito!');
        setOverallProgress(100);
        await updateProjectState(currentProject);
        setTimeout(() => {
          onComplete();
        }, 800);
      } else {
        currentProject.status = 'paused';
        setCurrentStepText('Algunas escenas requieren atención o reintento.');
        await updateProjectState(currentProject);
      }
    } catch (err: any) {
      console.error('Error en pipeline de generación:', err);
      if (err?.isQuotaError) {
        handleQuotaExhausted(currentProject);
      } else {
        setCurrentStepText(`Error: ${err?.message || 'Error inesperado'}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQuotaExhausted = (currProj: VideoProject) => {
    currProj.status = 'paused';
    updateProjectState(currProj);
    setIsPausedDueToQuota(true);
    setIsProcessing(false);

    // Calculate resume time: usually free tier resets or clears in 60 seconds
    const resumeDate = new Date(Date.now() + 65 * 1000);
    const resumeString = resumeDate.toLocaleTimeString('es-ES', {
      minute: '2-digit',
      second: '2-digit',
    });
    setEstimatedResumeTime(resumeString);
    setCurrentStepText('Límite de cuota gratuito alcanzado. Progreso guardado.');
  };

  // Retry individual scene
  const retryScene = async (sceneId: string) => {
    const scene = project.scenes.find((s) => s.id === sceneId);
    if (!scene) return;

    scene.status = 'generating_image';
    scene.errorMessage = undefined;
    await updateProjectState({ ...project });

    try {
      if (!scene.imageUrl) {
        const imgRes = await generateImageWithGemini(
          scene.visualPrompt,
          project.aspectRatio,
          {
            title: scene.title,
            narrationText: scene.narrationText,
            keywords: scene.keywords,
          }
        );
        scene.imageUrl = imgRes.imageUrl;
      }

      if (!scene.audioUrl) {
        const voiceRes = await generateVoiceWithGemini(
          scene.narrationText,
          project.voiceName,
          project.voiceSpeed,
          project.voiceTone
        );
        scene.audioUrl = voiceRes.audioUrl;
        scene.duration = await getAudioDuration(voiceRes.audioUrl);
      }

      scene.status = 'ready';
      await updateProjectState({ ...project });
    } catch (err: any) {
      scene.status = 'error';
      scene.errorMessage = 'Reintento fallido.';
      await updateProjectState({ ...project });
    }
  };

  useEffect(() => {
    startPipeline();
    return () => {
      isCancelledRef.current = true;
    };
  }, []);

  const readyScenesCount = project.scenes.filter((s) => s.status === 'ready').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-28">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 py-3.5 bg-slate-950/85 backdrop-blur-md border-b border-slate-800/80 pt-safe">
        <button
          onClick={onCancel}
          className="text-xs font-semibold text-slate-400 hover:text-white"
        >
          Guardar y Salir
        </button>
        <span className="text-sm font-bold text-white truncate max-w-[200px]">
          {project.title}
        </span>
        <div className="w-16 text-right">
          <span className="text-xs font-mono text-indigo-400 font-bold">
            {overallProgress}%
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Progress Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
              <span className="text-xs font-bold text-slate-200">{currentStepText}</span>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {readyScenesCount} de {project.scenes.length || '?'} listas
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700/60">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 via-indigo-400 to-violet-500 rounded-full transition-all duration-500"
              style={{ width: `${overallProgress}%` }}
            ></div>
          </div>
        </div>

        {/* Quota Pause Alert Banner */}
        {isPausedDueToQuota && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-950/40 p-4 sm:p-5 text-amber-200 space-y-3 shadow-lg">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-white">
                  Límite de cuota de la cuenta gratuita alcanzado
                </h4>
                <p className="text-xs text-amber-300/90 leading-relaxed mt-1">
                  Tu progreso está 100% guardado en el dispositivo. La API de Gemini se recuperará en aproximadamente 1 minuto (a las {estimatedResumeTime || 'breve'}).
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={startPipeline}
                disabled={isProcessing}
                className="flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2.5 text-xs font-bold shadow-md active:scale-95 transition"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                <span>Continuar donde me quedé</span>
              </button>
            </div>
          </div>
        )}

        {/* Scene Cards Live Status */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Escenas del video
          </h3>

          {project.scenes.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-8 text-center text-xs text-slate-500">
              Analizando guion y preparando escenas...
            </div>
          ) : (
            project.scenes.map((scene, idx) => {
              const isReady = scene.status === 'ready';
              const isGeneratingImg = scene.status === 'generating_image';
              const isGeneratingVoice = scene.status === 'generating_voice';
              const isError = scene.status === 'error';

              return (
                <div
                  key={scene.id}
                  className={`flex items-center gap-3.5 p-3.5 rounded-2xl border transition ${
                    isReady
                      ? 'border-emerald-500/20 bg-slate-900/60'
                      : isError
                      ? 'border-rose-500/30 bg-rose-950/20'
                      : 'border-slate-800 bg-slate-900/40'
                  }`}
                >
                  {/* Thumbnail / Status Box */}
                  <div className="relative w-20 h-14 sm:w-24 sm:h-16 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                    {scene.imageUrl ? (
                      <img
                        src={scene.imageUrl}
                        alt={scene.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-600">
                        {isGeneratingImg ? (
                          <RotateCw className="w-5 h-5 text-indigo-400 animate-spin" />
                        ) : (
                          <ImageIcon className="w-5 h-5" />
                        )}
                      </div>
                    )}

                    {/* Small Status Tag */}
                    <div className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[9px] font-mono text-slate-300">
                      {scene.duration ? `${scene.duration.toFixed(1)}s` : ''}
                    </div>
                  </div>

                  {/* Scene Text & Status */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-white truncate">
                        {scene.title || `Escena ${idx + 1}`}
                      </span>
                      {isReady && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                    </div>

                    <p className="text-[11px] text-slate-400 line-clamp-1 leading-snug">
                      {scene.narrationText}
                    </p>

                    {/* Live status caption */}
                    <div className="flex items-center gap-2 mt-1.5 text-[10px]">
                      {isGeneratingImg && (
                        <span className="text-indigo-400 flex items-center gap-1 font-medium">
                          <RotateCw className="w-2.5 h-2.5 animate-spin" />
                          Generando imagen IA...
                        </span>
                      )}
                      {isGeneratingVoice && (
                        <span className="text-violet-400 flex items-center gap-1 font-medium">
                          <Volume2 className="w-2.5 h-2.5 animate-pulse" />
                          Sintetizando voz en off...
                        </span>
                      )}
                      {isReady && (
                        <span className="text-emerald-400 font-medium">Escena lista</span>
                      )}
                      {isError && (
                        <span className="text-rose-400 font-medium">
                          {scene.errorMessage || 'Error en la escena'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions / Retry */}
                  {isError && (
                    <button
                      onClick={() => retryScene(scene.id)}
                      className="p-2 rounded-xl bg-rose-600/20 text-rose-300 hover:bg-rose-600/30 border border-rose-500/30 transition text-xs font-semibold"
                      title="Reintentar escena"
                    >
                      <RotateCw className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* Sticky Bottom Actions */}
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-safe bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent border-t border-slate-800/60 z-30">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <button
            onClick={onCancel}
            className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
          >
            Pausar y Volver
          </button>

          {readyScenesCount > 0 && (
            <button
              onClick={onComplete}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 text-xs font-bold text-white shadow-lg active:scale-95 transition"
            >
              <span>Ver video ({readyScenesCount} escenas)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
