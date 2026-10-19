// Nexora AI Developer
// Repository inventory layer
// Builds a structured inventory from repository map data.

export type RepositoryInventory = {
  generatedAt: string;
  areas: {
    frontend: string[];
    backend: string[];
    database: string[];
    config: string[];
  };
};

export function createRepositoryInventory(): RepositoryInventory {
  return {
    generatedAt: new Date().toISOString(),
    areas: {
      frontend: ["src/pages", "src/components", "src/actions"],
      backend: ["supabase/functions"],
      database: ["supabase/migrations"],
      config: ["package.json", "vite.config", "tsconfig"]
    }
  };
}
