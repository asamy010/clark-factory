/* V19.64: Require admin Firebase token + tighter CORS.
   Pre-V19.64: any internet user could hit this endpoint, supply arbitrary
   `odooUrl`, and use the Vercel function as an SSRF proxy. With provided
   credentials they could also write to anyone's Odoo. Now restricted to
   verified admin/manager Firebase users. */
import { verifyAdminToken } from "./_firebase.js";

export default async function handler(req, res) {
  const allowedOrigin = process.env.ODOO_ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  /* V19.64: Auth gate */
  const authHeader = req.headers.authorization || "";
  const bodyToken = (req.body && req.body.adminToken) || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : (bodyToken || "").trim();
  const auth = await verifyAdminToken(token);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const { action, odooUrl, odooDb, odooUser, odooKey, payload } = req.body;
  if (!odooUrl || !odooDb || !odooUser || !odooKey) return res.status(400).json({ error: "Missing Odoo credentials" });

  /* V19.64: Optional URL allowlist. Set ODOO_ALLOWED_HOSTS="example.odoo.com,other.com"
     in Vercel env to restrict which Odoo instances this proxy accepts. If unset,
     all hosts allowed (back-compat). */
  const allowList = (process.env.ODOO_ALLOWED_HOSTS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (allowList.length > 0) {
    let host;
    try { host = new URL(odooUrl).host; } catch (_) { return res.status(400).json({ error: "Invalid odooUrl" }); }
    if (!allowList.includes(host)) {
      return res.status(403).json({ error: "Odoo host not in allowlist: " + host });
    }
  }

  const rpcCall = async (endpoint, method, params) => {
    const paramXml = params.map(p => toXmlValue(p)).join("");
    const xml = '<?xml version="1.0"?><methodCall><methodName>' + method + '</methodName><params>' + paramXml + '</params></methodCall>';
    const r = await fetch(odooUrl.replace(/\/+$/, "") + endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: xml
    });
    const text = await r.text();
    if (!r.ok) throw new Error("Odoo HTTP " + r.status + ": " + text.slice(0, 200));
    const faultMatch = text.match(/<name>faultString<\/name>\s*<value>\s*<string>([^<]*)<\/string>/);
    if (faultMatch) throw new Error("Odoo Fault: " + faultMatch[1].slice(0, 300));
    return parseXmlResponse(text);
  };

  try {
    if (action === "authenticate") {
      const uid = await rpcCall("/xmlrpc/2/common", "authenticate", [odooDb, odooUser, odooKey, {}]);
      if (!uid || uid === false) return res.status(401).json({ error: "Authentication failed" });
      return res.status(200).json({ uid });
    }

    if (action === "search_refs") {
      const uid = await rpcCall("/xmlrpc/2/common", "authenticate", [odooDb, odooUser, odooKey, {}]);
      if (!uid) return res.status(401).json({ error: "Auth failed" });
      const { refs } = payload;
      if (!refs || refs.length === 0) return res.status(200).json({ existing: [] });
      const ids = await rpcCall("/xmlrpc/2/object", "execute_kw", [odooDb, uid, odooKey, "account.move", "search", [[["ref", "in", refs]]], { limit: refs.length * 2 }]);
      if (!ids || ids.length === 0) return res.status(200).json({ existing: [] });
      const records = await rpcCall("/xmlrpc/2/object", "execute_kw", [odooDb, uid, odooKey, "account.move", "read", [ids], { fields: ["ref"] }]);
      const existing = (records || []).map(r => r.ref).filter(Boolean);
      return res.status(200).json({ existing });
    }

    if (action === "find_journal") {
      const uid = await rpcCall("/xmlrpc/2/common", "authenticate", [odooDb, odooUser, odooKey, {}]);
      if (!uid) return res.status(401).json({ error: "Auth failed" });
      const { journalName } = payload;
      const ids = await rpcCall("/xmlrpc/2/object", "execute_kw", [odooDb, uid, odooKey, "account.journal", "search", [[["name", "=", journalName]]], { limit: 1 }]);
      if (!ids || ids.length === 0) return res.status(404).json({ error: "Journal not found: " + journalName });
      return res.status(200).json({ journalId: ids[0] });
    }

    if (action === "find_account") {
      const uid = await rpcCall("/xmlrpc/2/common", "authenticate", [odooDb, odooUser, odooKey, {}]);
      if (!uid) return res.status(401).json({ error: "Auth failed" });
      const { accountCode } = payload;
      let ids = await rpcCall("/xmlrpc/2/object", "execute_kw", [odooDb, uid, odooKey, "account.account", "search", [[["code", "=", accountCode]]], { limit: 1 }]);
      if (!ids || ids.length === 0) {
        ids = await rpcCall("/xmlrpc/2/object", "execute_kw", [odooDb, uid, odooKey, "account.account", "search", [[["code", "=like", accountCode + "%"]]], { limit: 1 }]);
      }
      if (!ids || ids.length === 0) {
        ids = await rpcCall("/xmlrpc/2/object", "execute_kw", [odooDb, uid, odooKey, "account.account", "search", [[["code", "ilike", accountCode]]], { limit: 1 }]);
      }
      if (!ids || ids.length === 0) return res.status(404).json({ error: "Account not found: " + accountCode });
      return res.status(200).json({ accountId: ids[0] });
    }

    if (action === "create_entries") {
      const uid = await rpcCall("/xmlrpc/2/common", "authenticate", [odooDb, odooUser, odooKey, {}]);
      if (!uid) return res.status(401).json({ error: "Auth failed" });
      const { entries } = payload;
      if (!entries || entries.length === 0) return res.status(200).json({ created: 0, ids: [] });
      const createdIds = [];
      const errors = [];
      for (const entry of entries) {
        try {
          const lineVals = entry.lines.map(l => [0, 0, { account_id: l.accountId, debit: l.debit || 0, credit: l.credit || 0, name: l.name || "" }]);
          const ids = await rpcCall("/xmlrpc/2/object", "execute_kw", [odooDb, uid, odooKey, "account.move", "create", [{ ref: entry.ref || "", date: entry.date, journal_id: entry.journalId, narration: entry.narration || "", line_ids: lineVals, move_type: "entry" }], {}]);
          if (ids) {
            const moveId = Array.isArray(ids) ? ids[0] : ids;
            createdIds.push(moveId);
            try { await rpcCall("/xmlrpc/2/object", "execute_kw", [odooDb, uid, odooKey, "account.move", "action_post", [[moveId]], {}]); } catch(e2) {}
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

function escXml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

function toXmlValue(v) {
  if (v === null || v === undefined) return "<param><value><boolean>0</boolean></value></param>";
  if (typeof v === "boolean") return "<param><value><boolean>" + (v ? 1 : 0) + "</boolean></value></param>";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return "<param><value><int>" + v + "</int></value></param>";
    return "<param><value><double>" + v + "</double></value></param>";
  }
  if (typeof v === "string") return "<param><value><string>" + escXml(v) + "</string></value></param>";
  if (Array.isArray(v)) {
    var inner = v.map(function(item) { return "<value>" + toXmlInner(item) + "</value>"; }).join("");
    return "<param><value><array><data>" + inner + "</data></array></value></param>";
  }
  if (typeof v === "object") {
    var members = Object.keys(v).map(function(k) {
      return "<member><name>" + escXml(k) + "</name><value>" + toXmlInner(v[k]) + "</value></member>";
    }).join("");
    return "<param><value><struct>" + members + "</struct></value></param>";
  }
  return "<param><value><string>" + escXml(String(v)) + "</string></value></param>";
}

function toXmlInner(v) {
  if (v === null || v === undefined) return "<boolean>0</boolean>";
  if (typeof v === "boolean") return "<boolean>" + (v ? 1 : 0) + "</boolean>";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return "<int>" + v + "</int>";
    return "<double>" + v + "</double>";
  }
  if (typeof v === "string") return "<string>" + escXml(v) + "</string>";
  if (Array.isArray(v)) {
    var inner = v.map(function(item) { return "<value>" + toXmlInner(item) + "</value>"; }).join("");
    return "<array><data>" + inner + "</data></array>";
  }
  if (typeof v === "object") {
    var members = Object.keys(v).map(function(k) {
      return "<member><name>" + escXml(k) + "</name><value>" + toXmlInner(v[k]) + "</value></member>";
    }).join("");
    return "<struct>" + members + "</struct>";
  }
  return "<string>" + escXml(String(v)) + "</string>";
}

function parseXmlResponse(xml) {
  var valueMatch = xml.match(/<params>\s*<param>\s*<value>([\s\S]*?)<\/value>\s*<\/param>\s*<\/params>/);
  if (!valueMatch) return null;
  return parseValue(valueMatch[1].trim());
}

function parseValue(v) {
  v = (v || "").trim();
  var m;
  /* Compound types FIRST — check structure before scalar regexes. */
  /* This prevents matching nested int/string inside array/struct. */
  if (v.indexOf("<array>") === 0 || v.indexOf("<array ") === 0) {
    var dataMatch = v.match(/<data>([\s\S]*?)<\/data>/);
    if (!dataMatch) return [];
    var values = [];
    /* Depth-tracked value extraction — handles nested struct/array inside array. */
    var inner = dataMatch[1];
    var idx = 0, depth = 0, vstart = -1;
    while (idx < inner.length) {
      if (inner.substr(idx, 7) === "<value>") {
        if (depth === 0) vstart = idx + 7;
        depth++;
        idx += 7;
      } else if (inner.substr(idx, 8) === "</value>") {
        depth--;
        if (depth === 0 && vstart !== -1) {
          values.push(parseValue(inner.substring(vstart, idx)));
          vstart = -1;
        }
        idx += 8;
      } else {
        idx++;
      }
    }
    return values;
  }
  if (v.indexOf("<struct>") === 0 || v.indexOf("<struct ") === 0) {
    var obj = {};
    /* Depth-tracked struct member parser — handles nested struct/array values. */
    var sStart = v.indexOf("<struct>") + 8;
    var sEnd = v.lastIndexOf("</struct>");
    var body = v.substring(sStart, sEnd);
    var i = 0;
    while (i < body.length) {
      var memStart = body.indexOf("<member>", i);
      if (memStart === -1) break;
      var memEnd = body.indexOf("</member>", memStart);
      if (memEnd === -1) break;
      var mem = body.substring(memStart + 8, memEnd);
      var nameMatch = mem.match(/<name>([^<]+)<\/name>/);
      if (!nameMatch) { i = memEnd + 9; continue; }
      var valStart = mem.indexOf("<value>", nameMatch.index + nameMatch[0].length);
      var valEnd = mem.lastIndexOf("</value>");
      if (valStart !== -1 && valEnd > valStart) {
        obj[nameMatch[1]] = parseValue(mem.substring(valStart + 7, valEnd));
      }
      i = memEnd + 9;
    }
    return obj;
  }
  if (v.indexOf("<nil") === 0 || v === "<nil/>") return null;
  /* Scalar types — safe now because compound types are already handled above. */
  m = v.match(/^<(?:int|i4)>(-?\d+)<\/(?:int|i4)>$/);
  if (m) return parseInt(m[1]);
  m = v.match(/^<double>(-?[0-9.eE+\-]+)<\/double>$/);
  if (m) return parseFloat(m[1]);
  m = v.match(/^<boolean>([01])<\/boolean>$/);
  if (m) return m[1] === "1";
  m = v.match(/^<string>([\s\S]*)<\/string>$/);
  if (m) return m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  /* Bare value (no wrapping element) — XML-RPC allows this for strings. */
  if (/^-?\d+$/.test(v)) return parseInt(v);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  return v || null;
}
