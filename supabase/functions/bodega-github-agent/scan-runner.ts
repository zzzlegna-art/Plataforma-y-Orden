export type RepositoryScanResult = {
  repository: string;
  scannedAt: string;
  sections: {
    frontend: string[];
    backend: string[];
    database: string[];
    config: string[];
  };
};

export function createScanResult(repository: string): RepositoryScanResult {
  return {
    repository,
    scannedAt: new Date().toISOString(),
    sections: {
      frontend: ['src/pages', 'src/components', 'src/actions', 'src/lib'],
      backend: ['supabase/functions'],
      database: ['supabase/migrations'],
      config: ['package.json', 'tsconfig.json', 'vite.config.*']
    }
  };
}
