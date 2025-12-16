
import { GeneratedFile, GitHubSettings } from "../types";

const GITHUB_API_URL = "https://api.github.com";

// Helper for headers
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
  return data.login; // Return username
};

export const createGitHubRepository = async (token: string, repoName: string, description: string) => {
  const res = await fetch(`${GITHUB_API_URL}/user/repos`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify({
      name: repoName,
      description: description,
      private: true, // Default to private for safety
      auto_init: true // Create a README so we can commit immediately
    }),
  });

  if (!res.ok && res.status !== 422) { // 422 means it might already exist
    const err = await res.json();
    throw new Error(err.message || "Falha ao criar repositório.");
  }
  return true;
};

// Helper to get file SHA (needed for updates)
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

  // Process files sequentially to avoid rate limits on creation
  for (const file of files) {
    const sha = await getFileSha(token, username, repoName, file.path);
    
    // Convert content to Base64 (handle unicode)
    const contentEncoded = btoa(unescape(encodeURIComponent(file.content)));

    const body: any = {
      message: message,
      content: contentEncoded,
    };

    if (sha) {
      body.sha = sha;
    }

    const res = await fetch(`${GITHUB_API_URL}/repos/${username}/${repoName}/contents/${file.path}`, {
      method: "PUT",
      headers: getHeaders(token),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error(`Failed to push ${file.path}`, await res.json());
      // Continue to next file or throw? Let's log and continue
    }
  }
};

export const getLatestWorkflowRun = async (settings: GitHubSettings) => {
  const { token, username, repoName } = settings;
  
  const res = await fetch(`${GITHUB_API_URL}/repos/${username}/${repoName}/actions/runs?per_page=1`, {
    headers: getHeaders(token),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.workflow_runs && data.workflow_runs.length > 0 ? data.workflow_runs[0] : null;
};

export const getBuildArtifact = async (settings: GitHubSettings, runId: number) => {
  const { token, username, repoName } = settings;
  
  const res = await fetch(`${GITHUB_API_URL}/repos/${username}/${repoName}/actions/runs/${runId}/artifacts`, {
    headers: getHeaders(token),
  });

  if (!res.ok) return null;
  const data = await res.json();
  
  // Find the JAR artifact (usually named 'plugin-jar' in our template)
  const artifact = data.artifacts.find((a: any) => a.name === 'plugin-jar') || data.artifacts[0];
  
  if (artifact) {
     return artifact.archive_download_url;
  }
  return null;
};

export const downloadArtifact = async (token: string, url: string, filename: string) => {
  // GitHub API returns a redirect to the zip blob. 
  // We need to fetch it with the token, then convert to blob.
  const res = await fetch(url, {
      headers: getHeaders(token)
  });
  
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
