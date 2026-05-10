/* ═══════════════════════════════════════════════════════════════
   CLARK — Shopify partitioned-collection helpers (V21.9.2)
   ───────────────────────────────────────────────────────────────
   Wraps the read/write pattern for shopifyProducts and shopifyCustomers
   after the V21.9.2 migration.

   Pre-migration: data lives in factory/config.shopifyProducts (array)
   Post-migration: data lives in shopifyProductsDocs/{id} (per-doc)

   These helpers transparently handle BOTH states by checking the
   _partitionedV2192Done flag on factory/config. After migration, all
   reads/writes go to the new collections automatically.
   ═══════════════════════════════════════════════════════════════ */

import { getDb } from "../_firebase.js";

export const FLAG_V2192 = "_partitionedV2192Done";
export const PRODUCTS_COL = "shopifyProductsDocs";
export const CUSTOMERS_COL = "shopifyCustomersDocs";

/* Check if the migration has been applied. Returns boolean. */
export async function isPartitionedV2192(cfg){
  if(cfg && typeof cfg === "object") return !!cfg[FLAG_V2192];
  /* Fallback: read config doc */
  try {
    const db = getDb();
    const snap = await db.collection("factory").doc("config").get();
    return !!(snap.exists && snap.data() && snap.data()[FLAG_V2192]);
  } catch(_) { return false; }
}

/* Read all shopifyProducts. Pre-migration: from cfg.shopifyProducts array.
   Post-migration: from shopifyProductsDocs collection. */
export async function readAllShopifyProducts(cfg){
  if(!cfg || !cfg[FLAG_V2192]){
    return Array.isArray(cfg?.shopifyProducts) ? cfg.shopifyProducts : [];
  }
  const db = getDb();
  const snap = await db.collection(PRODUCTS_COL).get();
  const arr = [];
  snap.forEach(d => {
    const data = d.data();
    if(data) arr.push(data);
  });
  return arr;
}

/* Read all shopifyCustomers. */
export async function readAllShopifyCustomers(cfg){
  if(!cfg || !cfg[FLAG_V2192]){
    return Array.isArray(cfg?.shopifyCustomers) ? cfg.shopifyCustomers : [];
  }
  const db = getDb();
  const snap = await db.collection(CUSTOMERS_COL).get();
  const arr = [];
  snap.forEach(d => {
    const data = d.data();
    if(data) arr.push(data);
  });
  return arr;
}

/* Write a single product. Updates per-doc post-migration, or in-array pre. */
export async function writeShopifyProduct(cfg, product, opts){
  const db = getDb();
  if(cfg && cfg[FLAG_V2192]){
    const id = product.id || product.shopify_id;
    if(!id) throw new Error("product missing id");
    const safeId = String(id).replace(/\//g, "_");
    /* V21.9.9: enforce top-level `id` field — see writeManyShopifyProducts */
    const docToWrite = { ...product, id: safeId };
    await db.collection(PRODUCTS_COL).doc(safeId).set(docToWrite, { merge: !!opts?.merge });
    return;
  }
  /* Pre-migration: update array inside transaction */
  const cfgRef = db.collection("factory").doc("config");
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(cfgRef);
    const c = snap.exists ? (snap.data() || {}) : {};
    const arr = Array.isArray(c.shopifyProducts) ? c.shopifyProducts.slice() : [];
    const id = String(product.id || product.shopify_id);
    const idx = arr.findIndex(p => String(p.id || p.shopify_id) === id);
    if(idx >= 0) arr[idx] = opts?.merge ? { ...arr[idx], ...product } : product;
    else arr.push(product);
    tx.set(cfgRef, { shopifyProducts: arr }, { merge: true });
  });
}

/* Write a single customer. */
export async function writeShopifyCustomer(cfg, customer, opts){
  const db = getDb();
  if(cfg && cfg[FLAG_V2192]){
    const id = customer.id || customer.shopify_customer_id;
    if(!id) throw new Error("customer missing id");
    const safeId = String(id).replace(/\//g, "_");
    /* V21.9.9: enforce top-level `id` field for client listener compatibility */
    const docToWrite = { ...customer, id: safeId };
    await db.collection(CUSTOMERS_COL).doc(safeId).set(docToWrite, { merge: !!opts?.merge });
    return;
  }
  /* Pre-migration: update array inside transaction */
  const cfgRef = db.collection("factory").doc("config");
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(cfgRef);
    const c = snap.exists ? (snap.data() || {}) : {};
    const arr = Array.isArray(c.shopifyCustomers) ? c.shopifyCustomers.slice() : [];
    const id = String(customer.id || customer.shopify_customer_id);
    const idx = arr.findIndex(p => String(p.id || p.shopify_customer_id) === id);
    if(idx >= 0) arr[idx] = opts?.merge ? { ...arr[idx], ...customer } : customer;
    else arr.push(customer);
    tx.set(cfgRef, { shopifyCustomers: arr }, { merge: true });
  });
}

/* Bulk-write many products. Writes per-doc post-migration, single tx pre.
   Returns count written.
   V21.9.9 CRITICAL FIX: ensure each doc has a top-level `id` field equal to
   shopify_id. The client-side partitioned listener (App.jsx ~3286) only
   stores docs that have `data.id` — without this, products would be invisible
   in the UI even though they were stored correctly in Firestore. */
export async function writeManyShopifyProducts(cfg, products){
  const db = getDb();
  if(cfg && cfg[FLAG_V2192]){
    let count = 0;
    const BATCH = 400;
    for(let i = 0; i < products.length; i += BATCH){
      const batch = db.batch();
      for(const p of products.slice(i, i + BATCH)){
        const id = p.id || p.shopify_id;
        if(!id) continue;
        const safeId = String(id).replace(/\//g, "_");
        /* V21.9.9: enforce id field for client-side listener compatibility */
        const docToWrite = { ...p, id: safeId };
        batch.set(db.collection(PRODUCTS_COL).doc(safeId), docToWrite);
        count++;
      }
      await batch.commit();
    }
    return count;
  }
  /* Pre-migration: replace array */
  const cfgRef = db.collection("factory").doc("config");
  await cfgRef.set({ shopifyProducts: products }, { merge: true });
  return products.length;
}

/* Bulk-write many customers.
   V21.9.9: enforce top-level `id` field for listener compatibility. */
export async function writeManyShopifyCustomers(cfg, customers){
  const db = getDb();
  if(cfg && cfg[FLAG_V2192]){
    let count = 0;
    const BATCH = 400;
    for(let i = 0; i < customers.length; i += BATCH){
      const batch = db.batch();
      for(const c of customers.slice(i, i + BATCH)){
        const id = c.id || c.shopify_customer_id;
        if(!id) continue;
        const safeId = String(id).replace(/\//g, "_");
        const docToWrite = { ...c, id: safeId };
        batch.set(db.collection(CUSTOMERS_COL).doc(safeId), docToWrite);
        count++;
      }
      await batch.commit();
    }
    return count;
  }
  const cfgRef = db.collection("factory").doc("config");
  await cfgRef.set({ shopifyCustomers: customers }, { merge: true });
  return customers.length;
}

/* Delete a single product (rare but needed for cleanup). */
export async function deleteShopifyProduct(cfg, productId){
  const db = getDb();
  if(cfg && cfg[FLAG_V2192]){
    await db.collection(PRODUCTS_COL).doc(String(productId).replace(/\//g, "_")).delete();
    return;
  }
  /* Pre-migration */
  const cfgRef = db.collection("factory").doc("config");
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(cfgRef);
    const c = snap.exists ? (snap.data() || {}) : {};
    const arr = (Array.isArray(c.shopifyProducts) ? c.shopifyProducts : [])
      .filter(p => String(p.id || p.shopify_id) !== String(productId));
    tx.set(cfgRef, { shopifyProducts: arr }, { merge: true });
  });
}
