import { extractCodeStructure } from "./code-structure-extractor.ts";

export type IndexChunk = {
  repository: "zzzlegna-art/Bodega-6A";
  path: string;
  sha: string;
  chunk_index: number;
  content: string;
  structure: ReturnType<typeof extractCodeStructure>;
};

// This module only prepares in-memory records. It does not contact Supabase.
const ALLOWED_PATH = /^(?:src\/|supabase\/functions\/|docs\/)[a-zA-Z0-9_./-]+\.(?:ts|tsx|js|jsx|md|sql)$/;
const MAX_SOURCE_LENGTH = 150_000;
const CHUNK_SIZE = 2_000;

export function prepareIndexChunks(path: string, sha: string, source: string): IndexChunk[] {
  if (!ALLOWED_PATH.test(path) || path.includes("..")) throw new Error("Path is not allowed");
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("Invalid GitHub blob SHA");
  if (source.length > MAX_SOURCE_LENGTH) throw new Error("Source exceeds indexing limit");
  if (source.length === 0) return [];

  const structure = extractCodeStructure(path, source);
  const chunks: IndexChunk[] = [];
  for (let offset = 0; offset < source.length; offset += CHUNK_SIZE) {
    chunks.push({
      repository: "zzzlegna-art/Bodega-6A",
      path,
      sha,
      chunk_index: chunks.length,
      content: source.slice(offset, offset + CHUNK_SIZE),
      structure,
    });
  }
  return chunks;
}
