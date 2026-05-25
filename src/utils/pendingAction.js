/* ═══════════════════════════════════════════════════════════════════════
   CLARK · pendingAction (V21.9.188)
   ───────────────────────────────────────────────────────────────────────
   Cross-page "deep-link" action handoff. Used when one page (e.g. the
   accounting Dashboard) wants the destination page (e.g. TreasuryPg) to
   auto-open a create form on mount.

   Mechanism:
     1. Source page calls setPendingAction({tab, action, ...extra}).
     2. Source page triggers navigation (goto-tab event or setActive).
     3. Target page's mount-effect calls consumePendingAction(tab).
        If a matching action is pending AND younger than EXPIRY_MS,
        the action is returned + consumed (single-shot).

   Why sessionStorage (not window prop): survives the React re-render
   cycle without races, and stays inspectable in DevTools when the user
   reports "the new-form didn't open". The EXPIRY_MS guards against
   stale actions firing on unrelated navigations.

   Why single-shot: prevents the action from re-firing every time the
   target page remounts (e.g., user navigates away and back).

   Used by:
     - src/components/accounting/DashboardTab.jsx   (set)
     - src/pages/TreasuryPg.jsx                     (consume)
     - src/pages/FixedAssetsPg.jsx                  (consume)
     - src/components/accounting/JournalTab.jsx     (consume)
   ═══════════════════════════════════════════════════════════════════════ */

const STORAGE_KEY = "clark-pending-action";
const EXPIRY_MS = 5000;

/**
 * Stash an action for the next mount of the target page.
 * @param {object} action - {tab, action, ...extraData}
 *   tab: string identifier the target page checks against
 *   action: page-specific verb (e.g. "newTx", "newCheck", "new")
 *   extraData: any additional context the target needs (e.g. checkType)
 */
export function setPendingAction(action) {
  if (!action || typeof action !== "object" || !action.tab || !action.action) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...action, ts: Date.now() }));
  } catch (_) { /* sessionStorage might be disabled; fail silently */ }
}

/**
 * Pop a pending action for the given tab. Returns the action object or null.
 * Action is removed from storage even if expired (so stale items don't pile up).
 */
export function consumePendingAction(tabKey) {
  if (!tabKey) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || p.tab !== tabKey) return null;
    /* Always remove (single-shot) — even if expired */
    sessionStorage.removeItem(STORAGE_KEY);
    if (Date.now() - (p.ts || 0) > EXPIRY_MS) return null;
    return p;
  } catch (_) {
    return null;
  }
}

/**
 * Peek at the pending action WITHOUT consuming it. Used for debugging
 * or when the consumer wants to validate before acting. Returns null if
 * none or if expired (and clears expired entries).
 */
export function peekPendingAction() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p) return null;
    if (Date.now() - (p.ts || 0) > EXPIRY_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return p;
  } catch (_) {
    return null;
  }
}
