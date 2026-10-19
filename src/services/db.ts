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

export async function saveProject(project: VideoProject): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_PROJECTS, 'readwrite');
      const store = transaction.objectStore(STORE_PROJECTS);
      const updatedProject = {
        ...project,
        updatedAt: Date.now(),
      };
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
