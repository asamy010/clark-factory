export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { action, odooUrl, odooDb, odooUser, odooKey, payload } = req.body;
  if (!odooUrl || !odooDb || !odooUser || !odooKey) return res.status(400).json({ error: "Missing Odoo credentials" });

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
  var m;
  m = v.match(/<(?:int|i4)>(-?\d+)<\/(?:int|i4)>/);
  if (m) return parseInt(m[1]);
  m = v.match(/<double>([^<]+)<\/double>/);
  if (m) return parseFloat(m[1]);
  m = v.match(/<boolean>([01])<\/boolean>/);
  if (m) return m[1] === "1";
  m = v.match(/<string>([^<]*)<\/string>/);
  if (m) return m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  if (v.includes("<nil") || v.includes("<boolean>0</boolean>")) return false;
  if (v.includes("<array>")) {
    var dataMatch = v.match(/<data>([\s\S]*?)<\/data>/);
    if (!dataMatch) return [];
    var values = [];
    var re = /<value>([\s\S]*?)<\/value>/g;
    var vm;
    while ((vm = re.exec(dataMatch[1])) !== null) values.push(parseValue(vm[1].trim()));
    return values;
  }
  if (v.includes("<struct>")) {
    var obj = {};
    var re2 = /<member>\s*<name>([^<]+)<\/name>\s*<value>([\s\S]*?)<\/value>\s*<\/member>/g;
    var sm;
    while ((sm = re2.exec(v)) !== null) obj[sm[1]] = parseValue(sm[2].trim());
    return obj;
  }
  var bare = v.trim();
  if (/^-?\d+$/.test(bare)) return parseInt(bare);
  return bare || null;
}
