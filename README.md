# CLARK Factory ERP — Shopify B2C Integration

> Garment factory ERP with full Shopify Two-Stage COD workflow + Bosta shipping integration.

[![Deploy Status](https://img.shields.io/badge/Vercel-deployed-success)](https://clark-factory.vercel.app)
[![Version](https://img.shields.io/badge/version-V21.9.10-blue)](./WORK_LOG.md)
[![Build](https://img.shields.io/badge/build-passing-success)](#)

---

## 🎯 What is this?

CLARK Factory is a complete ERP system for an Egyptian garment manufacturing
business, integrated with:

- **Shopify** (B2C store with Two-Stage COD workflow)
- **Bosta** (shipping + Customer Return Pickup)
- **Judge.me** (product reviews)
- **WhatsApp** (customer communication + automated campaigns)
- **Firebase** (auth, Firestore, Storage)
- **Vercel** (hosting + serverless functions + cron)

---

## 📚 Documentation

| File | Purpose |
|------|---------|
| **[CLAUDE.md](./CLAUDE.md)** | Engineering protocol + Principal Engineer persona instructions |
| **[WORK_LOG.md](./WORK_LOG.md)** | Complete phase-by-phase history (V19.91 → V21.9.10) |
| **[README.md](./README.md)** | This file — project overview |
| **[shopify-integration-spec.md](./docs/shopify-integration-spec.md)** | Original spec |

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       Browser (React + Vite)                    │
├─────────────────────────────────────────────────────────────────┤
│  ShopifyIntegrationPg.jsx ─┐                                    │
│  • 13 sub-tabs             │                                    │
│  • Dashboard / Connection  │                                    │
│  • Products / Orders       │     ┌─ runWithProgress             │
│  • Returns / Abandoned    ─┼────▶│  (overlay + Firestore        │
│  • Discounts / Customers   │     │   listener for progress)     │
│  • Campaigns / Shipping    │     └──────────────────────────────┘
│  • Invoices / Reconcil.    │                                    │
│  • Settings                │                                    │
└────────────────────────────┼──── HTTPS + Bearer ID token ──────┐
                             │                                    │
┌────────────────────────────▼────────────────────────────────────┤
│                  Vercel Serverless Functions                    │
├─────────────────────────────────────────────────────────────────┤
│  /api/shopify/* ─── 30+ endpoints ──┐                           │
│  /api/bosta/* ───── 6 endpoints     │                           │
│  /api/judgeme/* ─── 2 endpoints    ─┼─▶ Firestore              │
│  /api/cron/* ────── 3 schedulers    │   • factory/config        │
│  /api/maintenance/* ─ 2 migrations  │   • shopifyOrdersArchive  │
│  /api/diagnostics ── health check   │   • shopifyProductsDocs   │
│                                     │   • shopifyCustomersDocs  │
│                                     │   • syncJobs (progress)   │
│                                     │   • <30+ split collections>
│                                     └──┬────────────────────────┤
│                                        │                        │
│                                        ▼                        │
│                                 Firebase Storage                │
│                                 • shopify-products/*            │
│                                 • whatsapp-campaigns/*          │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │  Shopify Admin API   │ ◀─── OAuth 2.0 (shpat_)
                  │  • Orders / Products │      Scopes: read_orders,
                  │  • Customers         │      read_all_orders,
                  │  • Inventory         │      read_products,
                  │  • Webhooks          │      write_products, etc.
                  └──────────────────────┘
                             ▲
                             │
                  ┌──────────┴───────────┐
                  │   Bosta Public API   │
                  │  • Deliveries        │
                  │  • CRP (returns)     │
                  │  • AWB PDF           │
                  └──────────────────────┘
```

---

## 🔥 Key Features

### Shopify Integration (13 sub-tabs)

1. **📊 Dashboard** — KPIs + recent activity
2. **🔌 Connection** — OAuth setup + status
3. **📦 Products** — Sync + filters + bulk actions + inventory push
4. **🛒 Orders** — Two-stage COD + archive viewer + Bosta linking
5. **↩️ Returns** — Return requests + Bosta CRP integration
6. **🛍️ Abandoned Cart** — Recovery campaigns
7. **🎟 Discounts** — Codes manager
8. **👥 Customers** — Tier system (VIP/Regular/New/At-risk) + WhatsApp
9. **📬 Campaigns** — Automated WhatsApp by audience segment
10. **🚚 Shipping (Bosta)** — Live tracking + multi-provider registry
11. **🧾 Invoices** — Phase 3 accounting integration
12. **🔄 Reconciliation** — Match Shopify ↔ CLARK
13. **⚙️ Settings** — Workflow config + Bosta + Judge.me

### Document Splitting

Firestore docs hard-cap at 1 MB. CLARK uses two split strategies:

- **Daily splits** (transactional/dated): treasury, audit, payments, invoices,
  notifications, salesCreditNotes, returnRequests, campaigns, etc.
- **Per-id splits** (entities): customers, suppliers, products, etc.

Result: factory/config stays small (~150 KB) regardless of business volume.

### Universal Progress Tracking

Every sync/pull operation shows a full-screen progress overlay with:
- Live progress bar (% or indeterminate)
- Step-by-step messages
- Elapsed time
- Result preview on success
- Manual dismiss (no auto-close)

Powered by `withProgress()` server wrapper + `syncJobs/{jobId}` Firestore listener.

### Robust Error Handling

- Per-endpoint timeouts (30s default → 10 min for historical syncs)
- Try/catch on every async path
- AbortController for request cancellation
- Graceful degradation (e.g. Bosta failure doesn't block return approval)
- All errors logged with context

---

## 🚀 Development

### Prerequisites

- Node 18+
- Firebase project with Firestore + Storage + Auth
- Shopify dev store + custom app credentials
- Vercel account
- Bosta API key (optional)

### Local Development

```bash
cd "C:\Users\Ahmed Samy\Desktop\clark-v19_90_0"
npm install
npm run dev
```

### Build

```bash
npm run build
```

Output goes to `dist/`. Should finish with `✓ built in Xs` and zero errors.

### Deploy

The git repo at `Documents/GitHub/clark-factory/` is auto-deployed by Vercel
on every push to `main`. Workflow:

```bash
# 1. Develop in source folder
cd "C:\Users\Ahmed Samy\Desktop\clark-v19_90_0"
# ... edit files ...
npm run build  # verify

# 2. Bump version (3 places: package.json + constants/index.js + AboutVersionModal.jsx)

# 3. Copy to git repo
cp <files> "C:\Users\Ahmed Samy\Documents\GitHub\clark-factory\<paths>"

# 4. Commit + push
cd "C:\Users\Ahmed Samy\Documents\GitHub\clark-factory"
git add <specific-files>
git commit -m "V<x.y.z>: ..."
git push origin main

# 5. Zip on Desktop
# (PowerShell — see CLAUDE.md §1 step 6)
```

Full protocol details in [CLAUDE.md](./CLAUDE.md).

### Environment Variables (Vercel)

```
# Firebase Admin
GOOGLE_APPLICATION_CREDENTIALS_JSON  (or individual keys)
FIREBASE_PROJECT_ID

# Shopify OAuth
SHOPIFY_CLIENT_ID
SHOPIFY_CLIENT_SECRET
DELIVERY_CONFIRM_SECRET   (HMAC for state signing)

# Cron
CRON_SECRET

# Bosta webhook
BOSTA_WEBHOOK_SECRET

# Optional fallback for Shopify
SHOPIFY_STORE_URL
SHOPIFY_ACCESS_TOKEN
SHOPIFY_API_VERSION       (default: 2024-10)
SHOPIFY_APP_BASE_URL      (override for webhook URLs)
```

---

## 📜 Engineering Standard

Every line of code in this repo follows the **Principal Engineer** standard
(see [CLAUDE.md §0](./CLAUDE.md)):

- ✅ **Defensive** — handles edge cases
- ✅ **Documented** — comments explain "why" not "what"
- ✅ **Tested** — at least smoke-tested before deploy
- ✅ **Reversible** — backups + idempotent migrations

Bug fixes always include:
- ROOT CAUSE comment
- Anti-pattern entry in CLAUDE.md §10 (prevents regression)
- Verification steps

---

## 📊 Current Stats

- **Version**: V21.9.10
- **Commits on main**: 30+
- **API endpoints**: 50+
- **UI components**: 40+
- **Total lines**: ~30,000
- **Migrations completed**: 10+
- **Cron jobs**: 3 active

See [WORK_LOG.md](./WORK_LOG.md) for full phase history.

---

## 🤝 Maintainer

**Ahmed Samy** — CLARK Factory owner

Built and maintained as a Principal Engineer-level codebase.

---

## 📄 License

Private — proprietary CLARK Factory ERP system.

---

*Last updated: V21.9.10 (2026-05-10)*
