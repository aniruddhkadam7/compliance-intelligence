# Architecture & Security

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | The repo was empty. A single Vercel-native deployable: route handlers are serverless functions, and server components query Postgres directly with no client round-trip. |
| UI | Tailwind v4, Radix primitives (shadcn-style components in `src/components/ui`), Lucide, TanStack Table v8, Recharts, React Flow | As specified. Components are local source, not a black-box kit. |
| Data | PostgreSQL + Prisma 6 | Normalised schema with foreign keys and indexes. Local dev uses PGlite (Postgres compiled to WASM) served over the wire protocol, so no install is needed. Production uses Neon or Supabase. |
| Ingestion | SheetJS, pure validation layer (`src/lib/ingest`) | Preview and confirm share one code path. The CLI import uses the same service as the UI. |
| State | None in memory | Every request reads Postgres, which is safe for serverless. |

## Layout

```
src/app/(app)/*        pages (server components + client islands)
src/app/api/*          route handlers (Zod-validated, role-checked)
src/lib/ingest/*       workbook parsing, validation, persistence
src/lib/queries/*      read models shared by pages and APIs
src/lib/connectors/*   update monitoring (independent of ingestion)
src/lib/auth/*         session signing, role checks
prisma/schema.prisma   data model
```

## Two separate workflows

1. **Excel mapping workflow.** A workbook goes through preview, validation and confirmation, then replaces the reference data in one transaction. This is the only path that changes CCF mappings.
2. **Update monitoring workflow.** A connector check compares against its stored baseline and records a `FrameworkUpdate` for review. Reviewing (acknowledge or dismiss) and "Sync" (adopt the detected version as baseline) change connector state and the audit log only. They never touch mappings.

### Connectors (verified against live sources on 2026-10-31)

| Connector | Source | Mechanism | Detects |
|---|---|---|---|
| NIST CSF 2.0 · CPRT | `csrc.nist.gov/extensions/nudp/services/json/nudp/framework/version/csf_2_0_0/export/json` | Official JSON export. A download endpoint, not a versioned API. | Version change; element-level content change (6 functions / 34 categories / 185 subcategories hashed individually); successor releases (`csf_2_1_0`, …) appearing in CPRT |
| NIST SP 800-53 Rev 5 · OSCAL | `usnistgov/oscal-content` catalog JSON on GitHub | Machine-readable file, ETag-conditional | Version change (the workbook cites r5.1.1, the catalog is 5.2.0); controls added or withdrawn; republication |
| NIST CSWP 29 · document watch | CSF 2.0 PDF | HTTP fingerprint (ETag, Last-Modified, size). **Not an API.** The server rejects HEAD, so a 1-byte ranged GET is used. | File changed |
| GDPR / EU AI Act · CELLAR | `publications.europa.eu/webapi/rdf/sparql` | Official SPARQL endpoint (CDM relationships) | New consolidated versions (version change), corrigenda (content change), amending acts (new publication) |

NIST OLIR has no machine-readable feed at the time of writing; its catalogue is an HTML page. The `NEW_INFORMATIVE_REFERENCE` change type exists for when one becomes available. CPRT's CSF export is the closest current source of informative-reference data.

Scheduling: Vercel Cron calls `/api/cron/connectors` daily, and connectors whose `pollingMinutes` has elapsed are run. Users can also run **Check now** manually.

## Security

* **Authentication.** HS256-signed session cookie (`httpOnly`, `SameSite=Lax`, `Secure` in production, 8 h). Middleware blocks every page and API route except login and cron. Accounts come from `AUTH_USERS`. Replace `authenticate()` in `src/lib/auth/server.ts` with OIDC/SAML for SSO; nothing else depends on it.
* **Roles.** `viewer` has read-only access. `analyst` and `admin` can import, check and sync connectors, and review updates. Roles are enforced server-side in every mutating route (`requireWriter`), and the UI disables controls to match.
* **Input validation.** Zod validates every query and body. Uploads are checked for `.xlsx` extension, size limit (default 4 MB), and the ZIP magic bytes. Confirm requires the same SHA-256 as the preview, and a preview cannot be reused.
* **Secrets.** Secrets are read only on the server, from environment variables. `.env` and workbooks are git-ignored. A production bundle scan found no secrets or connection strings in client JavaScript.
* **Audit.** Logins (including failures), import previews, completions and rejections, transition imports, connector checks and syncs, and update reviews are all written to `AuditLog`, which is visible under Data & Imports.
* **Headers.** `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` and `Permissions-Policy` are set. `robots: noindex`.
* **Not claimed.** No certification or regulatory compliance is claimed for the prototype.

## Known limits

* Coverage uses the workbook's own definition: primary `ARC Mapping` on the authoritative sheet. The 9 IRs reached only through a secondary mapping are reported separately.
* Framework version labels and families are parsed from `Source Name`. The workbook has no publication dates.
* Local PGlite is single-process. Use Neon or Supabase for anything shared.
* The transition workbook (CSF 1.1 → 2.0 Govern examples) has not been supplied yet. The importer matches columns by header aliases (see the downloadable template) and keeps every original column in `raw`.
