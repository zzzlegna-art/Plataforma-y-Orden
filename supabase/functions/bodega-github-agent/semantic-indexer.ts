// Semantic indexer for Bodega-6A AI Developer Agent
// Prepares repository knowledge for future AI analysis.

export type CodeSymbol = {
  path: string;
  category: string;
  summary?: string;
};

export function buildSemanticIndex(files: Array<{path:string; content?:string}>): CodeSymbol[] {
  return files.map((file) => ({
    path: file.path,
    category: detectCategory(file.path),
    summary: 'Pending semantic analysis'
  }));
}

function detectCategory(path: string): string {
  if (path.includes('components')) return 'component';
  if (path.includes('pages')) return 'page';
  if (path.includes('functions')) return 'backend';
  if (path.includes('migrations')) return 'database';
  return 'config';
}
