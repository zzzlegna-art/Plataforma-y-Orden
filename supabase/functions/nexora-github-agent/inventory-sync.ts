// Bodega-6A AI Developer Agent
// Inventory Sync Layer
//
// Responsible for preparing repository inventory payloads
// before persisting them into Supabase memory.

export type RepositoryInventory = {
  repository: string;
  version: string;
  frontend: string[];
  backend: string[];
  database: string[];
  config: string[];
};

export function buildInventory(input: Partial<RepositoryInventory>): RepositoryInventory {
  return {
    repository: input.repository ?? 'Bodega-6A',
    version: input.version ?? '1.0',
    frontend: input.frontend ?? [],
    backend: input.backend ?? [],
    database: input.database ?? [],
    config: input.config ?? [],
  };
}

export function serializeInventory(inventory: RepositoryInventory) {
  return {
    repository_name: inventory.repository,
    scan_version: inventory.version,
    inventory,
  };
}
