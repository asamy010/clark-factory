/*
  Odoo XML-RPC Sync Proxy for CLARK
  Handles: authenticate, search, create journal entries
  Odoo XML-RPC endpoints:
    /xmlrpc/2/common  — authenticate
    /xmlrpc/2/object  — execute_kw (CRUD)
*/

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { action, odooUrl, odooDb, odooUser, odooKey, payload } = req.body;
  if (!odooUrl || !odooDb || !odooUser || !odooKey) return res.status(400).json({ error: "Missing Odoo credentials" });

  const rpcCall = async (endpoint, method, params) => {
    /* Build XML-RPC request body */
    const paramXml = params.map(p => toXmlValue(p)).join("");
    const xml = `<?xml version="1.0"?><methodCall><methodName>${method}</methodName><params>${paramXml}</params></methodCall>`;
    const r = await fetch(odooUrl.replace(/\/+$/, "") + endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: xml
    });
    const text = await r.text();
    if (!r.ok) throw new Error("Odoo HTTP " + r.status + ": " + text.slice(0, 200));
    /* Check for fault */
    const faultMatch = text.match(/<name>faultString<\/name>\s*<value>\s*<string>([^<]*)<\/string>/);
    if (faultMatch) throw new Error("Odoo Fault: " + faultMatch[1].slice(0, 300));
    return parseXmlResponse(text);
  };

  try {
    /* ── AUTHENTICATE ── */
    if (action === "authenticate") {
      const uid = await rpcCall("/xmlrpc/2/common", "authenticate", [odooDb, odooUser, odooKey, {}]);
      if (!uid || uid === false) return res.status(401).json({ error: "Authentication failed — check credentials" });
      return res.status(200).json({ uid });
    }

    /* ── SEARCH for existing refs (prevent duplicates) ── */
    if (action === "search_refs") {
      const uid = await rpcCall("/xmlrpc/2/common", "authenticate", [odooDb, odooUser, odooKey, {}]);
      if (!uid) return res.status(401).json({ error: "Auth failed" });
      const { refs } = payload;
      if (!refs || refs.length === 0) return res.status(200).json({ existing: [] });
      const ids = await rpcCall("/xmlrpc/2/object", "execute_kw", [
        odooDb, uid, odooKey, "account.move", "search",
        [[["ref", "in", refs]]],
        { limit: refs.length * 2 }
      ]);
      /* Read the refs of found records */
      if (!ids || ids.length === 0) return res.status(200).json({ existing: [] });
      const records = await rpcCall("/xmlrpc/2/object", "execute_kw", [
        odooDb, uid, odooKey, "account.move", "read",
        [ids],
        { fields: ["ref"] }
      ]);
      const existing = (records || []).map(r => r.ref).filter(Boolean);
      return res.status(200).json({ existing });
    }

    /* ── FIND journal & accounts by name/code ── */
    if (action === "find_journal") {
      const uid = await rpcCall("/xmlrpc/2/common", "authenticate", [odooDb, odooUser, odooKey, {}]);
      if (!uid) return res.status(401).json({ error: "Auth failed" });
      const { journalName } = payload;
      const ids = await rpcCall("/xmlrpc/2/object", "execute_kw", [
        odooDb, uid, odooKey, "account.journal", "search",
        [[["name", "=", journalName]]],
        { limit: 1 }
      ]);
      if (!ids || ids.length === 0) return res.status(404).json({ error: "Journal '" + journalName + "' not found" });
      return res.status(200).json({ journalId: ids[0] });
    }

    if (action === "find_account") {
      const uid = await rpcCall("/xmlrpc/2/common", "authenticate", [odooDb, odooUser, odooKey, {}]);
      if (!uid) return res.status(401).json({ error: "Auth failed" });
      const { accountCode } = payload;
      const ids = await rpcCall("/xmlrpc/2/object", "execute_kw", [
        odooDb, uid, odooKey, "account.account", "search",
        [[["code", "=", accountCode]]],
        { limit: 1 }
      ]);
      if (!ids || ids.length === 0) return res.status(404).json({ error: "Account '" + accountCode + "' not found" });
      return res.status(200).json({ accountId: ids[0] });
    }

    /* ── CREATE journal entries (batch) ── */
    if (action === "create_entries") {
      const uid = await rpcCall("/xmlrpc/2/common", "authenticate", [odooDb, odooUser, odooKey, {}]);
      if (!uid) return res.status(401).json({ error: "Auth failed" });
      const { entries } = payload; /* Array of {ref, date, journalId, narration, lines: [{accountId, debit, credit, name}]} */
      if (!entries || entries.length === 0) return res.status(200).json({ created: 0, ids: [] });
      const createdIds = [];
      const errors = [];
      for (const entry of entries) {
        try {
          const lineVals = entry.lines.map(l => [0, 0, {
            account_id: l.accountId,
            debit: l.debit || 0,
            credit: l.credit || 0,
            name: l.name || entry.narration || ""
          }]);
          const ids = await rpcCall("/xmlrpc/2/object", "execute_kw", [
            odooDb, uid, odooKey, "account.move", "create",
            [{ ref: entry.ref || "", date: entry.date, journal_id: entry.journalId, narration: entry.narration || "", line_ids: lineVals, move_type: "entry" }],
            {}
          ]);
          if (ids) {
            const moveId = Array.isArray(ids) ? ids[0] : ids;
            createdIds.push(moveId);
            /* Auto-post (confirm) the entry */
            try { await rpcCall("/xmlrpc/2/object", "execute_kw", [odooDb, uid, odooKey, "account.move", "action_post", [[moveId]], {}]); } catch(e2) { /* ignore post errors — entry still created as draft */ }
          }
        } catch (e) {
          errors.push({ ref: entry.ref, error: e.message.slice(0, 200) });
        }
      }
      return res.status(200).json({ created: createdIds.length, ids: createdIds, errors });
    }

    return res.status(400).json({ error: "Unknown action: " + action });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

/* ── XML-RPC Helpers ── */
function toXmlValue(v) {
  if (v === null || v === undefined) return "<param><value><boolean>0</boolean></value></param>";
  if (typeof v === "boolean") return `<param><value><boolean>${v ? 1 : 0}</boolean></value></param>`;
  if (typeof v === "number") {
    if (Number.isInteger(v)) return `<param><value><int>${v}</int></value></param>`;
    return `<param><value><double>${v}</double></value></param>`;
  }
  if (typeof v === "string") return `<param><value><string>${escXml(v)}</string></value></param>`;
  if (Array.isArray(v)) {
    /* Check if it's an array of arrays (domain) or array of values */
    const inner = v.map(item => `<value>${toXmlValueInner(item)}</value>`).join("");
    return `<param><value><array><data>${inner}</data></array></value></param>`;
  }
  if (typeof v === "object") {
    const members = Object.entries(v).map(([k, val]) =>
      `<member><name>${escXml(k)}</name><value>${toXmlValueInner(val)}</value></member>`
    ).join("");
    return `<param><value><struct>${members}</struct></value></param>`;
  }
  return `<param><value><string>${escXml(String(v))}</string></value></param>`;
}

function toXmlValueInner(v) {
  if (v === null || v === undefined) return "<boolean>0</boolean>";
  if (typeof v === "boolean") return `<boolean>${v ? 1 : 0}</boolean>`;
  if (typeof v === "number") {
    if (Number.isInteger(v)) return `<int>${v}</int>`;
    return `<double>${v}</double>`;
  }
  if (typeof v === "string") return `<string>${escXml(v)}</string>`;
  if (Array.isArray(v)) {
    /* Handle tuple-like arrays [0,0,{...}] for Odoo line_ids */
    const inner = v.map(item => `<value>${toXmlValueInner(item)}</value>`).join("");
    return `<array><data>${inner}</data></array>`;
  }
  if (typeof v === "object") {
    const members = Object.entries(v).map(([k, val]) =>
      `<member><name>${escXml(k)}</name><value>${toXmlValueInner(val)}</value></member>`
    ).join("");
    return `<struct>${members}</struct>`;
  }
  return `<string>${escXml(String(v))}</string>`;
}

function escXml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

function parseXmlResponse(xml) {
  /* Simple XML-RPC response parser */
  /* Check for single value response (authenticate returns int/boolean) */
  const valueMatch = xml.match(/<params>\s*<param>\s*<value>([\s\S]*?)<\/value>\s*<\/param>\s*<\/params>/);
  if (!valueMatch) return null;
  return parseValue(valueMatch[1].trim());
}

function parseValue(v) {
  /* int/i4 */
  let m = v.match(/<(?:int|i4)>(-?\d+)<\/(?:int|i4)>/);
  if (m) return parseInt(m[1]);
  /* double */
  m = v.match(/<double>([^<]+)<\/double>/);
  if (m) return parseFloat(m[1]);
  /* boolean */
  m = v.match(/<boolean>([01])<\/boolean>/);
  if (m) return m[1] === "1";
  /* string */
  m = v.match(/<string>([^<]*)<\/string>/);
  if (m) return m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  /* nil / false */
  if (v.includes("<nil") || v.includes("<boolean>0</boolean>")) return false;
  /* array */
  if (v.includes("<array>")) {
    const dataMatch = v.match(/<data>([\s\S]*?)<\/data>/);
    if (!dataMatch) return [];
    const values = [];
    const re = /<value>([\s\S]*?)<\/value>/g;
    let vm;
    while ((vm = re.exec(dataMatch[1])) !== null) {
      values.push(parseValue(vm[1].trim()));
    }
    return values;
  }
  /* struct */
  if (v.includes("<struct>")) {
    const obj = {};
    const re = /<member>\s*<name>([^<]+)<\/name>\s*<value>([\s\S]*?)<\/value>\s*<\/member>/g;
    let sm;
    while ((sm = re.exec(v)) !== null) {
      obj[sm[1]] = parseValue(sm[2].trim());
    }
    return obj;
  }
  /* If just bare text, try parsing as int */
  const bare = v.trim();
  if (/^-?\d+$/.test(bare)) return parseInt(bare);
  return bare || null;
}
