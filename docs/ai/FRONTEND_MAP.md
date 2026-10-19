# Nexora Frontend Map

## Overview

The frontend of Nexora is built using React, TypeScript and Vite.

The main application logic is contained inside the `src/` directory.

## Structure

    src/

    ├── components/
    │   Reusable interface components.

    ├── hooks/
    │   Custom React hooks.

    ├── i18n/
    │   Internationalization system.

    ├── integrations/
    │   └── supabase/
    │       Supabase client integrations.

    ├── lib/
    │   Internal utilities and shared libraries.

    ├── pages/
    │   Application views and screens.

    ├── store/
    │   Global state management.

    ├── types/
    │   Shared TypeScript definitions.

    ├── App.tsx
    │   Root application component.

    ├── main.tsx
    │   React application entry point.

    ├── router.tsx
    │   Route configuration.

    ├── App.css
    └── index.css

## Development Rules

Before modifying frontend code, the AI must:

1.  Identify affected components.
2.  Check existing patterns.
3.  Verify related state management.
4.  Validate TypeScript compatibility.
5.  Run project checks.

## AI Objective

Understand existing frontend architecture before generating new
features.
