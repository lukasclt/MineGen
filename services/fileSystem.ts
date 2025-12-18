
import { GeneratedProject, GeneratedFile } from "../types";

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

const IGNORED_DIRS = new Set(['.git', 'target', 'build', '.idea', 'node_modules', '.gradle', 'bin']);
const IGNORED_EXTENSIONS = new Set(['.jar', '.class', '.png', '.jpg', '.exe', '.dll', '.so', '.zip', '.gz']);

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

export const readProjectFromDisk = async (directoryHandle: any): Promise<GeneratedProject> => {
  const files: GeneratedFile[] = [];

  const readDirRecursive = async (dirHandle: any, pathPrefix: string) => {
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        const ext = '.' + entry.name.split('.').pop();
        if (IGNORED_EXTENSIONS.has(ext)) continue;

        try {
          const file = await entry.getFile();
          // Skip large files (> 1MB) to prevent context overflow
          if (file.size > 1024 * 1024) continue;

          const text = await file.text();
          const fullPath = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;

          let language: any = 'text';
          if (entry.name.endsWith('.java')) language = 'java';
          else if (entry.name.endsWith('.xml')) language = 'xml';
          else if (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml')) language = 'yaml';
          else if (entry.name.endsWith('.json')) language = 'json';

          files.push({
            path: fullPath,
            content: text,
            language: language
          });
        } catch (e) {
          console.warn(`Skipped file ${entry.name}`, e);
        }
      } else if (entry.kind === 'directory') {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await readDirRecursive(entry, pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name);
      }
    }
  };

  await readDirRecursive(directoryHandle, '');
  
  // Sort files to put pom.xml and main classes first (better for AI context)
  files.sort((a, b) => {
    if (a.path === 'pom.xml') return -1;
    if (b.path === 'pom.xml') return 1;
    return a.path.localeCompare(b.path);
  });

  return {
    explanation: "Projeto carregado do disco.",
    files: files
  };
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
