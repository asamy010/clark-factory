# CLARK Factory ERP — Garment Manufacturing + Shopify B2C

> Full-stack ERP for an Egyptian garment factory: production, inventory,
> sales, purchasing, accounting, treasury, HR/payroll — with Shopify
> Two-Stage COD, Bosta shipping, and a WhatsApp AI agent.

[![Deploy Status](https://img.shields.io/badge/Vercel-deployed-success)](https://clark-factory.vercel.app)
[![Version](https://img.shields.io/badge/version-V21.27.184-blue)](./docs/RELEASE-LOG.md)
[![Build](https://img.shields.io/badge/build-passing-success)](#)
[![Tests](https://img.shields.io/badge/tests-507%20passing-success)](#)

---

## 🎯 What is this?

CLARK Factory is a complete, Arabic-first (RTL) ERP for an Egyptian garment
manufacturing business. It covers the full operational cycle — cutting/work
orders → production → finished-goods inventory → sales & distribution →
accounting → treasury → payroll — and integrates a B2C storefront and
logistics on top:

- **Shopify** — B2C store with a Two-Stage COD workflow + WhatsApp campaigns
- **Bosta** — shipping, AWB labels, live tracking, Customer Return Pickup (CRP)
- **WhatsApp** — AI support agent + automated, segment-based campaigns
- **Judge.me** — product reviews
- **Firebase** — Auth, Firestore, Storage
- **Vercel** — hosting + serverless functions + cron

> The entire UI is in **Arabic (Egyptian dialect)**. Code, comments, and this
> README are in English.

---

## 📚 Documentation

| File | Purpose |
|------|---------|
| **[CLAUDE.md](./CLAUDE.md)** | Engineering protocol, Principal-Engineer persona, architectural rules, and the anti-pattern catalog. **Read first.** |
| **[docs/NEW-SESSION-START.md](./docs/NEW-SESSION-START.md)** | Quick operational summary + standing directives for any new session. |
| **[docs/RELEASE-LOG.md](./docs/RELEASE-LOG.md)** | **The live rolling history** — newest first, root-cause for every release. This is the authoritative changelog of record. |
| **[docs/ROADMAP-PROFESSIONAL.md](./docs/ROADMAP-PROFESSIONAL.md)** | Forward-looking roadmap. |
| **[docs/SUPABASE-MIGRATION-PLAN.md](./docs/SUPABASE-MIGRATION-PLAN.md)** | Planned migration off Firestore (lift-and-shift JSONB → relational). |
| **[docs/SECURITY.md](./docs/SECURITY.md)** | Security model and posture. |
| **[public/changelog.json](./public/changelog.json)** | In-app, user-facing changelog (lazy-loaded by the About modal). |

> ⚠️ `WORK_LOG.md` is **frozen at V21.9.10** (2026-05-10) and is kept only for
> historical reference. For anything after that, use **`docs/RELEASE-LOG.md`**.

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    Browser (React 18 + Vite 5)                     │
│  src/App.jsx — single app shell: global state, Firestore           │
│  listeners, routing (history API), write transactions, migrations  │
├──────────────────────────────────────────────────────────────────┤
│  ~38 pages (src/pages/*) + ~130 components (src/components/*)       │
│  Sales · Purchase · Accounting · Treasury · HR · Warehouse ·       │
│  Models/Production · Shopify (13 sub-tabs) · AI Agent · Automation  │
└───────────────────────────┬──────────────────────────────────────┘
                            │  HTTPS + Firebase ID token (Bearer)
┌───────────────────────────▼──────────────────────────────────────┐
│              Vercel Serverless Functions (api/*)                   │
│  ~91 endpoints · setCors · verifyAdminToken · withProgress wrapper │
│   /api/shopify/*  (31)   /api/bosta/*   /api/ai-agent/*            │
│   /api/maintenance/* (12 migrations/repairs)                       │
│   /api/cron/* (5 jobs)   /api/admin/*   /api/*-portal*             │
└───────────────────────────┬──────────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────────┐
│                          Firestore                                 │
│  factory/config (kept small)  +  daily splits (treasuryDays, …)    │
│  +  per-id partitions (customersDocs, …)  +  seasons/{s}/orders    │
│  +  per-file docs (factory/df_<id>)  +  syncJobs (progress)        │
└────────────────────────────────────────────────────────────────────┘
        │                         │                         │
        ▼                         ▼                         ▼
  Shopify Admin API         Bosta Public API          Firebase Storage
  (OAuth 2.0, shpat_)       (deliveries, CRP, AWB)    (products, campaigns)
        │
        ▼
  WhatsApp bridge (clark-wa-bridge, self-hosted) ──▶ AI agent (Claude)
```

### Core architectural rules (see CLAUDE.md for the full set)

- **Document splitting** — Firestore caps documents at 1 MB. Any array that
  grows over time is split: **daily** (`treasuryDays/{YYYY-MM-DD}`, audits,
  payments, invoices, notifications…) or **per-id** (`customersDocs/{id}`,
  products, suppliers…). Storage-space files go one-doc-per-file
  (`factory/df_<id>`, V178) for unbounded capacity. Result: `factory/config`
  stays small regardless of business volume.
- **Active season** — orders live in `seasons/{seasonId}/orders/{id}`, **not**
  in `cfg.orders`.
- **Distributions are the source of truth** — sales-order "mirrors"
  (`sourceDistributionId`) are display/billing documents only and are excluded
  from balance/inventory math to prevent double-counting.
- **Migrations** — every one follows **backup → dry-run → idempotent → flag**,
  paired with on-demand `repair-*` endpoints for drift recovery.
- **Universal progress tracking** — every sync/pull runs through
  `withProgress()` (server) + a `syncJobs/{jobId}` Firestore listener (client)
  that drives a full-screen progress overlay.

---

## 🔥 Key Features

### Manufacturing & inventory
- Cutting/work orders, models, multi-fabric (A–H) + colors + size sets
- Raw-material, accessories, and finished-goods inventory
- **Stock movements are the source of truth** (`stockLedger`,
  `recomputeItemFromMovements`); opening balances via store permits
  (الإذونات المخزنية), inventory valuation at cost
- Mobile warehouse flows: quick sale/return, stock receive/count, packaging

### Sales & purchasing (document chains)
- **Sales:** quotation → sales order → invoice; customer distributions &
  deliveries; account transfers; credit notes
- **Purchasing:** RFQ → PO → goods receipt → invoice; debit notes;
  weighted-average costing; multi-currency
- Deletion ordering enforced (newest-first), with guards against breaking
  downstream documents

### Accounting & treasury
- Double-entry posting engine (`postingRules`, `posting`), customer/supplier
  statements, season closing, dashboard P&L KPIs
- Treasury with daily-split cash ledger, two-leg transfers, checks lifecycle,
  recurring rules; nightly financial reconciliation cron

### HR & payroll
- Weekly payroll, attendance, employee debts/installments; approved weeks post
  to treasury (with a repair endpoint for drift)

### Shopify integration (13 sub-tabs)
Dashboard · Connection (OAuth) · Products · Orders (Two-Stage COD) · Returns
(Bosta CRP) · Abandoned Cart · Discounts · Customers (tiers + WhatsApp) ·
Campaigns · Shipping · Invoices · Reconciliation · Settings

### Shipping
- Bosta: create shipment, AWB PDF, tracking via webhook, historical sync
- Multi-provider registry (Aramex / Mylerz scaffolded)

### AI & automation
- **WhatsApp AI agent** (Claude) — read-only over business data, tool-use loop,
  human takeover, per-conversation budget caps; default model is configurable
  via `AI_AGENT_MODEL`
- **AI image studio** — generate / describe / analyze product imagery
- **Event-driven automation** — atomic claim-fire-record idempotency
  (in-flight lock + content dedup), scheduled reminders/campaigns, and a
  `scheduler-watchdog` that detects a stalled cron

### Customer/partner portals
Signed (HMAC) public links for delivery confirmation, customer/partner/workshop
ordering, and stock operations.

### Observability
`/api/diagnostics` + the in-app Diagnostics panel track document sizes, array
growth, orphan detection, and flag/data mismatches with tiered thresholds
(600 KB warn → 800 KB error → 1 MB critical).

---

## 🚀 Development

### Prerequisites
- Node 18+
- Firebase project (Firestore + Storage + Auth)
- Shopify custom-app credentials
- Vercel account
- Bosta API key (optional)

### Local development
```bash
npm install
npm run dev      # Vite dev server
npm run build    # production build → dist/ (must finish "✓ built", zero errors)
npm test         # vitest run (507 tests)
npm run lint     # eslint
npm run test:rules   # Firestore rules against the emulator
```

### Environment
- **Development machine:** Mac (source on iCloud Drive). The git repo at
  `clark-factory/` is what Vercel deploys.
- **No local test environment** — deploys go **directly to production**.
  Treat any change to sensitive data flows (accounting, treasury, inventory,
  Firestore/Storage rules, migrations) with care: warn, prefer a low-risk
  staging operation first, and never "ship and hope". See CLAUDE.md §0.1
  (Push-Back) and §1.

### Deploy workflow (per CLAUDE.md §1)
After every code change: **build → bump version (3 places) → update
`docs/RELEASE-LOG.md` → commit specific files → push → zip**.

Version is the single source of truth in **three** places:
1. `package.json` → `"version": "21.x.y"`
2. `src/constants/index.js` → `export const APP_VERSION = "V21.x.y"`
3. `public/changelog.json` → prepend a new entry at the top of the array

> Versioning note: the changelog moved to **`public/changelog.json`** (V21.21.37).
> It is no longer kept inside `AboutVersionModal.jsx`.

Vercel auto-deploys on push to `main`. The release zip (per release) excludes
`node_modules/` and `dist/`; in CI/cloud use:
```bash
git archive --format=zip --prefix=clark-v21.x.y/ -o clark-v21.x.y.zip HEAD
```

### Environment variables (Vercel)
```
# Firebase Admin
GOOGLE_APPLICATION_CREDENTIALS_JSON   (or individual keys)
FIREBASE_PROJECT_ID

# Shopify OAuth
SHOPIFY_CLIENT_ID
SHOPIFY_CLIENT_SECRET
DELIVERY_CONFIRM_SECRET    # HMAC for portal/state signing

# Cron
CRON_SECRET

# Bosta webhook
BOSTA_WEBHOOK_SECRET

# AI agent (WhatsApp)
AI_AGENT_MODEL             # default: claude-sonnet-4-20250514
ANTHROPIC_API_KEY

# Optional Shopify fallback
SHOPIFY_STORE_URL
SHOPIFY_ACCESS_TOKEN
SHOPIFY_API_VERSION        # default: 2024-10
SHOPIFY_APP_BASE_URL       # override for webhook URLs
```

---

## 🧪 Quality

- **Tests:** 43 Vitest files, **507 passing**. Coverage is strongest on the
  financial core (posting rules, statements, inventory valuation, treasury
  sync, invoices) with realistic fixtures and golden calculations. Firestore
  rules are validated against the emulator in CI before deploy.
- **Known gaps:** React components and most API endpoints are not yet unit
  tested — a deliberate area for future investment.

---

## 📜 Engineering Standard

Every change follows the **Principal Engineer** standard (CLAUDE.md §0):

- ✅ **Defensive** — handles edge cases
- ✅ **Documented** — comments explain *why*, not *what*
- ✅ **Tested** — at least smoke-tested before deploy
- ✅ **Reversible** — backups + idempotent migrations

Bug fixes include a **ROOT CAUSE** comment, a regression test (or explicit
manual verification steps), and an anti-pattern entry in CLAUDE.md §10 to
prevent recurrence.

---

## 📊 Current Stats (measured at V21.27.184)

| Metric | Value |
|--------|-------|
| **Version** | V21.27.184 (2026-06-29) |
| **Total lines (src + api)** | ~177,000 |
| **React files** | 166 `.jsx` (~38 pages + ~130 components) |
| **JS modules** | 179 `.js` (utils, schemas, constants) |
| **API endpoints** | ~91 (116 files incl. shared helpers) |
| **Shopify endpoints** | 31 |
| **Migration/repair endpoints** | 12 |
| **Cron jobs** | 5 |
| **Tests** | 507 passing across 43 files |
| **Firestore rules** | 660 lines, 8 roles |

See **[docs/RELEASE-LOG.md](./docs/RELEASE-LOG.md)** for the full phase history.

---

## 🤝 Maintainer

**Ahmed Samy** — CLARK Factory owner.

---

## 📄 License

Private — proprietary CLARK Factory ERP system.

---

*Last updated: V21.27.184 (2026-06-30).*
