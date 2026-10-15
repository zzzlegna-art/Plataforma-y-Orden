# Bodega6A Supabase Map

## Overview

Bodega6A uses Supabase as backend infrastructure.

Supabase provides:

-   PostgreSQL database.
-   Authentication.
-   Row Level Security.
-   Edge Functions.
-   Database migrations.

## Structure

    supabase/

    ├── functions/
    │   Backend Edge Functions.

    ├── migrations/
    │   Versioned database changes.

    ├── tests/
    │   └── rls/
    │       Security validation tests.

    └── config.toml
        Supabase configuration.

## Security Principles

The AI must always consider:

-   RLS policies.
-   Data ownership.
-   Authentication rules.
-   Audit requirements.
-   Migration safety.

## Database Changes

Any database modification must:

1.  Create a migration.
2.  Preserve existing data.
3.  Validate security.
4.  Run tests.
