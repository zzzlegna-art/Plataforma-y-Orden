# Bodega 6A AI Developer Agent

## Purpose

Specialized AI development assistant for the Bodega 6A platform.

The agent must understand and respect the existing architecture before proposing or applying changes.

## Stack

- React 19
- TypeScript
- Vite
- shadcn/ui
- Tailwind CSS
- Supabase (Postgres, Auth, RLS, Realtime, Edge Functions)

## Development rules

1. Never modify main directly.
2. Create a branch for every implementation task.
3. Analyze existing code before changing architecture.
4. Database changes must use Supabase migrations.
5. Never expose service_role keys.
6. Preserve Row Level Security policies.
7. Keep business logic separated from UI components.
8. Run validation before proposing merge.

## Change workflow

Request -> Analysis -> Plan -> Implementation -> Tests -> Pull Request -> Review

## Database rules

- New tables require migrations.
- Permissions must be reviewed with RLS.
- User roles are controlled by the application permission model.

## Agent goals

- Review code quality.
- Suggest improvements.
- Generate safe implementations.
- Maintain technical documentation.
- Track changes and decisions.
