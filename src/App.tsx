import React, { useEffect, useState } from 'react';
import { VideoProject } from './types';
import { getAllProjects, saveProject, deleteProjectById, getProjectById } from './services/db';
import { HomeView } from './views/HomeView';
import { NewProjectView } from './views/NewProjectView';
import { GeneratingView } from './views/GeneratingView';
import { EditorView } from './views/EditorView';
import { PreviewExportView } from './views/PreviewExportView';
import { WifiOff } from 'lucide-react';

export default function App() {
  const [currentView, setCurrentView] = useState<'home' | 'new' | 'generating' | 'editor' | 'preview'>('home');
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [newProjectInitial, setNewProjectInitial] = useState<{ title: string; script: string } | undefined>(undefined);
  const [isTestMode, setIsTestMode] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // Monitor network status for PWA reliability
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load projects from IndexedDB on startup
  const loadProjects = async () => {
    try {
      const projs = await getAllProjects();
      setProjects(projs);
    } catch (err) {
      console.error('Error al cargar proyectos:', err);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const activeProject = projects.find((p) => p.id === activeProjectId) || null;

  // Handlers
  const handleNewProject = (initial?: { title: string; script: string }) => {
    setNewProjectInitial(initial);
    setCurrentView('new');
  };

  const handleStartGeneration = async (projectConfig: Partial<VideoProject>, testMode: boolean) => {
    const newId = `project_${Date.now()}`;
    const newProject: VideoProject = {
      id: newId,
      title: projectConfig.title || 'Mi Video IA',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      aspectRatio: projectConfig.aspectRatio || '16:9',
      rawScript: projectConfig.rawScript || '',
      visualStyle: projectConfig.visualStyle || '',
      voiceName: projectConfig.voiceName || 'Kore',
      voiceSpeed: projectConfig.voiceSpeed || 1.1,
      voiceTone: projectConfig.voiceTone || 'informativo',
      music: projectConfig.music || {
        id: 'lofi-chill',
        name: 'Lo-Fi Chill Hop',
        type: 'preset',
        volume: 0.25,
        presetType: 'lofi',
      },
      status: 'generating',
      scenes: [],
      testMode,
    };

    await saveProject(newProject);
    await loadProjects();
    setActiveProjectId(newId);
    setIsTestMode(testMode);
    setCurrentView('generating');
  };

  const handleOpenProject = (projectId: string) => {
    const proj = projects.find((p) => p.id === projectId);
    if (!proj) return;
    setActiveProjectId(projectId);

    if (proj.status === 'ready') {
      setCurrentView('preview');
    } else if (proj.status === 'generating' || proj.status === 'paused') {
      setCurrentView('generating');
    } else {
      setCurrentView('editor');
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    await deleteProjectById(projectId);
    if (activeProjectId === projectId) {
      setActiveProjectId(null);
    }
    await loadProjects();
  };

  const handleDuplicateProject = async (projectId: string) => {
    const proj = projects.find((p) => p.id === projectId);
    if (!proj) return;

    const duplicated: VideoProject = {
      ...proj,
      id: `project_${Date.now()}`,
      title: `${proj.title} (Copia)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveProject(duplicated);
    await loadProjects();
  };

  const handleProjectUpdated = (updated: VideoProject) => {
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Offline Toast Banner */}
      {!isOnline && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl bg-amber-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 shadow-lg animate-bounce">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Sin conexión a internet. Los datos y videos guardados siguen disponibles.</span>
        </div>
      )}

      {/* Screen Routing */}
      {currentView === 'home' && (
        <HomeView
          projects={projects}
          onNewProject={handleNewProject}
          onOpenProject={handleOpenProject}
          onDeleteProject={handleDeleteProject}
          onDuplicateProject={handleDuplicateProject}
        />
      )}

      {currentView === 'new' && (
        <NewProjectView
          initialData={newProjectInitial}
          onCancel={() => setCurrentView('home')}
          onGenerate={handleStartGeneration}
        />
      )}

      {currentView === 'generating' && activeProject && (
        <GeneratingView
          project={activeProject}
          testMode={isTestMode}
          onProjectUpdated={handleProjectUpdated}
          onComplete={() => setCurrentView('preview')}
          onCancel={() => {
            loadProjects();
            setCurrentView('home');
          }}
        />
      )}

      {currentView === 'editor' && activeProject && (
        <EditorView
          project={activeProject}
          onProjectUpdated={handleProjectUpdated}
          onPreviewExport={() => setCurrentView('preview')}
          onBack={() => {
            loadProjects();
            setCurrentView('home');
          }}
        />
      )}

      {currentView === 'preview' && activeProject && (
        <PreviewExportView
          project={activeProject}
          onEditScenes={() => setCurrentView('editor')}
          onBack={() => {
            loadProjects();
            setCurrentView('home');
          }}
        />
      )}
    </div>
  );
}
