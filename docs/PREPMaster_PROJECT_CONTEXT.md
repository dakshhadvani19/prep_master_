# PrepMaster â€” Project Context

## Purpose

PrepMaster is a university-exam preparation SPA for diploma/degree students. The project combines a static department catalog, Supabase-backed course/subject catalog data, Supabase authentication, AI-assisted question generation, exam taking, admin tooling, and future persistent attempts/leaderboards.

## Repository

- GitHub: dakshhadvani19/prep_master_
- App: global-exam-prep/
- Default branch: main
- Deployment: Vercel
- Current live Supabase project: prepmaster
- Supabase ref: llqwtgwjlwgrftihtern
- Region: ap-south-1
- Git policy: main-only unless the user explicitly requests another flow.

## Source-of-truth hierarchy

1. Current code on main is the implementation source of truth.
2. Live Supabase schema/data is the backend source of truth for database-backed features.
3. docs/PREPMaster_CURRENT_STATUS.md is the current implementation/status handoff.
4. This document is the durable project architecture/context.
5. Historical artifacts are not requirements and must not override current code or explicit user instructions.

## Core architecture

- React 19 + Vite
- React Router
- Framer Motion
- Lucide
- Supabase JS
- Vercel serverless API endpoints
- Browser-local/static adapters only where persistent Supabase storage is not yet designed

There is one authentication provider: Supabase Auth.
There is no secondary backend integration in the current application.

## Authentication

Supabase Auth owns identity and sessions.

Suppo¶»§q«^