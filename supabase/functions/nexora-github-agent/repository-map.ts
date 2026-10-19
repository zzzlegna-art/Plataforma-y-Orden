// Nexora AI Developer
// Repository map builder
//
// This module prepares a normalized project map for the AI agent.
// It will later consume GitHub API file metadata and produce context
// for code analysis.

export type RepositoryMap = {
  repository: string;
  paths: string[];
  generatedAt: string;
};

export function createRepositoryMap(repository: string): RepositoryMap {
  return {
    repository,
    paths: [
      'src/pages',
      'src/actions',
      'src/components',
      'src/lib',
      'supabase/migrations',
      'supabase/functions',
      'package.json'
    ],
    generatedAt: new Date().toISOString()
  };
}
