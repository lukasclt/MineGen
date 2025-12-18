
import { GeneratedProject } from "../types";

// --- IndexedDB Configuration ---
const DB_NAME = 'MineGenDB';
const STORE_NAME = 'projectHandles';

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const saveDirectoryHandleToDB = async (projectId: string, handle: any) => {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(handle, projectId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getDirectoryHandleFromDB = async (projectId: string): Promise<any> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(projectId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// --- Standard File System API ---

export const getDirectoryHandle = async () => {
  if (!('showDirectoryPicker' in window)) {
    throw new Error("Seu navegador não suporta acesso direto a pastas. Use Chrome, Edge ou Opera.");
  }
  // @ts-ignore
  return await window.showDirectoryPicker();
};

export const verifyPermission = async (fileHandle: any, readWrite: boolean = true) => {
  const options = { mode: readWrite ? 'readwrite' : 'read' };
  
  // Check if permission is already granted
  if ((await fileHandle.queryPermission(options)) === 'granted') {
    return true;
  }
  
  // Request permission. This MUST be called inside a user gesture (click handler)
  if ((await fileHandle.requestPermission(options)) === 'granted') {
    return true;
  }
  
  return false;
};

export const saveProjectToDisk = async (directoryHandle: any, project: GeneratedProject) => {
  if (!directoryHandle) return;

  for (const file of project.files) {
    const parts = file.path.split('/');
    const fileName = parts.pop();
    const directories = parts;

    let currentDirHandle = directoryHandle;

    // Navigate or create directories recursively
    for (const dir of directories) {
      if (dir === '.' || dir === '') continue;
      currentDirHandle = await currentDirHandle.getDirectoryHandle(dir, { create: true });
    }

    // Create and write file
    if (fileName) {
      const fileHandle = await currentDirHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(file.content);
      await writable.close();
    }
  }
};
