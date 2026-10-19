// Nexora AI Developer Agent
// GitHub App authentication scaffold
//
// Secrets required in Supabase:
// GITHUB_APP_ID
// GITHUB_INSTALLATION_ID
// GITHUB_PRIVATE_KEY
//
// This module prepares the authentication layer.
// The private key must never be stored in the repository.

export interface GitHubAgentConfig {
  appId: string;
  installationId: string;
  privateKey: string;
}

export function getGitHubConfig(): GitHubAgentConfig {
  const appId = Deno.env.get("GITHUB_APP_ID") ?? "";
  const installationId = Deno.env.get("GITHUB_INSTALLATION_ID") ?? "";
  const privateKey = Deno.env.get("GITHUB_PRIVATE_KEY") ?? "";

  return {
    appId,
    installationId,
    privateKey,
  };
}

export function validateGitHubConfig(config: GitHubAgentConfig) {
  return Boolean(
    config.appId &&
    config.installationId &&
    config.privateKey
  );
}
