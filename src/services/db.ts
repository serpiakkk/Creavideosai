import { VideoProject } from '../types';

const DB_NAME = 'autovideo_ia_db';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllProjects(): Promise<VideoProject[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_PROJECTS, 'readonly');
      const store = transaction.objectStore(STORE_PROJECTS);
      const request = store.getAll();

      request.onsuccess = () => {
        const projects = (request.result as VideoProject[]) || [];
        // Sort newest first
        projects.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(projects);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Error al obtener proyectos de IndexedDB:', err);
    return [];
  }
}

export async function getProjectById(id: string): Promise<VideoProject | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_PROJECTS, 'readonly');
      const store = transaction.objectStore(STORE_PROJECTS);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error(`Error al obtener proyecto ${id} de IndexedDB:`, err);
    return null;
  }
}

async function blobUrlToDataUrl(url: string): Promise<string> {
  if (!url || !url.startsWith('blob:')) return url;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(url);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('No se pudo convertir blob URL a Data URL:', err);
    return url;
  }
}

export async function saveProject(project: VideoProject): Promise<void> {
  try {
    const db = await openDB();

    // Requisito 20: Nunca guardar enlaces blob: (se rompen al cerrar la app)
    const sanitizedScenes = await Promise.all(
      (project.scenes || []).map(async (scene) => {
        let imageUrl = scene.imageUrl;
        let audioUrl = scene.audioUrl;
        if (imageUrl?.startsWith('blob:')) {
          imageUrl = await blobUrlToDataUrl(imageUrl);
        }
        if (audioUrl?.startsWith('blob:')) {
          audioUrl = await blobUrlToDataUrl(audioUrl);
        }
        return {
          ...scene,
          imageUrl,
          audioUrl,
        };
      })
    );

    let customMusicUrl = project.music?.customAudioUrl;
    if (customMusicUrl?.startsWith('blob:')) {
      customMusicUrl = await blobUrlToDataUrl(customMusicUrl);
    }

    const updatedProject: VideoProject = {
      ...project,
      scenes: sanitizedScenes,
      music: {
        ...project.music,
        customAudioUrl: customMusicUrl,
      },
      updatedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_PROJECTS, 'readwrite');
      const store = transaction.objectStore(STORE_PROJECTS);
      const request = store.put(updatedProject);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Error al guardar proyecto en IndexedDB:', err);
    throw err;
  }
}

export async function deleteProjectById(id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_PROJECTS, 'readwrite');
      const store = transaction.objectStore(STORE_PROJECTS);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error(`Error al borrar proyecto ${id} de IndexedDB:`, err);
    throw err;
  }
}
