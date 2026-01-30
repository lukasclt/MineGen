
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
    // Adicionado affiliation para garantir que repositórios de colaboração apareçam
    // Aumentado per_page para 100 para pegar mais repositórios
    const res = await fetch(`${GITHUB_API_URL}/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member`, { headers: getHeaders(token) });
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

// --- FILE SYSTEM OTIMIZADO (GIT TREE API) ---

const EXTENSIONS_TO_FETCH = new Set([
  'java', 'xml', 'yml', 'yaml', 'json', 'gradle', 'properties', 'txt', 'md', 'gitignore', 'kts', 'cmd', 'sh'
]);

const IGNORED_PATHS = [
    'target/', 'build/', '.gradle/', 'node_modules/', '.idea/', '.settings/', 'bin/', '.class'
];

/**
 * Busca todos os arquivos de texto relevantes do repositório de forma recursiva e otimizada.
 */
export const getRepoFiles = async (token: string, owner: string, repoName: string): Promise<GeneratedFile[]> => {
    // 1. Obter informações do repo para saber a branch padrão
    const repoRes = await fetch(`${GITHUB_API_URL}/repos/${owner}/${repoName}`, { headers: getHeaders(token) });
    if (!repoRes.ok) throw new Error("Repositório não encontrado.");
    const repoData = await repoRes.json();
    const defaultBranch = repoData.default_branch || 'main';

    // 2. Obter a árvore de arquivos completa (Tree API) recursivamente
    // Isso evita o problema de N+1 requisições (pasta por pasta)
    const treeRes = await fetch(`${GITHUB_API_URL}/repos/${owner}/${repoName}/git/trees/${defaultBranch}?recursive=1`, { 
        headers: getHeaders(token) 
    });
    
    if (!treeRes.ok) {
        if (treeRes.status === 409) return []; // Repositório vazio
        throw new Error("Erro ao ler estrutura de arquivos.");
    }
    
    const treeData = await treeRes.json();
    
    // 3. Filtrar apenas arquivos (blobs) de texto que nos interessam
    if (treeData.truncated) {
        console.warn("Repositório muito grande, lista de arquivos truncada pelo GitHub.");
    }

    const relevantBlobs = treeData.tree.filter((item: any) => {
        if (item.type !== 'blob') return false;
        
        // Ignora pastas inúteis
        if (IGNORED_PATHS.some(ignore => item.path.includes(ignore))) return false;

        // Verifica extensão
        const ext = item.path.split('.').pop()?.toLowerCase();
        return ext && EXTENSIONS_TO_FETCH.has(ext);
    });

    // 4. Download Paralelo Controlado (Batching)
    // Navegadores limitam ~6 conexões paralelas. Fazer Promise.all em tudo causaria erro de rede ou rate limit.
    const files: GeneratedFile[] = [];
    const BATCH_SIZE = 6; 

    for (let i = 0; i < relevantBlobs.length; i += BATCH_SIZE) {
        const batch = relevantBlobs.slice(i, i + BATCH_SIZE);
        
        const batchResults = await Promise.all(batch.map(async (blob: any) => {
            try {
                // Fetch blob content (base64)
                const blobRes = await fetch(blob.url, { headers: getHeaders(token) });
                if (!blobRes.ok) return null;
                const blobData = await blobRes.json();
                
                // Decode Base64 (suporta caracteres UTF-8 corretamente)
                const content = decodeURIComponent(escape(window.atob(blobData.content)));
                
                let lang: any = 'text';
                if (blob.path.endsWith('.java')) lang = 'java';
                else if (blob.path.endsWith('.xml')) lang = 'xml';
                else if (blob.path.endsWith('.json')) lang = 'json';
                else if (blob.path.endsWith('.gradle') || blob.path.endsWith('.kts')) lang = 'gradle';
                else if (blob.path.endsWith('.yml') || blob.path.endsWith('.yaml')) lang = 'yaml';

                return {
                    path: blob.path,
                    content: content,
                    language: lang
                } as GeneratedFile;
            } catch (e) {
                console.warn(`Falha ao baixar ${blob.path}`, e);
                return null;
            }
        }));

        // Filtra falhas e adiciona ao array principal
        batchResults.forEach(f => { if (f) files.push(f); });
    }

    return files;
};

// --- COMMIT COMPLEXO (GIT TREE API) ---

export const commitToRepo = async (
    token: string, 
    owner: string, 
    repo: string, 
    files: GeneratedFile[], 
    message: string,
    description: string = ""
) => {
    // Busca a branch padrão dinamicamente para evitar erro se for 'master' em vez de 'main'
    const repoInfoRes = await fetch(`${GITHUB_API_URL}/repos/${owner}/${repo}`, { headers: getHeaders(token) });
    const repoInfo = await repoInfoRes.json();
    const branch = repoInfo.default_branch || 'main';

    // 1. Pegar referência do último commit
    const refRes = await fetch(`${GITHUB_API_URL}/repos/${owner}/${repo}/git/ref/heads/${branch}`, { headers: getHeaders(token) });
    if (!refRes.ok) throw new Error(`Não foi possível encontrar a branch ${branch}.`);
    const refData = await refRes.json();
    const latestCommitSha = refData.object.sha;

    // 2. Pegar a Tree do último commit
    const commitRes = await fetch(`${GITHUB_API_URL}/repos/${owner}/${repo}/git/commits/${latestCommitSha}`, { headers: getHeaders(token) });
    const commitData = await commitRes.json();
    const baseTreeSha = commitData.tree.sha;

    // 3. Criar Blobs para cada arquivo modificado
    // Nota: Para repositórios grandes, isso deve ser feito em batch também, mas para commits pontuais da IA é ok.
    const treeItems = [];
    for (const file of files) {
        // Encode UTF-8 to Base64 safe string
        const base64Content = btoa(unescape(encodeURIComponent(file.content)));

        const blobRes = await fetch(`${GITHUB_API_URL}/repos/${owner}/${repo}/git/blobs`, {
            method: 'POST',
            headers: getHeaders(token),
            body: JSON.stringify({
                content: base64Content,
                encoding: 'base64' // Usar base64 é mais seguro para caracteres especiais
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
    
    if (!newTreeRes.ok) throw new Error("Erro ao criar Git Tree");
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
    
    if (!newCommitRes.ok) throw new Error("Erro ao criar Git Commit");
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
