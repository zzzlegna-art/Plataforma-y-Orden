// Bodega-6A AI Developer
// Repository indexer layer
// Prepares repository structure analysis for the AI agent.

export type RepositoryMap = {
  repository: string;
  paths: string[];
  analyzedAt: string;
};

export function createRepositoryMap(repository: string, paths: string[]): RepositoryMap {
  return {
    repository,
    paths,
    analyzedAt: new Date().toISOString(),
  };
}

export const defaultAnalysisPaths = [
  "src",
  "supabase/migrations",
  "supabase/functions",
  "package.json",
];
