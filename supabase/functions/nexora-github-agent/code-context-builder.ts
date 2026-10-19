// Nexora AI Developer
// Code Context Builder v1.0
// Builds normalized context before sending repository information to AI.

export type RepositoryContext = {
  repository: string;
  scannedAreas: string[];
  files: Array<{ path: string; category: string }>;
  generatedAt: string;
};

export function buildRepositoryContext(repository: string, files: Array<{ path: string }>): RepositoryContext {
  return {
    repository,
    scannedAreas: [
      'src/pages',
      'src/components',
      'src/actions',
      'src/lib',
      'supabase/functions',
      'supabase/migrations'
    ],
    files: files.map((file) => ({
      path: file.path,
      category: classifyFile(file.path)
    })),
    generatedAt: new Date().toISOString()
  };
}

function classifyFile(path: string): string {
  if (path.includes('migrations')) return 'database';
  if (path.includes('functions')) return 'backend';
  if (path.includes('components')) return 'component';
  if (path.includes('pages')) return 'page';
  return 'configuration';
}
