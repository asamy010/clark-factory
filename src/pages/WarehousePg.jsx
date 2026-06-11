/* ═══════════════════════════════════════════════════════════════
   CLARK - WarehousePg.jsx
   
   Extracted from App.jsx in V15.1 phase 3.
   Contains: WarehousePg
   ═══════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useState } from "react";
import { Btn, Card, Inp, Sel, useDebounced } from "../components/ui.jsx";
import { FS, PRINT_CSS } from "../constants/index.js";
import { T, TD, TH } from "../theme.js";
import { fmt, gid, r2 } from "../utils/format.js";
import { calcOrder, getConfirmedStock } from "../utils/orders.js";
import { ask, askInput, showToast, tell, denyAction } from "../utils/popups.js";
import { loadQR } from "../utils/qr.js";
import { openPrintWindow } from "../utils/print.js";
import { countUnitUsage, DEFAULT_UNITS, getUnits, hasDualUnit, baseToSecondary } from "../utils/units.js";
import { formatBlockerMessage, canForceDelete, summarizeForceDelete, forceDeleteCleanup } from "../utils/dataIntegrity.js";

export function WarehousePg({data,upConfig,updOrder,isMob,isTab,canEdit,statusCards,user,userRole}){
  const userName=user?.displayName||(user?.email||"").split("@")[0];
  const today=new Date().toISOString().split("T")[0];
  const[subTab,setSubTab]=useState("overview");
  /* Fabric/Accessory filters */
  const[fabFilter,setFabFilter]=useState("");const fabFilterDeb=useDebounced(fabFilter,200);
  const[accFilter,setAccFilter]=useState("");const accFilterDeb=useDebounced(accFilter,200);
  const[hideZero,setHideZero]=useState(false);
  const[sortBy,setSortBy]=useState("name");
  /* General products */
  const[prodFilter,setProdFilter]=useState("");const prodFilterDeb=useDebounced(prodFilter,200);
  const[prodCategoryF,setProdCategoryF]=useState("");
  const[showProdForm,setShowProdForm]=useState(false);
  const[prodForm,setProdForm]=useState(null);/* {id?, name, category, unit, price, minStock, notes} */
  /* V16.77: Fabric/Accessory add+edit forms (moved from DBPg) */
  const[fabForm,setFabForm]=useState(null);/* {name,unit,price,_eid} */
  const[accForm,setAccForm]=useState(null);/* {name,unit,price,_eid} */
  const[showMoveForm,setShowMoveForm]=useState(false);
  const[moveForm,setMoveForm]=useState(null);/* {itemType, itemId, itemName, unit, type:in|out|adjust, qty, price, date, notes} */
  /* Movements filters */
  const[movType,setMovType]=useState("");
  const[movCategory,setMovCategory]=useState("");/* fabric|accessory|general|finished */
  const[movDateFrom,setMovDateFrom]=useState("");
  const[movDateTo,setMovDateTo]=useState("");
  const[movSearch,setMovSearch]=useState("");const movSearchDeb=useDebounced(movSearch,200);
  /* Product details popup (from QR scan) */
  const[viewProd,setViewProd]=useState(null);
  /* CSV import */
  const[showImport,setShowImport]=useState(false);
  const[importData,setImportData]=useState(null);/* {rows:[{name,category,unit,stock,...}], errors:[], parsed:true} */
  /* Bulk operations */
  const[bulkMode,setBulkMode]=useState(false);/* {type:"fabric"|"accessory"|"general"} | false */
  const[bulkSelected,setBulkSelected]=useState({});/* {id: true} */
  const[showBulkEdit,setShowBulkEdit]=useState(false);
  const[bulkEditForm,setBulkEditForm]=useState({field:"minStock",value:"",operation:"set"});/* set | add | multiply */
  
  const fabrics=data.fabrics||[];
  const accessories=data.accessories||[];
  const generalProducts=data.generalProducts||[];
  const productCategories=data.productCategories||["مستلزمات تشغيل","قطع غيار","خدمات","ورق وكرتون","مواد تنظيف","أخرى"];
  const stockMovements=data.stockMovements||[];
  const orders=data.orders||[];
  const purchaseSettings=data.purchaseSettings||{};
  const stockEnabled=!!purchaseSettings.stockEnabled;
  
  /* ──────── COMPREHENSIVE WAREHOUSE STATS ──────── */
  const wStats=useMemo(()=>{
    const f={count:fabrics.length,value:0,low:0,zero:0};
    fabrics.forEach(x=>{const s=Number(x.stock)||0;const c=Number(x.avgCost)||Number(x.price)||0;f.value+=s*c;if(s===0)f.zero++;else if(x.minStock&&s<=x.minStock)f.low++});
    const a={count:accessories.length,value:0,low:0,zero:0};
    accessories.forEach(x=>{const s=Number(x.stock)||0;const c=Number(x.avgCost)||Number(x.price)||0;a.value+=s*c;if(s===0)a.zero++;else if(x.minStock&&s<=x.minStock)a.low++});
    const g={count:generalProducts.length,value:0,low:0,zero:0};
    generalProducts.forEach(x=>{const s=Number(x.stock)||0;const c=Number(x.avgCost)||Number(x.price)||0;g.value+=s*c;if(s===0)g.zero++;else if(x.minStock&&s<=x.minStock)g.low++});
    /* Finished goods: count orders with balance */
    let finishedQty=0,finishedModels=0;
    orders.forEach(o=>{if(o.closed)return;const t=calcOrder(o);const del=getConfirmedStock(o);const bal=(t.cutQty||0)-del;if(bal>0){finishedQty+=bal;finishedModels++}});
    return{fabric:f,accessory:a,general:g,finished:{count:finishedModels,qty:finishedQty}};
  },[fabrics,accessories,generalProducts,orders]);
  
  /* ──────── OPEN PRODUCT FROM QR SCAN ──────── */
  useEffect(()=>{
    const h=()=>{
      if(!window.__openProd)return;
      const prodId=window.__openProd;
      delete window.__openProd;
      const prod=generalProducts.find(p=>String(p.id)===String(prodId));
      if(prod){setSubTab("general");setViewProd(prod)}
    };
    window.addEventListener("open-prod",h);
    /* Also check on mount in case event already dispatched */
    if(window.__openProd)h();
    return()=>window.removeEventListener("open-prod",h);
  },[generalProducts]);
  
  /* ──────── WAREHOUSE REPORTS (memoized for advanced charts) ──────── */
  const wReports=useMemo(()=>{
    /* Monthly movements (last 6 months) */
    const now=new Date();const months=[];
    for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push({key:d.toISOString().slice(0,7),label:["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"][d.getMonth()]+" "+String(d.getFullYear()).slice(-2),inValue:0,outValue:0,inCount:0,outCount:0})}
    stockMovements.forEach(m=>{const mon=months.find(x=>x.key===(m.date||"").slice(0,7));if(!mon)return;const val=(Number(m.qty)||0)*(Number(m.price)||0);if(m.type==="in"||m.type==="opening"){mon.inValue+=val;mon.inCount++}else if(m.type==="out"){mon.outValue+=val;mon.outCount++}});
    months.forEach(m=>{m.inValue=r2(m.inValue);m.outValue=r2(m.outValue)});
    /* Top consumed items (by out movements in last 90 days) */
    const cutoff=new Date(now-90*86400000).toISOString().split("T")[0];
    const consumed={};
    stockMovements.filter(m=>m.type==="out"&&m.date>=cutoff).forEach(m=>{const k=m.itemType+":"+m.itemId;if(!consumed[k])consumed[k]={itemType:m.itemType,itemId:m.itemId,itemName:m.itemName,unit:m.unit,qty:0,value:0,count:0};consumed[k].qty+=Number(m.qty)||0;consumed[k].value+=(Number(m.qty)||0)*(Number(m.price)||0);consumed[k].count++});
    const topConsumed=Object.values(consumed).sort((a,b)=>b.value-a.value).slice(0,10).map(x=>({...x,qty:r2(x.qty),value:r2(x.value)}));
    return{months,topConsumed};
  },[stockMovements]);
  
  /* ──────── CSV IMPORT ──────── */
  const parseCSVFile=(file)=>{
    const reader=new FileReader();
    reader.onload=(e)=>{
      const text=e.target.result;
      const lines=text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(x=>x.trim());
      if(lines.length<2){setImportData({rows:[],errors:["الملف فارغ أو غير صالح"],parsed:true});return}
      /* Simple CSV parser (handles quoted fields with commas) */
      const parseLine=(line)=>{
        const out=[];let cur="";let inQ=false;
        for(let i=0;i<line.length;i++){const c=line[i];
          if(c==='"'){if(inQ&&line[i+1]==='"'){cur+='"';i++}else inQ=!inQ}
          else if(c===","&&!inQ){out.push(cur);cur=""}
          else cur+=c;
        }
        out.push(cur);return out;
      };
      const headers=parseLine(lines[0]).map(h=>h.trim());
      const rows=[];const errors=[];
      /* Expected headers: "الاسم", "الفئة", "الوحدة", "الرصيد", "الحد الأدنى", "السعر", "ملاحظات" */
      const hMap={
        name:headers.findIndex(h=>h.includes("اسم")||h.toLowerCase()==="name"),
        category:headers.findIndex(h=>h.includes("فئة")||h.toLowerCase()==="category"),
        unit:headers.findIndex(h=>h.includes("وحدة")||h.toLowerCase()==="unit"),
        stock:headers.findIndex(h=>h.includes("رصيد")||h.toLowerCase()==="stock"),
        minStock:headers.findIndex(h=>h.includes("أدنى")||h.includes("دنى")||h.toLowerCase()==="minstock"),
        price:headers.findIndex(h=>h.includes("سعر")||h.toLowerCase()==="price"),
        notes:headers.findIndex(h=>h.includes("ملاحظ")||h.toLowerCase()==="notes")
      };
      if(hMap.name<0){errors.push("عمود 'الاسم' غير موجود في الملف");setImportData({rows:[],errors,parsed:true});return}
      for(let i=1;i<lines.length;i++){
        const cells=parseLine(lines[i]);
        const name=(cells[hMap.name]||"").trim();
        if(!name){errors.push("صف "+(i+1)+": الاسم فارغ — تم تجاهله");continue}
        rows.push({
          name,
          category:hMap.category>=0?(cells[hMap.category]||"").trim()||"أخرى":"أخرى",
          unit:hMap.unit>=0?(cells[hMap.unit]||"").trim()||"قطعة":"قطعة",
          stock:hMap.stock>=0?(Number(cells[hMap.stock])||0):0,
          minStock:hMap.minStock>=0?(Number(cells[hMap.minStock])||0):0,
          price:hMap.price>=0?(Number(cells[hMap.price])||0):0,
          notes:hMap.notes>=0?(cells[hMap.notes]||"").trim():""
        });
      }
      setImportData({rows,errors,parsed:true});
    };
    reader.readAsText(file,"UTF-8");
  };
  
  const confirmImport=async()=>{
    if(!canEdit){await denyAction("استيراد البيانات");return;}
    if(!importData||importData.rows.length===0)return;
    const confirmed=await ask("استيراد المنتجات","سيتم إضافة "+importData.rows.length+" منتج جديد.\n\n⚠️ المنتجات الموجودة بنفس الاسم سيتم تخطيها (مش هيحصل تعديل أو duplicate).\n\nمتابعة؟",{confirmText:"استيراد"});
    if(!confirmed)return;
    let added=0,skipped=0;
    upConfig(d=>{
      if(!d.generalProducts)d.generalProducts=[];
      if(!d.stockMovements)d.stockMovements=[];
      const existingNames=new Set((d.generalProducts||[]).map(p=>(p.name||"").trim().toLowerCase()));
      importData.rows.forEach(row=>{
        if(existingNames.has(row.name.toLowerCase())){skipped++;return}
        const id=gid();
        const product={
          id,name:row.name,category:row.category,unit:row.unit,
          stock:row.stock,minStock:row.minStock,
          price:row.price,avgCost:row.price||0,
          notes:row.notes,lastMovementDate:row.stock>0?today:"",
          createdAt:new Date().toISOString()
        };
        d.generalProducts.push(product);
        existingNames.add(row.name.toLowerCase());
        /* If stock>0, record opening movement */
        if(row.stock>0){
          d.stockMovements.push({
            id:gid(),type:"opening",itemType:"general",
            itemId:id,itemName:row.name,qty:row.stock,
            unit:row.unit,price:row.price||0,date:today,
            sourceType:"import",sourceId:null,
            notes:"استيراد CSV — رصيد ابتدائي",
            createdBy:userName,createdAt:new Date().toISOString()
          });
        }
        added++;
      });
    });
    setShowImport(false);
    setImportData(null);
    showToast("✅ تم استيراد "+added+" منتج"+(skipped>0?" — تخطي "+skipped+" مكرر":""));
  };
  
  /* ──────── BULK OPERATIONS ──────── */
  const enterBulkMode=(type)=>{setBulkMode({type});setBulkSelected({})};
  const exitBulkMode=()=>{setBulkMode(false);setBulkSelected({})};
  const toggleBulkSelect=(id)=>setBulkSelected(p=>({...p,[id]:!p[id]}));
  const selectAllInList=(list)=>{const sel={};list.forEach(it=>sel[it.id]=true);setBulkSelected(sel)};
  const deselectAll=()=>setBulkSelected({});
  const bulkSelectedCount=Object.values(bulkSelected).filter(Boolean).length;
  
  const applyBulkEdit=async()=>{
    if(!canEdit){await denyAction("التعديل الجماعي");return;}
    if(!bulkMode)return;
    const field=bulkEditForm.field;
    const op=bulkEditForm.operation;
    const val=Number(bulkEditForm.value)||0;
    if(!field){await tell("الحقل مطلوب","اختر الحقل المراد تعديله",{type:"warning"});return}
    const ids=Object.keys(bulkSelected).filter(id=>bulkSelected[id]);
    if(ids.length===0){await tell("لم تختر شيئاً","حدد منتجاً واحداً على الأقل",{type:"warning"});return}
    const listKey=bulkMode.type==="fabric"?"fabrics":bulkMode.type==="accessory"?"accessories":"generalProducts";
    const opLabel=op==="set"?"تعيين إلى":op==="add"?"إضافة":op==="multiply"?"ضرب في":"";
    const fieldLabel=field==="minStock"?"الحد الأدنى":field==="price"?"السعر":field;
    const confirmed=await ask("تعديل جماعي","• العدد: "+ids.length+" منتج\n• "+fieldLabel+": "+opLabel+" "+val+"\n\nمتابعة؟",{confirmText:"تعديل"});
    if(!confirmed)return;
    upConfig(d=>{
      const list=d[listKey]||[];
      ids.forEach(id=>{const idx=list.findIndex(x=>String(x.id)===String(id));if(idx<0)return;const it=list[idx];const cur=Number(it[field])||0;
        if(op==="set")it[field]=val;
        else if(op==="add")it[field]=Math.max(0,cur+val);
        else if(op==="multiply")it[field]=r2(cur*val);
      });
    });
    setShowBulkEdit(false);
    setBulkEditForm({field:"minStock",value:"",operation:"set"});
    exitBulkMode();
    showToast("✅ تم التعديل على "+ids.length+" منتج");
  };
  
  
  /* ──────── FILTERED LISTS ──────── */
  const filteredFab=useMemo(()=>{
    let list=fabrics.map(x=>({...x,_stock:Number(x.stock)||0,_cost:Number(x.avgCost)||Number(x.price)||0}));
    list=list.map(x=>({...x,_value:x._stock*x._cost}));
    if(hideZero)list=list.filter(x=>x._stock>0);
    const q=fabFilterDeb.trim().toLowerCase();
    if(q)list=list.filter(x=>(x.name||"").toLowerCase().includes(q));
    if(sortBy==="name")list.sort((a,b)=>(a.name||"").localeCompare(b.name||"","ar"));
    else if(sortBy==="stock")list.sort((a,b)=>b._stock-a._stock);
    else if(sortBy==="value")list.sort((a,b)=>b._value-a._value);
    else if(sortBy==="low")list.sort((a,b)=>{const aL=a.minStock&&a._stock<=a.minStock?0:1;const bL=b.minStock&&b._stock<=b.minStock?0:1;return aL-bL});
    return list;
  },[fabrics,hideZero,fabFilterDeb,sortBy]);
  
  const filteredAcc=useMemo(()=>{
    let list=accessories.map(x=>({...x,_stock:Number(x.stock)||0,_cost:Number(x.avgCost)||Number(x.price)||0}));
    list=list.map(x=>({...x,_value:x._stock*x._cost}));
    if(hideZero)list=list.filter(x=>x._stock>0);
    const q=accFilterDeb.trim().toLowerCase();
    if(q)list=list.filter(x=>(x.name||"").toLowerCase().includes(q));
    if(sortBy==="name")list.sort((a,b)=>(a.name||"").localeCompare(b.name||"","ar"));
    else if(sortBy==="stock")list.sort((a,b)=>b._stock-a._stock);
    else if(sortBy==="value")list.sort((a,b)=>b._value-a._value);
    else if(sortBy==="low")list.sort((a,b)=>{const aL=a.minStock&&a._stock<=a.minStock?0:1;const bL=b.minStock&&b._stock<=b.minStock?0:1;return aL-bL});
    return list;
  },[accessories,hideZero,accFilterDeb,sortBy]);
  
  const filteredProd=useMemo(()=>{
    let list=generalProducts.map(x=>({...x,_stock:Number(x.stock)||0,_cost:Number(x.avgCost)||Number(x.price)||0}));
    list=list.map(x=>({...x,_value:x._stock*x._cost}));
    if(hideZero)list=list.filter(x=>x._stock>0);
    const q=prodFilterDeb.trim().toLowerCase();
    if(q)list=list.filter(x=>(x.name||"").toLowerCase().includes(q));
    if(prodCategoryF)list=list.filter(x=>x.category===prodCategoryF);
    if(sortBy==="name")list.sort((a,b)=>(a.name||"").localeCompare(b.name||"","ar"));
    else if(sortBy==="stock")list.sort((a,b)=>b._stock-a._stock);
    else if(sortBy==="value")list.sort((a,b)=>b._value-a._value);
    return list;
  },[generalProducts,hideZero,prodFilterDeb,prodCategoryF,sortBy]);
  
  /* ──────── GENERAL PRODUCT CRUD ──────── */
  const openNewProd=()=>{setProdForm({name:"",category:productCategories[0]||"أخرى",unit:"قطعة",unit2:"",unit2Rate:"",price:0,minStock:0,notes:""});setShowProdForm(true)};
  const editProd=(p)=>{setProdForm({...p,unit2:p.unit2||"",unit2Rate:p.unit2Rate||""});setShowProdForm(true)};
  const saveProd=async()=>{
    if(!canEdit){await denyAction("حفظ المنتج");return;}
    if(!prodForm)return;
    if(!prodForm.name||!prodForm.name.trim()){await tell("الاسم مطلوب","يرجى إدخال اسم المنتج",{type:"warning"});return}
    const isEdit=!!prodForm.id;
    upConfig(d=>{
      if(!d.generalProducts)d.generalProducts=[];
      /* V21.21.52: وحدة فرعية اختيارية — الرصيد يفضل بالوحدة الأساسية */
      const _u2=(prodForm.unit2||"").trim();
      const _r2=Number(prodForm.unit2Rate);
      const _dual=_u2&&isFinite(_r2)&&_r2>0;
      const obj={
        id:prodForm.id||gid(),
        name:prodForm.name.trim(),
        category:prodForm.category||"أخرى",
        unit:prodForm.unit||"قطعة",
        stock:isEdit?(Number(prodForm.stock)||0):0,
        minStock:Number(prodForm.minStock)||0,
        price:Number(prodForm.price)||0,
        avgCost:isEdit?(Number(prodForm.avgCost)||0):0,
        notes:prodForm.notes||"",
        lastMovementDate:prodForm.lastMovementDate||"",
        createdAt:prodForm.createdAt||new Date().toISOString()
      };
      if(_dual){obj.unit2=_u2;obj.unit2Rate=_r2;}
      if(isEdit){const idx=d.generalProducts.findIndex(x=>x.id===obj.id);if(idx>=0)d.generalProducts[idx]=obj}
      else d.generalProducts.push(obj);
    });
    setShowProdForm(false);
    setProdForm(null);
    showToast(isEdit?"✅ تم تعديل المنتج":"✅ تم إضافة المنتج");
  };

  /* V18.48: Shared force-delete flow.
     When a normal delete is blocked by refs, this offers the user a "force
     delete" option that ALSO removes related stockMovements + strips the item
     from purchaseReceipts. Only used for stock-type kinds.
     Returns: true if force-delete happened, false otherwise. */
  const tryForceDelete=async({kind,id,name,labelAr})=>{
    const force=canForceDelete(data,kind,id);
    if(!force.ok){
      await tell("لا يمكن الحذف بالقوة",force.reason,{type:"error"});
      return false;
    }
    const sum=summarizeForceDelete(data,kind,id);
    const lines=[];
    if(sum.currentStock>0)         lines.push("• الرصيد الحالي ("+sum.currentStock+") سيُمسح");
    if(sum.moveCount>0)            lines.push("• "+sum.moveCount+" حركة مخزن سَتُحذف");
    if(sum.receiptItemCount>0)     lines.push("• "+sum.receiptItemCount+" بند داخل إذن استلام سيُحذف");
    if(sum.affectedReceipts.length>0) lines.push("• الإيصالات المتأثرة: "+sum.affectedReceipts.slice(0,3).join("، ")+(sum.affectedReceipts.length>3?"...":""));
    const msg="سيتم حذف "+labelAr+" \""+name+"\" مع كل الحركات المرتبطة به:\n\n"+lines.join("\n")+"\n\n⚠️ هذه العملية لا يمكن التراجع عنها بشكل كامل (الحركات المحذوفة لن ترجع).\n💡 لو فيه قيود محاسبية مرتبطة، راجع الترحيلات يدوياً.";
    const confirmed=await ask("حذف بالقوة",msg,{danger:true,confirmText:"⚠️ حذف بالقوة",cancelText:"إلغاء"});
    if(!confirmed)return false;
    upConfig(d=>{forceDeleteCleanup(d,kind,id)});
    showToast("✓ تم الحذف بالقوة — راجع المحاسبة لو لزم");
    return true;
  };

  /* V18.48: Show force-delete option in the blocker popup.
     Returns true if user chose force-delete (and it happened), false otherwise. */
  const offerForceDelete=async({kind,id,name,labelAr,blockerMsg})=>{
    /* Use ask() with custom labels so it has 2 buttons:
       - Cancel = OK / dismiss
       - Confirm = "⚠️ حذف بالقوة" → opens force flow */
    const wantsForce=await ask(
      "لا يمكن حذف "+labelAr,
      blockerMsg+"\n\nاضغط 'حذف بالقوة' لإجبار الحذف مع تنظيف الحركات المرتبطة، أو إلغاء.",
      {danger:true,confirmText:"⚠️ حذف بالقوة",cancelText:"إلغاء"}
    );
    if(!wantsForce)return false;
    return await tryForceDelete({kind,id,name,labelAr});
  };

  const deleteProd=async(p)=>{
    if(!canEdit){await denyAction("حذف المنتج");return;}
    /* V16.66: Block delete if product has stock or movements — prevents
       silent loss of data referenced by stockMovements. */
    const blocker=formatBlockerMessage(data,"generalProduct",p.id,p.name);
    if(blocker){
      /* V18.48: instead of just refusing, offer force-delete */
      await offerForceDelete({kind:"generalProduct",id:p.id,name:p.name,labelAr:"المنتج",blockerMsg:blocker});
      return;
    }
    const confirmed=await ask("حذف المنتج","حذف المنتج "+p.name+"؟",{danger:true,confirmText:"حذف"});
    if(!confirmed)return;
    upConfig(d=>{d.generalProducts=(d.generalProducts||[]).filter(x=>x.id!==p.id)});
    showToast("تم حذف المنتج");
  };

  /* ──────── V16.77: FABRIC ADD/EDIT/DELETE (moved from DBPg) ──────── */
  const saveFab=async()=>{
    if(!canEdit){await denyAction("حفظ الخامة");return;}
    if(!fabForm)return;
    if(!fabForm.name||!fabForm.name.trim()){await tell("الاسم مطلوب","يرجى إدخال اسم القماش",{type:"warning"});return}
    upConfig(d=>{
      if(!d.fabrics)d.fabrics=[];
      /* V21.21.52: الوحدة الفرعية اختيارية — تتكتب بس لو متظبطة بمعدل صالح،
         وإلا تتمسح (لو المستخدم شالها). الرصيد يفضل بالوحدة الأساسية. */
      const _u2=(fabForm.unit2||"").trim();
      const _r2=Number(fabForm.unit2Rate);
      const _dual=_u2&&isFinite(_r2)&&_r2>0;
      if(fabForm._eid){
        const idx=d.fabrics.findIndex(x=>x.id===fabForm._eid);
        if(idx>=0){
          d.fabrics[idx]={...d.fabrics[idx],name:fabForm.name.trim(),unit:fabForm.unit||"كيلو",price:Number(fabForm.price)||0};
          if(_dual){d.fabrics[idx].unit2=_u2;d.fabrics[idx].unit2Rate=_r2;}
          else{delete d.fabrics[idx].unit2;delete d.fabrics[idx].unit2Rate;}
        }
      }else{
        const _f={id:Date.now(),name:fabForm.name.trim(),unit:fabForm.unit||"كيلو",price:Number(fabForm.price)||0,stock:0};
        if(_dual){_f.unit2=_u2;_f.unit2Rate=_r2;}
        d.fabrics.push(_f);
      }
    });
    setFabForm(null);
    showToast(fabForm._eid?"✅ تم تعديل القماش":"✅ تم إضافة القماش");
  };
  const editFab=(f)=>setFabForm({name:f.name,unit:f.unit,price:f.price,unit2:f.unit2||"",unit2Rate:f.unit2Rate||"",_eid:f.id});
  const deleteFab=async(f)=>{
    if(!canEdit){await denyAction("حذف القماش");return;}
    const blocker=formatBlockerMessage(data,"fabric",f.id,f.name);
    if(blocker){
      /* V18.48: offer force-delete instead of just refusing */
      await offerForceDelete({kind:"fabric",id:f.id,name:f.name,labelAr:"القماش",blockerMsg:blocker});
      return;
    }
    const confirmed=await ask("حذف القماش","حذف القماش "+f.name+"؟",{danger:true,confirmText:"حذف"});
    if(!confirmed)return;
    upConfig(d=>{
      if(!d.recycleBin)d.recycleBin=[];
      const item=(d.fabrics||[]).find(x=>x.id===f.id);
      if(item)d.recycleBin.unshift({...item,_type:"قماش",_collection:"fabrics",_deletedAt:new Date().toISOString()});
      d.fabrics=(d.fabrics||[]).filter(x=>x.id!==f.id);
      if(d.recycleBin.length>100)d.recycleBin=d.recycleBin.slice(0,100);
    });
    showToast("✓ تم حذف القماش — يمكن الاستعادة من سلة المحذوفات");
  };

  /* ──────── V16.77: ACCESSORY ADD/EDIT/DELETE (moved from DBPg) ──────── */
  const saveAcc=async()=>{
    if(!canEdit){await denyAction("حفظ الإكسسوار");return;}
    if(!accForm)return;
    if(!accForm.name||!accForm.name.trim()){await tell("الاسم مطلوب","يرجى إدخال وصف الإكسسوار",{type:"warning"});return}
    upConfig(d=>{
      if(!d.accessories)d.accessories=[];
      /* V21.21.52: وحدة فرعية اختيارية — نفس منطق القماش */
      const _u2=(accForm.unit2||"").trim();
      const _r2=Number(accForm.unit2Rate);
      const _dual=_u2&&isFinite(_r2)&&_r2>0;
      if(accForm._eid){
        const idx=d.accessories.findIndex(x=>x.id===accForm._eid);
        if(idx>=0){
          d.accessories[idx]={...d.accessories[idx],name:accForm.name.trim(),unit:accForm.unit||"قطعة",price:Number(accForm.price)||0};
          if(_dual){d.accessories[idx].unit2=_u2;d.accessories[idx].unit2Rate=_r2;}
          else{delete d.accessories[idx].unit2;delete d.accessories[idx].unit2Rate;}
        }
      }else{
        const _a={id:Date.now(),name:accForm.name.trim(),unit:accForm.unit||"قطعة",price:Number(accForm.price)||0,stock:0};
        if(_dual){_a.unit2=_u2;_a.unit2Rate=_r2;}
        d.accessories.push(_a);
      }
    });
    setAccForm(null);
    showToast(accForm._eid?"✅ تم تعديل الإكسسوار":"✅ تم إضافة الإكسسوار");
  };
  const editAcc=(a)=>setAccForm({name:a.name,unit:a.unit,price:a.price,unit2:a.unit2||"",unit2Rate:a.unit2Rate||"",_eid:a.id});
  const deleteAcc=async(a)=>{
    if(!canEdit){await denyAction("حذف الإكسسوار");return;}
    const blocker=formatBlockerMessage(data,"accessory",a.id,a.name);
    if(blocker){
      /* V18.48: offer force-delete instead of just refusing */
      await offerForceDelete({kind:"accessory",id:a.id,name:a.name,labelAr:"الإكسسوار",blockerMsg:blocker});
      return;
    }
    const confirmed=await ask("حذف الإكسسوار","حذف الإكسسوار "+a.name+"؟",{danger:true,confirmText:"حذف"});
    if(!confirmed)return;
    upConfig(d=>{
      if(!d.recycleBin)d.recycleBin=[];
      const item=(d.accessories||[]).find(x=>x.id===a.id);
      if(item)d.recycleBin.unshift({...item,_type:"اكسسوار",_collection:"accessories",_deletedAt:new Date().toISOString()});
      d.accessories=(d.accessories||[]).filter(x=>x.id!==a.id);
      if(d.recycleBin.length>100)d.recycleBin=d.recycleBin.slice(0,100);
    });
    showToast("✓ تم حذف الإكسسوار — يمكن الاستعادة من سلة المحذوفات");
  };
  
  /* ──────── MANUAL MOVEMENT (in / out / adjust) ──────── */
  const openMoveForm=(itemType,item)=>{
    setMoveForm({
      itemType,itemId:item.id,itemName:item.name,unit:item.unit||"",
      type:"in",qty:0,price:Number(item.avgCost)||Number(item.price)||0,
      date:today,notes:""
    });
    setShowMoveForm(true);
  };
  const saveMovement=async()=>{
    if(!canEdit){await denyAction("حفظ حركة المخزون");return;}
    if(!moveForm)return;
    const qty=Number(moveForm.qty)||0;
    if(qty<=0){await tell("الكمية مطلوبة","يرجى إدخال كمية أكبر من صفر",{type:"warning"});return}
    
    const listKey=moveForm.itemType==="fabric"?"fabrics":moveForm.itemType==="accessory"?"accessories":"generalProducts";
    const item=(data[listKey]||[]).find(x=>String(x.id)===String(moveForm.itemId));
    if(!item){await tell("خطأ","الصنف غير موجود",{type:"error"});return}
    const curStock=Number(item.stock)||0;
    
    /* For "out" and "adjust" (to less), check stock */
    if(moveForm.type==="out"&&qty>curStock){
      await tell("المخزن غير كافي","المتاح: "+fmt(curStock)+" "+item.unit+"\nالمطلوب: "+fmt(qty)+" "+item.unit,{type:"error"});
      return;
    }
    
    const typeLabel=moveForm.type==="in"?"إضافة":moveForm.type==="out"?"صرف":"تسوية";
    const confirmed=await ask("تأكيد الحركة","• الصنف: "+moveForm.itemName+"\n• النوع: "+typeLabel+"\n• الكمية: "+fmt(qty)+" "+moveForm.unit+(moveForm.type==="in"?"\n• السعر: "+fmt(r2(Number(moveForm.price)||0))+" ج.م":"")+"\n\nمتابعة؟",{confirmText:"حفظ"});
    if(!confirmed)return;
    
    upConfig(d=>{
      if(!d.stockMovements)d.stockMovements=[];
      const list=d[listKey]||[];
      const idx=list.findIndex(x=>String(x.id)===String(moveForm.itemId));
      if(idx<0)return;
      const it=list[idx];
      
      if(moveForm.type==="in"){
        /* Weighted avg for cost */
        const oldStock=Number(it.stock)||0;
        const oldAvg=Number(it.avgCost)||Number(it.price)||0;
        const addPrice=Number(moveForm.price)||0;
        const total=oldStock+qty;
        it.avgCost=total>0?r2((oldStock*oldAvg+qty*addPrice)/total):addPrice;
        it.stock=total;
      }else if(moveForm.type==="out"){
        it.stock=Math.max(0,(Number(it.stock)||0)-qty);
      }else if(moveForm.type==="adjust"){
        /* For adjust: qty represents the new total stock */
        it.stock=qty;
      }
      it.lastMovementDate=moveForm.date||today;
      
      /* Movement record */
      d.stockMovements.push({
        id:gid(),
        type:moveForm.type==="adjust"?"adjust":(moveForm.type==="in"?"in":"out"),
        itemType:moveForm.itemType,
        itemId:moveForm.itemId,
        itemName:moveForm.itemName,
        qty:moveForm.type==="adjust"?(qty-curStock):qty,
        unit:moveForm.unit||"",
        price:Number(moveForm.price)||0,
        date:moveForm.date||today,
        sourceType:"manual",
        sourceId:null,
        notes:moveForm.notes||"حركة يدوية",
        createdBy:userName,
        createdAt:new Date().toISOString()
      });
    });
    
    setShowMoveForm(false);
    setMoveForm(null);
    showToast("✅ تم تسجيل الحركة");
  };
  
  /* ──────── UNIFIED MOVEMENTS (filtered + sorted) ──────── */
  const filteredMovements=useMemo(()=>{
    let list=stockMovements.slice();
    if(movType)list=list.filter(m=>m.type===movType);
    if(movCategory)list=list.filter(m=>m.itemType===movCategory);
    if(movDateFrom)list=list.filter(m=>(m.date||"")>=movDateFrom);
    if(movDateTo)list=list.filter(m=>(m.date||"")<=movDateTo);
    const q=movSearchDeb.trim().toLowerCase();
    if(q)list=list.filter(m=>(m.itemName||"").toLowerCase().includes(q)||(m.notes||"").toLowerCase().includes(q));
    list.sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
    return list;
  },[stockMovements,movType,movCategory,movDateFrom,movDateTo,movSearchDeb]);
  
  /* ──────── PRINT MOVEMENTS REPORT ──────── */
  const printMovementsReport=()=>{
    const w=openPrintWindow();if(!w){tell("المتصفح يمنع الطباعة","فعّل النوافذ المنبثقة",{danger:true});return}
    const title="تقرير حركات المخزن";
    const filterSummary=[];
    if(movDateFrom)filterSummary.push("من: "+movDateFrom);
    if(movDateTo)filterSummary.push("إلى: "+movDateTo);
    if(movType)filterSummary.push("النوع: "+(movType==="in"?"دخول":movType==="out"?"خروج":movType==="opening"?"ابتدائي":"تسوية"));
    if(movCategory)filterSummary.push("الصنف: "+(movCategory==="fabric"?"خامات":movCategory==="accessory"?"إكسسوار":movCategory==="general"?"منتجات":"جاهز"));
    if(movSearchDeb)filterSummary.push("بحث: "+movSearchDeb);
    /* Summary by item type */
    const byType={fabric:{in:0,out:0,count:0},accessory:{in:0,out:0,count:0},general:{in:0,out:0,count:0},finished:{in:0,out:0,count:0}};
    filteredMovements.forEach(m=>{const cat=byType[m.itemType];if(!cat)return;cat.count++;if(m.type==="in"||m.type==="opening")cat.in+=Math.abs(Number(m.qty)||0);else if(m.type==="out")cat.out+=Math.abs(Number(m.qty)||0)});
    /* Total value of "in" movements (cost) */
    let totalInValue=0;filteredMovements.forEach(m=>{if((m.type==="in"||m.type==="opening")&&m.price)totalInValue+=(Math.abs(Number(m.qty)||0)*(Number(m.price)||0))});
    const rowsHtml=filteredMovements.map(m=>{
      const typeLabel=m.type==="in"?"دخول":m.type==="out"?"خروج":m.type==="opening"?"ابتدائي":"تسوية";
      const catLabel=m.itemType==="fabric"?"🧵 خامة":m.itemType==="accessory"?"🪡 إكسسوار":m.itemType==="general"?"➕ منتج":"👕 جاهز";
      const signClass=m.type==="out"?"err":"ok";
      return "<tr><td>"+m.date+"</td><td>"+catLabel+"</td><td class='"+signClass+"'>"+typeLabel+"</td><td><b>"+(m.itemName||"—")+"</b></td><td class='center "+signClass+"'>"+(m.type==="out"?"-":"+")+fmt(Math.abs(Number(m.qty)||0))+" "+(m.unit||"")+"</td><td class='center'>"+(m.price?fmt(r2(m.price)):"—")+"</td><td>"+(m.notes||m.sourceType||"—")+"</td><td>"+(m.createdBy||"—")+"</td></tr>";
    }).join("");
    const html="<html dir='rtl'><head><meta charset='UTF-8'><title>"+title+"</title><style>"+PRINT_CSS+".center{text-align:center}.summary{background:#F0F9FF;padding:10px;border-radius:8px;margin-bottom:14px;font-size:11px;line-height:1.8}.summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:10px}.sum-card{background:#fff;padding:8px;border-radius:6px;text-align:center;border:1px solid #E2E8F0}.sum-card .lbl{font-size:10px;color:#64748B;font-weight:600}.sum-card .val{font-size:14px;font-weight:800;color:#0284C7;margin-top:4px}</style></head><body><div class='hdr'><div style='font-size:18px;font-weight:800;color:#0284C7'>📊 "+title+"</div><div class='hdr-info'><div>تاريخ الطباعة: "+today+"</div><div>إجمالي الحركات: "+filteredMovements.length+"</div></div></div>"+(filterSummary.length>0?"<div class='summary'><b>الفلاتر المطبقة:</b> "+filterSummary.join(" • ")+"</div>":"")+"<div class='summary-grid'><div class='sum-card'><div class='lbl'>خامات</div><div class='val'>"+byType.fabric.count+"</div><div style='font-size:9px;color:#64748B'>↓"+fmt(byType.fabric.in)+" • ↑"+fmt(byType.fabric.out)+"</div></div><div class='sum-card'><div class='lbl'>إكسسوار</div><div class='val' style='color:#8B5CF6'>"+byType.accessory.count+"</div><div style='font-size:9px;color:#64748B'>↓"+fmt(byType.accessory.in)+" • ↑"+fmt(byType.accessory.out)+"</div></div><div class='sum-card'><div class='lbl'>منتجات عامة</div><div class='val' style='color:#EC4899'>"+byType.general.count+"</div><div style='font-size:9px;color:#64748B'>↓"+fmt(byType.general.in)+" • ↑"+fmt(byType.general.out)+"</div></div><div class='sum-card'><div class='lbl'>قيمة الدخول</div><div class='val' style='color:#10B981'>"+fmt(r2(totalInValue))+" ج</div><div style='font-size:9px;color:#64748B'>تكلفة إجمالية</div></div></div><h3 style='margin-top:14px'>تفاصيل الحركات</h3><table><thead><tr><th>التاريخ</th><th>النوع</th><th>الحركة</th><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الملاحظات</th><th>بواسطة</th></tr></thead><tbody>"+(rowsHtml||"<tr><td colspan='8' class='center' style='padding:20px;color:#94A3B8'>لا توجد حركات</td></tr>")+"</tbody></table><div class='foot'>CLARK ERP System — تقرير حركات المخزن — "+new Date().toLocaleString("ar-EG")+"</div><script>setTimeout(function(){window.print()},500)</"+"script></body></html>";
    w.document.write(html);w.document.close();
  };
  
  /* ──────── EXPORT CSV (generic) ──────── */
  const downloadCSV=(filename,headers,rows)=>{
    /* BOM for Arabic support in Excel */
    const BOM="\uFEFF";
    const escape=(v)=>{if(v==null)return"";const s=String(v);if(/[",\n]/.test(s))return'"'+s.replace(/"/g,'""')+'"';return s};
    const csv=BOM+headers.join(",")+"\n"+rows.map(r=>r.map(escape).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=filename;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),500);
    showToast("✅ تم تحميل "+filename);
  };
  
  const exportMovementsCSV=()=>{
    const headers=["التاريخ","نوع الصنف","نوع الحركة","اسم الصنف","الكمية","الوحدة","السعر","القيمة","المرجع","الملاحظات","بواسطة"];
    const rows=filteredMovements.map(m=>[
      m.date||"",
      m.itemType==="fabric"?"خامة":m.itemType==="accessory"?"إكسسوار":m.itemType==="general"?"منتج عام":"جاهز",
      m.type==="in"?"دخول":m.type==="out"?"خروج":m.type==="opening"?"رصيد ابتدائي":"تسوية",
      m.itemName||"",
      (m.type==="out"?"-":"+")+Math.abs(Number(m.qty)||0),
      m.unit||"",
      Number(m.price)||"",
      r2((Math.abs(Number(m.qty)||0))*(Number(m.price)||0))||"",
      m.sourceType||"",
      m.notes||"",
      m.createdBy||""
    ]);
    downloadCSV("stock-movements-"+today+".csv",headers,rows);
  };
  
  const exportStockSnapshotCSV=()=>{
    const headers=["نوع الصنف","الفئة","الاسم","الرصيد","الوحدة","الحد الأدنى","متوسط التكلفة","القيمة","الحالة","آخر حركة"];
    const rows=[];
    fabrics.forEach(f=>{const s=Number(f.stock)||0;const c=Number(f.avgCost)||Number(f.price)||0;const status=s===0?"نافذ":f.minStock&&s<=f.minStock?"ناقص":"متاح";rows.push(["خامة","",f.name||"",s,f.unit||"",f.minStock||"",r2(c),r2(s*c),status,f.lastReceiveDate||""])});
    accessories.forEach(a=>{const s=Number(a.stock)||0;const c=Number(a.avgCost)||Number(a.price)||0;const status=s===0?"نافذ":a.minStock&&s<=a.minStock?"ناقص":"متاح";rows.push(["إكسسوار","",a.name||"",s,a.unit||"",a.minStock||"",r2(c),r2(s*c),status,a.lastReceiveDate||""])});
    generalProducts.forEach(p=>{const s=Number(p.stock)||0;const c=Number(p.avgCost)||Number(p.price)||0;const status=s===0?"نافذ":p.minStock&&s<=p.minStock?"ناقص":"متاح";rows.push(["منتج عام",p.category||"",p.name||"",s,p.unit||"",p.minStock||"",r2(c),r2(s*c),status,p.lastMovementDate||""])});
    downloadCSV("stock-snapshot-"+today+".csv",headers,rows);
  };
  
  /* ──────── PRINT STOCK SNAPSHOT (current balances) ──────── */
  const printStockSnapshot=()=>{
    const w=openPrintWindow();if(!w){tell("المتصفح يمنع الطباعة","فعّل النوافذ المنبثقة",{danger:true});return}
    const buildRows=(list,typeLabel,typeColor)=>list.map(x=>{const s=Number(x.stock)||0;const c=Number(x.avgCost)||Number(x.price)||0;const status=s===0?"نافذ":x.minStock&&s<=x.minStock?"ناقص":"متاح";const statusClass=s===0?"err":x.minStock&&s<=x.minStock?"warn":"ok";return "<tr><td><span style='background:"+typeColor+"20;color:"+typeColor+";padding:1px 6px;border-radius:4px;font-size:9px;font-weight:700'>"+typeLabel+"</span></td>"+(x.category?"<td>"+x.category+"</td>":"<td>—</td>")+"<td><b>"+(x.name||"")+"</b></td><td class='center'>"+fmt(s)+" "+(x.unit||"")+"</td><td class='center'>"+(x.minStock?fmt(x.minStock):"—")+"</td><td class='center'>"+fmt(r2(c))+"</td><td class='center'><b>"+fmt(r2(s*c))+"</b></td><td class='center "+statusClass+"'>"+status+"</td></tr>"}).join("");
    const allRows=buildRows(fabrics,"🧵 خامة","#0EA5E9")+buildRows(accessories,"🪡 إكسسوار","#8B5CF6")+buildRows(generalProducts,"➕ منتج","#EC4899");
    const totalValue=fabrics.reduce((s,x)=>s+(Number(x.stock)||0)*(Number(x.avgCost)||Number(x.price)||0),0)+accessories.reduce((s,x)=>s+(Number(x.stock)||0)*(Number(x.avgCost)||Number(x.price)||0),0)+generalProducts.reduce((s,x)=>s+(Number(x.stock)||0)*(Number(x.avgCost)||Number(x.price)||0),0);
    const html="<html dir='rtl'><head><meta charset='UTF-8'><title>جرد المخزن</title><style>"+PRINT_CSS+".center{text-align:center}</style></head><body><div class='hdr'><div style='font-size:18px;font-weight:800;color:#0284C7'>📦 جرد المخزن الشامل</div><div class='hdr-info'><div>تاريخ الجرد: "+today+"</div><div>إجمالي القيمة: <b style='color:#0284C7'>"+fmt(r2(totalValue))+" ج.م</b></div></div></div><h3>أرصدة الأصناف</h3><table><thead><tr><th>النوع</th><th>الفئة</th><th>الاسم</th><th>الرصيد</th><th>الحد الأدنى</th><th>متوسط التكلفة</th><th>القيمة</th><th>الحالة</th></tr></thead><tbody>"+(allRows||"<tr><td colspan='8' class='center' style='padding:20px;color:#94A3B8'>لا توجد أصناف</td></tr>")+"<tr style='background:#EFF6FF;font-weight:800'><td colspan='6' style='text-align:left'>الإجمالي الكلي لقيمة المخزن</td><td class='center info' style='font-size:14px'>"+fmt(r2(totalValue))+" ج.م</td><td></td></tr></tbody></table><div class='sig'><div class='sig-box'>مسؤول المخزن</div><div class='sig-box'>المحاسب</div><div class='sig-box'>المدير</div></div><div class='foot'>CLARK ERP System — جرد المخزن بتاريخ "+today+"</div><script>setTimeout(function(){window.print()},500)</"+"script></body></html>";
    w.document.write(html);w.document.close();
  };
  
  /* ──────── PRINT QR LABEL for a general product ──────── */
  const printProductQR=async(product)=>{
    let qrData="";
    try{const QR=await loadQR();if(QR)qrData=await QR.toDataURL(JSON.stringify({app:"clark",type:"prod",id:product.id,name:product.name}),{width:200,margin:1,errorCorrectionLevel:"M"})}
    catch(e){console.error("QR gen failed",e)}
    const w=openPrintWindow();if(!w){tell("المتصفح يمنع الطباعة","فعّل النوافذ المنبثقة",{danger:true});return}
    const html="<html dir='rtl'><head><meta charset='UTF-8'><title>QR — "+product.name+"</title><style>"+PRINT_CSS+".qr-card{width:60mm;margin:10mm auto;padding:8mm;border:2px solid #1E293B;border-radius:8px;text-align:center;page-break-after:always}.qr-img{width:45mm;height:45mm;margin:0 auto}.qr-title{font-size:14px;font-weight:800;margin-top:6mm}.qr-sub{font-size:10px;color:#64748B;margin-top:2mm}.qr-cat{display:inline-block;padding:2px 10px;background:#EC489915;color:#EC4899;border-radius:12px;font-size:9px;font-weight:700;margin-top:4mm}@page{size:60mm auto;margin:0}</style></head><body><div class='qr-card'>"+(qrData?"<img class='qr-img' src='"+qrData+"'/>":"<div style='padding:20mm;background:#F1F5F9;border-radius:4px'>QR غير متاح</div>")+"<div class='qr-title'>"+product.name+"</div><div class='qr-sub'>الوحدة: "+(product.unit||"—")+" • رصيد: "+fmt(Number(product.stock)||0)+"</div>"+(product.category?"<div class='qr-cat'>"+product.category+"</div>":"")+"<div class='qr-sub' style='margin-top:4mm;font-size:8px'>CLARK — "+today+"</div></div><script>setTimeout(function(){window.print()},500)</"+"script></body></html>";
    w.document.write(html);w.document.close();
  };
  
  /* ──────── RENDER HELPERS ──────── */
  const renderItemTable=(list,type)=>{
    if(list.length===0)return<div style={{padding:40,textAlign:"center",color:T.textMut}}>
      {(type==="fabric"?fabrics.length:type==="accessory"?accessories.length:generalProducts.length)===0?
        "لا توجد "+(type==="fabric"?"خامات":type==="accessory"?"إكسسوارات":"منتجات")+" مسجلة":
        "لا توجد نتائج"}
    </div>;
    const color=type==="fabric"?T.accent:type==="accessory"?"#8B5CF6":"#EC4899";
    const isBulkActive=bulkMode?.type===type;
    return<div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
        <thead><tr>
          {isBulkActive&&<th style={{...TH,width:40,textAlign:"center"}}>☑</th>}
          <th style={TH}>الاسم</th>
          {type==="general"&&<th style={TH}>الفئة</th>}
          <th style={{...TH,textAlign:"center"}}>الرصيد</th>
          <th style={{...TH,textAlign:"center"}}>الوحدة</th>
          {type==="accessory"&&<th style={{...TH,textAlign:"center"}} title="كمية لكل قطعة">qty/قطعة</th>}
          <th style={{...TH,textAlign:"center"}}>الحد الأدنى</th>
          <th style={{...TH,textAlign:"center"}}>متوسط التكلفة</th>
          <th style={{...TH,textAlign:"center"}}>القيمة</th>
          <th style={{...TH,textAlign:"center"}}>الحالة</th>
          <th style={{...TH,textAlign:"center",width:80}}>الإجراءات</th>
        </tr></thead>
        <tbody>
          {list.map(item=>{const stock=item._stock;const cost=item._cost;const value=item._value;
            const isLow=item.minStock&&stock<=item.minStock;const isZero=stock===0;
            const statusColor=isZero?T.err:isLow?T.warn:T.ok;
            const statusLabel=isZero?"نافذ":isLow?"ناقص":"متاح";
            const listKey=type==="fabric"?"fabrics":type==="accessory"?"accessories":"generalProducts";
            const isSel=!!bulkSelected[item.id];
            return<tr key={item.id} style={{borderBottom:"1px solid "+T.brd,background:isSel?T.warn+"15":isZero?T.err+"04":isLow?T.warn+"04":"transparent"}}>
              {isBulkActive&&<td style={{...TD,textAlign:"center"}}><input type="checkbox" checked={isSel} onChange={()=>toggleBulkSelect(item.id)} style={{width:18,height:18,cursor:"pointer"}}/></td>}
              <td style={{...TD,fontWeight:700}}>{item.name||"—"}</td>
              {type==="general"&&<td style={{...TD}}><span style={{padding:"2px 8px",borderRadius:6,fontSize:FS-3,fontWeight:600,background:color+"15",color}}>{item.category||"—"}</span></td>}
              {/* V21.21.52: عرض الرصيد بالوحدتين لو الصنف له وحدة فرعية (مشتق من المعدل) */}
              <td style={{...TD,textAlign:"center",fontWeight:800,color:statusColor,fontSize:FS}}>{fmt(stock)}{hasDualUnit(item)&&<div style={{fontSize:FS-4,fontWeight:600,color:T.textMut}}>≈ {fmt(r2(baseToSecondary(item,stock)))} {item.unit2}</div>}</td>
              <td style={{...TD,textAlign:"center",color:T.textSec}}>{item.unit||"—"}{hasDualUnit(item)&&<span style={{color:T.textMut}}> / {item.unit2}</span>}</td>
              {type==="accessory"&&<td style={{...TD,textAlign:"center"}}>
                {canEdit?<Inp type="number" value={item.qtyPerPiece||1} onChange={v=>{upConfig(d=>{const idx=d.accessories.findIndex(x=>x.id===item.id);if(idx>=0)d.accessories[idx].qtyPerPiece=Number(v)||1})}} style={{width:60,padding:"3px 6px",fontSize:FS-1,textAlign:"center"}}/>:<span>{item.qtyPerPiece||1}</span>}
              </td>}
              <td style={{...TD,textAlign:"center"}}>
                {canEdit?<Inp type="number" value={item.minStock||""} onChange={v=>{upConfig(d=>{const idx=d[listKey].findIndex(x=>x.id===item.id);if(idx>=0)d[listKey][idx].minStock=Number(v)||0})}} placeholder="—" style={{width:70,padding:"3px 6px",fontSize:FS-1,textAlign:"center"}}/>:<span>{item.minStock||"—"}</span>}
              </td>
              <td style={{...TD,textAlign:"center",color:T.textSec}}>{fmt(r2(cost))}</td>
              <td style={{...TD,textAlign:"center",fontWeight:700,color}}>{fmt(r2(value))}</td>
              <td style={{...TD,textAlign:"center"}}>
                <span style={{padding:"2px 10px",borderRadius:10,fontSize:FS-3,fontWeight:700,background:statusColor+"15",color:statusColor,border:"1px solid "+statusColor+"30"}}>{statusLabel}</span>
              </td>
              <td style={{...TD,textAlign:"center"}}>
                {canEdit&&<div style={{display:"flex",gap:3,justifyContent:"center"}}>
                  <Btn small onClick={()=>openMoveForm(type,item)} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30",padding:"2px 7px",fontSize:FS-3}} title="حركة جديدة">⇅</Btn>
                  {type==="general"&&<>
                    <Btn small onClick={()=>printProductQR(item)} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630",padding:"2px 7px",fontSize:FS-3}} title="QR Code">📱</Btn>
                    <Btn small onClick={()=>editProd(item)} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30",padding:"2px 7px",fontSize:FS-3}} title="تعديل">✏️</Btn>
                    <Btn small onClick={()=>deleteProd(item)} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30",padding:"2px 7px",fontSize:FS-3}} title="حذف">🗑</Btn>
                  </>}
                  {/* V16.77: edit/delete buttons for fabric and accessory */}
                  {type==="fabric"&&<>
                    <Btn small onClick={()=>editFab(item)} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30",padding:"2px 7px",fontSize:FS-3}} title="تعديل">✏️</Btn>
                    <Btn small onClick={()=>deleteFab(item)} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30",padding:"2px 7px",fontSize:FS-3}} title="حذف">🗑</Btn>
                  </>}
                  {type==="accessory"&&<>
                    <Btn small onClick={()=>editAcc(item)} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630",padding:"2px 7px",fontSize:FS-3}} title="تعديل">✏️</Btn>
                    <Btn small onClick={()=>deleteAcc(item)} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30",padding:"2px 7px",fontSize:FS-3}} title="حذف">🗑</Btn>
                  </>}
                </div>}
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>;
  };
  
  /* ──────── RENDER ──────── */
  return<div>
    {/* Header */}
    <div style={{display:"flex",flexWrap:"wrap",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:8}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:FS+4,fontWeight:800,color:T.text}}>📦 مركز المخازن</span>
        {!stockEnabled&&<span style={{padding:"3px 10px",borderRadius:8,fontSize:FS-2,fontWeight:700,background:T.warn+"15",color:T.warn,border:"1px solid "+T.warn+"40"}} title="يمكن التفعيل من تبويبة المشتريات">⚠️ مخزن الخامات غير مفعل</span>}
      </div>
    </div>
    
    {/* Sub-tabs */}
    <div style={{display:"flex",gap:4,marginBottom:12,borderBottom:"2px solid "+T.brd,flexWrap:"wrap"}}>
      {[
        {key:"overview",label:"🎯 نظرة عامة"},
        {key:"fabric",label:"🧵 الخامات",count:fabrics.length},
        {key:"accessory",label:"🪡 الإكسسوار",count:accessories.length},
        {key:"finished",label:"👕 الجاهز",count:wStats.finished.count},
        {key:"general",label:"➕ منتجات عامة",count:generalProducts.length},
        {key:"movements",label:"📊 سجل الحركات",count:stockMovements.length},
        {key:"units",label:"📏 الوحدات",count:getUnits(data).length}
      ].map(st=>{const active=subTab===st.key;return<div key={st.key} onClick={()=>setSubTab(st.key)} style={{padding:"8px 14px",cursor:"pointer",borderBottom:active?"3px solid "+T.accent:"3px solid transparent",marginBottom:-2,fontWeight:active?800:600,color:active?T.accent:T.textSec,fontSize:FS-1,display:"inline-flex",alignItems:"center",gap:6,whiteSpace:"nowrap"}}>
        <span>{st.label}</span>
        {st.count!==undefined&&<span style={{fontSize:FS-3,padding:"1px 6px",borderRadius:10,background:active?T.accent+"15":T.bg,color:active?T.accent:T.textMut}}>{st.count}</span>}
      </div>})}
    </div>
    
    {/* ════ OVERVIEW ════ */}
    {subTab==="overview"&&<>
      {/* Big stats */}
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(4,1fr)",gap:10,marginBottom:12}}>
        <div onClick={()=>setSubTab("fabric")} style={{padding:14,borderRadius:12,background:T.accent+"06",border:"1px solid "+T.accent+"20",cursor:"pointer"}}>
          <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4}}>🧵 الخامات</div>
          <div style={{fontSize:FS+6,fontWeight:800,color:T.accent}}>{fmt(r2(wStats.fabric.value))}</div>
          <div style={{fontSize:FS-3,color:T.textMut,marginTop:4}}>{wStats.fabric.count+" خامة"}{wStats.fabric.low+wStats.fabric.zero>0?" • "+(wStats.fabric.low+wStats.fabric.zero)+" ناقص":""}</div>
        </div>
        <div onClick={()=>setSubTab("accessory")} style={{padding:14,borderRadius:12,background:"#8B5CF606",border:"1px solid #8B5CF620",cursor:"pointer"}}>
          <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4}}>🪡 الإكسسوار</div>
          <div style={{fontSize:FS+6,fontWeight:800,color:"#8B5CF6"}}>{fmt(r2(wStats.accessory.value))}</div>
          <div style={{fontSize:FS-3,color:T.textMut,marginTop:4}}>{wStats.accessory.count+" صنف"}{wStats.accessory.low+wStats.accessory.zero>0?" • "+(wStats.accessory.low+wStats.accessory.zero)+" ناقص":""}</div>
        </div>
        <div onClick={()=>setSubTab("finished")} style={{padding:14,borderRadius:12,background:T.ok+"06",border:"1px solid "+T.ok+"20",cursor:"pointer"}}>
          <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4}}>👕 الجاهز</div>
          <div style={{fontSize:FS+6,fontWeight:800,color:T.ok}}>{fmt(wStats.finished.qty)}</div>
          <div style={{fontSize:FS-3,color:T.textMut,marginTop:4}}>{wStats.finished.count+" موديل • "+wStats.finished.qty+" قطعة"}</div>
        </div>
        <div onClick={()=>setSubTab("general")} style={{padding:14,borderRadius:12,background:"#EC489906",border:"1px solid #EC489920",cursor:"pointer"}}>
          <div style={{fontSize:FS-2,color:T.textSec,marginBottom:4}}>➕ منتجات عامة</div>
          <div style={{fontSize:FS+6,fontWeight:800,color:"#EC4899"}}>{fmt(r2(wStats.general.value))}</div>
          <div style={{fontSize:FS-3,color:T.textMut,marginTop:4}}>{wStats.general.count+" منتج"}{wStats.general.low+wStats.general.zero>0?" • "+(wStats.general.low+wStats.general.zero)+" ناقص":""}</div>
        </div>
      </div>
      
      {/* Total warehouse value */}
      <Card style={{marginBottom:12,background:"linear-gradient(135deg,"+T.accent+"08,#8B5CF608)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
          <div>
            <div style={{fontSize:FS-1,color:T.textSec,fontWeight:600}}>إجمالي قيمة المخازن</div>
            <div style={{fontSize:FS+10,fontWeight:800,color:T.accent}}>{fmt(r2(wStats.fabric.value+wStats.accessory.value+wStats.general.value))} ج.م</div>
            <div style={{fontSize:FS-2,color:T.textMut,marginTop:4}}>لا تشمل قيمة الجاهز (غير مُسعَّر بعد)</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <Btn small onClick={printStockSnapshot} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>🖨️ جرد شامل</Btn>
              <Btn small onClick={exportStockSnapshotCSV} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>📊 Excel</Btn>
            </div>
            <div style={{fontSize:48,lineHeight:1}}>📊</div>
          </div>
        </div>
      </Card>
      
      {/* Low stock alerts */}
      {(()=>{const alerts=[];
        fabrics.forEach(f=>{const s=Number(f.stock)||0;if(f.minStock&&s<=f.minStock)alerts.push({...f,_type:"fabric",_icon:"🧵",_color:T.accent})});
        accessories.forEach(a=>{const s=Number(a.stock)||0;if(a.minStock&&s<=a.minStock)alerts.push({...a,_type:"accessory",_icon:"🪡",_color:"#8B5CF6"})});
        generalProducts.forEach(p=>{const s=Number(p.stock)||0;if(p.minStock&&s<=p.minStock)alerts.push({...p,_type:"general",_icon:"➕",_color:"#EC4899"})});
        if(alerts.length===0)return null;
        return<Card title={"⚠️ تنبيهات — أصناف تحت الحد الأدنى ("+alerts.length+")"} style={{borderLeft:"3px solid "+T.err}}>
          <div style={{maxHeight:200,overflowY:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
              <tbody>{alerts.map(a=>{const stock=Number(a.stock)||0;const isZero=stock===0;
                return<tr key={a._type+a.id} style={{borderBottom:"1px solid "+T.brd}}>
                  <td style={{...TD,fontWeight:700}}>{a._icon} {a.name}</td>
                  <td style={{...TD,textAlign:"center",color:a._color,fontSize:FS-3}}>{a._type==="fabric"?"خامة":a._type==="accessory"?"إكسسوار":"منتج"}</td>
                  <td style={{...TD,textAlign:"center",fontWeight:800,color:isZero?T.err:T.warn}}>{fmt(stock)+" "+(a.unit||"")}</td>
                  <td style={{...TD,textAlign:"center",color:T.textMut}}>الحد الأدنى: {fmt(a.minStock)+" "+(a.unit||"")}</td>
                  <td style={{...TD,textAlign:"center"}}><span style={{padding:"2px 8px",borderRadius:8,fontSize:FS-3,fontWeight:700,background:isZero?T.err+"15":T.warn+"15",color:isZero?T.err:T.warn}}>{isZero?"نافذ":"ناقص"}</span></td>
                </tr>})}</tbody>
            </table>
          </div>
        </Card>;
      })()}
      
      {/* Recent movements preview */}
      {stockMovements.length>0&&<Card title="📊 آخر الحركات" extra={<Btn small ghost onClick={()=>setSubTab("movements")}>عرض الكل</Btn>} style={{marginTop:12}}>
        <div style={{maxHeight:280,overflowY:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
            <tbody>
              {stockMovements.slice().sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).slice(0,10).map(m=>{
                const info=m.type==="in"?{icon:"↓",color:T.ok,label:"دخول"}:m.type==="out"?{icon:"↑",color:T.err,label:"خروج"}:m.type==="opening"?{icon:"◉",color:T.accent,label:"رصيد ابتدائي"}:{icon:"⟲",color:T.warn,label:"تسوية"};
                const typeIcon=m.itemType==="fabric"?"🧵":m.itemType==="accessory"?"🪡":m.itemType==="general"?"➕":"👕";
                return<tr key={m.id} style={{borderBottom:"1px solid "+T.brd}}>
                  <td style={{...TD,fontSize:FS-2,color:T.textMut,whiteSpace:"nowrap"}}>{m.date}</td>
                  <td style={{...TD}}><span style={{padding:"2px 7px",borderRadius:8,fontSize:FS-3,fontWeight:700,background:info.color+"15",color:info.color}}>{info.icon+" "+info.label}</span></td>
                  <td style={{...TD,fontWeight:700}}>{typeIcon} {m.itemName||"—"}</td>
                  <td style={{...TD,textAlign:"center",fontWeight:700,color:info.color}}>{(m.type==="out"?"-":"+")+fmt(Math.abs(m.qty))+" "+(m.unit||"")}</td>
                  <td style={{...TD,fontSize:FS-2,color:T.textMut}}>{m.notes||m.sourceType||"—"}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </Card>}
      
      {/* Advanced reports — charts */}
      {stockMovements.length>0&&<div style={{marginTop:12}}>
        <div style={{fontSize:FS+2,fontWeight:800,color:T.text,marginBottom:10}}>📊 تقارير متقدمة</div>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:12,marginBottom:12}}>
          {/* Monthly trend chart */}
          <Card title="📅 الحركة الشهرية (6 شهور)">
            <div style={{display:"flex",alignItems:"flex-end",gap:6,height:140,padding:"10px 0"}}>
              {wReports.months.map((m,i)=>{const max=Math.max(...wReports.months.map(x=>Math.max(x.inValue,x.outValue)),1);const hIn=(m.inValue/max)*100;const hOut=(m.outValue/max)*100;
                return<div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                  <div style={{display:"flex",alignItems:"flex-end",gap:2,height:"100%",width:"100%",justifyContent:"center"}}>
                    <div style={{width:"45%",height:hIn+"%",minHeight:m.inValue>0?3:1,background:T.ok,borderRadius:"3px 3px 0 0"}} title={"دخول: "+fmt(m.inValue)+" ج"}/>
                    <div style={{width:"45%",height:hOut+"%",minHeight:m.outValue>0?3:1,background:T.err,borderRadius:"3px 3px 0 0"}} title={"خروج: "+fmt(m.outValue)+" ج"}/>
                  </div>
                  <div style={{fontSize:FS-3,color:T.textMut,textAlign:"center",whiteSpace:"nowrap"}}>{m.label}</div>
                </div>;
              })}
            </div>
            <div style={{display:"flex",gap:12,justifyContent:"center",marginTop:8,fontSize:FS-2}}>
              <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,background:T.ok,borderRadius:2}}></span> دخول</span>
              <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,background:T.err,borderRadius:2}}></span> خروج</span>
            </div>
          </Card>
          
          {/* Top consumed */}
          <Card title="🔥 الأعلى استهلاكاً (90 يوم)">
            {wReports.topConsumed.length===0?<div style={{padding:20,textAlign:"center",color:T.textMut}}>لا توجد حركات خروج في آخر 90 يوم</div>:<div>
              {wReports.topConsumed.slice(0,5).map((c,i)=>{const max=wReports.topConsumed[0].value||1;const pct=(c.value/max)*100;const typeIcon=c.itemType==="fabric"?"🧵":c.itemType==="accessory"?"🪡":"➕";
                return<div key={i} style={{marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,fontSize:FS-1}}>
                    <span style={{fontWeight:700}}>{(i+1)+". "+typeIcon+" "+c.itemName}</span>
                    <span style={{color:T.err,fontWeight:700}}>{fmt(c.qty)+" "+(c.unit||"")}</span>
                  </div>
                  <div style={{height:6,background:T.bg,borderRadius:3,overflow:"hidden"}}>
                    <div style={{height:"100%",width:pct+"%",background:T.err,borderRadius:3}}/>
                  </div>
                </div>;
              })}
            </div>}
          </Card>
        </div>
      </div>}
    </>}
    
    {/* ════ FABRIC SUB-TAB ════ */}
    {subTab==="fabric"&&<>
      <Card>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end",marginBottom:10}}>
          <div style={{flex:1,minWidth:160}}>
            <label style={{fontSize:FS-3,color:T.textSec,fontWeight:600}}>بحث</label>
            <Inp value={fabFilter} onChange={setFabFilter} placeholder="🔍 اسم الخامة..."/>
          </div>
          <div style={{minWidth:120}}>
            <label style={{fontSize:FS-3,color:T.textSec,fontWeight:600}}>ترتيب</label>
            <Sel value={sortBy} onChange={setSortBy}>
              <option value="name">الاسم</option>
              <option value="stock">الرصيد</option>
              <option value="value">القيمة</option>
              <option value="low">الناقص أولاً</option>
            </Sel>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:FS-1,padding:"8px 10px"}}>
            <input type="checkbox" checked={hideZero} onChange={e=>setHideZero(e.target.checked)}/>
            <span>إخفاء الأصناف الصفرية</span>
          </label>
          {canEdit&&<Btn primary small onClick={()=>setFabForm({name:"",unit:"كيلو",price:"",unit2:"",unit2Rate:"",_eid:null})}>+ قماش جديد</Btn>}
        </div>
        {renderItemTable(filteredFab,"fabric")}
      </Card>
    </>}
    
    {/* ════ ACCESSORY SUB-TAB ════ */}
    {subTab==="accessory"&&<>
      <Card>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end",marginBottom:10}}>
          <div style={{flex:1,minWidth:160}}>
            <label style={{fontSize:FS-3,color:T.textSec,fontWeight:600}}>بحث</label>
            <Inp value={accFilter} onChange={setAccFilter} placeholder="🔍 اسم الإكسسوار..."/>
          </div>
          <div style={{minWidth:120}}>
            <label style={{fontSize:FS-3,color:T.textSec,fontWeight:600}}>ترتيب</label>
            <Sel value={sortBy} onChange={setSortBy}>
              <option value="name">الاسم</option>
              <option value="stock">الرصيد</option>
              <option value="value">القيمة</option>
              <option value="low">الناقص أولاً</option>
            </Sel>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:FS-1,padding:"8px 10px"}}>
            <input type="checkbox" checked={hideZero} onChange={e=>setHideZero(e.target.checked)}/>
            <span>إخفاء الأصناف الصفرية</span>
          </label>
          {canEdit&&<Btn primary small onClick={()=>setAccForm({name:"",unit:"قطعة",price:"",unit2:"",unit2Rate:"",_eid:null})}>+ اكسسوار جديد</Btn>}
        </div>
        {renderItemTable(filteredAcc,"accessory")}
      </Card>
    </>}
    
    {/* ════ FINISHED SUB-TAB ════ */}
    {subTab==="finished"&&<Card>
      <div style={{padding:20,textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:10}}>👕</div>
        <div style={{fontSize:FS+2,fontWeight:700,color:T.text,marginBottom:6}}>مخزن المنتجات الجاهزة</div>
        <div style={{fontSize:FS-1,color:T.textSec,marginBottom:14}}>{/* V18.25: Standalone 'تسليم مخزن جاهز' tab removed — workflow consolidated into each order's detail page */}لإدارة تسليم المخزن الجاهز، افتح صفحة الأوردر المطلوب من تبويبة "أوامر القص" واستخدم زر "+ تسليم" داخل قسم تسليم مخزن جاهز</div>
      </div>
      
      {/* Finished goods summary table */}
      {wStats.finished.count>0&&<div style={{marginTop:16}}>
        <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:8}}>📋 موديلات لها رصيد جاهز</div>
        <div style={{overflowX:"auto",border:"1px solid "+T.brd,borderRadius:10}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
            <thead><tr>
              <th style={TH}>الموديل</th>
              <th style={{...TH,textAlign:"center"}}>عدد القطع المقصوصة</th>
              <th style={{...TH,textAlign:"center"}}>المسلم للعميل</th>
              <th style={{...TH,textAlign:"center"}}>الرصيد الجاهز</th>
              <th style={{...TH,textAlign:"center"}}>الحالة</th>
            </tr></thead>
            <tbody>
              {orders.filter(o=>{if(o.closed)return false;const t=calcOrder(o);const del=getConfirmedStock(o);return((t.cutQty||0)-del)>0}).sort((a,b)=>{const ta=calcOrder(a);const tb=calcOrder(b);const ba=(ta.cutQty||0)-getConfirmedStock(a);const bb=(tb.cutQty||0)-getConfirmedStock(b);return bb-ba}).map(o=>{
                const t=calcOrder(o);const del=getConfirmedStock(o);const bal=(t.cutQty||0)-del;
                return<tr key={o.id} style={{borderBottom:"1px solid "+T.brd}}>
                  <td style={{...TD,fontWeight:700}}>{o.modelNo||"—"}</td>
                  <td style={{...TD,textAlign:"center"}}>{fmt(t.cutQty||0)}</td>
                  <td style={{...TD,textAlign:"center",color:T.textSec}}>{fmt(del)}</td>
                  <td style={{...TD,textAlign:"center",fontWeight:800,color:T.ok,fontSize:FS}}>{fmt(bal)}</td>
                  <td style={{...TD,textAlign:"center",fontSize:FS-2,color:T.textMut}}>{o.status||"—"}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>}
    </Card>}
    
    {/* ════ GENERAL PRODUCTS SUB-TAB ════ */}
    {subTab==="general"&&<>
      <Card>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end",marginBottom:10}}>
          {canEdit&&<Btn primary onClick={openNewProd}>➕ منتج جديد</Btn>}
          {canEdit&&<Btn small onClick={()=>setShowImport(true)} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>📂 استيراد CSV</Btn>}
          {canEdit&&generalProducts.length>0&&<Btn small onClick={()=>bulkMode?exitBulkMode():enterBulkMode("general")} style={{background:bulkMode?.type==="general"?T.warn:"#8B5CF612",color:bulkMode?.type==="general"?"#fff":"#8B5CF6",border:"1px solid "+(bulkMode?.type==="general"?T.warn:"#8B5CF630")}}>{bulkMode?.type==="general"?"✕ إلغاء":"☑ تحديد جماعي"}</Btn>}
        </div>
        
        {/* Bulk toolbar */}
        {bulkMode?.type==="general"&&<div style={{padding:"10px 14px",background:T.warn+"08",border:"1px solid "+T.warn+"30",borderRadius:10,marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <div style={{fontSize:FS-1,fontWeight:600,color:T.textSec}}>
            ☑ محدد: <strong style={{color:T.warn,fontSize:FS}}>{bulkSelectedCount}</strong> من {filteredProd.length}
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <Btn small ghost onClick={()=>selectAllInList(filteredProd)}>☑ اختر الكل</Btn>
            <Btn small ghost onClick={deselectAll}>☐ إلغاء الكل</Btn>
            <Btn small onClick={()=>setShowBulkEdit(true)} disabled={bulkSelectedCount===0} style={{background:bulkSelectedCount>0?T.warn:T.bg,color:bulkSelectedCount>0?"#fff":T.textMut,border:"none"}}>✏️ تعديل المحدد ({bulkSelectedCount})</Btn>
          </div>
        </div>}
        
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end",marginBottom:10}}>
          <div style={{flex:1,minWidth:150}}>
            <label style={{fontSize:FS-3,color:T.textSec,fontWeight:600}}>بحث</label>
            <Inp value={prodFilter} onChange={setProdFilter} placeholder="🔍 اسم المنتج..."/>
          </div>
          <div style={{minWidth:140}}>
            <label style={{fontSize:FS-3,color:T.textSec,fontWeight:600}}>الفئة</label>
            <Sel value={prodCategoryF} onChange={setProdCategoryF}>
              <option value="">كل الفئات</option>
              {productCategories.map(c=><option key={c} value={c}>{c}</option>)}
            </Sel>
          </div>
          <div style={{minWidth:110}}>
            <label style={{fontSize:FS-3,color:T.textSec,fontWeight:600}}>ترتيب</label>
            <Sel value={sortBy} onChange={setSortBy}>
              <option value="name">الاسم</option>
              <option value="stock">الرصيد</option>
              <option value="value">القيمة</option>
            </Sel>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:FS-1,padding:"8px 10px"}}>
            <input type="checkbox" checked={hideZero} onChange={e=>setHideZero(e.target.checked)}/>
            <span>إخفاء الصفرية</span>
          </label>
        </div>
        {generalProducts.length===0?<div style={{padding:40,textAlign:"center",color:T.textMut}}>
          <div style={{fontSize:40,marginBottom:10}}>➕</div>
          <div style={{fontSize:FS+1,marginBottom:6}}>لا توجد منتجات عامة بعد</div>
          <div style={{fontSize:FS-2,marginBottom:12}}>أضف منتج (زيت ماكينات، كرتون، مستلزمات، إلخ)</div>
          {canEdit&&<Btn primary onClick={openNewProd}>➕ أضف أول منتج</Btn>}
        </div>:renderItemTable(filteredProd,"general")}
      </Card>
    </>}
    
    {/* ════ UNITS SUB-TAB (V16.59) ════
        Manages the master list of measurement units that appear in every
        unit-selection dropdown across the app (warehouse products, fabric
        defs, accessory defs, order form, purchase items). Backed by
        config.inventoryUnits — a plain string array. The getUnits() helper
        in src/utils/units.js handles the fallback to DEFAULT_UNITS plus any
        units already in use across inventoryItems[], so dropdowns work
        correctly even before this list is configured. */}
    {subTab==="units"&&(()=>{
      const currentList=getUnits(data);
      const isCustom=Array.isArray(data.inventoryUnits);
      const addUnit=async()=>{
        const name=await askInput("إضافة وحدة جديدة",{label:"اكتب اسم الوحدة",placeholder:"مثلاً: ميلي، جرام، رول صغير...",defaultValue:""});
        if(!name||!name.trim())return;
        const trimmed=name.trim();
        const list=isCustom?[...data.inventoryUnits]:[...currentList];
        if(list.includes(trimmed)){showToast("⚠️ الوحدة موجودة بالفعل");return}
        list.push(trimmed);
        upConfig(d=>{d.inventoryUnits=list});
        showToast("✓ تم إضافة الوحدة: "+trimmed);
      };
      const renameUnit=async(oldName)=>{
        const usage=countUnitUsage(data,oldName);
        const newName=await askInput("تعديل الوحدة",{label:"اكتب الاسم الجديد",defaultValue:oldName,message:usage>0?"هذه الوحدة مستخدمة في "+usage+" صنف — هيتم تحديث الأصناف تلقائياً":""});
        if(!newName||!newName.trim()||newName.trim()===oldName)return;
        const trimmed=newName.trim();
        const list=isCustom?[...data.inventoryUnits]:[...currentList];
        if(list.includes(trimmed)){showToast("⚠️ الوحدة الجديدة موجودة بالفعل");return}
        const idx=list.indexOf(oldName);
        if(idx>=0)list[idx]=trimmed;
        else list.push(trimmed);
        upConfig(d=>{
          d.inventoryUnits=list;
          /* Cascade rename: update any inventoryItems still using the old name. */
          if(usage>0&&Array.isArray(d.inventoryItems)){
            d.inventoryItems.forEach(it=>{if(it&&it.unit===oldName)it.unit=trimmed});
          }
        });
        showToast(usage>0?"✓ تم تعديل الوحدة وتحديث "+usage+" صنف":"✓ تم تعديل الوحدة");
      };
      const deleteUnit=async(name)=>{
        const usage=countUnitUsage(data,name);
        const msg=usage>0
          ?"⚠️ هذه الوحدة مستخدمة في "+usage+" صنف.\n\nالأصناف هتفضل بنفس الوحدة (مش هتتأثر) — هتختفي بس من القوائم المنسدلة.\n\nمتأكد؟"
          :"احذف وحدة \""+name+"\"؟";
        const ok=await ask("حذف وحدة",msg,{type:"warning",confirmText:"حذف"});
        if(!ok)return;
        const list=(isCustom?[...data.inventoryUnits]:[...currentList]).filter(u=>u!==name);
        upConfig(d=>{d.inventoryUnits=list});
        showToast("✓ تم الحذف");
      };
      const resetToDefaults=async()=>{
        const ok=await ask("استعادة الوحدات الافتراضية","هيتم استبدال القائمة الحالية بالوحدات الافتراضية:\n\n"+DEFAULT_UNITS.join(" • ")+"\n\nمتأكد؟",{type:"warning",confirmText:"استعادة"});
        if(!ok)return;
        upConfig(d=>{d.inventoryUnits=[...DEFAULT_UNITS]});
        showToast("✓ تم استعادة الوحدات الافتراضية");
      };
      return<Card title="📏 إدارة الوحدات">
        <div style={{fontSize:FS-2,color:T.textMut,marginBottom:14,lineHeight:1.7,padding:"10px 14px",background:T.accent+"08",borderRadius:8,border:"1px solid "+T.accent+"20"}}>
          💡 الوحدات اللي تضيفها هنا هتظهر في كل القوايم المنسدلة لاختيار الوحدة في كل البرنامج: المخزن، الخامات، الإكسسوار، أمر التشغيل، فاتورة المشتريات.
          {!isCustom&&<><br/>📌 القائمة الحالية مأخوذة من الوحدات الافتراضية + اللي بتستخدمها فعلاً في الأصناف. أضف أي وحدة لتثبيت قائمتك الخاصة.</>}
        </div>
        <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
          <Btn primary onClick={addUnit}>➕ إضافة وحدة جديدة</Btn>
          <Btn ghost onClick={resetToDefaults}>↻ استعادة الافتراضية</Btn>
        </div>
        {currentList.length===0
          ?<div style={{padding:30,textAlign:"center",color:T.textMut}}>لا توجد وحدات — اضغط "إضافة" للبدء</div>
          :<div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(4,1fr)",gap:8}}>
            {currentList.map(u=>{
              const usage=countUnitUsage(data,u);
              return<div key={u} style={{display:"flex",alignItems:"center",gap:6,padding:"10px 12px",borderRadius:10,background:T.bg,border:"1px solid "+T.brd}}>
                <span style={{flex:1,fontWeight:700,fontSize:FS,color:T.text}}>{u}</span>
                {usage>0&&<span style={{fontSize:FS-3,padding:"2px 8px",borderRadius:10,background:T.accent+"15",color:T.accent,fontWeight:700}} title="عدد الأصناف اللي بتستخدم الوحدة دي">{usage}</span>}
                <span onClick={()=>renameUnit(u)} style={{cursor:"pointer",fontSize:13,padding:"4px 6px",color:T.textSec}} title="تعديل">✏️</span>
                <span onClick={()=>deleteUnit(u)} style={{cursor:"pointer",fontSize:13,padding:"4px 6px",color:T.err}} title="حذف">🗑</span>
              </div>;
            })}
          </div>}
      </Card>;
    })()}
    
    {/* ════ MOVEMENTS SUB-TAB ════ */}
    {subTab==="movements"&&<Card>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end",marginBottom:10}}>
        <div style={{flex:1,minWidth:160}}>
          <label style={{fontSize:FS-3,color:T.textSec,fontWeight:600}}>بحث</label>
          <Inp value={movSearch} onChange={setMovSearch} placeholder="🔍 اسم الصنف، ملاحظات..."/>
        </div>
        <div style={{minWidth:120}}>
          <label style={{fontSize:FS-3,color:T.textSec,fontWeight:600}}>نوع الصنف</label>
          <Sel value={movCategory} onChange={setMovCategory}>
            <option value="">الكل</option>
            <option value="fabric">🧵 خامات</option>
            <option value="accessory">🪡 إكسسوار</option>
            <option value="general">➕ منتجات</option>
          </Sel>
        </div>
        <div style={{minWidth:110}}>
          <label style={{fontSize:FS-3,color:T.textSec,fontWeight:600}}>نوع الحركة</label>
          <Sel value={movType} onChange={setMovType}>
            <option value="">الكل</option>
            <option value="in">↓ دخول</option>
            <option value="out">↑ خروج</option>
            <option value="opening">◉ ابتدائي</option>
            <option value="adjust">⟲ تسوية</option>
          </Sel>
        </div>
        <div style={{minWidth:110}}>
          <label style={{fontSize:FS-3,color:T.textSec,fontWeight:600}}>من تاريخ</label>
          <Inp type="date" value={movDateFrom} onChange={setMovDateFrom}/>
        </div>
        <div style={{minWidth:110}}>
          <label style={{fontSize:FS-3,color:T.textSec,fontWeight:600}}>إلى تاريخ</label>
          <Inp type="date" value={movDateTo} onChange={setMovDateTo}/>
        </div>
        {(movSearch||movType||movCategory||movDateFrom||movDateTo)&&<Btn small ghost onClick={()=>{setMovSearch("");setMovType("");setMovCategory("");setMovDateFrom("");setMovDateTo("")}} style={{marginBottom:2}}>✕ مسح</Btn>}
      </div>
      
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:FS-2,color:T.textMut}}>إجمالي النتائج: <strong style={{color:T.accent,fontSize:FS}}>{filteredMovements.length}</strong> حركة</div>
        {filteredMovements.length>0&&<div style={{display:"flex",gap:6}}>
          <Btn small onClick={printMovementsReport} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>🖨️ طباعة التقرير</Btn>
          <Btn small onClick={exportMovementsCSV} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>📊 Excel</Btn>
        </div>}
      </div>
      
      {filteredMovements.length===0?<div style={{padding:40,textAlign:"center",color:T.textMut}}>
        {stockMovements.length===0?"لا توجد حركات بعد":"لا توجد نتائج لهذه الفلاتر"}
      </div>:<div style={{overflowX:"auto",maxHeight:"60vh",overflowY:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
          <thead style={{position:"sticky",top:0,background:T.cardSolid,zIndex:1}}><tr>
            <th style={TH}>التاريخ</th>
            <th style={TH}>نوع الصنف</th>
            <th style={TH}>الحركة</th>
            <th style={TH}>الصنف</th>
            <th style={{...TH,textAlign:"center"}}>الكمية</th>
            <th style={{...TH,textAlign:"center"}}>السعر</th>
            <th style={TH}>المرجع</th>
            <th style={TH}>بواسطة</th>
          </tr></thead>
          <tbody>
            {filteredMovements.map(m=>{const info=m.type==="in"?{icon:"↓",color:T.ok,label:"دخول"}:m.type==="out"?{icon:"↑",color:T.err,label:"خروج"}:m.type==="opening"?{icon:"◉",color:T.accent,label:"رصيد ابتدائي"}:{icon:"⟲",color:T.warn,label:"تسوية"};
              const typeIcon=m.itemType==="fabric"?"🧵 خامة":m.itemType==="accessory"?"🪡 إكسسوار":m.itemType==="general"?"➕ منتج":"👕 جاهز";
              const typeColor=m.itemType==="fabric"?T.accent:m.itemType==="accessory"?"#8B5CF6":m.itemType==="general"?"#EC4899":T.ok;
              return<tr key={m.id} style={{borderBottom:"1px solid "+T.brd}}>
                <td style={{...TD,fontSize:FS-2,color:T.textMut,whiteSpace:"nowrap"}}>{m.date}</td>
                <td style={{...TD}}><span style={{padding:"2px 6px",borderRadius:6,fontSize:FS-3,fontWeight:600,background:typeColor+"15",color:typeColor}}>{typeIcon}</span></td>
                <td style={{...TD}}><span style={{padding:"2px 8px",borderRadius:8,fontSize:FS-3,fontWeight:700,background:info.color+"15",color:info.color}}>{info.icon+" "+info.label}</span></td>
                <td style={{...TD,fontWeight:700}}>{m.itemName||"—"}</td>
                <td style={{...TD,textAlign:"center",fontWeight:700,color:info.color}}>{(m.type==="out"?"-":"+")+fmt(Math.abs(m.qty))+" "+(m.unit||"")}</td>
                <td style={{...TD,textAlign:"center",color:T.textSec}}>{m.price?fmt(r2(m.price)):"—"}</td>
                <td style={{...TD,fontSize:FS-2,color:T.textMut}}>{m.notes||m.sourceType||"—"}</td>
                <td style={{...TD,fontSize:FS-2,color:T.textMut}}>{m.createdBy||"—"}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>}
    </Card>}
    
    {/* ════ NEW/EDIT PRODUCT POPUP ════ */}
    {showProdForm&&prodForm&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowProdForm(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:20,width:"100%",maxWidth:500,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:"#EC4899"}}>➕ {prodForm.id?"تعديل المنتج":"منتج جديد"}</div>
          <Btn ghost small onClick={()=>setShowProdForm(false)}>✕</Btn>
        </div>
        
        <div style={{display:"grid",gridTemplateColumns:"1fr",gap:10,marginBottom:12}}>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>اسم المنتج <span style={{color:T.err}}>*</span></label>
            <Inp value={prodForm.name} onChange={v=>setProdForm(p=>({...p,name:v}))} placeholder="مثال: زيت ماكينات SAE 30"/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>الفئة</label>
              <Sel value={prodForm.category} onChange={v=>setProdForm(p=>({...p,category:v}))}>
                {productCategories.map(c=><option key={c} value={c}>{c}</option>)}
              </Sel>
            </div>
            <div>
              <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>الوحدة الأساسية</label>
              <Sel value={prodForm.unit||""} onChange={v=>setProdForm(p=>({...p,unit:v}))}>
                {getUnits(data,prodForm.unit).map(u=><option key={u} value={u}>{u}</option>)}
              </Sel>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>سعر البيع (اختياري)</label>
              <Inp type="number" value={prodForm.price||""} onChange={v=>setProdForm(p=>({...p,price:v}))} placeholder="0"/>
            </div>
            <div>
              <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>الحد الأدنى</label>
              <Inp type="number" value={prodForm.minStock||""} onChange={v=>setProdForm(p=>({...p,minStock:v}))} placeholder="0"/>
            </div>
          </div>
          {/* V21.21.52: وحدة فرعية اختيارية + معدل التحويل (الرصيد يفضل بالوحدة الأساسية) */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>وحدة فرعية (اختياري)</label>
              <Sel value={prodForm.unit2||""} onChange={v=>setProdForm(p=>({...p,unit2:v}))}>
                <option value="">— بدون —</option>
                {getUnits(data,prodForm.unit2).filter(u=>u!==prodForm.unit).map(u=><option key={u} value={u}>{u}</option>)}
              </Sel>
            </div>
            <div>
              <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>معدل التحويل</label>
              <Inp type="number" value={prodForm.unit2Rate||""} onChange={v=>setProdForm(p=>({...p,unit2Rate:v}))} placeholder="مثال: 2"/>
            </div>
          </div>
          {prodForm.unit2&&Number(prodForm.unit2Rate)>0&&<div style={{fontSize:FS-2,color:"#EC4899",fontWeight:700,background:"#EC489910",borderRadius:8,padding:"6px 10px",textAlign:"center"}}>1 {prodForm.unit||"؟"} = {fmt(Number(prodForm.unit2Rate))} {prodForm.unit2}</div>}
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>ملاحظات</label>
            <textarea value={prodForm.notes||""} onChange={e=>setProdForm(p=>({...p,notes:e.target.value}))} placeholder="وصف المنتج، مورد، إلخ..." style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"inherit",background:T.cardSolid,color:T.text,boxSizing:"border-box",resize:"vertical",minHeight:50}}/>
          </div>
          {!prodForm.id&&<div style={{padding:10,background:T.accent+"08",borderRadius:8,fontSize:FS-1,color:T.textSec}}>💡 بعد الحفظ، أضف الرصيد الابتدائي من "حركة جديدة ⇅"</div>}
        </div>
        
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <Btn ghost onClick={()=>setShowProdForm(false)}>إلغاء</Btn>
          <Btn primary onClick={saveProd} style={{background:"#EC4899",color:"#fff",border:"none"}}>💾 {prodForm.id?"حفظ":"إضافة"}</Btn>
        </div>
      </div>
    </div>}
    
    {/* ════ V16.77: FABRIC FORM POPUP (moved from DBPg) ════ */}
    {fabForm&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setFabForm(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:420,border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)"}}>
        <div style={{fontSize:FS+2,fontWeight:800,color:T.accent,marginBottom:14}}>{fabForm._eid?"✏️ تعديل القماش":"+ قماش جديد"}</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec}}>اسم القماش</label>
            <Inp value={fabForm.name} onChange={v=>setFabForm({...fabForm,name:v})}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div>
              <label style={{fontSize:FS-2,color:T.textSec}}>الوحدة الأساسية</label>
              <Sel value={fabForm.unit} onChange={v=>setFabForm({...fabForm,unit:v})}>
                {getUnits(data,fabForm.unit).map(u=><option key={u} value={u}>{u}</option>)}
              </Sel>
            </div>
            <div>
              <label style={{fontSize:FS-2,color:T.textSec}}>السعر (لكل وحدة أساسية)</label>
              <Inp value={fabForm.price} onChange={v=>setFabForm({...fabForm,price:v})} type="number"/>
            </div>
          </div>
          {/* V21.21.52: وحدة فرعية اختيارية + معدل التحويل (الرصيد يفضل بالوحدة الأساسية) */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div>
              <label style={{fontSize:FS-2,color:T.textSec}}>وحدة فرعية (اختياري)</label>
              <Sel value={fabForm.unit2||""} onChange={v=>setFabForm({...fabForm,unit2:v})}>
                <option value="">— بدون —</option>
                {getUnits(data,fabForm.unit2).filter(u=>u!==fabForm.unit).map(u=><option key={u} value={u}>{u}</option>)}
              </Sel>
            </div>
            <div>
              <label style={{fontSize:FS-2,color:T.textSec}}>معدل التحويل</label>
              <Inp value={fabForm.unit2Rate} onChange={v=>setFabForm({...fabForm,unit2Rate:v})} type="number" placeholder="مثال: 2"/>
            </div>
          </div>
          {fabForm.unit2&&Number(fabForm.unit2Rate)>0&&<div style={{fontSize:FS-2,color:T.accent,fontWeight:700,background:T.accent+"10",borderRadius:8,padding:"6px 10px",textAlign:"center"}}>1 {fabForm.unit||"؟"} = {fmt(Number(fabForm.unit2Rate))} {fabForm.unit2}</div>}
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}>
            <Btn ghost onClick={()=>setFabForm(null)}>إلغاء</Btn>
            <Btn primary onClick={saveFab}>💾 {fabForm._eid?"حفظ التعديلات":"إضافة"}</Btn>
          </div>
        </div>
      </div>
    </div>}
    
    {/* ════ V16.77: ACCESSORY FORM POPUP (moved from DBPg) ════ */}
    {accForm&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setAccForm(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:420,border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)"}}>
        <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6",marginBottom:14}}>{accForm._eid?"✏️ تعديل الإكسسوار":"+ اكسسوار جديد"}</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec}}>الوصف</label>
            <Inp value={accForm.name} onChange={v=>setAccForm({...accForm,name:v})}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div>
              <label style={{fontSize:FS-2,color:T.textSec}}>الوحدة الأساسية</label>
              <Sel value={accForm.unit} onChange={v=>setAccForm({...accForm,unit:v})}>
                {getUnits(data,accForm.unit).map(u=><option key={u} value={u}>{u}</option>)}
              </Sel>
            </div>
            <div>
              <label style={{fontSize:FS-2,color:T.textSec}}>السعر (لكل وحدة أساسية)</label>
              <Inp value={accForm.price} onChange={v=>setAccForm({...accForm,price:v})} type="number"/>
            </div>
          </div>
          {/* V21.21.52: وحدة فرعية اختيارية + معدل التحويل */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div>
              <label style={{fontSize:FS-2,color:T.textSec}}>وحدة فرعية (اختياري)</label>
              <Sel value={accForm.unit2||""} onChange={v=>setAccForm({...accForm,unit2:v})}>
                <option value="">— بدون —</option>
                {getUnits(data,accForm.unit2).filter(u=>u!==accForm.unit).map(u=><option key={u} value={u}>{u}</option>)}
              </Sel>
            </div>
            <div>
              <label style={{fontSize:FS-2,color:T.textSec}}>معدل التحويل</label>
              <Inp value={accForm.unit2Rate} onChange={v=>setAccForm({...accForm,unit2Rate:v})} type="number" placeholder="مثال: 2"/>
            </div>
          </div>
          {accForm.unit2&&Number(accForm.unit2Rate)>0&&<div style={{fontSize:FS-2,color:"#8B5CF6",fontWeight:700,background:"#8B5CF610",borderRadius:8,padding:"6px 10px",textAlign:"center"}}>1 {accForm.unit||"؟"} = {fmt(Number(accForm.unit2Rate))} {accForm.unit2}</div>}
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}>
            <Btn ghost onClick={()=>setAccForm(null)}>إلغاء</Btn>
            <Btn primary onClick={saveAcc} style={{background:"#8B5CF6",color:"#fff",border:"none"}}>💾 {accForm._eid?"حفظ التعديلات":"إضافة"}</Btn>
          </div>
        </div>
      </div>
    </div>}
    
    {/* ════ MANUAL MOVEMENT POPUP ════ */}
    {showMoveForm&&moveForm&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowMoveForm(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:20,width:"100%",maxWidth:500,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:T.ok}}>⇅ حركة مخزن — {moveForm.itemName}</div>
          <Btn ghost small onClick={()=>setShowMoveForm(false)}>✕</Btn>
        </div>
        
        {/* Current stock info */}
        {(()=>{const listKey=moveForm.itemType==="fabric"?"fabrics":moveForm.itemType==="accessory"?"accessories":"generalProducts";const item=(data[listKey]||[]).find(x=>String(x.id)===String(moveForm.itemId));const stock=Number(item?.stock)||0;
          return<div style={{padding:10,background:T.bg,borderRadius:8,marginBottom:12,fontSize:FS-1}}>الرصيد الحالي: <strong style={{color:T.accent}}>{fmt(stock)+" "+(moveForm.unit||"")}</strong></div>;
        })()}
        
        {/* Movement type */}
        <div style={{marginBottom:12}}>
          <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:6}}>نوع الحركة</label>
          <div style={{display:"flex",gap:6}}>
            {[{key:"in",label:"↓ دخول (إضافة للمخزن)",color:T.ok},{key:"out",label:"↑ خروج (صرف)",color:T.err},{key:"adjust",label:"⟲ تسوية (تحديد رصيد جديد)",color:T.warn}].map(mt=>{const active=moveForm.type===mt.key;
              return<div key={mt.key} onClick={()=>setMoveForm(p=>({...p,type:mt.key}))} style={{flex:1,padding:"8px 10px",borderRadius:10,cursor:"pointer",fontWeight:700,fontSize:FS-2,background:active?mt.color:T.bg,color:active?"#fff":T.text,border:"1px solid "+(active?mt.color:T.brd),textAlign:"center"}}>{mt.label}</div>;
            })}
          </div>
        </div>
        
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>{moveForm.type==="adjust"?"الرصيد الجديد":"الكمية"} <span style={{color:T.err}}>*</span></label>
            <Inp type="number" value={moveForm.qty||""} onChange={v=>setMoveForm(p=>({...p,qty:v}))} placeholder="0"/>
          </div>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>التاريخ</label>
            <Inp type="date" value={moveForm.date} onChange={v=>setMoveForm(p=>({...p,date:v}))}/>
          </div>
        </div>
        
        {moveForm.type==="in"&&<div style={{marginBottom:12}}>
          <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>سعر الوحدة (لحساب متوسط التكلفة)</label>
          <Inp type="number" value={moveForm.price||""} onChange={v=>setMoveForm(p=>({...p,price:v}))} placeholder="0"/>
        </div>}
        
        <div style={{marginBottom:14}}>
          <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>ملاحظات</label>
          <textarea value={moveForm.notes||""} onChange={e=>setMoveForm(p=>({...p,notes:e.target.value}))} placeholder="سبب الحركة، مصدر، إلخ..." style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"inherit",background:T.cardSolid,color:T.text,boxSizing:"border-box",resize:"vertical",minHeight:50}}/>
        </div>
        
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <Btn ghost onClick={()=>setShowMoveForm(false)}>إلغاء</Btn>
          <Btn primary onClick={saveMovement}>💾 حفظ الحركة</Btn>
        </div>
      </div>
    </div>}
    
    {/* ════ VIEW PRODUCT POPUP (from QR scan or click) ════ */}
    {viewProd&&(()=>{
      const stock=Number(viewProd.stock)||0;
      const cost=Number(viewProd.avgCost)||Number(viewProd.price)||0;
      const isLow=viewProd.minStock&&stock<=viewProd.minStock;
      const isZero=stock===0;
      const statusColor=isZero?T.err:isLow?T.warn:T.ok;
      const statusLabel=isZero?"نافذ":isLow?"ناقص":"متاح";
      /* Last 5 movements for this product */
      const prodMoves=stockMovements.filter(m=>m.itemType==="general"&&String(m.itemId)===String(viewProd.id)).sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).slice(0,5);
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setViewProd(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:20,width:"100%",maxWidth:600,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
            <div>
              <div style={{fontSize:FS+4,fontWeight:800,color:"#EC4899"}}>➕ {viewProd.name}</div>
              <div style={{fontSize:FS-1,color:T.textMut,marginTop:4,display:"flex",gap:8,flexWrap:"wrap"}}>
                <span style={{padding:"2px 8px",borderRadius:6,background:"#EC489915",color:"#EC4899",fontWeight:700}}>{viewProd.category||"—"}</span>
                <span style={{padding:"2px 8px",borderRadius:6,background:statusColor+"15",color:statusColor,fontWeight:700}}>{statusLabel}</span>
              </div>
            </div>
            <Btn ghost small onClick={()=>setViewProd(null)}>✕</Btn>
          </div>
          
          {/* Stats grid */}
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(4,1fr)",gap:10,marginBottom:14}}>
            <div style={{padding:12,borderRadius:10,background:statusColor+"08",border:"1px solid "+statusColor+"20"}}>
              <div style={{fontSize:FS-3,color:T.textSec}}>الرصيد الحالي</div>
              <div style={{fontSize:FS+6,fontWeight:800,color:statusColor}}>{fmt(stock)}</div>
              <div style={{fontSize:FS-3,color:T.textMut}}>{viewProd.unit||"—"}{hasDualUnit(viewProd)&&" ≈ "+fmt(r2(baseToSecondary(viewProd,stock)))+" "+viewProd.unit2}</div>
            </div>
            <div style={{padding:12,borderRadius:10,background:T.bg}}>
              <div style={{fontSize:FS-3,color:T.textSec}}>متوسط التكلفة</div>
              <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>{fmt(r2(cost))}</div>
              <div style={{fontSize:FS-3,color:T.textMut}}>ج.م/{viewProd.unit||"—"}</div>
            </div>
            <div style={{padding:12,borderRadius:10,background:T.bg}}>
              <div style={{fontSize:FS-3,color:T.textSec}}>القيمة الإجمالية</div>
              <div style={{fontSize:FS+2,fontWeight:800,color:"#EC4899"}}>{fmt(r2(stock*cost))}</div>
              <div style={{fontSize:FS-3,color:T.textMut}}>ج.م</div>
            </div>
            <div style={{padding:12,borderRadius:10,background:T.bg}}>
              <div style={{fontSize:FS-3,color:T.textSec}}>الحد الأدنى</div>
              <div style={{fontSize:FS+2,fontWeight:800,color:T.warn}}>{viewProd.minStock?fmt(viewProd.minStock):"—"}</div>
              <div style={{fontSize:FS-3,color:T.textMut}}>{viewProd.unit||""}</div>
            </div>
          </div>
          
          {/* Quick action buttons */}
          {canEdit&&<div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
            <Btn primary onClick={()=>{setViewProd(null);openMoveForm("general",viewProd)}} style={{flex:1,minWidth:120,background:T.ok,color:"#fff",border:"none"}}>⇅ حركة سريعة</Btn>
            <Btn onClick={()=>{setViewProd(null);editProd(viewProd)}} style={{flex:1,minWidth:100,background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>✏️ تعديل</Btn>
            <Btn onClick={()=>printProductQR(viewProd)} style={{flex:1,minWidth:100,background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630"}}>📱 QR</Btn>
          </div>}
          
          {viewProd.notes&&<div style={{padding:10,background:"#F59E0B08",borderRadius:8,fontSize:FS-1,color:T.textSec,marginBottom:12}}>📝 {viewProd.notes}</div>}
          
          {/* Last movements */}
          {prodMoves.length>0&&<div>
            <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:6}}>📊 آخر 5 حركات</div>
            <div style={{border:"1px solid "+T.brd,borderRadius:8,overflow:"hidden"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
                <tbody>
                  {prodMoves.map(m=>{const info=m.type==="in"?{icon:"↓",color:T.ok,label:"دخول"}:m.type==="out"?{icon:"↑",color:T.err,label:"خروج"}:m.type==="opening"?{icon:"◉",color:T.accent,label:"ابتدائي"}:{icon:"⟲",color:T.warn,label:"تسوية"};
                    return<tr key={m.id} style={{borderBottom:"1px solid "+T.brd}}>
                      <td style={{...TD,fontSize:FS-2,color:T.textMut,whiteSpace:"nowrap"}}>{m.date}</td>
                      <td style={{...TD}}><span style={{padding:"2px 7px",borderRadius:8,fontSize:FS-3,fontWeight:700,background:info.color+"15",color:info.color}}>{info.icon+" "+info.label}</span></td>
                      <td style={{...TD,textAlign:"center",fontWeight:700,color:info.color}}>{(m.type==="out"?"-":"+")+fmt(Math.abs(m.qty))+" "+(m.unit||"")}</td>
                      <td style={{...TD,fontSize:FS-2,color:T.textMut}}>{m.notes||"—"}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </div>}
        </div>
      </div>;
    })()}
    
    {/* ════ CSV IMPORT POPUP ════ */}
    {showImport&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>{setShowImport(false);setImportData(null)}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:20,width:"100%",maxWidth:700,maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:T.ok}}>📂 استيراد منتجات من CSV</div>
          <Btn ghost small onClick={()=>{setShowImport(false);setImportData(null)}}>✕</Btn>
        </div>
        
        {!importData?<>
          {/* Instructions */}
          <div style={{padding:14,background:T.accent+"08",borderRadius:10,marginBottom:14,fontSize:FS-1,lineHeight:1.7}}>
            <div style={{fontWeight:700,marginBottom:6}}>📋 صيغة الملف المتوقعة:</div>
            <div style={{fontSize:FS-2,color:T.textSec}}>الأعمدة المطلوبة (بأي ترتيب): <strong>الاسم</strong> (إجباري)</div>
            <div style={{fontSize:FS-2,color:T.textSec}}>اختياري: الفئة، الوحدة، الرصيد، الحد الأدنى، السعر، ملاحظات</div>
            <div style={{marginTop:8,padding:8,background:T.cardSolid,borderRadius:6,fontSize:FS-3,fontFamily:"monospace",direction:"ltr"}}>
              الاسم,الفئة,الوحدة,الرصيد,الحد الأدنى,السعر,ملاحظات<br/>
              زيت ماكينات SAE 30,مستلزمات تشغيل,لتر,20,5,50,زيت شهري<br/>
              كرتون تعبئة,ورق وكرتون,قطعة,500,100,3,
            </div>
            <div style={{marginTop:8,fontSize:FS-3,color:T.warn}}>⚠️ المنتجات بنفس الاسم سيتم تخطيها (مش هيحصل duplicate)</div>
          </div>
          
          {/* File upload */}
          <div style={{padding:30,textAlign:"center",border:"2px dashed "+T.brd,borderRadius:12,background:T.bg}}>
            <div style={{fontSize:40,marginBottom:10}}>📁</div>
            <div style={{fontSize:FS,color:T.textSec,marginBottom:14}}>اختر ملف CSV من جهازك</div>
            <input type="file" accept=".csv,text/csv" id="csv-upload-input" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)parseCSVFile(f);e.target.value=""}}/>
            <Btn primary onClick={()=>document.getElementById("csv-upload-input")?.click()} style={{background:T.ok,color:"#fff",border:"none"}}>📂 اختر ملف</Btn>
          </div>
          
          {/* Download template */}
          <div style={{marginTop:12,padding:10,background:T.bg,borderRadius:8,fontSize:FS-2,color:T.textMut,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>💡 محتاج قالب جاهز؟</span>
            <Btn small ghost onClick={()=>{const BOM="\uFEFF";const csv=BOM+"الاسم,الفئة,الوحدة,الرصيد,الحد الأدنى,السعر,ملاحظات\nزيت ماكينات SAE 30,مستلزمات تشغيل,لتر,20,5,50,\nكرتون تعبئة,ورق وكرتون,قطعة,500,100,3,";const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="products-template.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),500);showToast("تم تحميل القالب")}}>تحميل قالب فارغ</Btn>
          </div>
        </>:<>
          {/* Preview */}
          <div style={{flex:1,overflowY:"auto",border:"1px solid "+T.brd,borderRadius:10}}>
            {importData.errors.length>0&&<div style={{padding:10,background:T.err+"08",borderBottom:"1px solid "+T.err+"20",fontSize:FS-2,color:T.err}}>
              {importData.errors.map((err,i)=><div key={i}>⚠️ {err}</div>)}
            </div>}
            {importData.rows.length===0?<div style={{padding:40,textAlign:"center",color:T.textMut}}>لا توجد منتجات صالحة في الملف</div>:<table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-2}}>
              <thead style={{position:"sticky",top:0,background:T.cardSolid,zIndex:1}}><tr>
                <th style={TH}>الاسم</th>
                <th style={TH}>الفئة</th>
                <th style={{...TH,textAlign:"center"}}>الوحدة</th>
                <th style={{...TH,textAlign:"center"}}>الرصيد</th>
                <th style={{...TH,textAlign:"center"}}>حد أدنى</th>
                <th style={{...TH,textAlign:"center"}}>السعر</th>
              </tr></thead>
              <tbody>
                {importData.rows.map((r,i)=>{const isDup=generalProducts.some(p=>(p.name||"").trim().toLowerCase()===r.name.toLowerCase());
                  return<tr key={i} style={{borderBottom:"1px solid "+T.brd,background:isDup?T.warn+"08":"transparent"}}>
                    <td style={{...TD,fontWeight:700}}>{r.name}{isDup&&<span style={{fontSize:FS-3,color:T.warn,marginRight:6}}>⚠️ مكرر</span>}</td>
                    <td style={{...TD,color:T.textSec}}>{r.category}</td>
                    <td style={{...TD,textAlign:"center",color:T.textSec}}>{r.unit}</td>
                    <td style={{...TD,textAlign:"center",fontWeight:700}}>{fmt(r.stock)}</td>
                    <td style={{...TD,textAlign:"center",color:T.textMut}}>{fmt(r.minStock)}</td>
                    <td style={{...TD,textAlign:"center"}}>{fmt(r2(r.price))}</td>
                  </tr>;
                })}
              </tbody>
            </table>}
          </div>
          
          {(()=>{const newCount=importData.rows.filter(r=>!generalProducts.some(p=>(p.name||"").trim().toLowerCase()===r.name.toLowerCase())).length;const dupCount=importData.rows.length-newCount;
            return<div style={{padding:10,background:T.bg,borderRadius:8,marginTop:12,fontSize:FS-1,display:"flex",gap:14,flexWrap:"wrap"}}>
              <span>📊 الإجمالي: <strong>{importData.rows.length}</strong></span>
              <span style={{color:T.ok}}>✅ جديد: <strong>{newCount}</strong></span>
              {dupCount>0&&<span style={{color:T.warn}}>⚠️ مكرر: <strong>{dupCount}</strong></span>}
            </div>;
          })()}
          
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14,paddingTop:12,borderTop:"1px solid "+T.brd}}>
            <Btn ghost onClick={()=>setImportData(null)}>← رجوع</Btn>
            <Btn primary onClick={confirmImport} disabled={importData.rows.length===0} style={{background:importData.rows.length>0?T.ok:T.bg,color:importData.rows.length>0?"#fff":T.textMut,border:"none"}}>💾 استيراد</Btn>
          </div>
        </>}
      </div>
    </div>}
    
    {/* ════ BULK EDIT POPUP ════ */}
    {showBulkEdit&&bulkMode&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowBulkEdit(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:20,width:"100%",maxWidth:480,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:T.warn}}>✏️ تعديل جماعي — {bulkSelectedCount} منتج</div>
          <Btn ghost small onClick={()=>setShowBulkEdit(false)}>✕</Btn>
        </div>
        
        <div style={{padding:10,background:T.warn+"08",borderRadius:8,marginBottom:14,fontSize:FS-1,color:T.textSec}}>⚠️ سيتم التعديل على <strong>{bulkSelectedCount}</strong> منتج دفعة واحدة. لا يمكن التراجع.</div>
        
        <div style={{marginBottom:12}}>
          <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>الحقل المراد تعديله</label>
          <Sel value={bulkEditForm.field} onChange={v=>setBulkEditForm(p=>({...p,field:v}))}>
            <option value="minStock">الحد الأدنى</option>
            <option value="price">سعر البيع</option>
          </Sel>
        </div>
        
        <div style={{marginBottom:12}}>
          <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:6}}>نوع العملية</label>
          <div style={{display:"flex",gap:6}}>
            {[{key:"set",label:"تعيين إلى"},{key:"add",label:"إضافة"},{key:"multiply",label:"ضرب في"}].map(o=>{const active=bulkEditForm.operation===o.key;
              return<div key={o.key} onClick={()=>setBulkEditForm(p=>({...p,operation:o.key}))} style={{flex:1,padding:"8px 12px",borderRadius:10,cursor:"pointer",fontWeight:700,fontSize:FS-2,background:active?T.accent:T.bg,color:active?"#fff":T.text,border:"1px solid "+(active?T.accent:T.brd),textAlign:"center"}}>{o.label}</div>;
            })}
          </div>
        </div>
        
        <div style={{marginBottom:14}}>
          <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>القيمة</label>
          <Inp type="number" value={bulkEditForm.value} onChange={v=>setBulkEditForm(p=>({...p,value:v}))} placeholder="0"/>
          <div style={{fontSize:FS-3,color:T.textMut,marginTop:6}}>
            {bulkEditForm.operation==="set"&&"مثال: سيتم جعل القيمة = "+bulkEditForm.value+" لكل المنتجات المحددة"}
            {bulkEditForm.operation==="add"&&"مثال: ستتم إضافة "+bulkEditForm.value+" للقيمة الحالية (اسلب لطرح)"}
            {bulkEditForm.operation==="multiply"&&"مثال: ستتم ضرب القيمة الحالية × "+bulkEditForm.value+" (مفيد لزيادة الأسعار %10 = ×1.1)"}
          </div>
        </div>
        
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <Btn ghost onClick={()=>setShowBulkEdit(false)}>إلغاء</Btn>
          <Btn primary onClick={applyBulkEdit} style={{background:T.warn,color:"#fff",border:"none"}}>✏️ تطبيق</Btn>
        </div>
      </div>
    </div>}
    
  </div>;
}

/* ═══════════════════════════════════════════════════════════════
   PURCHASE PAGE — قسم المشتريات
   Session 1: Stock Overview + Feature Toggle + Opening Balance
   ═══════════════════════════════════════════════════════════════ */
/* PurchasePg moved to pages/PurchasePg.jsx (V15.0 phase 2) */
/* TreasuryPg moved to pages/TreasuryPg.jsx (V15.0 phase 2) */
/* HRPg moved to pages/HRPg.jsx (V15.0 phase 2) */
