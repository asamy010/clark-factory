# CLARK — Engineering Protocol & Conventions

This file is the **single source of truth** for how to develop CLARK. Read it
before every session. Anything that contradicts this protocol must be flagged
to the user before proceeding.

---

## 1. Build → Test → Commit → Push → Zip (mandatory after every update)

Per Ahmed's standing directive (the founding protocol of this project):

```
اعمل بيلد وتيست وكوميت على جيت هاب واعمل ملف زيب فايل ع الديسكتوب
من التحديث الاخير دايماً ده بروتوكول
```

After every meaningful change:

1. **Build** — `npm run build` from the source folder. Must finish with
   `✓ built in Xs` and zero errors.
2. **Test** — quick smoke check: schema valid, no missing imports, no
   `is not defined` errors in console.
3. **Commit** — copy modified files to the git repo at
   `C:\Users\Ahmed Samy\Documents\GitHub\clark-factory\`, then
   `git add` only the relevant paths (never `git add .`), then commit
   with a clear V-tagged message:
   `V<x.y.z>: <Phase> — <one-line summary>` followed by a multi-paragraph
   body describing the change.
4. **Push** — `git push origin main`. Vercel auto-deploys.
5. **Zip** — create `clark-v<x.y.z>.zip` on the Desktop excluding
   `node_modules`, `dist`, `.vercel`, `.git`. Use Compress-Archive +
   robocopy with `/XD node_modules dist .vercel .git` and Optimal
   compression.

**Source folder**: `C:\Users\Ahmed Samy\Desktop\clark-v19_90_0\`
**Git repo**: `C:\Users\Ahmed Samy\Documents\GitHub\clark-factory\`
**Remote**: `https://github.com/asamy010/clark-factory.git`

The source folder has NO `.git`. Always copy modified files into the git
repo folder before committing.

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

- ❌ `window.open(url)` after `await` (popup blocker drops it)
- ❌ Reading `cfg.orders` (orders live in `seasons/{season}/orders/`)
- ❌ Reading `order.fabricA.colors` (colors are in `order.colorsA`)
- ❌ Reading `order.sizes` (sizes come from `order.sizeSetId` → `data.sizeSets`)
- ❌ Adding a new growing array to `factory/config` without registering
  it in `SPLIT_COLLECTIONS` or `PARTITIONED_COLLECTIONS`
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
