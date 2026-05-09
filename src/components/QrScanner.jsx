/* ════════════════════════════════════════════════════════════════════════
   CLARK · QrScanner — V19.81.0
   ──────────────────────────────────────────────────────────────────────
   Thin wrapper around html5-qrcode that exposes a single `<QrScanner/>`
   component:
     <QrScanner onScan={text => ...} onError={msg => ...} active={true}/>

   Why a wrapper:
     - html5-qrcode mounts a <video> + canvas internally and needs explicit
       start()/stop() — wrapping in React's lifecycle keeps callers from
       having to worry about cleanup or duplicate-start crashes.
     - We dedup consecutive identical scans within a 1.5s window so a
       camera that holds frame on a QR doesn't fire onScan five times.
     - Camera permission errors get surfaced via onError (instead of
       silently failing inside the library).

   Caller contract:
     - active === false → camera off + DOM cleared (idle)
     - active === true  → camera live; onScan fires for each unique decode
     - The scanner picks the rear camera on mobile (facingMode:"environment")
       and falls back to whatever's available on desktop.
   ════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from "react";

export function QrScanner({ onScan, onError, active = true, height = 280 }) {
  const containerRef = useRef(null);
  const scannerRef = useRef(null);
  const lastScanRef = useRef({ text: "", at: 0 });
  const [status, setStatus] = useState("starting"); /* starting | running | stopped | error */
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    /* Don't start until the host element exists and the caller wants us active. */
    if (!active || !containerRef.current) {
      stopIfRunning();
      setStatus("stopped");
      return;
    }
    setStatus("starting");
    setErrMsg("");

    /* Lazy-import keeps the 100KB library out of the main chunk. */
    import("html5-qrcode").then(mod => {
      if (cancelled) return;
      const { Html5Qrcode } = mod;
      /* Container needs a stable id for html5-qrcode to attach <video> to. */
      const elId = "qr-scanner-" + Math.random().toString(36).slice(2, 9);
      if (containerRef.current) containerRef.current.id = elId;
      const scanner = new Html5Qrcode(elId, /*verbose*/ false);
      scannerRef.current = scanner;

      scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 220, height: 220 },
          aspectRatio: 1.333,
        },
        decodedText => {
          /* Dedup: ignore same text within 1.5s window */
          const now = Date.now();
          if (lastScanRef.current.text === decodedText && now - lastScanRef.current.at < 1500) return;
          lastScanRef.current = { text: decodedText, at: now };
          if (typeof onScan === "function") onScan(decodedText);
        },
        _decodeErr => { /* per-frame decode failures are normal — ignore */ }
      ).then(() => {
        if (!cancelled) setStatus("running");
      }).catch(err => {
        const msg = err?.message || String(err) || "تعذر فتح الكاميرا";
        if (!cancelled) {
          setErrMsg(msg);
          setStatus("error");
          if (typeof onError === "function") onError(msg);
        }
      });
    }).catch(err => {
      const msg = "تعذر تحميل مكتبة الـ QR: " + (err?.message || err);
      if (!cancelled) {
        setErrMsg(msg);
        setStatus("error");
        if (typeof onError === "function") onError(msg);
      }
    });

    return () => {
      cancelled = true;
      stopIfRunning();
    };

    function stopIfRunning() {
      const s = scannerRef.current;
      if (s && s.isScanning) {
        s.stop().then(() => {
          try { s.clear(); } catch (_) { /* noop */ }
        }).catch(() => { /* noop — already stopped */ });
      }
      scannerRef.current = null;
    }
  }, [active]);

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          minHeight: height,
          background: "#000",
          borderRadius: 12,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      />
      {status === "starting" && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#FFF", fontSize: 14, fontWeight: 700, pointerEvents: "none",
        }}>
          🎥 جاري فتح الكاميرا...
        </div>
      )}
      {status === "error" && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          color: "#FCA5A5", fontSize: 13, fontWeight: 600, padding: 16, textAlign: "center",
          background: "rgba(0,0,0,0.85)", borderRadius: 12,
        }}>
          ⚠️ {errMsg || "تعذر فتح الكاميرا"}
          <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6 }}>
            تأكد من السماح بالكاميرا في المتصفح، وإن الموقع HTTPS.
          </div>
        </div>
      )}
    </div>
  );
}
