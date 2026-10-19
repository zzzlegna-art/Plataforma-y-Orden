// Nexora AI Developer Agent
// GitHub App JWT helper scaffold
// The private key must be loaded from Supabase Secrets.

export interface GitHubAppCredentials {
  appId: string;
  privateKey: string;
}

export function validateGitHubAppCredentials(credentials: GitHubAppCredentials) {
  if (!credentials.appId || !credentials.privateKey) {
    throw new Error('Missing GitHub App credentials');
  }

  return {
    ready: true,
    appId: credentials.appId,
    message: 'Credentials validated. JWT generation can proceed.'
  };
}

export function createJWTConfiguration(appId: string) {
  return {
    issuer: appId,
    algorithm: 'RS256',
    expiresIn: 540
  };
}
