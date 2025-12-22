
import { GeneratedProject, GeneratedFile, PluginSettings, BuildSystem, Platform, JavaVersion, SavedProject } from "../types";

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

const IGNORED_DIRS = new Set(['.git', 'target', 'build', '.idea', 'node_modules', '.gradle', 'bin', '.minegen']);
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

// Nova função para checar sem pedir (útil para UI state)
export const checkPermissionStatus = async (fileHandle: any): Promise<'granted' | 'prompt' | 'denied'> => {
  if (!fileHandle) return 'denied';
  return await fileHandle.queryPermission({ mode: 'readwrite' });
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
          else if (entry.name.endsWith('.gradle')) language = 'gradle';

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
  
  files.sort((a, b) => {
    if (a.path === 'pom.xml' || a.path === 'build.gradle') return -1;
    if (b.path === 'pom.xml' || b.path === 'build.gradle') return 1;
    return a.path.localeCompare(b.path);
  });

  return {
    explanation: "Projeto carregado do disco.",
    files: files
  };
};

// --- Intelligent Project Analysis ---

export const detectProjectSettings = (files: GeneratedFile[]): Partial<PluginSettings> => {
    const settings: Partial<PluginSettings> = {};

    const pom = files.find(f => f.path.endsWith('pom.xml'));
    const gradle = files.find(f => f.path.endsWith('build.gradle') || f.path.endsWith('build.gradle.kts'));

    if (pom) {
        settings.buildSystem = BuildSystem.MAVEN;
        const artifactIdMatch = pom.content.match(/<artifactId>(.*?)<\/artifactId>/);
        const groupIdMatch = pom.content.match(/<groupId>(.*?)<\/groupId>/);
        const javaVersionMatch = pom.content.match(/<java\.version>(.*?)<\/java\.version>/) || 
                                 pom.content.match(/<maven\.compiler\.source>(.*?)<\/maven\.compiler\.source>/);
        
        if (artifactIdMatch) settings.name = artifactIdMatch[1];
        if (groupIdMatch) settings.groupId = groupIdMatch[1];
        if (artifactIdMatch) settings.artifactId = artifactIdMatch[1]; 
        
        if (javaVersionMatch) {
            const ver = javaVersionMatch[1];
            if (ver.includes('1.8')) settings.javaVersion = JavaVersion.JAVA_8;
            else if (ver.includes('11')) settings.javaVersion = JavaVersion.JAVA_11;
            else if (ver.includes('16')) settings.javaVersion = JavaVersion.JAVA_16;
            else if (ver.includes('17')) settings.javaVersion = JavaVersion.JAVA_17;
            else if (ver.includes('21')) settings.javaVersion = JavaVersion.JAVA_21;
        }

        if (pom.content.includes('io.papermc.paper')) settings.platform = Platform.PAPER;
        else if (pom.content.includes('org.spigotmc')) settings.platform = Platform.SPIGOT;
        else if (pom.content.includes('com.velocitypowered')) settings.platform = Platform.VELOCITY;
        else if (pom.content.includes('net.md-5')) settings.platform = Platform.BUNGEECORD;

    } else if (gradle) {
        settings.buildSystem = BuildSystem.GRADLE;
        const settingsGradle = files.find(f => f.path.endsWith('settings.gradle'));
        if (settingsGradle) {
             const nameMatch = settingsGradle.content.match(/rootProject\.name\s*=\s*['"](.*?)['"]/);
             if (nameMatch) settings.name = nameMatch[1];
        }

        if (gradle.content.includes('io.papermc.paper') || gradle.content.includes('paper-api')) settings.platform = Platform.PAPER;
        else if (gradle.content.includes('org.spigotmc')) settings.platform = Platform.SPIGOT;
        else if (gradle.content.includes('com.velocitypowered')) settings.platform = Platform.VELOCITY;
        
        if (gradle.content.includes('JavaLanguageVersion.of(17)')) settings.javaVersion = JavaVersion.JAVA_17;
        else if (gradle.content.includes('JavaLanguageVersion.of(21)')) settings.javaVersion = JavaVersion.JAVA_21;
        else if (gradle.content.includes('sourceCompatibility = 1.8') || gradle.content.includes('sourceCompatibility = \'1.8\'')) settings.javaVersion = JavaVersion.JAVA_8;
        else if (gradle.content.includes('sourceCompatibility = 17')) settings.javaVersion = JavaVersion.JAVA_17;
    }

    return settings;
};

export const saveFileToDisk = async (directoryHandle: any, path: string, content: string) => {
  if (!directoryHandle) throw new Error("Sem diretório vinculado.");

  // CRÍTICO: Checagem rápida de permissão antes de tentar
  // Se não tiver permissão, o 'createWritable' vai falhar, mas queremos um erro claro.
  // Nota: Não podemos chamar 'requestPermission' aqui pois é async sem gesto do usuário.
  const perm = await directoryHandle.queryPermission({ mode: 'readwrite' });
  if (perm !== 'granted') {
     throw new Error("Permissão de escrita negada. Clique em 'Reconectar Pasta' no topo.");
  }

  const parts = path.split('/');
  const fileName = parts.pop();
  const directories = parts;

  let currentDirHandle = directoryHandle;

  for (const dir of directories) {
    if (dir === '.' || dir === '') continue;
    currentDirHandle = await currentDirHandle.getDirectoryHandle(dir, { create: true });
  }

  if (fileName) {
    const fileHandle = await currentDirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }
};

export const saveProjectToDisk = async (directoryHandle: any, project: GeneratedProject) => {
  if (!directoryHandle) return;

  for (const file of project.files) {
    await saveFileToDisk(directoryHandle, file.path, file.content);
  }
};

export const saveProjectStateToDisk = async (directoryHandle: any, projectData: SavedProject) => {
    if (!directoryHandle) return;
    
    // Verifica permissão antes de tentar salvar estado
    const perm = await directoryHandle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') return; // Silenciosamente ignora se não tiver permissão

    const stateToSave = JSON.stringify(projectData, null, 2);

    try {
        await saveFileToDisk(directoryHandle, '.minegen/state.json', stateToSave);
    } catch (e) {
        console.warn("Falha ao salvar .minegen/state.json", e);
    }
};

export const loadProjectStateFromDisk = async (directoryHandle: any): Promise<SavedProject | null> => {
    try {
        const perm = await directoryHandle.queryPermission({ mode: 'read' });
        if (perm !== 'granted') return null;

        const minegenDir = await directoryHandle.getDirectoryHandle('.minegen');
        const stateFile = await minegenDir.getFileHandle('state.json');
        const file = await stateFile.getFile();
        const text = await file.text();
        const data = JSON.parse(text) as SavedProject;
        return data;
    } catch (e) {
        return null;
    }
};
