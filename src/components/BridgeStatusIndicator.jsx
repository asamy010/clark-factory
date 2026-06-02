/* ═══════════════════════════════════════════════════════════════
   CLARK — WhatsApp Bridge health indicator (V21.9.202)

   ROOT CAUSE this replaces:
   The Automation page pill said "غير متصل" while Campaigns showed
   "متصل" for the SAME bridge, at the SAME time. Two bugs caused it:

     1. Strictness mismatch — Automation's pill required `status.ok`
        (`if (s && s.ok)`) BEFORE checking waReady. The bridge /status
        endpoint returns {waReady, waState} and does NOT reliably send an
        `ok` field, so the pill fell through to "غير متصل" even when
        waReady was true. Campaigns checks `s.waReady` directly (no `ok`)
        and therefore showed the correct "متصل".

     2. No resilience — Automation's pill flipped to offline on ANY single
        fetch failure (5s timeout, re-checked every 30s). A brief network
        blip or a slow bridge response → a false "غير متصل" for up to 30s.

   This shared hook + pill fix both: it mirrors Campaigns' WORKING check
   (waReady), and it keeps showing the last-good state through a single
   transient failure — only reporting "offline" after 2 failures in a row
   (or if the bridge was never reachable at all this session).

   Used by: the Home greeting bar (App.jsx) AND the Automation page pill,
   so all three places (Home / Automation / Campaigns) now agree.
   ═══════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef } from "react";
import { FS } from "../constants/index.js";

/* Poll the bridge /status and expose a resilient, waReady-based health.
   States: unset | checking | init | qr | ready | offline */
export function useBridgeHealth(url, token, intervalMs = 45000){
  const [health, setHealth] = useState(() => ({ state: url ? "checking" : "unset", info: null, error: "" }));
  const failsRef = useRef(0);
  const lastGoodRef = useRef(null);

  useEffect(() => {
    if(!url){ setHealth({ state: "unset", info: null, error: "" }); return; }
    let dead = false;
    failsRef.current = 0;
    lastGoodRef.current = null;
    const base = String(url).replace(/\/+$/, "");

    const check = async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        const r = await fetch(base + "/status", {
          headers: token ? { Authorization: "Bearer " + token } : undefined,
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        const s = await r.json();
        if(dead) return;
        failsRef.current = 0;
        /* waReady is the canonical "ready to send" flag (NOT `ok`). */
        const ready = !!s.waReady;
        const wstate = String(s.waState || "").toUpperCase();
        const state = ready
          ? "ready"
          : (wstate.includes("QR") || wstate.includes("SCAN")) ? "qr" : "init";
        const next = { state, info: s, error: "" };
        lastGoodRef.current = next;
        setHealth(next);
      } catch(e) {
        clearTimeout(timer);
        if(dead) return;
        failsRef.current += 1;
        /* Resilience: ride out a single blip on the last-good state; only
           declare offline after 2 consecutive failures (or if we never
           reached the bridge this session). */
        if(failsRef.current >= 2 || !lastGoodRef.current){
          setHealth({ state: "offline", info: lastGoodRef.current?.info || null, error: e.message || "تعذّر الاتصال" });
        }
      }
    };

    check();
    const iv = setInterval(check, intervalMs);
    return () => { dead = true; clearInterval(iv); };
  }, [url, token, intervalMs]);

  return health;
}

const STATE_META = {
  unset:    { icon: "⚪", label: "البريدج غير مضبوط", color: "#94A3B8" },
  checking: { icon: "🟡", label: "بيفحص البريدج…",    color: "#F59E0B" },
  init:     { icon: "🟡", label: "البريدج بيشتغّل…",   color: "#F59E0B" },
  qr:       { icon: "🟠", label: "محتاج مسح QR",       color: "#F97316" },
  ready:    { icon: "🟢", label: "واتساب متصل",        color: "#10B981" },
  offline:  { icon: "🔴", label: "البريدج غير متصل",   color: "#EF4444" },
};

/* Professional compact pill. `compact` (mobile) shows icon + short text only. */
export function BridgeStatusIndicator({ url, token, compact = false, intervalMs }){
  const health = useBridgeHealth(url, token, intervalMs);
  const meta = STATE_META[health.state] || STATE_META.checking;
  const sent = health.info?.daily?.sent;
  const cap = health.info?.settings?.dailyCap;
  const showDaily = health.state === "ready" && sent != null;
  const title = "WhatsApp Bridge: " + meta.label
    + (showDaily ? " · رسائل اليوم: " + sent + (cap ? "/" + cap : "") : "")
    + (health.error ? " — " + health.error : "");
  const shortLabel = compact
    ? (health.state === "ready" ? "واتساب" : health.state === "offline" ? "بريدج" : meta.label)
    : meta.label;
  return <div title={title} style={{
    display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0,
    padding: compact ? "5px 10px" : "6px 12px", borderRadius: 999,
    background: meta.color + "14", border: "1px solid " + meta.color + "40",
    color: meta.color, fontSize: FS - 2, fontWeight: 800, whiteSpace: "nowrap",
    lineHeight: 1,
  }}>
    <span style={{ fontSize: FS - 3 }}>{meta.icon}</span>
    <span>{shortLabel}</span>
    {showDaily && !compact && <span style={{ fontWeight: 600, opacity: 0.75 }}>· {sent}{cap ? "/" + cap : ""}</span>}
  </div>;
}
