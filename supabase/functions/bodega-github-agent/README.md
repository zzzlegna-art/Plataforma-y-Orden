# Bodega-6A GitHub Agent

## Purpose

Connector layer for the Bodega-6A AI Developer Agent.

This module will handle the communication between the AI agent and GitHub through the GitHub App.

## Planned capabilities

- Authenticate using GitHub App credentials stored as Supabase secrets.
- Read repository files.
- Build repository context for AI analysis.
- Create development branches.
- Prepare commits.
- Create pull requests.

## Security rules

- Never store private keys in the repository.
- Never modify production branches directly.
- All generated changes require review.
