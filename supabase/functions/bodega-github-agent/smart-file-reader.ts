// Bodega-6A AI Developer
// Smart File Reader Layer

export type RepositoryFileContext = {
  path: string;
  category: string;
  content: string;
};

export function buildFileContext(files: RepositoryFileContext[]) {
  return files.map((file) => ({
    path: file.path,
    category: file.category,
    size: file.content.length,
    preview: file.content.slice(0, 2000),
  }));
}

export function shouldAnalyzeFile(path: string) {
  const ignored = ["node_modules", ".git", "dist", "build"];
  return !ignored.some((item) => path.includes(item));
}
