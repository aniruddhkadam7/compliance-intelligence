# Azure Deployment: Evaluation and Plan

Status: **evaluation only. No Azure resources have been created.** Provisioning needs explicit approval.

## Current hosting
- **App:** Vercel (Next.js 15, serverless functions), production at compliance-intelligence-alpha.vercel.app.
- **Database:** Neon PostgreSQL (free tier, us-east-1). Schema changes are applied during production builds (`prisma db push`, which refuses data-loss changes).
- **Monitoring:** connector checks run manually (Check now) or on the scheduled cron route `/api/cron/connectors`.

The app is standard Next.js + PostgreSQL with no Vercel-specific runtime features beyond cron, so it moves to Azure without code changes.

## Recommended Azure architecture

| Component | Recommendation | Why |
|---|---|---|
| App hosting | **Azure App Service (Linux, Node 22)**. Alternative: Azure Container Apps | Runs `next start` directly; built-in TLS, custom domain, deployment slots. Container Apps if the team prefers containers or scale-to-zero. |
| Database | **Azure Database for PostgreSQL – Flexible Server** | Same engine as today; Prisma works unchanged. Private networking, automated backups, point-in-time restore. |
| Secrets | **Azure Key Vault** referenced from App Service settings | Holds `AUTH_SECRET`, `AUTH_USERS`, `CRON_SECRET`, `DATABASE_URL`. |
| Scheduled checks | **App Service WebJob** or a timer-triggered **Azure Function** calling `/api/cron/connectors` with `CRON_SECRET` | Replaces Vercel Cron. |
| Sign-in (later) | **Microsoft Entra ID** (OIDC) | Replaces demo passwords; the auth layer is isolated (`src/lib/auth`) for this swap. |
| AI (later, if approved) | **Azure AI Foundry** with Claude, or Azure OpenAI | Only for the "AI change summary" step in Sources, which is currently a labelled prototype. |

## Indicative monthly cost (demo / pilot scale)

These are rough figures based on public list prices for East US / West Europe. **Confirm them in the Azure Pricing Calculator before approval.** Prices vary by region, agreement and reservations.

| Item | Size | Approx. per month |
|---|---|---|
| App Service plan | Basic B1 (1 vCPU, 1.75 GB) | ~ USD 13 |
| — or production-grade | Premium P0v3 (1 vCPU, 4 GB) | ~ USD 60–80 |
| PostgreSQL Flexible Server | Burstable B1ms (1 vCore, 2 GB) | ~ USD 13–16 |
| PostgreSQL storage + backup | 32 GB | ~ USD 4–6 |
| Key Vault | Standard, low volume | < USD 1 |
| Functions / WebJob for checks | Consumption | ~ USD 0–2 |
| **Total (demo, B1 + B1ms)** | | **~ USD 30–40** |
| **Total (pilot, P0v3 + B1ms)** | | **~ USD 80–100** |

Not included: Entra ID licences (usually already held), AI model usage (charged per token), egress beyond the free allowance, and Azure Front Door or WAF if required by security policy.

## Deployment steps (once approved)
1. Create a resource group in the agreed region (data residency: confirm with the client).
2. Create PostgreSQL Flexible Server (B1ms), enable private access or a firewall rule for the App Service outbound IPs, and create the database.
3. Create Key Vault and add the secrets listed above.
4. Create the App Service plan and Web App (Linux, Node 22). Set the app settings as Key Vault references. Startup command: `npm run start`.
5. Build: `npm ci && npx prisma generate && npx prisma db push && npm run build`, from GitHub Actions or `az webapp deploy`.
6. Load the global document library through **Data & Imports → Authoritative document library**. Client controls are uploaded separately by each client.
7. Add the timer job calling `/api/cron/connectors` with `Authorization: Bearer <CRON_SECRET>`.
8. Optional: custom domain plus managed certificate; Entra ID sign-in.

## Data separation on Azure
- **Global layer** (documents, obligations, source relationships, update monitoring): shared by all clients and loaded once.
- **Client layer** (controls, test procedures, mappings, proposals): every row belongs to a `Client`. For stronger isolation per client, the same schema can run as a separate database (or a separate PostgreSQL schema) per client, with the global layer in a shared database. Decide this before onboarding a second client.
