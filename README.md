# Compliance Intelligence Platform (GSK demonstration)

A framework repository with citation traceability, internal CCF mapping, version impact analysis and framework update monitoring.
It is built from the supplied `CCF Demonstration.xlsx` workbook and official machine-readable sources.

> This is a prototype for demonstration. Mappings come from the supplied workbook. It is not a certified compliance system, and detected framework updates never change approved mappings automatically.

## Modules

| Route | Module |
|---|---|
| `/overview` | Executive overview. Every figure is calculated from imported data. |
| `/frameworks` | Framework repository (27 ArC authoritative sources) and framework detail. |
| `/citations` | Citation Explorer (5,166 source sections) with a traceability panel. |
| `/mappings` | Cross-framework mapping: pair table, relationship graph, coverage matrix, unmapped requirements. |
| `/controls` | Internal CCF mapping (422 controls): trace graph, test procedures, evidence, references, original row. |
| `/requirements/:id` | Integrated requirement hub: citations by framework, controls, review analyses. |
| `/version-impact` | Framework version comparison (NIST CSF 1.1 → 2.0) plus transition workbook examples. |
| `/updates` | Connectors (NIST CPRT, NIST OSCAL, NIST document watch, EUR-Lex CELLAR) and the update review centre. |
| `/data` | Workbook import (preview → confirm), data quality findings, import history, audit log. |

Docs: [data dictionary](docs/DATA_DICTIONARY.md) · [workbook → app mapping](docs/DATA_MAPPING.md) · [architecture & security](docs/ARCHITECTURE.md)

## Local setup

Requirements: Node 20+ (tested on Node 24).

```bash
npm install
cp .env.example .env            # then set AUTH_SECRET, AUTH_USERS, CRON_SECRET
npm run db:start                # terminal 1: local PostgreSQL (PGlite) on :5442, data in ./data/pglite
npm run db:push                 # create tables
npm run db:import               # import data/source/CCF Demonstration.xlsx
npm run dev                     # terminal 2: http://localhost:3000
```

Put the workbook at `data/source/CCF Demonstration.xlsx`. It is git-ignored and must never be committed.
Data can also be imported from the UI under **Data & Imports** (analyst or admin role).

Sign in with an account from `AUTH_USERS`. Connectors create their records automatically on first visit to **Updates & Connectors**. Run **Check all now** to record baselines.

### Scripts

| Script | Purpose |
|---|---|
| `npm run db:start` | Local PostgreSQL via PGlite (no install needed) |
| `npm run db:push` | Apply `prisma/schema.prisma` to the database |
| `npm run db:import -- <file>` | Import a CCF workbook through the same service as the UI |
| `npm run typecheck` / `npm run lint` | Static checks |

## Deploying to Vercel

1. Create a PostgreSQL database (Neon or Supabase). Use the **pooled** connection string with `?sslmode=require&pgbouncer=true`.
2. Import the GitHub repository into Vercel and set these environment variables: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_USERS`, `CRON_SECRET`, and optionally `MAX_UPLOAD_MB` (≤ 4; Vercel's request body limit is 4.5 MB).
3. From a machine with the workbook, run `DATABASE_URL=… npx prisma db push` and then `DATABASE_URL=… npm run db:import`. Alternatively, upload the workbook through **Data & Imports** after deploying.
4. `vercel.json` schedules `/api/cron/connectors` daily at 06:00 UTC. Vercel sends `Authorization: Bearer $CRON_SECRET`.

The workbook is never part of the build or the repository. Client data lives only in the configured database, behind authentication.
