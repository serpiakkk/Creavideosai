import React, { useState } from 'react';
import { Plus, Video, Calendar, Sparkles, Trash2, Copy, Play, Film, AlertCircle } from 'lucide-react';
import { VideoProject } from '../types';
import { PWAInstallButton } from '../components/pwa/PWAInstallButton';
import { DEMO_SCRIPTS } from '../utils/constants';

interface HomeViewProps {
  projects: VideoProject[];
  onNewProject: (initialScript?: { title: string; script: string }) => void;
  onOpenProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onDuplicateProject: (projectId: string) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  projects,
  onNewProject,
  onOpenProject,
  onDeleteProject,
  onDuplicateProject,
}) => {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const formatDate = (timestamp: number) => {
    return new Intl.DateTimeFormat('es-ES', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp));
  };

  const getStatusBadge = (status: VideoProject['status']) => {
    switch (status) {
      case 'ready':
        return <span className="text-xs font-semibold text-emerald-400">Listo</span>;
      case 'generating':
        return <span className="text-xs font-semibold text-amber-400">Generando...</span>;
      case 'paused':
        return <span className="text-xs font-semibold text-rose-400">Pausado</span>;
      case 'draft':
      default:
        return <span className="text-xs font-semibold text-slate-400">Borrador</span>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-28">
      {/* Top Bar following contract */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-4 px-4 sm:px-6 py-3.5 bg-slate-950/85 backdrop-blur-md border-b border-slate-800/80 pt-safe">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <Film className="w-5 h-5" />
          </div>
          <span className="text-lg font-bold tracking-tight text-white whitespace-nowrap">
            AutoVideo IA
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <PWAInstallButton />
          <button
            onClick={() => onNewProject()}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md hover:bg-indigo-500 active:scale-[0.98] transition"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nuevo video</span>
            <span className="sm:hidden">Crear</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6">
        {/* Hero Card / Welcome */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-950/60 via-slate-900/80 to-slate-900 border border-indigo-500/20 p-5 sm:p-7 mb-8 shadow-xl">
          <div className="relative z-10 max-w-2xl">
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>De Guion a Video Autónomo</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-snug mb-2">
              Crea videos completos en minutos con voz de Gemini e imágenes IA
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed mb-5">
              Pega tu guion en español. AutoVideo IA se encarga de las imágenes, narración,
              subtítulos dinámicos de TikTok/YouTube y el montaje final descargable.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => onNewProject()}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 hover:from-indigo-500 hover:to-violet-500 active:scale-[0.98] transition"
              >
                <Plus className="w-4 h-4" />
                <span>Crear nuevo video</span>
              </button>

              <button
                onClick={() => onNewProject(DEMO_SCRIPTS[0])}
                className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 active:scale-[0.98] transition"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Cargar guion de ejemplo</span>
              </button>
            </div>
          </div>
        </div>

        {/* Projects Section Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Mis Proyectos</h2>
            <p className="text-xs text-slate-400">
              {projects.length} {projects.length === 1 ? 'video guardado' : 'videos guardados'} en este dispositivo
            </p>
          </div>
        </div>

        {/* Projects Grid or Zero State */}
        {projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-8 sm:p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-indigo-950/60 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mx-auto mb-4">
              <Video className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Aún no tienes ningún video</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mb-6">
              Pega un guion o prueba con una de nuestras plantillas para generar tu primer video con IA.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={() => onNewProject()}
                className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-indigo-500 transition"
              >
                Empezar de cero
              </button>
              <button
                onClick={() => onNewProject(DEMO_SCRIPTS[0])}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
              >
                Probar con guion de ejemplo
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => {
              const firstSceneImage = project.scenes.find((s) => s.imageUrl)?.imageUrl;
              const readyCount = project.scenes.filter((s) => s.status === 'ready').length;

              return (
                <div
                  key={project.id}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/60 hover:bg-slate-900 hover:border-slate-700 transition shadow-lg"
                >
                  {/* Thumbnail Container */}
                  <div
                    onClick={() => onOpenProject(project.id)}
                    className="relative aspect-video w-full cursor-pointer bg-slate-950 overflow-hidden flex items-center justify-center"
                  >
                    {firstSceneImage ? (
                      <img
                        src={firstSceneImage}
                        alt={project.title}
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-600 gap-2">
                        <Video className="w-8 h-8 text-indigo-400/60" />
                        <span className="text-[11px] text-slate-400">Vista previa</span>
                      </div>
                    )}

                    {/* Aspect Ratio Badge */}
                    <div className="absolute top-2.5 left-2.5 rounded-md bg-black/70 backdrop-blur-md px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                      {project.aspectRatio}
                    </div>

                    {/* Status Badge */}
                    <div className="absolute top-2.5 right-2.5 rounded-md bg-black/70 backdrop-blur-md px-2 py-0.5">
                      {getStatusBadge(project.status)}
                    </div>

                    {/* Play Overlay on Hover */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <div className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                        <Play className="w-5 h-5 ml-0.5 fill-current" />
                      </div>
                    </div>
                  </div>

                  {/* Card Info */}
                  <div className="flex flex-col flex-1 p-4">
                    <div
                      onClick={() => onOpenProject(project.id)}
                      className="cursor-pointer mb-2 flex-1"
                    >
                      <h3 className="text-sm font-bold text-white group-hover:text-indigo-400 transition-colors line-clamp-1">
                        {project.title || 'Video sin título'}
                      </h3>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                        <Calendar className="w-3 h-3" />
                        <span>{formatDate(project.updatedAt)}</span>
                        <span>·</span>
                        <span>{project.scenes.length} {project.scenes.length === 1 ? 'escena' : 'escenas'}</span>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between border-t border-slate-800/80 pt-3 mt-1">
                      <div className="text-[11px] text-slate-400">
                        Progreso: <span className="font-semibold text-slate-200">{readyCount}/{project.scenes.length}</span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onDuplicateProject(project.id)}
                          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                          title="Duplicar proyecto"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>

                        {deleteConfirmId === project.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                onDeleteProject(project.id);
                                setDeleteConfirmId(null);
                              }}
                              className="px-2 py-1 text-[10px] font-bold bg-rose-600 text-white rounded-md hover:bg-rose-500"
                            >
                              Borrar
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="px-2 py-1 text-[10px] text-slate-400 hover:text-white"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirmId(project.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition"
                            title="Eliminar proyecto"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating Bottom Action for thumb ergonomics */}
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-safe bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent pointer-events-none z-20">
        <div className="max-w-md mx-auto pointer-events-auto">
          <button
            onClick={() => onNewProject()}
            className="w-full h-13 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xl shadow-indigo-600/30 active:scale-[0.98] transition-transform"
          >
            <Plus className="w-5 h-5" />
            <span>Crear nuevo video</span>
          </button>
        </div>
      </div>
    </div>
  );
};
