export const automationConnections = {
  githubToken: () => Deno.env.get("GITHUB_TOKEN"),
  supabaseUrl: () => Deno.env.get("BODEGA_SUPABASE_URL"),
  serviceRoleKey: () => Deno.env.get("BODEGA_SUPABASE_SERVICE_ROLE_KEY"),
};

export function validateAutomationSecrets() {
  return {
    github: Boolean(automationConnections.githubToken()),
    supabase: Boolean(automationConnections.supabaseUrl() && automationConnections.serviceRoleKey()),
  };
}
