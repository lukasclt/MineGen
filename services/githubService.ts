
import { GeneratedFile, GitHubRepo } from "../types";

const GITHUB_API_URL = "https://api.github.com";

const getHeaders = (token: string) => ({
  "Authorization": `token ${token}`,
  "Accept": "application/vnd.github.v3+json",
  "Content-Type": "application/json",
});

// --- USER & REPOS ---

export const getAuthenticatedUser = async (token: string) => {
    const res = await fetch(`${GITHUB_API_URL}/user`, { headers: getHeaders(token) });
    if (!res.ok) throw new Error("Token inválido");
    return await res.json();
};

export const getUserRepos = async (token: string) => {
    const res = await fetch(`${GITHUB_API_URL}/user/repos?sort=updated&per_page=50`, { headers: getHeaders(token) });
    if (!res.ok) throw new Error("Erro ao buscar repositórios");
    return await res.json();
};

export const createRepository = async (token: string, name: string, description: string) => {
    const res = await fetch(`${GITHUB_API_URL}/user/repos`, {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify({ name, description, private: true, auto_init: true }) // Auto init cria branch main
    });
    if (!res.ok) throw new Error("Erro ao criar repositório");
    return await res.json();
};

// --- FILE SYSTEM EMULATION ---

export const getRepoFiles = async (token: string, owner: string, repo: string, path: string = ''): Promise<GeneratedFile[]> => {
    const res = await fetch(`${GITHUB_API_URL}/repos/${owner}/${repo}/contents/${path}`, { headers: getHeaders(token) });
    if (!res.ok) return []; // Pode estar vazio ou path não existe

    const items = await res.json();
    if (!Array.isArray(items)) return [];

    let files: GeneratedFile[] = [];

    for (const item of items) {
        if (item.type === 'file') {
            // Ignorar binários e arquivos grandes
            if (item.name.endsWith('.jar') || item.size > 100000) continue;

            const contentRes = await fetch(item.url, { headers: getHeaders(token) });
            const contentData = await contentRes.json();
            const content = atob(contentData.content);
            
            files.push({
                path: item.path,
                content: content,
                language: item.name.endsWith('.java') ? 'java' : 'text'
            });
        } else if (item.type === 'dir' && !item.name.startsWith('.')) {
            // Recursão simples (cuidado com limites de taxa)
            const subFiles = await getRepoFiles(token, owner, repo, item.path);
            files = [...files, ...subFiles];
        }
    }
    return files;
};

// --- COMMIT COMPLEXO (GIT TREE API) ---
// Isso evita múltiplos commits "spam" e permite commitar vários arquivos de uma vez

export const commitToRepo = async (
    token: string, 
    owner: string, 
    repo: string, 
    files: GeneratedFile[], 
    message: string,
    description: string = ""
) => {
    const branch = 'main';

    // 1. Pegar referência do último commit da branch main
    const refRes = await fetch(`${GITHUB_API_URL}/repos/${owner}/${repo}/git/ref/heads/${branch}`, { headers: getHeaders(token) });
    if (!refRes.ok) throw new Error("Não foi possível encontrar a branch main. Inicialize o repo.");
    const refData = await refRes.json();
    const latestCommitSha = refData.object.sha;

    // 2. Pegar a Tree do último commit
    const commitRes = await fetch(`${GITHUB_API_URL}/repos/${owner}/${repo}/git/commits/${latestCommitSha}`, { headers: getHeaders(token) });
    const commitData = await commitRes.json();
    const baseTreeSha = commitData.tree.sha;

    // 3. Criar Blobs para cada arquivo modificado
    const treeItems = [];
    for (const file of files) {
        const blobRes = await fetch(`${GITHUB_API_URL}/repos/${owner}/${repo}/git/blobs`, {
            method: 'POST',
            headers: getHeaders(token),
            body: JSON.stringify({
                content: file.content,
                encoding: 'utf-8'
            })
        });
        const blobData = await blobRes.json();
        
        treeItems.push({
            path: file.path,
            mode: '100644', // File mode
            type: 'blob',
            sha: blobData.sha
        });
    }

    // 4. Criar uma nova Tree baseada na anterior
    const newTreeRes = await fetch(`${GITHUB_API_URL}/repos/${owner}/${repo}/git/trees`, {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify({
            base_tree: baseTreeSha,
            tree: treeItems
        })
    });
    const newTreeData = await newTreeRes.json();
    const newTreeSha = newTreeData.sha;

    // 5. Criar o Commit
    const fullMessage = `${message}\n\n${description}`;
    const newCommitRes = await fetch(`${GITHUB_API_URL}/repos/${owner}/${repo}/git/commits`, {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify({
            message: fullMessage,
            tree: newTreeSha,
            parents: [latestCommitSha]
        })
    });
    const newCommitData = await newCommitRes.json();
    const newCommitSha = newCommitData.sha;

    // 6. Atualizar a referência (Push)
    await fetch(`${GITHUB_API_URL}/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
        method: 'PATCH',
        headers: getHeaders(token),
        body: JSON.stringify({
            sha: newCommitSha
        })
    });

    return newCommitSha;
};

// --- ACTIONS & BUILDS ---

export const getLatestWorkflowRun = async (token: string, owner: string, repo: string) => {
    const res = await fetch(`${GITHUB_API_URL}/repos/${owner}/${repo}/actions/runs?per_page=1&exclude_pull_requests=true`, {
        headers: getHeaders(token)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.workflow_runs?.[0] || null;
};

export const getWorkflowRunLogs = async (token: string, owner: string, repo: string, runId: number): Promise<string> => {
    // Pegar jobs
    const jobsRes = await fetch(`${GITHUB_API_URL}/repos/${owner}/${repo}/actions/runs/${runId}/jobs`, { headers: getHeaders(token) });
    const jobsData = await jobsRes.json();
    const failedJob = jobsData.jobs.find((j: any) => j.conclusion === 'failure') || jobsData.jobs[0];

    if (!failedJob) return "Sem jobs falhos.";

    // Pegar log raw
    const logsRes = await fetch(`${GITHUB_API_URL}/repos/${owner}/${repo}/actions/jobs/${failedJob.id}/logs`, {
        headers: { ...getHeaders(token) }
    });
    
    // GitHub pode redirecionar para S3, fetch segue automaticamente
    const text = await logsRes.text();
    
    // Pegar apenas as últimas 150 linhas para não estourar contexto da IA
    const lines = text.split('\n');
    return lines.slice(-150).join('\n');
};
