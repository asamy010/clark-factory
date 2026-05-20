/* V16.31: Item Categories System
   ───────────────────────────────
   Unified abstraction over the existing fabric/accessory data buckets PLUS
   any user-defined categories (e.g. "قطع غيار"). The two legacy buckets are
   exposed as virtual core categories so the UI doesn't have to special-case
   them; their data still lives in data.fabrics[] and data.accessories[] for
   backward compatibility with the order form, fabric pricing, etc.

   Data shape:
     data.itemCategories = [
       { id, name, emoji, types:[string], isCore?, legacy?:"fabric"|"accessory" }
     ]
     data.inventoryItems = [   // for non-legacy categories only
       { id, categoryId, name, type, unit, stock, minStock, avgCost,
         defaultSupplierId, notes, createdAt, createdBy }
     ]
*/

import { gid } from "./format.js";

/* ────────── Defaults ────────── */
const CORE_CATEGORIES_SEED=[
  {id:"core_fabric",   name:"قماش",     emoji:"🧵", types:["قطن","تريكو","بوليستر","شيفون","جينز"], isCore:true, legacy:"fabric"},
  {id:"core_accessory",name:"اكسسوار",  emoji:"🪡", types:["زرار","سحاب","شريط","لاستيك","خيط"],   isCore:true, legacy:"accessory"}
];

/* ────────── Migration / Initialization ────────── */
/* Idempotent — call from a useEffect or on data load. Mutates `d` if needed.
   Returns true when something was actually added so the caller can skip
   firebase write when nothing changed. */
export function ensureCategoriesInit(d){
  let changed=false;
  if(!Array.isArray(d.itemCategories)||d.itemCategories.length===0){
    d.itemCategories=JSON.parse(JSON.stringify(CORE_CATEGORIES_SEED));
    changed=true;
  }else{
    /* Make sure the two core categories exist even if someone deleted them */
    CORE_CATEGORIES_SEED.forEach(seed=>{
      if(!d.itemCategories.some(c=>c.legacy===seed.legacy)){
        d.itemCategories.unshift(JSON.parse(JSON.stringify(seed)));
        changed=true;
      }
    });
  }
  if(!Array.isArray(d.inventoryItems)){d.inventoryItems=[];changed=true}
  return changed;
}

/* ────────── Read helpers ────────── */
export function getCategories(data){return Array.isArray(data?.itemCategories)?data.itemCategories:[]}

export function getCategoryById(data,id){return getCategories(data).find(c=>c.id===id)||null}

/* Returns items for a category, transparently mapping the two legacy
   categories to data.fabrics / data.accessories.
   Each returned item has the standard shape:
     {id, name, type, unit, stock, minStock, price, avgCost, _legacy:"fabric"|"accessory"|undefined}
*/
export function getItemsForCategory(data,categoryId){
  const cat=getCategoryById(data,categoryId);
  if(!cat)return[];
  if(cat.legacy==="fabric"){
    return(data.fabrics||[]).map(f=>({
      id:f.id,name:f.name,type:f.type||"",unit:f.unit||"",
      stock:Number(f.stock)||0,minStock:Number(f.minStock)||0,
      price:Number(f.price)||0,avgCost:Number(f.avgCost)||Number(f.price)||0,
      defaultSupplierId:f.defaultSupplierId||"",
      _legacy:"fabric",_orig:f
    }));
  }
  if(cat.legacy==="accessory"){
    return(data.accessories||[]).map(a=>({
      id:a.id,name:a.name,type:a.type||"",unit:a.unit||"",
      stock:Number(a.stock)||0,minStock:Number(a.minStock)||0,
      price:Number(a.price)||0,avgCost:Number(a.avgCost)||Number(a.price)||0,
      defaultSupplierId:a.defaultSupplierId||"",
      _legacy:"accessory",_orig:a
    }));
  }
  return(data.inventoryItems||[]).filter(i=>i.categoryId===categoryId).map(i=>({
    id:i.id,name:i.name,type:i.type||"",unit:i.unit||"",
    stock:Number(i.stock)||0,minStock:Number(i.minStock)||0,
    price:Number(i.avgCost)||0,avgCost:Number(i.avgCost)||0,
    defaultSupplierId:i.defaultSupplierId||"",
    _legacy:undefined,_orig:i
  }));
}

/* All items across all categories — for global search / receipt item picker */
export function getAllItemsFlat(data){
  const out=[];
  getCategories(data).forEach(cat=>{
    getItemsForCategory(data,cat.id).forEach(it=>{
      out.push({...it,categoryId:cat.id,categoryName:cat.name,categoryEmoji:cat.emoji||""});
    });
  });
  return out;
}

/* ────────── Mutation helpers ────────── */
/* Returns the new id; caller wraps in upConfig */
export function addCategory(d,{name,emoji}){
  if(!Array.isArray(d.itemCategories))d.itemCategories=[];
  const id=gid();
  d.itemCategories.push({id,name:String(name||"").trim(),emoji:emoji||"📦",types:[],isCore:false});
  return id;
}

export function updateCategory(d,id,patch){
  const cat=(d.itemCategories||[]).find(c=>c.id===id);
  if(!cat)return false;
  if(patch.name!=null)cat.name=String(patch.name).trim();
  if(patch.emoji!=null)cat.emoji=patch.emoji;
  return true;
}

export function deleteCategory(d,id){
  const cat=(d.itemCategories||[]).find(c=>c.id===id);
  if(!cat||cat.isCore)return false;/* can't delete core categories */
  /* Refuse if items still exist under this category */
  const itemsLeft=(d.inventoryItems||[]).some(i=>i.categoryId===id);
  if(itemsLeft)return false;
  d.itemCategories=(d.itemCategories||[]).filter(c=>c.id!==id);
  return true;
}

export function addTypeToCategory(d,categoryId,typeName){
  const cat=(d.itemCategories||[]).find(c=>c.id===categoryId);
  if(!cat)return false;
  const t=String(typeName||"").trim();
  if(!t)return false;
  if(!Array.isArray(cat.types))cat.types=[];
  if(cat.types.includes(t))return false;/* duplicate */
  cat.types.push(t);
  return true;
}

export function removeTypeFromCategory(d,categoryId,typeName){
  const cat=(d.itemCategories||[]).find(c=>c.id===categoryId);
  if(!cat||!Array.isArray(cat.types))return false;
  cat.types=cat.types.filter(t=>t!==typeName);
  return true;
}

/* ────────── Item CRUD (non-legacy only) ────────── */
export function addInventoryItem(d,categoryId,patch,userName){
  if(!Array.isArray(d.inventoryItems))d.inventoryItems=[];
  const id=gid();
  d.inventoryItems.push({
    id,categoryId,
    name:String(patch.name||"").trim(),
    type:patch.type||"",
    unit:patch.unit||"قطعة",
    stock:Number(patch.stock)||0,
    minStock:Number(patch.minStock)||0,
    avgCost:Number(patch.avgCost)||0,
    defaultSupplierId:patch.defaultSupplierId||"",
    notes:patch.notes||"",
    /* V21.9.107: tags array (universal tagging Slice 6). Defaults empty. */
    tags:Array.isArray(patch.tags)?patch.tags.slice():[],
    createdAt:new Date().toISOString(),
    createdBy:userName||""
  });
  return id;
}

export function updateInventoryItem(d,itemId,patch){
  const it=(d.inventoryItems||[]).find(x=>x.id===itemId);
  if(!it)return false;
  ["name","type","unit","minStock","avgCost","defaultSupplierId","notes"].forEach(k=>{
    if(patch[k]!=null)it[k]=k==="minStock"||k==="avgCost"?(Number(patch[k])||0):patch[k];
  });
  /* V21.9.107: tags handled separately because it's an array (not a scalar). */
  if(Array.isArray(patch.tags))it.tags=patch.tags.slice();
  return true;
}

export function deleteInventoryItem(d,itemId){
  d.inventoryItems=(d.inventoryItems||[]).filter(i=>i.id!==itemId);
  return true;
}

/* ────────── Stock movement integration ────────── */
/* Used by receipts to apply stock changes uniformly across legacy + new */
export function applyStockDelta(d,categoryId,itemId,delta,unitCost){
  const cat=getCategoryById(d,categoryId);
  if(!cat)return false;
  if(cat.legacy==="fabric"){
    const f=(d.fabrics||[]).find(x=>x.id===itemId);
    if(!f)return false;
    const oldStock=Number(f.stock)||0;
    const oldAvg=Number(f.avgCost)||Number(f.price)||0;
    const newStock=oldStock+delta;
    if(delta>0&&unitCost!=null){
      /* Weighted-average cost on inflow */
      const totalOldVal=oldStock*oldAvg;
      const newVal=delta*Number(unitCost);
      f.avgCost=newStock>0?(totalOldVal+newVal)/newStock:Number(unitCost);
    } else if(delta<0 && newStock<=0){
      /* V21.9.92 (Stock audit Bug #6): when reversal empties stock, reset
         avgCost to 0 — otherwise a stale avgCost lingers and biases the
         next receipt's weighted average. Partial reversals leave avgCost
         unchanged (mathematically correct: removing some units doesn't
         change the per-unit value of the remaining). */
      f.avgCost=0;
    }
    f.stock=newStock;
    return true;
  }
  if(cat.legacy==="accessory"){
    const a=(d.accessories||[]).find(x=>x.id===itemId);
    if(!a)return false;
    const oldStock=Number(a.stock)||0;
    const oldAvg=Number(a.avgCost)||Number(a.price)||0;
    const newStock=oldStock+delta;
    if(delta>0&&unitCost!=null){
      const totalOldVal=oldStock*oldAvg;
      const newVal=delta*Number(unitCost);
      a.avgCost=newStock>0?(totalOldVal+newVal)/newStock:Number(unitCost);
    } else if(delta<0 && newStock<=0){
      /* V21.9.92 (Stock audit Bug #6): same reset on empty reversal. */
      a.avgCost=0;
    }
    a.stock=newStock;
    return true;
  }
  const it=(d.inventoryItems||[]).find(x=>x.id===itemId);
  if(!it)return false;
  const oldStock=Number(it.stock)||0;
  const oldAvg=Number(it.avgCost)||0;
  const newStock=oldStock+delta;
  if(delta>0&&unitCost!=null){
    const totalOldVal=oldStock*oldAvg;
    const newVal=delta*Number(unitCost);
    it.avgCost=newStock>0?(totalOldVal+newVal)/newStock:Number(unitCost);
  }
  it.stock=newStock;
  return true;
}
