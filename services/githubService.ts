
import { GeneratedFile, GitHubSettings } from "../types";

const GITHUB_API_URL = "https://api.github.com";

const getHeaders = (token: string) => ({
  "Authorization": `token ${token}`,
  "Accept": "application/vnd.github.v3+json",
  "Content-Type": "application/json",
});

export const validateGitHubToken = async (token: string): Promise<string> => {
  const res = await fetch(`${GITHUB_API_URL}/user`, {
    headers: getHeaders(token),
  });
  
  if (!res.ok) throw new Error("Token inválido ou expirado.");
  const data = await res.json();
  return data.login;
};

export const createGitHubRepository = async (token: string, repoName: string, description: string) => {
  const res = await fetch(`${GITHUB_API_URL}/user/repos`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify({
      name: repoName,
      description: description,
      private: true,
      auto_init: true
    }),
  });

  if (!res.ok && res.status !== 422) {
    const err = await res.json();
    throw new Error(err.message || "Falha ao criar repositório.");
  }
  return true;
};

const getFileSha = async (token: string, owner: string, repo: string, path: string): Promise<string | null> => {
  try {
    const res = await fetch(`${GITHUB_API_URL}/repos/${owner}/${repo}/contents/${path}`, {
      headers: getHeaders(token),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.sha;
  } catch {
    return null;
  }
};

export const commitAndPushFiles = async (
  settings: GitHubSettings,
  files: GeneratedFile[],
  message: string
) => {
  const { token, username, repoName } = settings;

  for (const file of files) {
    const sha = await getFileSha(token, username, repoName, file.path);
    const contentEncoded = btoa(unescape(encodeURIComponent(file.content)));

    const body: any = {
      message: message,
      content: contentEncoded,
    };

    if (sha) body.sha = sha;

    await fetch(`${GITHUB_API_URL}/repos/${username}/${repoName}/contents/${file.path}`, {
      method: "PUT",
      headers: getHeaders(token),
      body: JSON.stringify(body),
    });
  }
};

export const getLatestWorkflowRun = async (settings: GitHubSettings) => {
  const { token, username, repoName } = settings;
  const res = await fetch(`${GITHUB_API_URL}/repos/${username}/${repoName}/actions/runs?per_page=1`, {
    headers: getHeaders(token),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.workflow_runs?.[0] || null;
};

// Nova função para buscar logs reais do build
export const getWorkflowRunLogs = async (settings: GitHubSettings, runId: number): Promise<string> => {
  const { token, username, repoName } = settings;
  
  // Primeiro pegamos os jobs para encontrar o ID do job de build
  const jobsRes = await fetch(`${GITHUB_API_URL}/repos/${username}/${repoName}/actions/runs/${runId}/jobs`, {
    headers: getHeaders(token),
  });
  
  if (!jobsRes.ok) return "Não foi possível obter a lista de jobs.";
  const jobsData = await jobsRes.json();
  const buildJob = jobsData.jobs.find((j: any) => j.name.includes('build') || j.status === 'completed');
  
  if (!buildJob) return "Job de build não encontrado.";

  // Buscamos o log textual do job
  const logsRes = await fetch(`${GITHUB_API_URL}/repos/${username}/${repoName}/actions/jobs/${buildJob.id}/logs`, {
    headers: { ...getHeaders(token), "Accept": "application/vnd.github.v3.raw" },
  });

  if (!logsRes.ok) return "Erro ao baixar log bruto.";
  return await logsRes.text();
};

export const getBuildArtifact = async (settings: GitHubSettings, runId: number) => {
  const { token, username, repoName } = settings;
  const res = await fetch(`${GITHUB_API_URL}/repos/${username}/${repoName}/actions/runs/${runId}/artifacts`, {
    headers: getHeaders(token),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const artifact = data.artifacts.find((a: any) => a.name === 'plugin-jar') || data.artifacts[0];
  return artifact ? artifact.archive_download_url : null;
};

export const downloadArtifact = async (token: string, url: string, filename: string) => {
  const res = await fetch(url, { headers: getHeaders(token) });
  if (!res.ok) throw new Error("Falha ao baixar artefato.");
  const blob = await res.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(downloadUrl);
};
