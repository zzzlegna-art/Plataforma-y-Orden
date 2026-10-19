// Bodega-6A AI Developer Agent
// Inventory storage layer
// Prepares repository inventory persistence in Supabase.

export type RepositoryInventory = {
  repository: string;
  scannedAt: string;
  sections: {
    frontend: string[];
    backend: string[];
    database: string[];
    configuration: string[];
  };
};

export function buildInventoryRecord(repository: string): RepositoryInventory {
  return {
    repository,
    scannedAt: new Date().toISOString(),
    sections: {
      frontend: ["src/pages", "src/components", "src/actions", "src/lib"],
      backend: ["supabase/functions"],
      database: ["supabase/migrations"],
      configuration: ["package.json", "tsconfig", "vite.config"]
    }
  };
}
