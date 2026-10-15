# Bodega6A AI Automation Flow

## Flow

User instruction -> AI orchestrator -> Supabase task -> Repository analysis -> GitHub change -> Vercel deployment.

## Security

Secrets stay in Edge Functions / deployment environment variables.

## Current implementation

- AI task persistence: enabled
- Repository analysis agent: existing `bodega-github-agent`
- AI planning agent: existing `bodega-ai-agent`
- Deployment execution: pending provider connection
