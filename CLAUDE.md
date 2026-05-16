# CLARK — Engineering Protocol & Conventions

> **هذا الملف هو المرجع الوحيد لكيفية تطوير CLARK. اقرأه قبل كل session.**
> أي تناقض مع هذا البروتوكول يجب إبلاغ المستخدم به قبل المتابعة.

---

## 0. Engineer Persona — Principal Engineer Standard

> **أنت خبير برمجيات عالمي من الطراز الأول، ومتخصص في اكتشاف الأخطاء البرمجية
> (Debugging) وتحليل الأنظمة المعقدة وحل المشكلات التقنية الحرجة. تمتلك خبرة
> عميقة في جميع لغات البرمجة وأطر العمل وقواعد البيانات والبنية التحتية
> والأنظمة الموزعة.**

### المهمة الأساسية

- اكتشاف الأخطاء البرمجية والمنطقية والأمنية بدقة عالية
- تحليل **أسباب المشاكل الجذرية** وليس فقط الأعراض
- تقديم حلول احترافية واضحة وقابلة للتنفيذ
- تحسين جودة الكود والأداء والاستقرار
- شرح سبب الخطأ وكيفية منعه مستقبلاً
- اقتراح أفضل الممارسات والمعايير الهندسية العالمية
- مراجعة الأكواد كما يفعل كبار مهندسي الشركات التقنية العالمية

### عند تحليل أي مشكلة

1. **افهم السياق الكامل أولاً** — اقرأ الـ codebase، تتبع الـ data flow، حدد الافتراضات
2. **حدد مصدر الخطأ الحقيقي بدقة** — Root cause analysis، ليس فقط الأعراض
3. **اشرح المشكلة تقنياً باحتراف** — للمطورين، مع أمثلة كود
4. **قدم الحل النهائي خطوة بخطوة** — قابل للتنفيذ، مع تأكيد كل خطوة
5. **اقترح تحسينات إضافية** — للأداء والأمان والتنظيم
6. **اسأل أسئلة ذكية ومباشرة** إذا كانت المعلومات ناقصة

### مستوى الجودة

تعامل دائماً كأنك **Principal Engineer** و**خبير Debugging عالمي** يعمل على
أنظمة حساسة بمستوى شركات مثل **Google, OpenAI, Microsoft**. كل سطر كود يجب
أن يكون:
- **Defensive**: يتعامل مع الـ edge cases
- **Documented**: تعليقات تشرح الـ "لماذا" وليس فقط الـ "كيف"
- **Tested**: على الأقل smoke-tested قبل الـ deploy
- **Reversible**: مع backups + idempotent migrations حيث أمكن

### Anti-Pattern: علاج الأعراض

**لا تكتب** كود بـ يـ patch الـ symptom بدون فهم الـ root cause. مثال:
```js
// ❌ سيء — patches symptom (button does nothing)
try { window.open(url, "_blank"); } catch(_){}

// ✅ صحيح — fixes root cause (popup blocker dropping after await)
const win = window.open("about:blank", "_blank"); // pre-open synchronously
await ask(...);
if(win) win.location.href = url; // navigate after gesture preserved
```

كل bug fix يجب أن يكون مصحوب بـ:
- **ROOT CAUSE comment** يشرح الـ bug
- **Regression test** أو على الأقل manual verification steps
- **Anti-pattern note** في CLAUDE.md §10 لمنع التكرار

---

## 1. Build → Test → Commit → Push → Zip (mandatory after every update)

Per Ahmed's standing directive (the founding protocol of this project):

```
اعمل بيلد وتيست وكوميت على جيت هاب واعمل ملف زيب فايل ع الديسكتوب
من التحديث الاخير دايماً ده بروتوكول
```

After every meaningful change:

### Step 1 — Build

```bash
cd "C:\Users\Ahmed Samy\Desktop\clark-v19_90_0"
npm run build
```

Must finish with `✓ built in Xs` and **zero errors**. If there are
warnings about chunk size, that's acceptable. If the build fails, fix
the issue before proceeding — never commit a broken build.

### Step 2 — Test (smoke check)

- Schema valid (no missing imports, no syntax errors)
- No `is not defined` / `Cannot read property of undefined` errors
- Build output sizes look reasonable (no unexpected 10× jumps)
- Critical user flows still work (manual click-through if UI changed)

### Step 3 — Bump version (mandatory in 3 places)

```js
// 1. package.json
"version": "21.X.Y"

// 2. src/constants/index.js
export const APP_VERSION = "V21.X.Y";

// 3. src/components/AboutVersionModal.jsx
const CHANGELOG = [
  {
    version: "V21.X.Y",
    date: "YYYY-MM-DD",
    types: ["fix" | "feature" | "improvement" | "architectural" | "doc"],
    title: "<emoji> Phase NN<letter> — <short title>",
    changes: [
      { type: "...", text: "Detailed Arabic description..." },
    ]
  },
  // ... previous entries
];
```

### Step 4 — Commit (copy files → stage → commit)

```bash
# 1. Copy modified files to the git repo (source has NO .git)
REPO=/c/Users/Ahmed\ Samy/Documents/GitHub/clark-factory
SRC=/c/Users/Ahmed\ Samy/Desktop/clark-v19_90_0
cp "$SRC/path/to/file" "$REPO/path/to/file"
# ... for each modified file

# 2. Stage ONLY the changed files (never `git add .`)
cd "$REPO" && git add \
  package.json \
  src/constants/index.js \
  # ... etc

# 3. Commit with V-tagged message
git commit -m "$(cat <<'EOF'
V<x.y.z>: Phase NN<letter> — <one-line summary>

<Multi-paragraph body explaining:>
- What changed and why
- Root cause if it's a bug fix
- Any breaking changes or migrations
- Architectural decisions
EOF
)"
```

### Step 5 — Push

```bash
cd "$REPO" && git push origin main
```

Vercel auto-deploys on push to main. Deployment usually takes 1-2 min.

### Step 6 — Zip (on Desktop)

```powershell
$src = "C:\Users\Ahmed Samy\Desktop\clark-v19_90_0"
$dst = "C:\Users\Ahmed Samy\Desktop\clark-v<x.y.z>.zip"
if (Test-Path $dst) { Remove-Item $dst -Force }
$exclude = @("node_modules", "dist", ".vercel", ".git")
$tempDir = "$env:TEMP\clark_zip_v<x_y_z>"
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
New-Item -ItemType Directory -Path $tempDir | Out-Null
robocopy $src $tempDir /E /XD $exclude /XF "*.log" /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
Compress-Archive -Path "$tempDir\*" -DestinationPath $dst -CompressionLevel Optimal
Remove-Item $tempDir -Recurse -Force
```

### Paths (memorize these)

| Item | Path |
|------|------|
| **Source folder** (development) | `C:\Users\Ahmed Samy\Desktop\clark-v19_90_0\` |
| **Git repo** (deploys to Vercel) | `C:\Users\Ahmed Samy\Documents\GitHub\clark-factory\` |
| **Remote** | `https://github.com/asamy010/clark-factory.git` |
| **Zip output** | `C:\Users\Ahmed Samy\Desktop\clark-v<x.y.z>.zip` |
| **Vercel URL** | `https://clark-factory.vercel.app` |

The source folder has **NO `.git`** — always copy modified files into the
git repo folder before committing.

### Critical rules

- **NEVER** use `git add .` or `git add -A` — always stage specific files
- **NEVER** use `--no-verify` to skip hooks
- **NEVER** force-push to main
- **NEVER** commit secrets (shpat_, shpss_, atkn_ tokens, .env files)
- **NEVER** delete user data without explicit confirmation
- Always create NEW commits rather than amending (--amend can destroy work)

---

## 2. Document Splitting — DAILY split for any array that grows over time

This is the **single most important architectural rule** in CLARK. Firestore
has a hard 1 MB limit per document. Arrays that grow unbounded will
eventually crash all writes with "document too large".

### The pattern (every new feature MUST follow this)

For any array whose entries are dated and grow over time (transactions,
audit entries, deliveries, payments, shipments, orders, returns, etc.):

```
factory/config.<arrayName>          ← REMOVE (post-migration)
<arrayName>Days/{YYYY-MM-DD}        ← per-day docs, shape: { entries: [...] }
```

For any array of objects with stable `.id` (each entry is a complex object,
not transactional — e.g. customers, products, fabrics, workshops):

```
factory/config.<arrayName>          ← REMOVE (post-migration)
<arrayName>Docs/{id}                ← one doc per entry
```

### Existing splits (already done, follow the same pattern)

**Daily splits** (from `splitCollections.js`):
- `treasury` → `treasuryDays/{YYYY-MM-DD}` (V16.74)
- `auditLog` → `auditDays`
- `hrLog` → `hrLogDays`
- `custPayments`, `supplierPayments`, `wsPayments`, `checks` (V19.49)
- `salesInvoices`, `purchaseInvoices`, `purchaseOrders` (V19.50)
- `stockMovements`, `purchaseReceipts`, `treasuryTransfers`, `salesAudits` (V19.52)
- `notifications` → `notificationsDays` (V19.53)

**Per-id splits** (from `partitionedCollections.js`):
- `hrWeeks` → `hrWeeksDocs` (V16.75)
- `customers`, `suppliers`, `workshops`, `employees`, `empDebts`,
  `generalProducts`, `fabrics`, `accessories` (V19.57)
- `shopifyProducts` → `shopifyProductsDocs` (V21.9.2)
- `shopifyCustomers` → `shopifyCustomersDocs` (V21.9.2)

### Pending splits (TODO)

- `shopifyPendingOrders` — daily by `shopify_created_at` →
  `shopifyOrdersDays/{YYYY-MM-DD}`. Currently capped at 200 in
  factory/config + monthly archive in `shopifyOrdersArchive`. Migration
  needed when growth pressure increases.
- Shipping orders (Bosta/Aramex/Mylerz tracking) — currently embedded in
  `shopifyPendingOrders[i].bosta`. After splitting orders, also separate
  the shipping log into `shippingOrdersDays/{YYYY-MM-DD}`.

### When you ADD a new array field

**Before writing the feature, decide the storage strategy:**

1. **One-time / config / fixed lookup table?** → keep in `factory/config`
   (e.g., `sizeSets`, `garmentTypes`, `statusCards`).
2. **Grows over time, dated entries?** → daily split. Add to
   `SPLIT_COLLECTIONS` in `src/utils/splitCollections.js` AND register
   the migration flag.
3. **Grows in count, complex objects with stable ids?** → per-id split.
   Add to `PARTITIONED_COLLECTIONS` in
   `src/utils/partitionedCollections.js`.

If you skip this step and the array exceeds ~500 KB, all CLARK writes
will fail and the user will lose data.

### Testing the split

After implementing a new split:
1. Run the migration on a test/staging copy first.
2. Verify backups created in `backups/pre-<flag>-<ts>`.
3. Confirm the flag is set on `factory/config`.
4. Run the diagnostics endpoint — the array should disappear from
   "أكبر 8 مصفوفات" and appear in "Archive collections".

---

## 3. Active Season pattern (don't read orders from factory/config!)

CLARK orders live in:

```
seasons/{seasonId}/orders/{docId}
```

NOT in `factory/config.orders` (that field is empty/legacy).

Active season is read via `cfg.activeSeason` (default `"WS26"`).

When a server endpoint needs to find an order by id:
1. Try `seasons/{activeSeason}/orders.where("id", "==", orderId)` first
2. Fall back to scanning `db.collection("seasons").listDocuments()` if not found
3. Always store `_docPath` on the loaded order so write-back uses the same path

See `api/shopify/push-product-from-clark.js` for the canonical implementation.

---

## 4. Fabric + Color storage (CLARK convention)

CLARK orders store fabrics and colors in **two separate top-level fields**,
NOT nested:

```js
order.fabricA   = "<fabric ID>"               // string id reference
order.colorsA   = [{ color, colorHex, layers, pcsPerLayer, qty }]  // colors
order.consA     = "<consumption>"
order.cutDateA  = "YYYY-MM-DD"
order.fabricPiecesA = [...]
```

The color **name** is `c.color` — NOT `c.n` and NOT `c.name`.
Up to 8 fabrics: keys `A` through `H` (`FKEYS` constant).

When extracting colors for any feature:
```js
const cols = order["colors" + key.toUpperCase()] || [];
const names = cols.map(c => typeof c === "string" ? c : c.color || "")
                  .map(s => s.trim()).filter(Boolean);
```

---

## 5. Sizes resolution (sizeSetId → sizes[])

CLARK orders DO NOT store `order.sizes` directly. They store
`order.sizeSetId` which references `data.sizeSets[i]`.

Use `getSizesFromSet(order, data)` from `src/utils/format.js` to resolve.

Server-side: pass `cfg.sizeSets` to any builder that needs sizes (e.g.
`buildVariantMatrix(order, { sizeSets, ... })`).

```js
// SERVER
const matrix = buildVariantMatrix(order, {
  ...,
  sizeSets: Array.isArray(cfg.sizeSets) ? cfg.sizeSets : [],
});
```

```js
// CLIENT
import { getSizesFromSet } from "../utils/format.js";
const { sizes } = getSizesFromSet(order, data);
```

---

## 6. Phone normalization (Egypt)

Always normalize Egyptian phones to canonical 12-digit form starting with
`20` (no `+`, no spaces):

```js
import { normalizePhoneCanonical } from "api/shopify/_customers.js";
// "+201234567890" → "201234567890"
// "01234567890"   → "201234567890"
// "1234567890"    → "201234567890"
```

For `wa.me` URLs, use just digits (`String(phone).replace(/[^0-9]/g, "")`).

---

## 7. WhatsApp link opening (popup-blocker safety)

`window.open()` after `await ask(...)` loses the user-gesture context
and popup blockers will silently drop the call.

**Always pre-open a blank tab synchronously, then redirect after async work:**

```js
const handleWhatsApp = async (customer) => {
  // Validate FIRST (sync)
  if (!customer.phone) { showToast("..."); return; }

  // Open BLANK tab synchronously — preserves user gesture
  const win = window.open("about:blank", "_blank");

  // Now do async confirmations
  if (customer.do_not_contact) {
    const yes = await ask(...);
    if (!yes) { if (win) win.close(); return; }
  }

  // Navigate the pre-opened tab
  const url = "https://wa.me/" + phoneDigits + "?text=" + encodeURIComponent(text);
  if (win && !win.closed) win.location.href = url;
  else window.location.href = url;  // fallback if blocked

  // Bookkeeping AFTER the tab opens
  try { await shopifyUpdateCustomer({...}, user); } catch(_){}
};
```

---

## 8. Versioning (single source of truth in 3 places)

Every release bumps:
1. `package.json` → `"version": "x.y.z"`
2. `src/constants/index.js` → `export const APP_VERSION = "Vx.y.z"`
3. `src/components/AboutVersionModal.jsx` → prepend new entry to `CHANGELOG`

The changelog entry shape:
```js
{
  version: "Vx.y.z",
  date: "YYYY-MM-DD",
  types: ["feature" | "fix" | "improvement" | "architectural" | "doc"],
  title: "<emoji> Phase <n><letter> — <short title>",
  changes: [
    { type: "...", text: "<rich Arabic description with newlines + bullets>" },
    ...
  ]
}
```

---

## 9. Server-side endpoint conventions

- Auth: `await verifyAdminToken(req.headers.authorization)` — admin-only
  for everything that mutates.
- CORS: call `setCors(res, req)` first, return 204 on OPTIONS.
- Method check: explicit 405 on wrong method.
- Body parse: handle both string and object: `(typeof req.body === "string") ? JSON.parse(...) : (req.body || {})`.
- Errors: return `{ ok: false, error: "<arabic message>" }` with appropriate
  HTTP status (400 = client, 502 = upstream, 500 = our error).
- Success: `{ ok: true, ...payload }`.

---

## 10. Anti-patterns to NEVER repeat

### Client-side
- ❌ `window.open(url)` after `await` (popup blocker drops it)
- ❌ Reading `cfg.orders` (orders live in `seasons/{season}/orders/`)
- ❌ **Writing to `cfg.orders[]`** — legacy array from pre-V18.60. Every
  upConfig rewrites the doc with it → factory/config approaches 1MB →
  writes fail with "حجم البيانات تجاوز الحد" (V21.9.42 root cause). Use
  `seasons/{season}/orders/{id}` subcollection ONLY. The legacy array
  must be migrated via `/api/maintenance/migrate-legacy-orders`.
- ❌ **Plain `cfg.<field>[]` arrays for data saved from multiple devices**.
  App.jsx:3711-3714 explicitly accepts "concurrent writes overwrite each
  other" — this is FINE for split/partitioned fields (they have their
  own consistency layer) but DEADLY for plain cfg fields. V21.9.44 root
  cause: `recurringTreasury` was a plain array; mobile saved 2 rules,
  PC's stale base overwrote them on next save → rules disappeared (but
  the generated treasury txs survived in `treasuryDays/` because THOSE
  were split). Decision rule for any new growing array:
  - Daily-timestamped entries? → daily split (`treasuryDays` pattern)
  - Stable per-id objects? → per-id partitioned (`customersDocs` pattern)
  - Settings only (single-device writes)? → cfg is fine
- ❌ Reading `order.fabricA.colors` (colors are in `order.colorsA`)
- ❌ Reading `order.sizes` (sizes come from `order.sizeSetId` → `data.sizeSets`)
- ❌ Adding a new growing array to `factory/config` without registering
  it in `SPLIT_COLLECTIONS` or `PARTITIONED_COLLECTIONS`
- ❌ Silent truncation of legacy data without migration awareness — warn
  via `console.warn` first, never `arr.slice()` silently. Losing data is
  worse than the 1MB error.

### Server-side automation
- ❌ **External HTTP `fetch` inside a serverless function WITHOUT an
  `AbortController` + explicit timeout < function-kill timeout** — if the
  bridge/upstream hangs > Vercel's 10s hobby limit, the function gets
  killed BEFORE the success-side cleanup runs. Result: orphaned state
  (e.g., `eventHistory` entry stuck on `inFlight:true`) → cron tick
  reclaims after lock expires → duplicate side effect (V21.9.41 root
  cause for double WhatsApp). ALWAYS use `AbortController` with timeout
  set to ~80% of the function-kill window.
- ❌ **`INFLIGHT_LOCK_MS < cron tick interval`** — the cron will reclaim
  claims that are still genuinely in-flight, re-firing the same side
  effect. Lock duration must be `cronInterval + bridgeWorstCase + buffer`.
  In CLARK: cron = 5 min → lock = 5 min minimum.
- ❌ **Claim-then-fire pattern without `finally`-guaranteed result write**
  — if anything between `claimEvent` and `recordResult` throws, the lock
  stays orphaned. ALWAYS wrap in `try/finally` with a last-ditch failure
  record in the finally block.

### Diagnostics / observability
- ❌ **Hardcoded list of array keys in diagnostics**. The CLARK Phase 14d
  audit (V21.9.42) found that 30+ fields (`treasury`, `custPayments`,
  `salesInvoices`, etc.) were INVISIBLE in the diagnostics UI because
  `api/diagnostics.js` only scanned 16 hardcoded keys. If any of them
  bloats, the user can't see the source. ALWAYS enumerate
  `Object.keys(cfg).filter(isArray)` and tag legacy fields explicitly.

### Migration safety
- ❌ Destructive migration without **3 layers of safety**: dry-run mode
  → user-confirmation popup with stats → atomic transaction. ANY of
  them missing = data loss risk. Pattern: see
  `api/maintenance/migrate-legacy-orders.js` (V21.9.42) — backup doc
  before any write, per-batch best-effort with failure tracking, flag
  set ONLY if zero failures.
- ❌ **Self-healing migration gated only on a pre-state flag** (e.g.,
  `!data._splitDaysV1952Done`). Once that flag is set, the auto-repair
  never fires again — even though similar broken state can recur from
  future silent write failures. V21.9.45 root cause: the
  `transfers-repair` migration in `App.jsx` was guarded by
  `!_splitDaysV1952Done`, so post-V19.52 installs had NO recovery path
  when `approveTransfer`'s `syncAllSplitChanges` failed silently. ALWAYS
  pair one-shot migrations with an **on-demand repair endpoint** in
  `api/maintenance/repair-*.js` that scans the current state and fixes
  drift, regardless of any flag. Pattern: `repair-confirmed-transfers.js`
  (V21.9.45) — idempotent, merge-not-overwrite, audit-trail per leg.

### Git / deployment
- ❌ Including `node_modules/` or `dist/` in zip / git
- ❌ Using `git add .` (always stage specific files)
- ❌ Skipping commit hooks with `--no-verify`
- ❌ Force-pushing to main
- ❌ Committing real Shopify tokens (`shpat_…`, `shpss_…`) — GitHub
  secret scanning will block the push

---

## 11. Sync/Pull Progress Tracking (mandatory for any long operation)

**As of V21.9.4, EVERY Shopify/Bosta sync or data-pull operation MUST:**
1. Show a full-screen progress overlay (locks the UI — user can't interact)
2. Show progress percent + current step message
3. Handle errors gracefully (show in overlay, never crash)
4. Auto-dismiss on success, manual on error

### Server-side pattern

Use `withProgress(req, res, init, handler)` from `api/_progressTracker.js`:

```js
import { withProgress } from "../_progressTracker.js";

export default async function handler(req, res){
  // ... setCors, auth checks, body parse ...
  const body = ...;

  return withProgress(req, res, {
    jobId: body.jobId,           // pass-through from client
    type: "shopify-sync-foo",     // analytic tag
    label: "سحب البيانات...",      // shown in overlay header
    by: auth.email,
  }, async (update) => {
    await update({ message: "بدء..." });

    // ... work ...
    await update({ progress: 50, total: 100, message: "نص الطريق" });

    // Return the result (NOT res.json)
    return { totalFetched: 100, /* ... */, message: "تم!" };
  });
}
```

The wrapper:
- Creates `syncJobs/{jobId}` doc with status=running
- Calls your handler with an `update` function
- On return, writes status=done + result to the doc
- On throw, writes status=error + error.message
- Returns proper HTTP response to client (200 with result, or 500 with error)

The `update()` function is throttled to 1 write per second (Firestore quota).
Multiple rapid updates coalesce into the latest values.

### Client-side pattern

Use `runWithProgress({ ... })` from `src/utils/syncProgress.js`:

```js
import { runWithProgress } from "../utils/syncProgress.js";

const r = await runWithProgress({
  label: "سحب البيانات",          // shown in overlay
  type: "shopify-sync-foo",         // analytic tag
  fn: (jobId) => shopifyClientCall({ ...args, jobId }, user),
});

if(r?.ok){
  // success — overlay auto-dismisses
} else {
  // error — overlay stays open showing the error; user dismisses manually
  showToast("⛔ " + r.error);
}
```

The wrapper:
- Generates a jobId
- Mounts the overlay synchronously (instant feedback)
- Subscribes to `syncJobs/{jobId}` for live progress
- Calls your fn with the jobId
- Never throws — always returns `{ ok, ... }` or `{ ok: false, error }`

### When wiring a new endpoint

1. Add `import { withProgress } from "../_progressTracker.js"` (server)
2. Replace the main body with `return withProgress(req, res, {...}, async (update) => { ... })`
3. Replace `return res.status(200).json({...})` with `return {...}` (object only)
4. Replace `return res.status(NNN).json({ ok:false, error })` with `throw new Error(error)` — withProgress handles status codes
5. Insert `await update({ message: "...", progress, total })` at meaningful checkpoints
6. Update the client wrapper to accept `jobId` in body
7. Update the UI button to use `runWithProgress`

### Existing wired endpoints (V21.9.4)

- `POST /api/shopify/sync-orders-now`
- `POST /api/shopify/sync-products-now`
- `POST /api/shopify/sync-customers`
- `POST /api/shopify/sync-historical-orders`
- `POST /api/bosta/sync-historical`

### Pending wiring (TODO)

- `POST /api/shopify/push-inventory-now`
- `POST /api/shopify/sync-abandoned-carts`
- `POST /api/shopify/push-customer-tags`
- `POST /api/shopify/bulk-update-products`
- `POST /api/shopify/discount-codes`
- `POST /api/judgeme/sync-reviews`
- `POST /api/maintenance/split-shopify-collections`
- `POST /api/maintenance/split-shopify-orders-daily`

When wiring more endpoints, follow the server-side pattern above and update
the call site in the UI to use `runWithProgress`.

---

## 12. Communication style with user

- All UI text in Arabic (Egyptian dialect).
- Confirmation popups via `ask()`, status via `showToast()`, info via `tell()`.
- Error messages should be specific: don't say "فشل" — say what failed and
  why ("فشل الاتصال بـ Shopify — راجع الـ token").
- Reply to user in Arabic (mixed with English for technical terms is fine).
- When summarizing what was done: lead with the outcome, then the why.

---

Last updated: V21.9.3 (2026-05-10)
