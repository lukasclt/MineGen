
import { GeneratedProject } from "../types";

export const getDirectoryHandle = async () => {
  if (!('showDirectoryPicker' in window)) {
    throw new Error("Seu navegador não suporta acesso direto a pastas. Use Chrome, Edge ou Opera.");
  }
  // @ts-ignore - Typescript pode não reconhecer showDirectoryPicker nativamente sem config
  return await window.showDirectoryPicker();
};

export const verifyPermission = async (fileHandle: any, readWrite: boolean = true) => {
  const options = { mode: readWrite ? 'readwrite' : 'read' };
  if ((await fileHandle.queryPermission(options)) === 'granted') {
    return true;
  }
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

    // Navegar ou criar diretórios recursivamente (ex: src -> main -> java)
    for (const dir of directories) {
      if (dir === '.' || dir === '') continue;
      currentDirHandle = await currentDirHandle.getDirectoryHandle(dir, { create: true });
    }

    // Criar e escrever no arquivo
    if (fileName) {
      const fileHandle = await currentDirHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(file.content);
      await writable.close();
    }
  }
};
