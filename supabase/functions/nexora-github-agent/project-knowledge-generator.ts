// Project Knowledge Generator
// Builds human-readable knowledge records from extracted code structure.

export type CodeKnowledge = {
  file: string;
  category: string;
  summary: string;
  exports: string[];
  dependencies: string[];
};

export function generateKnowledge(input: {
  file: string;
  category: string;
  exports?: string[];
  dependencies?: string[];
}): CodeKnowledge {
  return {
    file: input.file,
    category: input.category,
    summary: `${input.file} is a ${input.category} module in the Nexora architecture.`,
    exports: input.exports ?? [],
    dependencies: input.dependencies ?? []
  };
}
