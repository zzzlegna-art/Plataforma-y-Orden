// Bodega-6A AI Developer
// Repository scan pipeline

export type RepositoryScan = {
  repository: string;
  scannedAt: string;
  areas: string[];
  status: 'ready' | 'pending';
};

export function createRepositoryScan(repository: string): RepositoryScan {
  return {
    repository,
    scannedAt: new Date().toISOString(),
    areas: [
      'src/pages',
      'src/components',
      'src/actions',
      'src/lib',
      'supabase/migrations',
      'supabase/functions'
    ],
    status: 'ready'
  };
}
