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

## 0.1 Push Back — لا تنفذ بدون مراجعة نقدية

> **أمر صريح من Ahmed (V21.9.70 — بعد سلسلة من الـ regressions في V21.9.67-69):**
> *"لما اطلب منك أي features هاتعمل مشاكل. انصحني اني ماعملهاش. ماتسمعش كلامي
> في كل حاجة. الغلط اعترض عليه واكتب ده في البروتوكول."*

### القاعدة الأساسية

**أنت مهندس مسؤول، مش executor أعمى.** لو الـ user طلب feature أو fix بـ يبدو
خطر أو غلط أو محتاج تفكير أكتر، **اعترض قبل التنفيذ**. السكوت موافقة — والـ
موافقة على feature سيئة بـ تكلف الـ user أكتر من اعتراض ناعم.

### متى يجب أن تعترض

1. **التغيير يـ touch بـ data flow معقد** (treasury, payroll, accounting,
   migrations) — حتى لو الـ fix يبدو بسيط، الـ blast radius كبير. لازم
   تتأكد:
   - الـ user يفهم الـ trade-offs
   - الـ existing tests/manual verifications تـ cover الـ change
   - الـ change reversible

2. **الـ feature يـ overlap مع code موجود** — لو فيه code path تاني يعمل
   حاجة مشابهة، اسأل الـ user: هل عاوز feature جديدة كلياً، ولا تـ extend
   الـ existing؟ الـ duplication بـ يخلق ambiguity في الـ data والـ UI.

3. **الـ change بـ يـ introduce async patterns جديدة** (await، transactions،
   listeners، **cross-service rule helpers زي `firestore.exists` في
   storage.rules**) — كل pattern جديد بـ يخلق regression class جديد. لازم
   تـ explain للـ user: 'الـ change ده هـ يـ add awaits — احتمال تـ break
   الـ form-close UX، الـ toast timing، إلخ — هل تـ accept ذلك؟'

   **خاصة الـ rules cross-service helpers** — Firestore rules vs Storage rules
   لهم CEL مختلف. الـ helper اللي بـ يشتغل في firestore.rules ممكن يـ throw
   silent error في storage.rules → default-deny → كل operations تفشل. **لو
   الـ user مفيش local test environment، ارفض الـ change ده تماماً** —
   الـ blast radius too high. (V21.9.69 incident — storage.rules dynamic
   scopes broke all uploads even though syntax validated and deployed.)

4. **الـ fix بـ يـ patch الـ symptom مش الـ root cause** — لو الـ root cause
   في طبقة أعمق (مثلاً Firebase rules غير مـ deployed، أو schema mismatch)،
   لا تـ implement workaround في الـ UI/API layer. اعترض: 'ده الـ symptom
   فقط — الـ root cause في X. لو نـ fix الـ symptom، الـ root cause هـ يـ
   surface تاني في مكان تاني.'

5. **التغيير بـ يـ touch settings/permissions/auth** — security-sensitive
   layers. الـ regression هنا بـ يـ block users من الـ access أو يـ leak
   permissions. لازم double-check + ask before deploy.

6. **الـ user بـ يطلب نفس الحاجة بعد ما أنت رفضت قبل** — لو رفضت لـ سبب
   وجيه (مثلاً 'الـ feature ده بـ يـ break الـ data integrity')، الـ user
   مش لازم يقبل الـ تكرار. اعترض ثاني وضّح الـ سبب بشكل أوضح.

### إزاي تعترض (بشكل احترافي مش مزعج)

❌ **لا تفعل:** الـ سكوت + تنفيذ. أو تـ implement مع warning مدفون في
الـ console.

✅ **افعل:**
```
⚠️ قبل أبدأ، عاوز ألفت نظرك لـ N مخاطر في الـ approach ده:

1. [risk #1 — concrete impact]
2. [risk #2 — concrete impact]

البدائل اللي أراها أأمن:
A. [alternative #1 + trade-off]
B. [alternative #2 + trade-off]

عاوزني أكمل بالـ approach الأصلي، أو نختار بديل، أو نناقش أكتر؟
```

### عدم التضامن مع رغبات الـ user الـ technically-wrong

الـ user مهندس بـ خبرة بس مش معصوم. لو طلب فعل غلط (مثلاً 'احذف
الـ migration logic علشان مزعج' — والـ migration بـ تـ protect data):
- اعترض بـ وضوح
- اشرح الـ سبب
- اقترح بديل
- لو الـ user أصر بعد التوضيح، نفّذ مع warning واضح + مكتوب في الكود

### الأنماط اللي يجب أن تعترض عليها فوراً

1. **'اعمل الـ feature ده بدون tests/verification'** → اعترض: الـ data
   integrity أهم من الـ velocity.
2. **'احذف الـ safety check ده'** → اعترض: الـ safety check موجود لـ سبب،
   راجع الـ git history وافهم قبل ما تشيل.
3. **'دمج N changes في واحدة'** → اعترض: كل change منفصل عشان الـ regression
   detection يكون ممكن.
4. **'اعمل الـ deploy فوراً'** → اعترض: deploy بدون verification = regression
   متوقع.

### Lessons من الـ V21.9.67-69 sequence (السبب اللي اتسجل عشانه ده)

في session واحد، نفذت ٦ "fixes" لـ data integrity متلاحقة:
- V21.9.67 (data integrity) → introduced popup-stuck regression
- V21.9.68 (popup fix) → introduced toast-delay regression
- V21.9.69 (toast fix) → user reported another regression (entry resurrection)

كل fix كان بـ يحل bug ويـ introduce واحد جديد. الـ root cause: **اتسرعت في
الـ implementation بدون ما أوقف وأقول للـ user: 'الـ changes دي معاد تـ
audit الـ async patterns في الـ app — هـ تـ require manual verification
خطوة بخطوة قبل ما نـ ship'**.

الـ user كان لازم يقول-لي 'بطل'. وأنا كان لازم أقول-له من البداية: 'الـ
changes دي risky — هـ نـ ship-ها على stages أو نـ test كل واحدة'.

---

## 1. Build → Test → Commit → Push → Zip (mandatory after every update)

Per Ahmed's standing directive (the founding protocol of this project):

```
اعمل بيلد وتيست وكوميت على جيت هاب واعمل ملف زيب فايل ع الديسكتوب
من التحديث الاخير دايماً ده بروتوكول
```

**Environment (updated 2026-05-17):**
Ahmed develops on a **Mac Mini**. Source folder lives on iCloud Drive.
Build runs on the Mac. No local-test environment — deploys go DIRECT to
production. (Old Windows paths in this file are stale — ignore them; the
Mac paths in the "Paths" table below are authoritative.)

After every meaningful change:

### Step 1 — Build

```bash
cd "/Users/as/Library/Mobile Documents/com~apple~CloudDocs/Dynamics/clark-v21.9.63"
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
REPO="/Users/as/Documents/GitHub/clark-factory"
SRC="/Users/as/Library/Mobile Documents/com~apple~CloudDocs/Dynamics/clark-v21.9.63"
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

### Step 6 — Zip (Mac)

See the "Mac standing command" below — single rsync + zip pipeline. The
old PowerShell variant has been removed (Ahmed develops exclusively on a
Mac Mini since at least V21.9.63; no Windows machine in the loop).

### Paths (memorize these — Mac)

| Item | Path |
|------|------|
| **Source folder** (development) | `/Users/as/Library/Mobile Documents/com~apple~CloudDocs/Dynamics/clark-v21.9.63/` |
| **Git repo** (deploys to Vercel) | `/Users/as/Documents/GitHub/clark-factory/` |
| **Remote** | `https://github.com/asamy010/clark-factory.git` |
| **Zip output** | `/Users/as/Library/Mobile Documents/com~apple~CloudDocs/Dynamics/clark-v<x.y.z>.zip` |
| **Vercel URL** | `https://clark-factory.vercel.app` |

The source folder has **NO `.git`** — always copy modified files into the
git repo folder before committing.

**No local test environment.** Ahmed deploys directly to production after
every commit. This means:
- Cross-service Firebase rule helpers (e.g., `firestore.exists` inside
  storage.rules) are FORBIDDEN — they pass syntax validation but fail at
  evaluation, breaking every read/write silently (V21.9.69 incident).
- Untested async patterns in hot paths (treasury saveTx, approveTransfer,
  approveWeek) WILL cause UX regressions visible immediately to all users.
- Any change that needs verification: warn explicitly, suggest staging
  the deploy with a low-risk operation first, or defer until verification
  is possible. Do not "ship and hope".

### Critical rules

- **NEVER** use `git add .` or `git add -A` — always stage specific files
- **NEVER** use `--no-verify` to skip hooks
- **NEVER** force-push to main
- **NEVER** commit secrets (shpat_, shpss_, atkn_ tokens, .env files)
- **NEVER** delete user data without explicit confirmation
- Always create NEW commits rather than amending (--amend can destroy work)
- **DO NOT rename the source folder** (Ahmed's standing rule from V21.9.60
  onward — renaming mid-session broke cwd continuity). Keep the source
  folder name stable across versions; only bump `APP_VERSION`,
  `package.json`, and the `AboutVersionModal` changelog inside.

- **BUT the folder INSIDE the zip MUST match the version**
  (Ahmed's clarification from V21.9.61). The zip output is the
  deliverable distributed to others — it should NEVER carry a stale
  folder name. So every release: build the zip from a temporary copy
  renamed to the new version, then delete the copy.

  **Mac standing command (executed on every version bump, no need to ask):**
  ```bash
  cd "/Users/as/Library/Mobile Documents/com~apple~CloudDocs/Dynamics" && \
    TMPDIR=$(mktemp -d) && \
    rsync -a \
      --exclude=node_modules --exclude=dist --exclude=.vercel \
      --exclude=.git --exclude='*.log' \
      "<source-folder-name>/" "$TMPDIR/clark-v<NEW>/" && \
    rm -f "clark-v<NEW>.zip" && \
    (cd "$TMPDIR" && zip -rq "/Users/as/Library/Mobile Documents/com~apple~CloudDocs/Dynamics/clark-v<NEW>.zip" "clark-v<NEW>") && \
    rm -rf "$TMPDIR"
  ```

  Result: source folder unchanged on disk, zip's inner folder = version,
  zip filename = version. Three names stay in sync (zip name + inner
  folder + APP_VERSION) without ever touching the live source.

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

### Migration safety — CHECKLIST for adding a partitioned/split field

**Adding a new partitioned collection (per-id docs) — V21.9.44 lesson:**

⚠️ MUST do ALL of these. Skipping any one creates the "البرنامج لسه بيحمل
بيانات" hang that blocks every user save (V21.9.46 root cause).

1. ✅ Register in `src/utils/partitionedCollections.js`:
   ```js
   PARTITIONED_COLLECTIONS.<field> = "<collection>Docs";
   PARTITIONED_FIELDS_V<XXXXX> = ["<field>"];
   PARTITIONED_FLAG_V<XXXXX>  = "_partitioned<X>V<XXXXX>Done";
   // + add to stripPartitionedArrays
   ```
2. ✅ Hydrate in `src/App.jsx` upConfig (search for `PARTITIONED_FLAG_V2192`,
   add a parallel block):
   ```js
   if(prev[PARTITIONED_FLAG_V<XXXXX>]){
     for(const f of PARTITIONED_FIELDS_V<XXXXX>){
       next[f]=JSON.parse(JSON.stringify(explicitPartBefore[f]||[]));
       partFieldsActive.push(f);
     }
   }
   ```
3. ✅ Add to merge logic in `App.jsx` data useMemo (same pattern)
4. ✅ Add flag to BOTH safety gates in `App.jsx` (lines ~3681 + ~3904)
5. ✅ **CRITICAL — Add `firestore.rules` match clause** before deploying:
   ```
   match /<collection>Docs/{id} {
     allow read:  if isAnyUser();   // or isHRRole(), etc.
     allow write: if isManagerPlus(); // or appropriate scope
   }
   ```
6. ✅ Create migration endpoint `api/maintenance/migrate-<field>.js`
   following the V21.9.42/V21.9.44 pattern (backup → dry-run → idempotent)
7. ✅ Add client wrapper in `shopifyClient.js` with appropriate timeout
8. ✅ Add UI banner in `DiagnosticsPanel.jsx` with migration trigger

**Deployment order:**
1. **Deploy `firestore.rules` FIRST** (or in parallel) before any client code
   that subscribes to the new collection. Otherwise the listener fails with
   `permission-denied` → V21.9.46 resilience kicks in (treats as
   loaded-empty + shows top-bar banner), but data WILL be invisible until
   rules deploy.
2. Then deploy the client code (App.jsx + UI + endpoints).
3. Run the migration from `DiagnosticsPanel`.

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

## 13. Session continuity & git sync (READ FIRST every session)

> **مهم جداً — قبل أي شغل في أي session جديد.**

### الـ git working tree ممكن يكون متأخّر عن origin/main
في البيئة دي لاحظنا إن الـ **local HEAD أحياناً بيبدأ من commit أقدم** من
`origin/main` (الـ push بيوصل GitHub بس الـ working copy بتترجّع). **الأعراض:**
رقم النسخة في `package.json`/`constants` بيبان أقدم من المتوقع، أو ملفات
معدّلة (من commits سابقة) مش موجودة محلياً.

**الحل — أول أمر في أي session:**
```bash
cd <repo> && git fetch origin main && git log --oneline -3 origin/main
# لو origin أحدث من HEAD المحلي ومفيش شغل محلي غير متكوميت:
git reset --hard origin/main
```
وقبل كل commit جديد: `git fetch origin main` ثم `git rebase origin/main` ثم
push. لو الـ push اترفض بـ `fetch first` → اعمل rebase وأعد المحاولة.

### البروتوكول ثابت (تأكيد §1)
بعد كل تعديل: **build → bump النسخة في ٣ أماكن → commit (ملفات محددة) → push
origin main → zip**. النسخة لازم تتظبط في `package.json` +
`src/constants/index.js` + entry جديد في `src/components/AboutVersionModal.jsx`.
لو النسخة «درِفت» بسبب الـ sync، صحّحها واكتب entries الناقصة في الـ changelog.

---

## 14. V21.21.x — قرارات معمارية مهمة (sales orders · dashboard · checks)

### 14.1 أمر البيع = البيع، و«المرايا» من التوزيعة
- **أمر البيع المباشر** بيُحتسب في الكشف التشغيلي (مدين) + بيخصم الرصيد المتاح
  (V21.21.0). الحسابات دي **قراءة مشتقّة** — مفيش mutation مالي جديد عند الإنشاء.
- **«المرآة»** = أمر بيع متولّد من توزيعة (`generateSalesOrdersFromSession
  Mutator`) عند زر «🧾 تأكيد البيع» في سجل التسليمات. علامته
  `sourceDistributionId = "${sessionId}:${custId}"` + `isDistributionMirror`.
- **قاعدة ذهبية لمنع الحساب المزدوج:** أي SO له `sourceDistributionId`
  **بيتخطّاه** كود V21.21.0 في **٤ أماكن**: `statement.js` (operational)،
  `accountSummary.computeSalesOverviewTotals` + `buildCustomerSummary`،
  `CustDeliverPg.soReservedByOrder`، `InventoryValuationReport.soReserved`.
  التوزيعة هي «مصدر الحقيقة»، المرآة مستند عرض/فوترة فقط (read-only locked).
- ⚠️ **الأوامر بتتخزّن في subcollection الموسم** (`seasons/{s}/orders`) — **مش
  في `d.orders` بتاع upConfig/upSales**. المُولّد بيقرأ من `data` الحيّة عبر
  `ctx={orders,customers,session}` ويكتب `salesOrders` عبر **upConfig** (config).
  (ده كان سبب bug «مفيش تسليمات مؤكّدة» — V21.21.13.)

### 14.2 تسلسل حذف المستندات (عكس الإنشاء)
عرض سعر → أمر بيع → فاتورة (ونفسه للمشتريات: RFQ → PO → استلام → فاتورة).
الحذف **الأحدث أولاً**: تحذف الأحدث، والأقدم يفضل (ويرجع لحالته السابقة).
- حذف SO: مسموح والعرض موجود (بيرجّعه «مقبول»)؛ ممنوع لو فيه فاتورة.
- حذف العرض: ممنوع لو فيه SO. حذف الفاتورة المسودة: بيفُكّ ربط الـ SO.
- المشتريات: `deletePo` يمنع لو فيه استلام، `deleteReceipt` يمنع لو فيه فاتورة،
  `deleteRfqMutator` يمنع لو فيه PO. (V21.21.3/4)
- حذف مجمّع (multi-select) + `BlockingOverlay` أثناء الحذف (V21.21.5).

### 14.3 الشيكات في كشف الحساب (V21.21.14)
- الشيك بيظهر **مرة واحدة من `data.checks`** (للعميل receivable «دفعة عميل»،
  للمورد payable «دفعة مورد»، غير مرتد/ملغي) — **معلّق أو محصّل/مدفوع**.
- حركات الخزنة `sourceType = check_collect / check_pay` **مستبعدة** من كشف
  الطرف (عشان مفيش تكرار؛ رصيد الخزنة النقدي مش متأثر — بيتحسب من
  `data.treasury` مباشرة). شيكات المورد المرتبطة بـ supplierPayment (بالـ
  `checkId`) بتتعدّ كدفعة (dedup). تريجر `checkDue` في
  `api/automation-tick.js` سليم (لازم enabled + ownerPhones).

### 14.4 معادلة الربح في لوحة التحكم (V21.21.17)
`src/utils/dashboardKpis.js` → **الربح = المبيعات الفعلية − المشتريات الفعلية
+ إجمالي تقييم المخزون** (= صافي المبيعات − COGS، و COGS = صافي المشتريات −
المخزون الختامي، تراكمي opening=0). **مجمل ربح تجاري — بدون مصروفات تشغيلية**.
تقييم المخزون بالتكلفة: الجاهز = `avail × calcOrder(o).costPer`، الخامات/
الإكسسوار = `stock × avgCost`. اللوحة (`DashboardKpis.jsx`) في تبويب «لوحة
التحكم» (`DashPg`) — **مش** في الهوم (V21.21.18). كل بطاقة → بوب اب تفاصيل +
طباعة/PDF.

### 14.5 حقائق بيانات متفرقة
- `buildCustomerSummary(custId, data)` و`buildSupplierSummary(supId, data)` —
  **الـ id الأول، data تاني** (سهل تتعكس بالغلط).
- الطباعة الحرارية للعميل: `printSalesDeliveryLabel(...,extra)` — الـ param
  الأخير `extra={shippingCompany, acctRequired, acctPaid, acctRemaining}`
  لبوليصة الشحن 15×10 (V21.21.16). متوافق بدون extra.
- الرصيد الافتتاحي للمخزن (V21.21.12): `applyStockDelta` لكل الفئات، حركة
  `type=opening sourceType=opening` بدون مورد/خزنة.
- التذكيرات المجدولة تدعم `daysOfWeek[]` / `daysOfMonth[]` (V21.21.11) — متوافق
  مع المفرد (الخزنة recurring مش متأثرة).
- على الموبايل: هَب المبيعات/المشتريات **مخفي شريط تاباته الداخلي** (الشريط
  العلوي SubViewTabs كفاية) — التنقّل من شبكة «الأقسام» (V21.21.15).
- التقرير اليومي (`api/_buildDailyReport.js` + client) بيحسب المبيعات من
  التوزيعات **+ أوامر البيع المباشرة** (بيتخطّى المرايا) — V21.21.2.
- تقرير الخزنة الشامل: تاب «تقارير» في TreasuryPg (V21.21.2). تاب «الحسابات»
  اتسمّى «دفاتر اليومية» (V21.21.10).

---

Last updated: V21.21.18 (2026-06-09) — أضيف §13 (git sync + continuity) و§14
(قرارات V21.21.x). البروتوكول §1 ثابت.
