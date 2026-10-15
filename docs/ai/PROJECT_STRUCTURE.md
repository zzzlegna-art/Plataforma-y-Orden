# Bodega6A Project Structure

## Overview

Bodega6A is a full-stack operational management platform.

The project is organized into frontend, backend, automation and
documentation layers.

------------------------------------------------------------------------

# Root Structure

    Bodega-6A/

    ├── .github/
    │   └── workflows/
    │       CI/CD and automated validation processes.

    ├── automation/
    │   └── reports/
    │       Generated automation artifacts and validation reports.

    ├── docs/
    │   └── ai/
    │       AI knowledge base and project context.

    ├── public/
    │   Static public assets.

    ├── src/
    │   Main frontend application.

    ├── supabase/
    │   Database configuration, migrations and backend logic.

    ├── package.json
    │   Project dependencies and scripts.

    ├── pnpm-lock.yaml
    │   Dependency lock file.

    ├── vite.config.ts
    │   Vite configuration.

    ├── tailwind.config.ts
    │   UI styling configuration.

    ├── tsconfig.json
    │   TypeScript configuration.

    ├── Dockerfile
    │   Container configuration.

    ├── docker-compose.yml
    │   Local environment configuration.

    ├── vercel.json
    │   Deployment configuration.

    └── README.md
        General project documentation.

------------------------------------------------------------------------

# Frontend

Location:

    src/

Responsibilities:

-   User interface.
-   React components.
-   Application logic.
-   Client-side services.
-   User interactions.

Technology:

-   React
-   TypeScript
-   Vite
-   Tailwind CSS

------------------------------------------------------------------------

# Backend

Location:

    supabase/

Responsibilities:

-   PostgreSQL database.
-   Authentication.
-   Row Level Security.
-   Database migrations.
-   Backend functions.

------------------------------------------------------------------------

# Automation

Location:

    .github/workflows/

Responsibilities:

-   Continuous integration.
-   Automated testing.
-   Security checks.
-   Pull request validation.

------------------------------------------------------------------------

# AI Development Rules

Before modifying any area:

1.  Inspect existing implementation.
2.  Understand dependencies.
3.  Check security implications.
4.  Create controlled changes.
5.  Validate before integration.

------------------------------------------------------------------------

# Deployment

Current deployment ecosystem:

-   GitHub Actions
-   Vercel
-   Supabase

------------------------------------------------------------------------

# AI Objective

The AI assistant must understand this structure before generating
changes.
