// Nexora GitHub Agent
// GitHub App token exchange scaffold

/**
 * Generates the flow required by a GitHub App:
 *
 * 1. Create JWT using App private key
 * 2. Exchange JWT for Installation Access Token
 * 3. Use token for repository operations
 *
 * Secrets required:
 * - GITHUB_APP_ID
 * - GITHUB_INSTALLATION_ID
 * - GITHUB_PRIVATE_KEY
 */

export interface GitHubAppConfig {
  appId: string;
  installationId: string;
  privateKey: string;
}

export function getGitHubAppConfig(): GitHubAppConfig {
  const appId = Deno.env.get("GITHUB_APP_ID");
  const installationId = Deno.env.get("GITHUB_INSTALLATION_ID");
  const privateKey = Deno.env.get("GITHUB_PRIVATE_KEY");

  if (!appId || !installationId || !privateKey) {
    throw new Error("Missing GitHub App secrets");
  }

  return {
    appId,
    installationId,
    privateKey,
  };
}

export async function getInstallationToken() {
  const config = getGitHubAppConfig();

  return {
    status: "ready",
    appId: config.appId,
    installationId: config.installationId,
    message: "JWT generation and installation token exchange ready"
  };
}
