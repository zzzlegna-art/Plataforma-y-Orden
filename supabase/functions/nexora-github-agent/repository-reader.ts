// Bodega-6A AI Developer
// Repository reader layer

export type RepositoryFileRequest = {
  path: string;
  ref?: string;
};

export type RepositoryContext = {
  files: RepositoryFileRequest[];
  purpose: string;
};

/**
 * Repository reader scaffold.
 *
 * Responsibilities:
 * - request repository files through the GitHub client
 * - normalize source context for the AI analyzer
 * - avoid sending unnecessary files to the reasoning layer
 */
export function buildRepositoryContext(input: RepositoryContext) {
  return {
    purpose: input.purpose,
    files: input.files.map((file) => ({
      path: file.path,
      ref: file.ref ?? 'default'
    }))
  };
}
