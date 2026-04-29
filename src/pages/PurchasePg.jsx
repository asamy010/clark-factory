/* ═══════════════════════════════════════════════════════════════
   CLARK - PurchasePg
   
   Extracted from App.jsx in V15.0 phase 2.
   Dependencies imported explicitly — no code changes inside.
   ═══════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { FS, PRINT_CSS } from "../constants/index.js";
import { gid, fmt, r2, normalizePhone, dayName } from "../utils/format.js";
import { ask, tell, showToast } from "../utils/popups.js";
import { getCategories, getCategoryById, getItemsForCategory, addCategory, updateCategory, deleteCategory, addTypeToCategory, removeTypeFromCategory, addInventoryItem, updateInventoryItem, deleteInventoryItem, applyStockDelta } from "../utils/categories.js";
import { Btn, Inp, Sel, SearchSel, Card, useDebounced } from "../components/ui.jsx";
import { T, TH, TD } from "../theme.js";
import { openPrintWindow } from "../utils/print.js";
import { getUnits } from "../utils/units.js";
import { formatBlockerMessage, getDeleteBlocker, canForceDelete, summarizeForceDelete, forceDeleteCleanup } from "../utils/dataIntegrity.js";
import { buildPurchaseInvoiceFromReceipt, findInvoiceByReceipt } from "../utils/invoices.js";

export function PurchasePg({data,upConfig,isMob,isTab,canEdit,user,userRole}){
  const userName=user?.displayName||(user?.email||"").split("@")[0];
  const today=new Date().toISOString().split("T")[0];
  const[subTab,setSubTab]=useState("receipts");
  /* V16.31: categories management popups */
  const[catEditPopup,setCatEditPopup]=useState(null);/* null | {id?,name,emoji} for create/edit */
  const[catTypesPopup,setCatTypesPopup]=useState(null);/* null | {categoryId} */
  const[itemEditPopup,setItemEditPopup]=useState(null);/* null | {id?,categoryId,name,type,unit,minStock,avgCost,defaultSupplierId,notes} */
  const[showActivate,setShowActivate]=useState(false);
  const[showOpeningBal,setShowOpeningBal]=useState(false);
  const[openingData,setOpeningData]=useState({});/* {itemId: {qty, cost}} */
  const[openingType,setOpeningType]=useState("fabric");/* fabric|accessory */
  const[stockFilter,setStockFilter]=useState("");const stockFilterDeb=useDebounced(stockFilter,200);
  const[stockTypeTab,setStockTypeTab]=useState("fabric");/* fabric|accessory */
  const[activateDate,setActivateDate]=useState(today);
  const[hideZero,setHideZero]=useState(false);
  const[sortBy,setSortBy]=useState("name");/* name|stock|value */
  /* ── Receipt form state ── */
  const[showReceiptForm,setShowReceiptForm]=useState(false);
  const[rcpt,setRcpt]=useState(null);/* {supplierId, supplierName, date, items[], paymentMethod, treasuryAccount, paidAmount, notes, checkBank, checkNo, checkDueDate} */
  const[rcptFilter,setRcptFilter]=useState("");const rcptFilterDeb=useDebounced(rcptFilter,200);
  const[rcptDateFrom,setRcptDateFrom]=useState("");
  const[rcptDateTo,setRcptDateTo]=useState("");
  const[rcptSupplierF,setRcptSupplierF]=useState("");
  const[viewReceipt,setViewReceipt]=useState(null);/* view a receipt detail */
  
  /* ── Supplier statement state ── */
  const[supFilter,setSupFilter]=useState("");const supFilterDeb=useDebounced(supFilter,200);
  const[activeSupplier,setActiveSupplier]=useState(null);/* supplier obj when statement is open */
  const[showPayForm,setShowPayForm]=useState(false);
  const[payForm,setPayForm]=useState(null);/* {supplierId, amount, method, account, date, notes, checkBank, checkNo, checkDueDate} */
  const[supSortBy,setSupSortBy]=useState("balance");/* name|balance|total */
  
  /* ── Supplier Add/Edit form state (V14.49) ── */
  const[showSupForm,setShowSupForm]=useState(false);
  const[supForm,setSupForm]=useState(null);/* {id?, name, phone, address, notes} */
  const[supDelConfirm,setSupDelConfirm]=useState(null);/* supplier obj to delete */
  
  /* ── Purchase Order form state ── */
  const[showPoForm,setShowPoForm]=useState(false);
  const[po,setPo]=useState(null);/* {id?, poNo?, supplierId, supplierName, date, items[], notes} */
  const[viewPo,setViewPo]=useState(null);
  const[poFilter,setPoFilter]=useState("");const poFilterDeb=useDebounced(poFilter,200);
  
  const purchaseSettings=data.purchaseSettings||{stockEnabled:false,stockActivationDate:"",blockOnInsufficientStock:true,autoDeductOnCut:true};
  const stockEnabled=!!purchaseSettings.stockEnabled;
  const fabrics=data.fabrics||[];
  const accessories=data.accessories||[];
  const stockMovements=data.stockMovements||[];
  const suppliers=data.suppliers||[];
  const purchaseReceipts=data.purchaseReceipts||[];
  const supplierPayments=data.supplierPayments||[];
  const checks=data.checks||[];
  const treasuryAccounts=(data.treasuryAccounts||[]).map(a=>typeof a==="string"?{id:a,name:a}:a);
  
  /* ──────── SUPPLIER BALANCES (memoized) ──────── */
  /* For each supplier: totalInvoiced, totalPaid, balance, receiptCount, lastActivity */
  const supplierStats=useMemo(()=>{
    const stats={};
    suppliers.forEach(s=>{stats[s.id]={id:s.id,name:s.name,phone:s.phone||"",address:s.address||"",totalInvoiced:0,totalPaid:0,balance:0,receiptCount:0,lastActivity:""}});
    /* Sum receipts */
    purchaseReceipts.forEach(r=>{if(!r.supplierId)return;const st=stats[r.supplierId];if(!st)return;
      st.totalInvoiced+=Number(r.totalAmount)||0;
      st.totalPaid+=Number(r.paidAmount)||0;/* paid at receipt time */
      st.receiptCount++;
      if(r.date>(st.lastActivity||""))st.lastActivity=r.date;
    });
    /* Sum standalone payments (not linked to a specific receipt but to supplier) */
    supplierPayments.forEach(p=>{if(!p.supplierId)return;const st=stats[p.supplierId];if(!st)return;
      /* Only count payments that are NOT already counted in receipts.paidAmount */
      /* receiptId means payment was made WITH the receipt — already counted */
      if(!p.receiptId){st.totalPaid+=Number(p.amount)||0;if(p.date>(st.lastActivity||""))st.lastActivity=p.date}
    });
    /* balance = invoiced - paid (positive = we owe them) */
    Object.values(stats).forEach(st=>{st.balance=r2(st.totalInvoiced-st.totalPaid)});
    return stats;
  },[suppliers,purchaseReceipts,supplierPayments]);
  
  /* Total across all suppliers */
  const supplierTotals=useMemo(()=>{
    let invoiced=0,paid=0,balance=0;let countWithBalance=0;
    Object.values(supplierStats).forEach(st=>{invoiced+=st.totalInvoiced;paid+=st.totalPaid;balance+=st.balance;if(Math.abs(st.balance)>1)countWithBalance++});
    return{invoiced:r2(invoiced),paid:r2(paid),balance:r2(balance),countWithBalance};
  },[supplierStats]);
  
  /* ──────── SUPPLIER STATEMENT (journal of a single supplier) ──────── */
  /* Returns sorted list of transactions with running balance */
  const buildStatement=(supplierId)=>{
    const entries=[];
    /* Receipts (invoices) */
    purchaseReceipts.filter(r=>String(r.supplierId)===String(supplierId)).forEach(r=>{
      entries.push({type:"invoice",date:r.date,ref:r.receiptNo,desc:"فاتورة — "+((r.items||[]).length)+" بند",debit:Number(r.totalAmount)||0,credit:0,id:r.id,sortKey:(r.date||"")+"-1-"+(r.createdAt||"")});
      /* If partial/full payment was made with this receipt — add as payment entry */
      if((Number(r.paidAmount)||0)>0){
        const methodLabel=r.paymentMethod==="cash"?"كاش":r.paymentMethod==="check"?"شيك":"";
        entries.push({type:"payment",date:r.date,ref:r.receiptNo,desc:"دفعة مع الاستلام"+(methodLabel?" ("+methodLabel+")":""),debit:0,credit:Number(r.paidAmount)||0,id:r.id+"-pay",sortKey:(r.date||"")+"-2-"+(r.createdAt||"")});
      }
    });
    /* Standalone payments */
    supplierPayments.filter(p=>String(p.supplierId)===String(supplierId)&&!p.receiptId).forEach(p=>{
      /* V16.33: Added endorsed_check method (شيك عميل مُظهّر) */
      const methodLabel=p.method==="cash"?"كاش":p.method==="check"?"شيك":p.method==="endorsed_check"?"شيك عميل مُظهّر":"تحويل";
      const ref=p.method==="endorsed_check"&&p.checkId?
        ("شيك مُظهّر #"+(checks.find(c=>c.id===p.checkId)?.checkNo||"")):
        (p.checkId?("شيك #"+(checks.find(c=>c.id===p.checkId)?.checkNo||"")):methodLabel);
      entries.push({type:"payment",date:p.date,ref,desc:p.notes||"دفعة ("+methodLabel+")",debit:0,credit:Number(p.amount)||0,id:p.id,sortKey:(p.date||"")+"-3-"+(p.createdAt||""),paymentId:p.id});
    });
    entries.sort((a,b)=>(a.sortKey||"").localeCompare(b.sortKey||""));
    let running=0;
    entries.forEach(e=>{running+=(e.debit||0)-(e.credit||0);e.balance=r2(running)});
    return entries;
  };
  
  /* ═══ SUPPLIER CRUD HANDLERS V14.49 ═══ */
  const openAddSupplier=()=>{
    setSupForm({id:null,name:"",phone:"",address:"",notes:""});
    setShowSupForm(true);
  };
  const openEditSupplier=(supplier)=>{
    setSupForm({id:supplier.id,name:supplier.name||"",phone:supplier.phone||"",address:supplier.address||"",notes:supplier.notes||""});
    setShowSupForm(true);
  };
  const saveSupplier=async()=>{
    const name=(supForm.name||"").trim();
    if(!name){await tell("بيانات ناقصة","اسم المورد مطلوب",{type:"warning"});return}
    /* Check duplicate name (case-insensitive, exclude self when editing) */
    const dup=suppliers.find(s=>((s.name||"").trim().toLowerCase()===name.toLowerCase())&&s.id!==supForm.id);
    if(dup){await tell("اسم مكرر","هذا الاسم مستخدم لمورد آخر",{type:"warning"});return}
    const phone=normalizePhone((supForm.phone||"").trim());
    const address=(supForm.address||"").trim();
    const notes=(supForm.notes||"").trim();
    upConfig(d=>{
      if(!d.suppliers)d.suppliers=[];
      if(supForm.id){
        /* Edit existing */
        const idx=d.suppliers.findIndex(s=>s.id===supForm.id);
        if(idx>=0){
          d.suppliers[idx]={...d.suppliers[idx],name,phone,address,notes};
        }
      }else{
        /* Add new */
        d.suppliers.push({id:gid(),name,phone,address,notes,createdAt:new Date().toISOString(),createdBy:userName});
      }
    });
    showToast(supForm.id?"✓ تم تحديث بيانات المورد":"✓ تمت إضافة المورد");
    setShowSupForm(false);
    setSupForm(null);
  };
  const deleteSupplier=async(supplier)=>{
    /* V16.64: Comprehensive reference check via dataIntegrity.js — replaces the
       previous receipt-count-only check. Now also blocks if the supplier is
       linked to orders, supplier payments, treasury transactions, checks, or
       is a default supplier on inventory items. */
    const blocker=formatBlockerMessage(data,"supplier",supplier.id,supplier.name);
    if(blocker){
      await tell("لا يمكن حذف المورد",blocker,{type:"warning"});
      return;
    }
    if(!await ask("حذف المورد","هل أنت متأكد من حذف المورد:\n• "+supplier.name+"\n\nلا يمكن التراجع عن هذه العملية",{danger:true,confirmText:"حذف"}))return;
    upConfig(d=>{d.suppliers=(d.suppliers||[]).filter(s=>s.id!==supplier.id)});
    showToast("✓ تم حذف المورد");
    setSupDelConfirm(null);
  };
  
  /* ──────── OPEN PAYMENT FORM ──────── */
  const openPayForm=(supplier)=>{
    const st=supplierStats[supplier.id]||{};
    setPayForm({
      supplierId:supplier.id,supplierName:supplier.name,
      amount:Math.max(0,st.balance||0),method:"cash",
      treasuryAccount:"",date:today,notes:"",
      checkBank:"",checkNo:"",checkDueDate:""
    });
    setShowPayForm(true);
  };
  
  /* ──────── SAVE PAYMENT ──────── */
  const savePayment=async()=>{
    if(!canEdit||!payForm)return;
    const amt=Number(payForm.amount)||0;
    if(amt<=0){await tell("المبلغ غير صحيح","يرجى إدخال مبلغ أكبر من صفر",{type:"warning"});return}
    if(payForm.method==="cash"&&!payForm.treasuryAccount){await tell("الخزنة مطلوبة","يرجى اختيار الخزنة للدفع الكاش",{type:"warning"});return}
    if(payForm.method==="check"){
      if(!payForm.checkBank||!payForm.checkNo){await tell("بيانات الشيك","يرجى إدخال اسم البنك ورقم الشيك",{type:"warning"});return}
    }
    
    const supplier=suppliers.find(s=>String(s.id)===String(payForm.supplierId));
    const methodLabel=payForm.method==="cash"?"كاش":"شيك";
    const confirmMsg="تسجيل دفعة:\n\n• المورد: "+(supplier?.name||"—")+"\n• المبلغ: "+fmt(r2(amt))+" ج.م\n• الطريقة: "+methodLabel+"\n• التاريخ: "+payForm.date+"\n\nمتابعة؟";
    const confirmed=await ask("تأكيد الدفعة",confirmMsg,{confirmText:"حفظ"});
    if(!confirmed)return;
    
    const payId=gid();
    const txId=payForm.method==="cash"?gid():null;
    const checkId=payForm.method==="check"?gid():null;
    
    upConfig(d=>{
      if(!d.supplierPayments)d.supplierPayments=[];
      if(!d.treasury)d.treasury=[];
      if(!d.checks)d.checks=[];
      
      /* Add supplier payment */
      d.supplierPayments.push({
        id:payId,supplierId:payForm.supplierId,supplierName:supplier?.name||"",
        amount:r2(amt),method:payForm.method,
        account:payForm.method==="cash"?payForm.treasuryAccount:"",
        checkId,date:payForm.date,notes:payForm.notes||"",
        treasuryTxId:txId,createdBy:userName,createdAt:new Date().toISOString()
      });
      
      /* Cash: register in treasury */
      if(payForm.method==="cash"){
        const dayN=dayName(payForm.date);
        d.treasury.unshift({
          id:txId,type:"out",amount:r2(amt),
          desc:"دفعة مورد — "+(supplier?.name||""),
          notes:payForm.notes||"",category:"دفعة مورد",
          account:payForm.treasuryAccount,season:d.activeSeason||"",
          date:payForm.date,day:dayN,
          sourceType:"supplier_payment",paymentId:payId,supplierId:payForm.supplierId,
          by:userName,createdAt:new Date().toISOString()
        });
      }
      /* Check: add to checks array */
      else if(payForm.method==="check"){
        d.checks.push({
          id:checkId,type:"payable",amount:r2(amt),
          party:supplier?.name||"",partyId:payForm.supplierId,
          bank:payForm.checkBank,checkNo:payForm.checkNo,
          date:payForm.date,dueDate:payForm.checkDueDate||payForm.date,
          notes:payForm.notes||"دفعة مورد",category:"دفعة مورد",status:"معلق",
          paymentId:payId,
          by:userName,createdAt:new Date().toISOString()
        });
      }
    });
    
    setShowPayForm(false);
    setPayForm(null);
    showToast("✅ تم تسجيل الدفعة — "+fmt(r2(amt))+" ج.م");
  };
  
  /* ──────── DELETE PAYMENT (rollback) ──────── */
  const deletePayment=async(paymentId)=>{
    if(!canEdit||userRole!=="admin")return;
    const pay=supplierPayments.find(p=>p.id===paymentId);
    if(!pay)return;
    const confirmed=await ask("حذف الدفعة","سيتم حذف الدفعة وعكس تأثيراتها على الخزنة والشيكات.\n\nمتابعة؟",{danger:true,confirmText:"حذف"});
    if(!confirmed)return;
    upConfig(d=>{
      d.supplierPayments=(d.supplierPayments||[]).filter(p=>p.id!==paymentId);
      d.treasury=(d.treasury||[]).filter(t=>!(t.sourceType==="supplier_payment"&&t.paymentId===paymentId));
      d.checks=(d.checks||[]).filter(c=>!(c.paymentId===paymentId&&c.status==="معلق"));
    });
    showToast("تم حذف الدفعة");
  };
  
  /* ──────── PURCHASE ORDER (PO) ──────── */
  const nextPoNo=()=>{
    const prefix=purchaseSettings.poPrefix||"PO-";
    const year=new Date().getFullYear();
    const existing=(data.purchaseOrders||[]).filter(p=>(p.poNo||"").startsWith(prefix+year));
    const maxNum=existing.reduce((m,r)=>{const n=Number((r.poNo||"").split("-").pop())||0;return n>m?n:m},0);
    return prefix+year+"-"+String(maxNum+1).padStart(3,"0");
  };
  
  const openNewPo=()=>{
    setPo({supplierId:"",supplierName:"",date:today,items:[],notes:""});
    setShowPoForm(true);
  };
  
  const addPoItem=(itemType)=>{setPo(p=>({...p,items:[...(p.items||[]),{id:gid(),itemType,itemId:"",itemName:"",qty:0,unit:"",price:0,amount:0,notes:""}]}))};
  const updatePoItem=(idx,field,value)=>{
    setPo(p=>{
      const items=[...(p.items||[])];
      if(idx<0||idx>=items.length)return p;
      const it={...items[idx]};
      it[field]=value;
      if(field==="itemId"){
        /* V16.31: itemType is either legacy "fabric"/"accessory" or a categoryId */
        let catId=it.itemType;
        if(catId==="fabric")catId="core_fabric";
        else if(catId==="accessory")catId="core_accessory";
        const list=getItemsForCategory(data,catId);
        const found=list.find(x=>String(x.id)===String(value));
        if(found){it.itemName=found.name;it.unit=found.unit||"";if(!it.price||it.price===0)it.price=Number(found.price)||Number(found.avgCost)||0}
      }
      it.amount=r2((Number(it.qty)||0)*(Number(it.price)||0));
      items[idx]=it;
      return{...p,items};
    });
  };
  const removePoItem=(idx)=>{setPo(p=>{const items=[...(p.items||[])];items.splice(idx,1);return{...p,items}})};
  
  const savePo=async()=>{
    if(!canEdit||!po)return;
    if(!po.supplierId){await tell("بيانات ناقصة","يرجى اختيار المورد",{type:"warning"});return}
    const validItems=(po.items||[]).filter(it=>it.itemId&&(Number(it.qty)||0)>0);
    if(validItems.length===0){await tell("لا توجد بنود","أضف بند واحد على الأقل",{type:"warning"});return}
    
    const supplier=suppliers.find(s=>String(s.id)===String(po.supplierId));
    const totalAmount=validItems.reduce((s,it)=>s+(Number(it.amount)||0),0);
    const poNo=po.poNo||nextPoNo();
    const poId=po.id||gid();
    const isEdit=!!po.id;
    
    const confirmed=await ask(isEdit?"تعديل أمر الشراء":"إنشاء أمر شراء","• المورد: "+(supplier?.name||"—")+"\n• عدد البنود: "+validItems.length+"\n• الإجمالي: "+fmt(r2(totalAmount))+" ج.م\n\n⚠️ أمر الشراء توثيق فقط — لا يؤثر على المخزن حتى يتم الاستلام",{confirmText:isEdit?"تعديل":"إنشاء"});
    if(!confirmed)return;
    
    upConfig(d=>{
      if(!d.purchaseOrders)d.purchaseOrders=[];
      const obj={
        id:poId,poNo,supplierId:po.supplierId,supplierName:supplier?.name||"",
        date:po.date||today,
        items:validItems.map(it=>({itemType:it.itemType,itemId:it.itemId,itemName:it.itemName,qty:Number(it.qty)||0,unit:it.unit||"",price:Number(it.price)||0,amount:Number(it.amount)||0,notes:it.notes||""})),
        totalAmount:r2(totalAmount),notes:po.notes||"",
        createdBy:userName,createdAt:po.createdAt||new Date().toISOString()
      };
      if(isEdit){const idx=d.purchaseOrders.findIndex(x=>x.id===poId);if(idx>=0)d.purchaseOrders[idx]=obj;else d.purchaseOrders.push(obj)}
      else d.purchaseOrders.push(obj);
    });
    setShowPoForm(false);
    setPo(null);
    showToast((isEdit?"✅ تم تعديل ":"✅ تم إنشاء ")+poNo);
  };
  
  const deletePo=async(p)=>{
    if(!canEdit)return;
    const confirmed=await ask("حذف أمر الشراء","حذف أمر الشراء "+p.poNo+"؟",{danger:true,confirmText:"حذف"});
    if(!confirmed)return;
    upConfig(d=>{d.purchaseOrders=(d.purchaseOrders||[]).filter(x=>x.id!==p.id)});
    showToast("تم حذف "+p.poNo);
  };
  
  /* Convert PO to a new receipt (pre-fills the receipt form) */
  const convertPoToReceipt=(p)=>{
    setRcpt({
      supplierId:p.supplierId,supplierName:p.supplierName,date:today,
      items:(p.items||[]).map(it=>({id:gid(),itemType:it.itemType,itemId:it.itemId,itemName:it.itemName,qty:it.qty,unit:it.unit,price:it.price,amount:it.amount,notes:it.notes||"",_fromPo:p.id})),
      paymentMethod:"credit",treasuryAccount:"",paidAmount:0,notes:"من أمر الشراء "+p.poNo,
      checkBank:"",checkNo:"",checkDueDate:"",_poId:p.id
    });
    setViewPo(null);
    setSubTab("receipts");
    setShowReceiptForm(true);
    showToast("📋 تم تحضير الاستلام من أمر الشراء "+p.poNo);
  };
  
  const editPo=(p)=>{setPo({...p,id:p.id,poNo:p.poNo});setViewPo(null);setShowPoForm(true)};
  
  /* Print PO */
  const printPo=(p)=>{
    const supplier=suppliers.find(s=>String(s.id)===String(p.supplierId));
    const w=openPrintWindow();if(!w){tell("المتصفح يمنع الطباعة","فعّل النوافذ المنبثقة",{danger:true});return}
    const rows=(p.items||[]).map(it=>"<tr><td>"+((getCategoryById(data,it.itemType==="fabric"?"core_fabric":it.itemType==="accessory"?"core_accessory":it.itemType)?.emoji||"📦"))+" "+it.itemName+"</td><td class='center'>"+fmt(it.qty)+"</td><td class='center'>"+(it.unit||"")+"</td><td class='center'>"+fmt(r2(it.price))+"</td><td class='center'><b>"+fmt(r2(it.amount))+"</b></td></tr>").join("");
    const html="<html dir='rtl'><head><meta charset='UTF-8'><title>"+p.poNo+"</title><style>"+PRINT_CSS+".center{text-align:center}</style></head><body><div class='hdr'><div style='font-size:18px;font-weight:800;color:#0284C7'>📋 أمر شراء</div><div class='hdr-info'><div>رقم: "+p.poNo+"</div><div>التاريخ: "+p.date+"</div></div></div><h3>بيانات المورد</h3><table><tr><th style='width:30%'>اسم المورد</th><td>"+(supplier?.name||p.supplierName||"—")+"</td></tr>"+(supplier?.phone?"<tr><th>التليفون</th><td>"+supplier.phone+"</td></tr>":"")+"</table><h3>البنود المطلوبة</h3><table><thead><tr><th>الصنف</th><th>الكمية</th><th>الوحدة</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>"+rows+"<tr style='background:#EFF6FF;font-weight:800'><td colspan='4' style='text-align:left'>الإجمالي الكلي</td><td class='center info' style='font-size:14px'>"+fmt(r2(p.totalAmount))+" ج.م</td></tr></tbody></table>"+(p.notes?"<h3>ملاحظات</h3><p style='padding:8px;background:#FEF3C7;border-radius:6px'>"+p.notes+"</p>":"")+"<div class='sig'><div class='sig-box'>المشتريات</div><div class='sig-box'>المدير</div></div><div class='foot'>CLARK Factory Management — أمر شراء — للتوثيق فقط</div><script>setTimeout(function(){window.print()},500)</"+"script></body></html>";
    w.document.write(html);w.document.close();
  };
  
  /* ──────── PURCHASE REPORTS (memoized) ──────── */
  const purchaseReports=useMemo(()=>{
    /* Top suppliers by volume */
    const supVolume={};purchaseReceipts.forEach(r=>{if(!r.supplierId)return;supVolume[r.supplierId]=(supVolume[r.supplierId]||0)+(Number(r.totalAmount)||0)});
    const topSuppliers=Object.entries(supVolume).map(([id,vol])=>{const s=suppliers.find(x=>String(x.id)===String(id));return{id,name:s?.name||"—",volume:r2(vol)}}).sort((a,b)=>b.volume-a.volume).slice(0,5);
    
    /* Top fabrics & accessories by quantity */
    const itemsVolume={fabric:{},accessory:{}};
    purchaseReceipts.forEach(r=>{(r.items||[]).forEach(it=>{if(!it.itemId)return;const key=it.itemType;if(!itemsVolume[key][it.itemId])itemsVolume[key][it.itemId]={id:it.itemId,name:it.itemName,qty:0,value:0,unit:it.unit||""};itemsVolume[key][it.itemId].qty+=Number(it.qty)||0;itemsVolume[key][it.itemId].value+=Number(it.amount)||0})});
    const topFabrics=Object.values(itemsVolume.fabric).sort((a,b)=>b.value-a.value).slice(0,5).map(x=>({...x,qty:r2(x.qty),value:r2(x.value)}));
    const topAccessories=Object.values(itemsVolume.accessory).sort((a,b)=>b.value-a.value).slice(0,5).map(x=>({...x,qty:r2(x.qty),value:r2(x.value)}));
    
    /* Monthly trend (last 6 months) */
    const now=new Date();const months=[];for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push({key:d.toISOString().slice(0,7),label:["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"][d.getMonth()]+" "+d.getFullYear(),total:0})}
    purchaseReceipts.forEach(r=>{const m=months.find(x=>x.key===(r.date||"").slice(0,7));if(m)m.total+=Number(r.totalAmount)||0});
    months.forEach(m=>m.total=r2(m.total));
    
    /* Low stock alerts */
    const lowStock=[];
    fabrics.forEach(f=>{const s=Number(f.stock)||0;if(f.minStock&&s<=f.minStock)lowStock.push({type:"fabric",id:f.id,name:f.name,stock:s,minStock:f.minStock,unit:f.unit||""})});
    accessories.forEach(a=>{const s=Number(a.stock)||0;if(a.minStock&&s<=a.minStock)lowStock.push({type:"accessory",id:a.id,name:a.name,stock:s,minStock:a.minStock,unit:a.unit||""})});
    
    return{topSuppliers,topFabrics,topAccessories,monthly:months,lowStock};
  },[purchaseReceipts,suppliers,fabrics,accessories]);
  
  /* ──────── STOCK STATISTICS ──────── */
  const stockStats=useMemo(()=>{
    const fStats={count:fabrics.length,totalValue:0,lowStock:0,zeroStock:0};
    fabrics.forEach(f=>{const s=Number(f.stock)||0;const c=Number(f.avgCost)||Number(f.price)||0;fStats.totalValue+=s*c;if(s===0)fStats.zeroStock++;else if(f.minStock&&s<=f.minStock)fStats.lowStock++});
    const aStats={count:accessories.length,totalValue:0,lowStock:0,zeroStock:0};
    accessories.forEach(a=>{const s=Number(a.stock)||0;const c=Number(a.avgCost)||Number(a.price)||0;aStats.totalValue+=s*c;if(s===0)aStats.zeroStock++;else if(a.minStock&&s<=a.minStock)aStats.lowStock++});
    return{fabric:fStats,accessory:aStats};
  },[fabrics,accessories]);
  
  /* ──────── ACTIVATE STOCK MODULE ──────── */
  const activateStockModule=async()=>{
    if(!canEdit)return;
    const confirmed=await ask("تفعيل المخزن","سيتم تفعيل نظام المخزن بتاريخ "+activateDate+".\n\n✅ الاستلامات الجديدة ستضاف للمخزن\n✅ الأوردرات الجديدة ستخصم من المخزن\n⚠️ الأوردرات القديمة لن تتأثر\n\nمتأكد؟",{confirmText:"تفعيل"});
    if(!confirmed)return;
    upConfig(d=>{
      if(!d.purchaseSettings)d.purchaseSettings={};
      d.purchaseSettings.stockEnabled=true;
      d.purchaseSettings.stockActivationDate=activateDate;
      d.purchaseSettings.blockOnInsufficientStock=true;
      d.purchaseSettings.autoDeductOnCut=true;
    });
    setShowActivate(false);
    showToast("✅ تم تفعيل المخزن — أضف الرصيد الابتدائي الآن");
    setTimeout(()=>setShowOpeningBal(true),500);
  };
  
  const deactivateStockModule=async()=>{
    if(!canEdit)return;
    const confirmed=await ask("إيقاف المخزن","سيتم إيقاف نظام المخزن.\n\n⚠️ الأوردرات الجديدة لن تخصم من المخزن\n⚠️ الاستلامات ستظل تُسجَّل لكن لن تؤثر على الرصيد\n\nمتأكد؟",{danger:true,confirmText:"إيقاف"});
    if(!confirmed)return;
    upConfig(d=>{if(!d.purchaseSettings)d.purchaseSettings={};d.purchaseSettings.stockEnabled=false});
    showToast("تم إيقاف نظام المخزن");
  };
  
  /* ──────── SAVE OPENING BALANCE ──────── */
  const saveOpeningBalance=async()=>{
    if(!canEdit)return;
    const entries=Object.entries(openingData).filter(([id,v])=>(Number(v.qty)||0)>0);
    if(entries.length===0){await tell("لا توجد بيانات","يرجى إدخال رصيد لعنصر واحد على الأقل",{type:"warning"});return}
    const confirmed=await ask("حفظ الرصيد الابتدائي","سيتم تسجيل "+entries.length+" رصيد ابتدائي.\n\nلن يمكن التعديل عليهم بعد الحفظ (إلا عبر تسوية).\n\nمتابعة؟",{confirmText:"حفظ"});
    if(!confirmed)return;
    upConfig(d=>{
      if(!d.stockMovements)d.stockMovements=[];
      entries.forEach(([itemId,v])=>{
        const qty=Number(v.qty)||0;const cost=Number(v.cost)||0;
        const list=openingType==="fabric"?(d.fabrics||[]):(d.accessories||[]);
        const idx=list.findIndex(x=>String(x.id)===String(itemId));
        if(idx<0)return;
        const item=list[idx];
        item.stock=(Number(item.stock)||0)+qty;
        item.avgCost=cost;/* Opening balance sets avgCost */
        item.lastReceiveDate=activateDate||new Date().toISOString().split("T")[0];
        d.stockMovements.push({
          id:gid(),type:"opening",itemType:openingType,itemId:item.id,itemName:item.name,
          qty,unit:item.unit||"",price:cost,date:activateDate||new Date().toISOString().split("T")[0],
          sourceType:"opening",sourceId:null,notes:"رصيد ابتدائي",createdBy:userName,createdAt:new Date().toISOString()
        });
      });
    });
    setOpeningData({});
    setShowOpeningBal(false);
    showToast("✅ تم حفظ الرصيد الابتدائي ("+entries.length+" عنصر)");
  };
  
  /* ──────── OPEN RECEIPT FORM (new or edit) ──────── */
  const openNewReceipt=()=>{
    setRcpt({
      supplierId:"",supplierName:"",date:today,items:[],
      paymentMethod:"credit",/* cash | credit | check */
      treasuryAccount:"",paidAmount:0,notes:"",
      checkBank:"",checkNo:"",checkDueDate:""
    });
    setShowReceiptForm(true);
  };
  
  /* Generate auto receipt number */
  const nextReceiptNo=()=>{
    const prefix=purchaseSettings.receiptPrefix||"REC-";
    const year=new Date().getFullYear();
    const existing=(data.purchaseReceipts||[]).filter(r=>(r.receiptNo||"").startsWith(prefix+year));
    const maxNum=existing.reduce((m,r)=>{const n=Number((r.receiptNo||"").split("-").pop())||0;return n>m?n:m},0);
    return prefix+year+"-"+String(maxNum+1).padStart(3,"0");
  };
  
  /* ──────── ADD/REMOVE/UPDATE LINE ITEMS ──────── */
  const addRcptItem=(itemType)=>{
    setRcpt(p=>({...p,items:[...(p.items||[]),{id:gid(),itemType,itemId:"",itemName:"",qty:0,unit:"",price:0,amount:0,notes:""}]}));
  };
  
  const updateRcptItem=(idx,field,value)=>{
    setRcpt(p=>{
      const items=[...(p.items||[])];
      if(idx<0||idx>=items.length)return p;
      const it={...items[idx]};
      it[field]=value;
      /* Auto-populate from selected item — V16.31: works for any category */
      if(field==="itemId"){
        /* itemType may be "fabric"/"accessory" (legacy) or a categoryId */
        let catId=it.itemType;
        if(catId==="fabric")catId="core_fabric";
        else if(catId==="accessory")catId="core_accessory";
        const list=getItemsForCategory(data,catId);
        const found=list.find(x=>String(x.id)===String(value));
        if(found){it.itemName=found.name;it.unit=found.unit||"";if(!it.price||it.price===0)it.price=Number(found.price)||Number(found.avgCost)||0}
      }
      /* Recalc amount */
      it.amount=r2((Number(it.qty)||0)*(Number(it.price)||0));
      items[idx]=it;
      return{...p,items};
    });
  };
  
  const removeRcptItem=(idx)=>{
    setRcpt(p=>{const items=[...(p.items||[])];items.splice(idx,1);return{...p,items}});
  };
  
  /* ──────── WEIGHTED AVERAGE COST ──────── */
  const calcNewAvgCost=(item,addQty,addPrice)=>{
    const oldStock=Number(item.stock)||0;
    const oldAvg=Number(item.avgCost)||Number(item.price)||0;
    const totalStock=oldStock+addQty;
    if(totalStock<=0)return addPrice;
    const oldValue=oldStock*oldAvg;
    const addValue=addQty*addPrice;
    return r2((oldValue+addValue)/totalStock);
  };
  
  /* ──────── SAVE RECEIPT (main logic) ──────── */
  const saveReceipt=async()=>{
    if(!canEdit||!rcpt)return;
    /* Validation */
    if(!rcpt.supplierId){await tell("بيانات ناقصة","يرجى اختيار المورد",{type:"warning"});return}
    const validItems=(rcpt.items||[]).filter(it=>it.itemId&&(Number(it.qty)||0)>0);
    if(validItems.length===0){await tell("لا توجد بنود","أضف بند واحد على الأقل مع كمية أكبر من صفر",{type:"warning"});return}
    const totalAmount=validItems.reduce((s,it)=>s+(Number(it.amount)||0),0);
    if(totalAmount<=0){await tell("المبلغ صفر","تأكد من إدخال أسعار البنود",{type:"warning"});return}
    
    /* Validate payment method */
    if(rcpt.paymentMethod==="cash"){
      if(!rcpt.treasuryAccount){await tell("الخزنة مطلوبة","يرجى اختيار الخزنة للدفع الكاش",{type:"warning"});return}
      if((Number(rcpt.paidAmount)||0)<=0){await tell("المبلغ المدفوع","يرجى إدخال المبلغ المدفوع",{type:"warning"});return}
    }
    if(rcpt.paymentMethod==="check"){
      if(!rcpt.checkBank||!rcpt.checkNo){await tell("بيانات الشيك","يرجى إدخال اسم البنك ورقم الشيك",{type:"warning"});return}
      if((Number(rcpt.paidAmount)||0)<=0){await tell("مبلغ الشيك","يرجى إدخال مبلغ الشيك",{type:"warning"});return}
    }
    
    const paidAmt=rcpt.paymentMethod==="credit"?0:(Number(rcpt.paidAmount)||0);
    const paymentStatus=paidAmt>=totalAmount?"paid":paidAmt>0?"partial":"unpaid";
    
    const supplier=suppliers.find(s=>String(s.id)===String(rcpt.supplierId));
    const receiptNo=nextReceiptNo();
    const rcptId=gid();
    
    /* Build confirm message */
    let confirmMsg="سيتم حفظ الاستلام:\n\n";
    confirmMsg+="• المورد: "+(supplier?.name||"—")+"\n";
    confirmMsg+="• عدد البنود: "+validItems.length+"\n";
    confirmMsg+="• الإجمالي: "+fmt(r2(totalAmount))+" ج.م\n";
    confirmMsg+="• طريقة الدفع: "+(rcpt.paymentMethod==="cash"?"كاش":rcpt.paymentMethod==="check"?"شيك":"آجل")+"\n";
    if(paidAmt>0)confirmMsg+="• المدفوع: "+fmt(r2(paidAmt))+" ج.م\n";
    if(stockEnabled)confirmMsg+="\n✅ سيتم إضافة البنود للمخزن تلقائياً";
    
    const confirmed=await ask("تأكيد الاستلام",confirmMsg,{confirmText:"حفظ"});
    if(!confirmed)return;
    
    /* Build receipt object */
    const receipt={
      id:rcptId,receiptNo,
      supplierId:rcpt.supplierId,supplierName:supplier?.name||"",
      date:rcpt.date||today,
      items:validItems.map(it=>({
        itemType:it.itemType,itemId:it.itemId,itemName:it.itemName,
        qty:Number(it.qty)||0,unit:it.unit||"",
        price:Number(it.price)||0,amount:Number(it.amount)||0,
        notes:it.notes||""
      })),
      totalAmount:r2(totalAmount),paidAmount:r2(paidAmt),
      paymentMethod:rcpt.paymentMethod,paymentStatus,
      treasuryAccount:rcpt.paymentMethod==="cash"?rcpt.treasuryAccount:"",
      notes:rcpt.notes||"",
      createdBy:userName,createdAt:new Date().toISOString()
    };
    
    upConfig(d=>{
      if(!d.purchaseReceipts)d.purchaseReceipts=[];
      if(!d.stockMovements)d.stockMovements=[];
      if(!d.supplierPayments)d.supplierPayments=[];
      if(!d.treasury)d.treasury=[];
      if(!d.checks)d.checks=[];
      
      /* 1. Save the receipt */
      d.purchaseReceipts.push(receipt);
      
      /* 2. Update stock + add stockMovement for each item (if stock enabled) */
      if(stockEnabled){
        validItems.forEach(it=>{
          const qty=Number(it.qty)||0;
          const price=Number(it.price)||0;
          /* V16.31: Use applyStockDelta to handle legacy + new categories uniformly.
             The function does the weighted-avg cost calculation and stock update. */
          let catId=it.itemType;
          if(catId==="fabric")catId="core_fabric";
          else if(catId==="accessory")catId="core_accessory";
          applyStockDelta(d,catId,it.itemId,qty,price);
          /* Update lastReceiveDate on the item directly (not handled by applyStockDelta) */
          const cat=getCategoryById(d,catId);
          if(cat?.legacy==="fabric"){const f=(d.fabrics||[]).find(x=>String(x.id)===String(it.itemId));if(f)f.lastReceiveDate=receipt.date}
          else if(cat?.legacy==="accessory"){const a=(d.accessories||[]).find(x=>String(x.id)===String(it.itemId));if(a)a.lastReceiveDate=receipt.date}
          else{const x=(d.inventoryItems||[]).find(y=>String(y.id)===String(it.itemId));if(x)x.lastReceiveDate=receipt.date}
          /* Movement */
          d.stockMovements.push({
            id:gid(),type:"in",itemType:it.itemType,itemId:it.itemId,itemName:it.itemName,
            qty,unit:it.unit||"",price,date:receipt.date,
            sourceType:"receipt",sourceId:rcptId,
            notes:"استلام "+receiptNo+" من "+(supplier?.name||""),
            createdBy:userName,createdAt:new Date().toISOString()
          });
        });
      }
      
      /* 3. Handle payment */
      if(rcpt.paymentMethod==="cash"&&paidAmt>0){
        /* Register in treasury (outflow) */
        const txId=gid();
        const dayN=dayName(receipt.date);
        d.treasury.unshift({
          id:txId,type:"out",amount:paidAmt,
          desc:"استلام "+receiptNo+" — "+(supplier?.name||""),
          notes:rcpt.notes||"",category:"مشتريات",
          account:rcpt.treasuryAccount,season:d.activeSeason||"",
          date:receipt.date,day:dayN,
          sourceType:"purchase_receipt",receiptId:rcptId,supplierId:rcpt.supplierId,
          by:userName,createdAt:new Date().toISOString()
        });
        /* Also add as supplier payment */
        d.supplierPayments.push({
          id:gid(),supplierId:rcpt.supplierId,supplierName:supplier?.name||"",
          amount:paidAmt,method:"cash",account:rcpt.treasuryAccount,
          date:receipt.date,notes:"دفعة مع استلام "+receiptNo,
          receiptId:rcptId,treasuryTxId:txId,
          createdBy:userName,createdAt:new Date().toISOString()
        });
      }
      else if(rcpt.paymentMethod==="check"&&paidAmt>0){
        /* Add to checks array (payable) */
        const checkId=gid();
        d.checks.push({
          id:checkId,type:"payable",amount:paidAmt,
          party:supplier?.name||"",partyId:rcpt.supplierId,
          bank:rcpt.checkBank,checkNo:rcpt.checkNo,
          date:receipt.date,dueDate:rcpt.checkDueDate||receipt.date,
          notes:"شيك لاستلام "+receiptNo,category:"دفعة مورد",status:"معلق",
          receiptId:rcptId,
          by:userName,createdAt:new Date().toISOString()
        });
        /* Add supplier payment */
        d.supplierPayments.push({
          id:gid(),supplierId:rcpt.supplierId,supplierName:supplier?.name||"",
          amount:paidAmt,method:"check",checkId,
          date:receipt.date,notes:"شيك لاستلام "+receiptNo+" — "+rcpt.checkBank+" #"+rcpt.checkNo,
          receiptId:rcptId,
          createdBy:userName,createdAt:new Date().toISOString()
        });
      }
      /* Credit (آجل): no payment action needed, supplier balance will reflect via receipts - payments */
    });
    
    setShowReceiptForm(false);
    setRcpt(null);
    showToast("✅ تم حفظ الاستلام "+receiptNo);
  };
  
  /* ──────── PRINT RECEIPT ──────── */
  const printReceipt=(r)=>{
    const supplier=suppliers.find(s=>String(s.id)===String(r.supplierId));
    const w=openPrintWindow();if(!w){tell("المتصفح يمنع الطباعة","فعّل النوافذ المنبثقة",{danger:true});return}
    const rowsHtml=(r.items||[]).map(it=>"<tr><td>"+((getCategoryById(data,it.itemType==="fabric"?"core_fabric":it.itemType==="accessory"?"core_accessory":it.itemType)?.emoji||"📦"))+" "+it.itemName+"</td><td class='center'>"+fmt(it.qty)+"</td><td class='center'>"+(it.unit||"")+"</td><td class='center'>"+fmt(r2(it.price))+"</td><td class='center'><b>"+fmt(r2(it.amount))+"</b></td></tr>").join("");
    const paymentLabel=r.paymentMethod==="cash"?"كاش":r.paymentMethod==="check"?"شيك":"آجل";
    const html="<html dir='rtl'><head><meta charset='UTF-8'><title>"+r.receiptNo+"</title><style>"+PRINT_CSS+".center{text-align:center}</style></head><body><div class='hdr'><div style='font-size:18px;font-weight:800;color:#0284C7'>📥 إذن استلام مشتريات</div><div class='hdr-info'><div>رقم: "+r.receiptNo+"</div><div>التاريخ: "+r.date+"</div></div></div><h3>بيانات المورد</h3><table><tr><th style='width:30%'>اسم المورد</th><td>"+(supplier?.name||r.supplierName||"—")+"</td></tr>"+(supplier?.phone?"<tr><th>التليفون</th><td>"+supplier.phone+"</td></tr>":"")+(supplier?.address?"<tr><th>العنوان</th><td>"+supplier.address+"</td></tr>":"")+"</table><h3>البنود</h3><table><thead><tr><th>الصنف</th><th>الكمية</th><th>الوحدة</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>"+rowsHtml+"<tr style='background:#EFF6FF;font-weight:800'><td colspan='4' style='text-align:left'>الإجمالي الكلي</td><td class='center info' style='font-size:14px'>"+fmt(r2(r.totalAmount))+" ج.م</td></tr></tbody></table><h3>تفاصيل الدفع</h3><table><tr><th style='width:30%'>طريقة الدفع</th><td class='info'>"+paymentLabel+"</td></tr><tr><th>المدفوع</th><td class='ok'>"+fmt(r2(r.paidAmount||0))+" ج.م</td></tr><tr><th>المتبقي</th><td class='err'>"+fmt(r2((r.totalAmount||0)-(r.paidAmount||0)))+" ج.م</td></tr>"+(r.treasuryAccount?"<tr><th>الخزنة</th><td>"+r.treasuryAccount+"</td></tr>":"")+"</table>"+(r.notes?"<h3>ملاحظات</h3><p style='padding:8px;background:#FEF3C7;border-radius:6px'>"+r.notes+"</p>":"")+"<div class='sig'><div class='sig-box'>المستلم</div><div class='sig-box'>المحاسب</div><div class='sig-box'>المدير</div></div><div class='foot'>CLARK Factory Management — تم الإنشاء: "+new Date(r.createdAt||Date.now()).toLocaleString("ar-EG")+" — بواسطة: "+(r.createdBy||"—")+"</div><script>setTimeout(function(){window.print()},500)</"+"script></body></html>";
    w.document.write(html);w.document.close();
  };
  
  /* ──────── DELETE RECEIPT (admin only, rollback) ──────── */
  const deleteReceipt=async(r)=>{
    if(!canEdit||userRole!=="admin")return;
    /* V16.65: Block if any of the linked checks have been collected/paid/endorsed.
       The existing rollback removes only PENDING checks (line 717) — non-pending
       ones would have left treasury entries that we can't safely undo, so the
       caller is forced to revert those checks to "معلق" first. */
    const linkedChecks=(data.checks||[]).filter(c=>c.receiptId===r.id);
    const lockedChecks=linkedChecks.filter(c=>c.status&&c.status!=="معلق");
    if(lockedChecks.length>0){
      const list=lockedChecks.map(c=>"• شيك #"+(c.checkNo||"—")+" — حالته: "+c.status).join("\n");
      await tell("⛔ لا يمكن حذف الاستلام","الاستلام مرتبط بشيكات تم تحصيلها أو دفعها:\n"+list+"\n\nأرجع الشيكات لـ \"معلق\" أولاً (من تاب الشيكات) ثم احذف الاستلام.",{type:"warning"});
      return;
    }
    const confirmed=await ask("حذف الاستلام","سيتم حذف الاستلام "+r.receiptNo+" وعكس كل التأثيرات:\n\n⚠️ سيتم خصم البنود من المخزن\n⚠️ سيتم حذف الحركات المالية المرتبطة\n\nهل تريد المتابعة؟",{danger:true,confirmText:"حذف"});
    if(!confirmed)return;
    upConfig(d=>{
      /* Reverse stock */
      if(stockEnabled&&r.items){
        r.items.forEach(it=>{
          /* V16.31: Use applyStockDelta with negative qty to reverse */
          let catId=it.itemType;
          if(catId==="fabric")catId="core_fabric";
          else if(catId==="accessory")catId="core_accessory";
          const qty=Number(it.qty)||0;
          /* Subtract — applyStockDelta handles legacy + new uniformly. We pass null
             for unitCost since reversing shouldn't shift the avg cost. */
          applyStockDelta(d,catId,it.itemId,-qty,null);
          /* Clamp to zero (applyStockDelta doesn't enforce non-negative for refunds) */
          const cat=getCategoryById(d,catId);
          if(cat?.legacy==="fabric"){const f=(d.fabrics||[]).find(x=>String(x.id)===String(it.itemId));if(f&&f.stock<0)f.stock=0}
          else if(cat?.legacy==="accessory"){const a=(d.accessories||[]).find(x=>String(x.id)===String(it.itemId));if(a&&a.stock<0)a.stock=0}
          else{const x=(d.inventoryItems||[]).find(y=>String(y.id)===String(it.itemId));if(x&&x.stock<0)x.stock=0}
        });
      }
      /* Remove stock movements linked to this receipt */
      d.stockMovements=(d.stockMovements||[]).filter(m=>!(m.sourceType==="receipt"&&m.sourceId===r.id));
      /* Remove treasury transactions linked */
      d.treasury=(d.treasury||[]).filter(t=>!(t.sourceType==="purchase_receipt"&&t.receiptId===r.id));
      /* Remove supplier payments linked */
      d.supplierPayments=(d.supplierPayments||[]).filter(p=>p.receiptId!==r.id);
      /* Remove checks linked (only if status is still معلق) */
      d.checks=(d.checks||[]).filter(c=>!(c.receiptId===r.id&&c.status==="معلق"));
      /* Finally remove the receipt */
      d.purchaseReceipts=(d.purchaseReceipts||[]).filter(x=>x.id!==r.id);
    });
    showToast("تم حذف الاستلام "+r.receiptNo);
  };
  
  /* ──────── FILTERED & SORTED STOCK LIST ──────── */
  /* V16.31: stockTypeTab is now a categoryId — could be 'core_fabric', 'core_accessory', or any user-defined id */
  const filteredStock=useMemo(()=>{
    /* Translate legacy values for back-compat with any saved state */
    let catId=stockTypeTab;
    if(catId==="fabric")catId="core_fabric";
    else if(catId==="accessory")catId="core_accessory";
    const items=getItemsForCategory(data,catId);
    let f=items.map(x=>({...x,_stock:Number(x.stock)||0,_cost:Number(x.avgCost)||Number(x.price)||0}));
    f=f.map(x=>({...x,_value:x._stock*x._cost}));
    if(hideZero)f=f.filter(x=>x._stock>0);
    const q=stockFilterDeb.trim().toLowerCase();
    if(q)f=f.filter(x=>(x.name||"").toLowerCase().includes(q)||(x.type||"").toLowerCase().includes(q));
    if(sortBy==="name")f.sort((a,b)=>(a.name||"").localeCompare(b.name||"","ar"));
    else if(sortBy==="stock")f.sort((a,b)=>b._stock-a._stock);
    else if(sortBy==="value")f.sort((a,b)=>b._value-a._value);
    else if(sortBy==="low")f.sort((a,b)=>{const aLow=a.minStock&&a._stock<=a.minStock?0:1;const bLow=b.minStock&&b._stock<=b.minStock?0:1;return aLow-bLow});
    return f;
  },[stockTypeTab,data,hideZero,stockFilterDeb,sortBy]);
  
  /* ──────── RENDER ──────── */
  return<div>
    {/* Header + status bar */}
    <div style={{display:"flex",flexWrap:"wrap",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:8}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:FS+4,fontWeight:800,color:T.text}}>🛍️ المشتريات والمخزن</span>
        <span style={{padding:"3px 10px",borderRadius:8,fontSize:FS-2,fontWeight:700,background:stockEnabled?T.ok+"15":T.textMut+"15",color:stockEnabled?T.ok:T.textMut,border:"1px solid "+(stockEnabled?T.ok+"40":T.textMut+"30")}}>{stockEnabled?"● المخزن مُفعَّل":"○ المخزن غير مُفعَّل"}</span>
        {stockEnabled&&purchaseSettings.stockActivationDate&&<span style={{fontSize:FS-2,color:T.textMut}}>{"منذ "+purchaseSettings.stockActivationDate}</span>}
      </div>
      {canEdit&&<div style={{display:"flex",gap:6}}>
        {!stockEnabled?<Btn primary small onClick={()=>setShowActivate(true)}>🚀 تفعيل المخزن</Btn>:<>
          <Btn small onClick={()=>setShowOpeningBal(true)} style={{background:"#F59E0B12",color:"#F59E0B",border:"1px solid #F59E0B30"}}>➕ رصيد ابتدائي</Btn>
          <Btn small ghost onClick={deactivateStockModule} style={{color:T.err}}>إيقاف</Btn>
        </>}
      </div>}
    </div>

    {/* Sub-tabs navigation */}
    <div style={{display:"flex",gap:4,marginBottom:12,borderBottom:"2px solid "+T.brd,flexWrap:"wrap"}}>
      {[
        {key:"stock",label:"📦 المخزن",count:fabrics.length+accessories.length+(data.inventoryItems||[]).length},
        {key:"categories",label:"🏷️ الأصناف",count:(data.itemCategories||[]).length},
        {key:"receipts",label:"📥 الاستلامات",count:purchaseReceipts.length},
        {key:"orders",label:"📋 أوامر شراء",count:(data.purchaseOrders||[]).length},
        {key:"suppliers",label:"👥 كشوف الموردين",count:suppliers.length}
      ].map(st=>{const active=subTab===st.key;return<div key={st.key} onClick={()=>!st.disabled&&setSubTab(st.key)} style={{padding:"8px 16px",cursor:st.disabled?"not-allowed":"pointer",borderBottom:active?"3px solid "+T.accent:"3px solid transparent",marginBottom:-2,fontWeight:active?800:600,color:st.disabled?T.textMut:(active?T.accent:T.textSec),fontSize:FS-1,opacity:st.disabled?0.5:1,display:"inline-flex",alignItems:"center",gap:6,whiteSpace:"nowrap"}}>
        <span>{st.label}</span>
        <span style={{fontSize:FS-3,padding:"1px 6px",borderRadius:10,background:active?T.accent+"15":T.bg,color:active?T.accent:T.textMut}}>{st.count}</span>
        {st.disabled&&<span style={{fontSize:FS-3,color:T.textMut}} title="قريباً">🔒</span>}
      </div>})}
    </div>

    {/* ════ SUB-TAB: STOCK ════ */}
    {subTab==="stock"&&<>
      {/* Stats cards */}
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(4,1fr)",gap:10,marginBottom:12}}>
        <div style={{padding:12,borderRadius:10,background:T.accent+"06",border:"1px solid "+T.accent+"20"}}>
          <div style={{fontSize:FS-2,color:T.textSec}}>قيمة المخزن (خامات)</div>
          <div style={{fontSize:FS+6,fontWeight:800,color:T.accent}}>{fmt(r2(stockStats.fabric.totalValue))}</div>
          <div style={{fontSize:FS-3,color:T.textMut}}>{stockStats.fabric.count+" خامة"}</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:"#8B5CF606",border:"1px solid #8B5CF620"}}>
          <div style={{fontSize:FS-2,color:T.textSec}}>قيمة المخزن (إكسسوار)</div>
          <div style={{fontSize:FS+6,fontWeight:800,color:"#8B5CF6"}}>{fmt(r2(stockStats.accessory.totalValue))}</div>
          <div style={{fontSize:FS-3,color:T.textMut}}>{stockStats.accessory.count+" صنف"}</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:T.warn+"06",border:"1px solid "+T.warn+"20"}}>
          <div style={{fontSize:FS-2,color:T.textSec}}>أصناف ناقصة</div>
          <div style={{fontSize:FS+6,fontWeight:800,color:T.warn}}>{stockStats.fabric.lowStock+stockStats.accessory.lowStock}</div>
          <div style={{fontSize:FS-3,color:T.textMut}}>أقل من الحد الأدنى</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:T.err+"06",border:"1px solid "+T.err+"20"}}>
          <div style={{fontSize:FS-2,color:T.textSec}}>أصناف نفذت</div>
          <div style={{fontSize:FS+6,fontWeight:800,color:T.err}}>{stockStats.fabric.zeroStock+stockStats.accessory.zeroStock}</div>
          <div style={{fontSize:FS-3,color:T.textMut}}>رصيدها صفر</div>
        </div>
      </div>

      {/* V16.31: Dynamic category tabs — fabric/accessory + any user-defined */}
      <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
        {getCategories(data).map(cat=>{
          const isActive=stockTypeTab===cat.id||(cat.legacy==="fabric"&&stockTypeTab==="fabric")||(cat.legacy==="accessory"&&stockTypeTab==="accessory");
          const items=getItemsForCategory(data,cat.id);
          const color=cat.legacy==="fabric"?T.accent:cat.legacy==="accessory"?"#8B5CF6":"#F59E0B";
          return<div key={cat.id} onClick={()=>setStockTypeTab(cat.id)} style={{padding:"8px 16px",borderRadius:10,cursor:"pointer",fontWeight:700,fontSize:FS-1,background:isActive?color:T.bg,color:isActive?"#fff":T.text,border:"1px solid "+(isActive?color:T.brd)}}>
            {cat.emoji||"📦"} {cat.name} ({items.length})
          </div>;
        })}
        {/* V16.60: Add inventory item button — works for ALL categories now,
            including legacy fabric/accessory. Legacy items get _legacy flag in
            the popup so the save handler routes to data.fabrics / data.accessories
            instead of data.inventoryItems. */}
        {canEdit&&(()=>{
          let catId=stockTypeTab;
          if(catId==="fabric")catId="core_fabric";
          else if(catId==="accessory")catId="core_accessory";
          const cat=getCategoryById(data,catId);
          if(!cat)return null;
          const label=cat.legacy==="fabric"?"+ خامة جديدة":cat.legacy==="accessory"?"+ إكسسوار جديد":"+ صنف للمخزن";
          const defaultUnit=cat.legacy==="accessory"?"قطعة":(cat.legacy==="fabric"?"كيلو":"قطعة");
          return<Btn small primary onClick={()=>setItemEditPopup({
            _legacy:cat.legacy||undefined,/* "fabric" | "accessory" | undefined */
            categoryId:cat.id,name:"",type:"",unit:defaultUnit,
            minStock:0,avgCost:0,defaultSupplierId:"",notes:""
          })}>{label}</Btn>;
        })()}
      </div>

      {/* Filters */}
      <Card>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end",marginBottom:10}}>
          <div style={{flex:1,minWidth:160}}>
            <label style={{fontSize:FS-3,color:T.textSec,fontWeight:600}}>بحث</label>
            <Inp value={stockFilter} onChange={setStockFilter} placeholder="🔍 اكتب للبحث..."/>
          </div>
          <div style={{minWidth:120}}>
            <label style={{fontSize:FS-3,color:T.textSec,fontWeight:600}}>ترتيب</label>
            <Sel value={sortBy} onChange={setSortBy}>
              <option value="name">الاسم</option>
              <option value="stock">الرصيد (أعلى أولاً)</option>
              <option value="value">القيمة (أعلى أولاً)</option>
              <option value="low">الناقص أولاً</option>
            </Sel>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:FS-1,padding:"8px 10px"}}>
            <input type="checkbox" checked={hideZero} onChange={e=>setHideZero(e.target.checked)}/>
            <span>إخفاء الأصناف الصفرية</span>
          </label>
        </div>

        {/* Stock table */}
        {(()=>{
          /* V16.31: resolve current category */
          let curCatId=stockTypeTab;
          if(curCatId==="fabric")curCatId="core_fabric";
          else if(curCatId==="accessory")curCatId="core_accessory";
          const curCat=getCategoryById(data,curCatId);
          const isAccLegacy=curCat?.legacy==="accessory";
          const isFabLegacy=curCat?.legacy==="fabric";
          const allItemsCount=getItemsForCategory(data,curCatId).length;
          return filteredStock.length===0?<div style={{padding:40,textAlign:"center",color:T.textMut}}>
            {allItemsCount===0?
              "لا توجد أصناف في «"+(curCat?.name||"")+"». "+(curCat?.isCore?"أضفها من قاعدة البيانات أولاً.":"اضغط زر «+ صنف للمخزن» لإضافة أول صنف."):
              "لا توجد نتائج"}
          </div>:<div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
              <thead><tr>
                <th style={TH}>الاسم</th>
                {!isFabLegacy&&!isAccLegacy&&<th style={TH}>النوع</th>}
                <th style={{...TH,textAlign:"center"}}>الرصيد</th>
                <th style={{...TH,textAlign:"center"}}>الوحدة</th>
                {isAccLegacy&&<th style={{...TH,textAlign:"center"}} title="كم قطعة إكسسوار لكل موديل">qty/قطعة</th>}
                <th style={{...TH,textAlign:"center"}}>الحد الأدنى</th>
                <th style={{...TH,textAlign:"center"}}>متوسط التكلفة</th>
                <th style={{...TH,textAlign:"center"}}>القيمة</th>
                <th style={{...TH,textAlign:"center"}}>آخر استلام</th>
                <th style={{...TH,textAlign:"center"}}>الحالة</th>
                {canEdit&&<th style={{...TH,textAlign:"center"}}></th>}
              </tr></thead>
              <tbody>
                {filteredStock.map(item=>{const stock=item._stock;const cost=item._cost;const value=item._value;
                  const isLow=item.minStock&&stock<=item.minStock;const isZero=stock===0;
                  const statusColor=isZero?T.err:isLow?T.warn:T.ok;
                  const statusLabel=isZero?"نافذ":isLow?"ناقص":"متاح";
                  /* Resolve which array to mutate when saving inline edits */
                  const saveMin=(v)=>{
                    upConfig(d=>{
                      if(isFabLegacy){const idx=(d.fabrics||[]).findIndex(x=>x.id===item.id);if(idx>=0)d.fabrics[idx].minStock=Number(v)||0}
                      else if(isAccLegacy){const idx=(d.accessories||[]).findIndex(x=>x.id===item.id);if(idx>=0)d.accessories[idx].minStock=Number(v)||0}
                      else{const idx=(d.inventoryItems||[]).findIndex(x=>x.id===item.id);if(idx>=0)d.inventoryItems[idx].minStock=Number(v)||0}
                    });
                  };
                  return<tr key={item.id} style={{borderBottom:"1px solid "+T.brd,background:isZero?T.err+"04":isLow?T.warn+"04":"transparent"}}>
                    <td style={{...TD,fontWeight:700}}>{item.name||"—"}</td>
                    {!isFabLegacy&&!isAccLegacy&&<td style={{...TD,color:T.textSec}}>{item.type?<span style={{padding:"2px 8px",borderRadius:6,background:"#8B5CF610",color:"#8B5CF6",fontSize:FS-3,fontWeight:600}}>{item.type}</span>:"—"}</td>}
                    <td style={{...TD,textAlign:"center",fontWeight:800,color:statusColor,fontSize:FS}}>{fmt(stock)}</td>
                    <td style={{...TD,textAlign:"center",color:T.textSec}}>{item.unit||"—"}</td>
                    {isAccLegacy&&<td style={{...TD,textAlign:"center"}}>
                      {canEdit?<Inp type="number" value={item._orig?.qtyPerPiece||1} onChange={v=>{upConfig(d=>{const idx=d.accessories.findIndex(x=>x.id===item.id);if(idx>=0)d.accessories[idx].qtyPerPiece=Number(v)||1})}} style={{width:60,padding:"3px 6px",fontSize:FS-1,textAlign:"center"}}/>:<span>{item._orig?.qtyPerPiece||1}</span>}
                    </td>}
                    <td style={{...TD,textAlign:"center"}}>
                      {canEdit?<Inp type="number" value={item.minStock||""} onChange={saveMin} placeholder="—" style={{width:70,padding:"3px 6px",fontSize:FS-1,textAlign:"center"}}/>:<span>{item.minStock||"—"}</span>}
                    </td>
                    <td style={{...TD,textAlign:"center",color:T.textSec}}>{fmt(r2(cost))}</td>
                    <td style={{...TD,textAlign:"center",fontWeight:700,color:T.accent}}>{fmt(r2(value))}</td>
                    <td style={{...TD,textAlign:"center",fontSize:FS-2,color:T.textMut}}>{item._orig?.lastReceiveDate||"—"}</td>
                    <td style={{...TD,textAlign:"center"}}>
                      <span style={{padding:"2px 10px",borderRadius:10,fontSize:FS-3,fontWeight:700,background:statusColor+"15",color:statusColor,border:"1px solid "+statusColor+"30"}}>{statusLabel}</span>
                    </td>
                    {/* V16.60: Edit/delete buttons now show for ALL categories
                        including legacy fabric/accessory. The handlers route to
                        the correct array based on item._legacy. */}
                    {canEdit&&<td style={{...TD,textAlign:"center"}}>
                      <div style={{display:"flex",gap:4,justifyContent:"center"}}>
                        <Btn small ghost onClick={()=>setItemEditPopup({
                          _legacy:item._legacy||undefined,
                          id:item.id,categoryId:curCatId,name:item.name,type:item.type,
                          unit:item.unit,minStock:item.minStock,avgCost:item.avgCost,
                          defaultSupplierId:item.defaultSupplierId,
                          notes:item._orig?.notes||""
                        })} title="تعديل">✏️</Btn>
                        <Btn small ghost onClick={async()=>{
                          /* V16.66: Comprehensive integrity check via dataIntegrity —
                             previously this only checked stock balance, missing
                             usage in orders / purchase receipts / stock movements.
                             V18.48: on blocker, offer force-delete option. */
                          const kind=item._legacy==="fabric"?"fabric":item._legacy==="accessory"?"accessory":"inventoryItem";
                          const labelAr=kind==="fabric"?"القماش":kind==="accessory"?"الإكسسوار":"الصنف";
                          const blocker=formatBlockerMessage(data,kind,item.id,item.name);
                          if(blocker){
                            /* Offer force-delete instead of just refusing */
                            const wantsForce=await ask(
                              "لا يمكن حذف "+labelAr,
                              blocker+"\n\nاضغط 'حذف بالقوة' لإجبار الحذف مع تنظيف الحركات المرتبطة، أو إلغاء.",
                              {danger:true,confirmText:"⚠️ حذف بالقوة",cancelText:"إلغاء"}
                            );
                            if(!wantsForce)return;
                            const force=canForceDelete(data,kind,item.id);
                            if(!force.ok){await tell("لا يمكن الحذف بالقوة",force.reason,{type:"error"});return}
                            const sum=summarizeForceDelete(data,kind,item.id);
                            const lines=[];
                            if(sum.currentStock>0)         lines.push("• الرصيد الحالي ("+sum.currentStock+") سيُمسح");
                            if(sum.moveCount>0)            lines.push("• "+sum.moveCount+" حركة مخزن سَتُحذف");
                            if(sum.receiptItemCount>0)     lines.push("• "+sum.receiptItemCount+" بند داخل إذن استلام سيُحذف");
                            if(sum.affectedReceipts.length>0) lines.push("• الإيصالات المتأثرة: "+sum.affectedReceipts.slice(0,3).join("، ")+(sum.affectedReceipts.length>3?"...":""));
                            const msg="سيتم حذف "+labelAr+" \""+item.name+"\" مع كل الحركات المرتبطة به:\n\n"+lines.join("\n")+"\n\n⚠️ هذه العملية لا يمكن التراجع عنها بشكل كامل.\n💡 لو فيه قيود محاسبية مرتبطة، راجع الترحيلات يدوياً.";
                            const confirmed=await ask("حذف بالقوة",msg,{danger:true,confirmText:"⚠️ حذف بالقوة",cancelText:"إلغاء"});
                            if(!confirmed)return;
                            upConfig(d=>{forceDeleteCleanup(d,kind,item.id)});
                            showToast("✓ تم الحذف بالقوة — راجع المحاسبة لو لزم");
                            return;
                          }
                          if(!await ask("حذف الصنف","حذف \""+item.name+"\" نهائياً؟",{danger:true}))return;
                          upConfig(d=>{
                            if(item._legacy==="fabric"){
                              if(d.fabrics)d.fabrics=d.fabrics.filter(x=>x.id!==item.id);
                            }else if(item._legacy==="accessory"){
                              if(d.accessories)d.accessories=d.accessories.filter(x=>x.id!==item.id);
                            }else{
                              deleteInventoryItem(d,item.id);
                            }
                          });
                          showToast("✓ تم الحذف");
                        }} title="حذف">🗑️</Btn>
                      </div>
                    </td>}
                  </tr>;
                })}
              </tbody>
            </table>
          </div>;
        })()}
      </Card>

      {/* Recent movements (read-only for now) */}
      {stockEnabled&&stockMovements.length>0&&<Card title="📊 آخر حركات المخزن" style={{marginTop:12}}>
        <div style={{maxHeight:320,overflowY:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
            <thead><tr>
              <th style={TH}>التاريخ</th>
              <th style={TH}>النوع</th>
              <th style={TH}>الصنف</th>
              <th style={{...TH,textAlign:"center"}}>الكمية</th>
              <th style={{...TH,textAlign:"center"}}>السعر</th>
              <th style={TH}>المرجع</th>
              <th style={TH}>بواسطة</th>
            </tr></thead>
            <tbody>
              {stockMovements.slice().sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).slice(0,50).map(m=>{
                const typeInfo=m.type==="in"?{icon:"↓",color:T.ok,label:"دخول"}:m.type==="out"?{icon:"↑",color:T.err,label:"خروج"}:m.type==="opening"?{icon:"◉",color:T.accent,label:"رصيد ابتدائي"}:{icon:"⟲",color:T.warn,label:"تسوية"};
                return<tr key={m.id} style={{borderBottom:"1px solid "+T.brd}}>
                  <td style={{...TD,fontSize:FS-2,color:T.textMut}}>{m.date}</td>
                  <td style={{...TD}}><span style={{padding:"2px 8px",borderRadius:8,fontSize:FS-3,fontWeight:700,background:typeInfo.color+"15",color:typeInfo.color}}>{typeInfo.icon+" "+typeInfo.label}</span></td>
                  <td style={{...TD,fontWeight:700}}>{m.itemName||"—"}</td>
                  <td style={{...TD,textAlign:"center",fontWeight:700,color:typeInfo.color}}>{(m.type==="out"?"-":"+")+fmt(m.qty)+" "+(m.unit||"")}</td>
                  <td style={{...TD,textAlign:"center",color:T.textSec}}>{m.price?fmt(r2(m.price)):"—"}</td>
                  <td style={{...TD,fontSize:FS-2,color:T.textMut}}>{m.notes||m.sourceType||"—"}</td>
                  <td style={{...TD,fontSize:FS-2,color:T.textMut}}>{m.createdBy||"—"}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </Card>}
    </>}

    {/* ════ SUB-TAB: RECEIPTS ════ */}
    {subTab==="receipts"&&<>
      {/* Receipts stats */}
      {(()=>{const stats={count:purchaseReceipts.length,total:0,paid:0,unpaid:0,thisMonth:0};
        const thisMonth=today.slice(0,7);
        purchaseReceipts.forEach(r=>{stats.total+=Number(r.totalAmount)||0;stats.paid+=Number(r.paidAmount)||0;stats.unpaid+=((Number(r.totalAmount)||0)-(Number(r.paidAmount)||0));if((r.date||"").startsWith(thisMonth))stats.thisMonth+=Number(r.totalAmount)||0});
        return<div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(4,1fr)",gap:10,marginBottom:12}}>
          <div style={{padding:12,borderRadius:10,background:T.accent+"06",border:"1px solid "+T.accent+"20"}}>
            <div style={{fontSize:FS-2,color:T.textSec}}>إجمالي المشتريات</div>
            <div style={{fontSize:FS+6,fontWeight:800,color:T.accent}}>{fmt(r2(stats.total))}</div>
            <div style={{fontSize:FS-3,color:T.textMut}}>{stats.count+" فاتورة"}</div>
          </div>
          <div style={{padding:12,borderRadius:10,background:T.ok+"06",border:"1px solid "+T.ok+"20"}}>
            <div style={{fontSize:FS-2,color:T.textSec}}>المدفوع</div>
            <div style={{fontSize:FS+6,fontWeight:800,color:T.ok}}>{fmt(r2(stats.paid))}</div>
            <div style={{fontSize:FS-3,color:T.textMut}}>ج.م</div>
          </div>
          <div style={{padding:12,borderRadius:10,background:T.err+"06",border:"1px solid "+T.err+"20"}}>
            <div style={{fontSize:FS-2,color:T.textSec}}>المتبقي (آجل)</div>
            <div style={{fontSize:FS+6,fontWeight:800,color:T.err}}>{fmt(r2(stats.unpaid))}</div>
            <div style={{fontSize:FS-3,color:T.textMut}}>ج.م</div>
          </div>
          <div style={{padding:12,borderRadius:10,background:"#8B5CF606",border:"1px solid #8B5CF620"}}>
            <div style={{fontSize:FS-2,color:T.textSec}}>هذا الشهر</div>
            <div style={{fontSize:FS+6,fontWeight:800,color:"#8B5CF6"}}>{fmt(r2(stats.thisMonth))}</div>
            <div style={{fontSize:FS-3,color:T.textMut}}>ج.م</div>
          </div>
        </div>})()}
      
      <Card>
        {/* Header: new receipt + filters */}
        <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"flex-end",marginBottom:10}}>
          {canEdit&&<Btn primary onClick={openNewReceipt}>➕ استلام جديد</Btn>}
          <div style={{flex:1,minWidth:150}}>
            <label style={{fontSize:FS-3,color:T.textSec,fontWeight:600}}>بحث</label>
            <Inp value={rcptFilter} onChange={setRcptFilter} placeholder="🔍 رقم الفاتورة، المورد..."/>
          </div>
          <div style={{minWidth:120}}>
            <label style={{fontSize:FS-3,color:T.textSec,fontWeight:600}}>المورد</label>
            <Sel value={rcptSupplierF} onChange={setRcptSupplierF}>
              <option value="">الكل</option>
              {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </Sel>
          </div>
          <div style={{minWidth:110}}>
            <label style={{fontSize:FS-3,color:T.textSec,fontWeight:600}}>من تاريخ</label>
            <Inp type="date" value={rcptDateFrom} onChange={setRcptDateFrom}/>
          </div>
          <div style={{minWidth:110}}>
            <label style={{fontSize:FS-3,color:T.textSec,fontWeight:600}}>إلى تاريخ</label>
            <Inp type="date" value={rcptDateTo} onChange={setRcptDateTo}/>
          </div>
          {(rcptFilter||rcptSupplierF||rcptDateFrom||rcptDateTo)&&<Btn small ghost onClick={()=>{setRcptFilter("");setRcptSupplierF("");setRcptDateFrom("");setRcptDateTo("")}} style={{marginBottom:2}}>✕ مسح</Btn>}
        </div>
        
        {/* Receipts table */}
        {(()=>{let filtered=purchaseReceipts.slice();
          const q=rcptFilterDeb.trim().toLowerCase();
          if(q)filtered=filtered.filter(r=>(r.receiptNo||"").toLowerCase().includes(q)||(r.supplierName||"").toLowerCase().includes(q));
          if(rcptSupplierF)filtered=filtered.filter(r=>String(r.supplierId)===String(rcptSupplierF));
          if(rcptDateFrom)filtered=filtered.filter(r=>(r.date||"")>=rcptDateFrom);
          if(rcptDateTo)filtered=filtered.filter(r=>(r.date||"")<=rcptDateTo);
          filtered.sort((a,b)=>(b.date||"").localeCompare(a.date||""));
          
          if(filtered.length===0)return<div style={{padding:40,textAlign:"center",color:T.textMut}}>
            {purchaseReceipts.length===0?"لا توجد استلامات بعد — اضغط \"استلام جديد\" للبدء":"لا توجد نتائج لهذه الفلاتر"}
          </div>;
          
          return<div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
              <thead><tr>
                <th style={TH}>رقم الفاتورة</th>
                <th style={TH}>التاريخ</th>
                <th style={TH}>المورد</th>
                <th style={{...TH,textAlign:"center"}}>البنود</th>
                <th style={{...TH,textAlign:"center"}}>الإجمالي</th>
                <th style={{...TH,textAlign:"center"}}>المدفوع</th>
                <th style={{...TH,textAlign:"center"}}>المتبقي</th>
                <th style={{...TH,textAlign:"center"}}>الدفع</th>
                <th style={{...TH,textAlign:"center"}}>الحالة</th>
                <th style={TH}></th>
              </tr></thead>
              <tbody>
                {filtered.map(r=>{const total=Number(r.totalAmount)||0;const paid=Number(r.paidAmount)||0;const remaining=total-paid;
                  const statusColor=r.paymentStatus==="paid"?T.ok:r.paymentStatus==="partial"?T.warn:T.err;
                  const statusLabel=r.paymentStatus==="paid"?"مدفوع":r.paymentStatus==="partial"?"جزئي":"غير مدفوع";
                  const methodLabel=r.paymentMethod==="cash"?"💵 كاش":r.paymentMethod==="check"?"📄 شيك":"⏳ آجل";
                  return<tr key={r.id} style={{borderBottom:"1px solid "+T.brd,cursor:"pointer"}} onClick={()=>setViewReceipt(r)}>
                    <td style={{...TD,fontWeight:700,color:T.accent}}>{r.receiptNo}</td>
                    <td style={{...TD}}>{r.date}</td>
                    <td style={{...TD,fontWeight:600}}>{r.supplierName||"—"}</td>
                    <td style={{...TD,textAlign:"center"}}>{(r.items||[]).length}</td>
                    <td style={{...TD,textAlign:"center",fontWeight:700}}>{fmt(r2(total))}</td>
                    <td style={{...TD,textAlign:"center",color:T.ok,fontWeight:600}}>{paid?fmt(r2(paid)):"—"}</td>
                    <td style={{...TD,textAlign:"center",color:remaining>0?T.err:T.textMut,fontWeight:600}}>{remaining>0?fmt(r2(remaining)):"—"}</td>
                    <td style={{...TD,textAlign:"center",fontSize:FS-2}}>{methodLabel}</td>
                    <td style={{...TD,textAlign:"center"}}>
                      <span style={{padding:"2px 8px",borderRadius:8,fontSize:FS-3,fontWeight:700,background:statusColor+"15",color:statusColor,border:"1px solid "+statusColor+"30"}}>{statusLabel}</span>
                    </td>
                    <td style={{...TD,textAlign:"center"}} onClick={e=>e.stopPropagation()}>
                      {canEdit&&userRole==="admin"&&<Btn small onClick={()=>deleteReceipt(r)} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30",padding:"3px 8px",fontSize:FS-3}}>🗑</Btn>}
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>})()}
      </Card>
    </>}
    
    {/* ════ SUB-TAB: ORDERS (PO) ════ */}
    {subTab==="orders"&&<>
      {/* Reports summary */}
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(4,1fr)",gap:10,marginBottom:12}}>
        <div style={{padding:12,borderRadius:10,background:T.accent+"06",border:"1px solid "+T.accent+"20"}}>
          <div style={{fontSize:FS-2,color:T.textSec}}>إجمالي الأوامر</div>
          <div style={{fontSize:FS+6,fontWeight:800,color:T.accent}}>{(data.purchaseOrders||[]).length}</div>
          <div style={{fontSize:FS-3,color:T.textMut}}>أمر شراء</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:"#8B5CF606",border:"1px solid #8B5CF620"}}>
          <div style={{fontSize:FS-2,color:T.textSec}}>قيمة الأوامر</div>
          <div style={{fontSize:FS+6,fontWeight:800,color:"#8B5CF6"}}>{fmt(r2((data.purchaseOrders||[]).reduce((s,p)=>s+(Number(p.totalAmount)||0),0)))}</div>
          <div style={{fontSize:FS-3,color:T.textMut}}>ج.م</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:T.ok+"06",border:"1px solid "+T.ok+"20"}}>
          <div style={{fontSize:FS-2,color:T.textSec}}>أعلى مورد</div>
          <div style={{fontSize:FS+1,fontWeight:800,color:T.ok}}>{purchaseReports.topSuppliers[0]?.name||"—"}</div>
          <div style={{fontSize:FS-3,color:T.textMut}}>{purchaseReports.topSuppliers[0]?fmt(r2(purchaseReports.topSuppliers[0].volume))+" ج.م":""}</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:T.err+"06",border:"1px solid "+T.err+"20"}}>
          <div style={{fontSize:FS-2,color:T.textSec}}>تنبيهات نقص</div>
          <div style={{fontSize:FS+6,fontWeight:800,color:T.err}}>{purchaseReports.lowStock.length}</div>
          <div style={{fontSize:FS-3,color:T.textMut}}>صنف تحت الحد</div>
        </div>
      </div>
      
      <Card>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"flex-end",marginBottom:10}}>
          {canEdit&&<Btn primary onClick={openNewPo}>➕ أمر شراء جديد</Btn>}
          <div style={{flex:1,minWidth:180}}>
            <label style={{fontSize:FS-3,color:T.textSec,fontWeight:600}}>بحث</label>
            <Inp value={poFilter} onChange={setPoFilter} placeholder="🔍 رقم، مورد..."/>
          </div>
        </div>
        
        {(()=>{const pos=(data.purchaseOrders||[]).slice();
          const q=poFilterDeb.trim().toLowerCase();
          let filtered=pos;
          if(q)filtered=pos.filter(p=>(p.poNo||"").toLowerCase().includes(q)||(p.supplierName||"").toLowerCase().includes(q));
          filtered.sort((a,b)=>(b.date||"").localeCompare(a.date||""));
          
          if(filtered.length===0)return<div style={{padding:40,textAlign:"center",color:T.textMut}}>
            <div style={{fontSize:40,marginBottom:8}}>📋</div>
            <div>{pos.length===0?"لا توجد أوامر شراء — اضغط \"أمر شراء جديد\"":"لا توجد نتائج"}</div>
          </div>;
          
          return<div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
              <thead><tr>
                <th style={TH}>رقم الأمر</th>
                <th style={TH}>التاريخ</th>
                <th style={TH}>المورد</th>
                <th style={{...TH,textAlign:"center"}}>البنود</th>
                <th style={{...TH,textAlign:"center"}}>الإجمالي</th>
                <th style={{...TH,textAlign:"center"}}>الإجراءات</th>
              </tr></thead>
              <tbody>
                {filtered.map(p=><tr key={p.id} style={{borderBottom:"1px solid "+T.brd,cursor:"pointer"}} onClick={()=>setViewPo(p)}>
                  <td style={{...TD,fontWeight:700,color:"#8B5CF6"}}>{p.poNo}</td>
                  <td style={{...TD}}>{p.date}</td>
                  <td style={{...TD,fontWeight:600}}>{p.supplierName||"—"}</td>
                  <td style={{...TD,textAlign:"center"}}>{(p.items||[]).length}</td>
                  <td style={{...TD,textAlign:"center",fontWeight:700,color:T.accent}}>{fmt(r2(p.totalAmount))}</td>
                  <td style={{...TD,textAlign:"center"}} onClick={e=>e.stopPropagation()}>
                    {canEdit&&<div style={{display:"flex",gap:4,justifyContent:"center"}}>
                      <Btn small onClick={()=>convertPoToReceipt(p)} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30",padding:"3px 8px",fontSize:FS-3}} title="تحويل لاستلام">📥</Btn>
                      <Btn small onClick={()=>editPo(p)} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30",padding:"3px 8px",fontSize:FS-3}} title="تعديل">✏️</Btn>
                      <Btn small onClick={()=>deletePo(p)} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30",padding:"3px 8px",fontSize:FS-3}} title="حذف">🗑</Btn>
                    </div>}
                  </td>
                </tr>)}
              </tbody>
            </table>
          </div>;
        })()}
      </Card>
      
      {/* Purchase Reports */}
      {purchaseReceipts.length>0&&<div style={{marginTop:14}}>
        <div style={{fontSize:FS+2,fontWeight:800,color:T.text,marginBottom:10}}>📊 تقارير المشتريات</div>
        
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:12,marginBottom:12}}>
          {/* Top suppliers */}
          <Card title="🏆 أعلى الموردين">
            {purchaseReports.topSuppliers.length===0?<div style={{padding:20,textAlign:"center",color:T.textMut}}>لا توجد بيانات</div>:<div>
              {purchaseReports.topSuppliers.map((s,i)=>{const max=purchaseReports.topSuppliers[0].volume||1;const pct=(s.volume/max)*100;
                return<div key={s.id} style={{marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,fontSize:FS-1}}>
                    <span style={{fontWeight:700}}>{(i+1)+". "+s.name}</span>
                    <span style={{color:T.accent,fontWeight:700}}>{fmt(s.volume)+" ج"}</span>
                  </div>
                  <div style={{height:6,background:T.bg,borderRadius:3,overflow:"hidden"}}>
                    <div style={{height:"100%",width:pct+"%",background:T.accent,borderRadius:3}}/>
                  </div>
                </div>;
              })}
            </div>}
          </Card>
          
          {/* Monthly trend */}
          <Card title="📅 الاتجاه الشهري">
            <div style={{display:"flex",alignItems:"flex-end",gap:6,height:120,padding:"10px 0"}}>
              {purchaseReports.monthly.map((m,i)=>{const max=Math.max(...purchaseReports.monthly.map(x=>x.total),1);const h=(m.total/max)*100;
                return<div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                  <div style={{fontSize:FS-3,color:T.textMut,fontWeight:600}}>{m.total>0?fmt(Math.round(m.total/1000))+"k":"—"}</div>
                  <div style={{width:"100%",height:h+"%",minHeight:m.total>0?3:1,background:m.total>0?T.accent:T.brd,borderRadius:"4px 4px 0 0"}}/>
                  <div style={{fontSize:FS-3,color:T.textMut,textAlign:"center",whiteSpace:"nowrap"}}>{m.label.split(" ")[0]}</div>
                </div>;
              })}
            </div>
          </Card>
        </div>
        
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:12,marginBottom:12}}>
          {/* Top fabrics */}
          <Card title="🧵 أعلى الخامات استهلاكاً">
            {purchaseReports.topFabrics.length===0?<div style={{padding:20,textAlign:"center",color:T.textMut}}>لا توجد بيانات</div>:<table style={{width:"100%",fontSize:FS-1,borderCollapse:"collapse"}}>
              <thead><tr><th style={TH}>الخامة</th><th style={{...TH,textAlign:"center"}}>الكمية</th><th style={{...TH,textAlign:"center"}}>القيمة</th></tr></thead>
              <tbody>{purchaseReports.topFabrics.map((f,i)=><tr key={i} style={{borderBottom:"1px solid "+T.brd}}>
                <td style={{...TD,fontWeight:700}}>{f.name}</td>
                <td style={{...TD,textAlign:"center"}}>{fmt(f.qty)+" "+f.unit}</td>
                <td style={{...TD,textAlign:"center",color:T.accent,fontWeight:700}}>{fmt(f.value)}</td>
              </tr>)}</tbody>
            </table>}
          </Card>
          
          {/* Top accessories */}
          <Card title="🪡 أعلى الإكسسوار استهلاكاً">
            {purchaseReports.topAccessories.length===0?<div style={{padding:20,textAlign:"center",color:T.textMut}}>لا توجد بيانات</div>:<table style={{width:"100%",fontSize:FS-1,borderCollapse:"collapse"}}>
              <thead><tr><th style={TH}>الإكسسوار</th><th style={{...TH,textAlign:"center"}}>الكمية</th><th style={{...TH,textAlign:"center"}}>القيمة</th></tr></thead>
              <tbody>{purchaseReports.topAccessories.map((a,i)=><tr key={i} style={{borderBottom:"1px solid "+T.brd}}>
                <td style={{...TD,fontWeight:700}}>{a.name}</td>
                <td style={{...TD,textAlign:"center"}}>{fmt(a.qty)+" "+a.unit}</td>
                <td style={{...TD,textAlign:"center",color:"#8B5CF6",fontWeight:700}}>{fmt(a.value)}</td>
              </tr>)}</tbody>
            </table>}
          </Card>
        </div>
        
        {/* Low stock alerts */}
        {purchaseReports.lowStock.length>0&&<Card title={"⚠️ أصناف تحت الحد الأدنى ("+purchaseReports.lowStock.length+")"} style={{borderLeft:"3px solid "+T.err}}>
          <table style={{width:"100%",fontSize:FS-1,borderCollapse:"collapse"}}>
            <thead><tr><th style={TH}>الصنف</th><th style={{...TH,textAlign:"center"}}>النوع</th><th style={{...TH,textAlign:"center"}}>الرصيد الحالي</th><th style={{...TH,textAlign:"center"}}>الحد الأدنى</th><th style={{...TH,textAlign:"center"}}>النقص</th></tr></thead>
            <tbody>{purchaseReports.lowStock.map((l,i)=><tr key={i} style={{borderBottom:"1px solid "+T.brd,background:l.stock===0?T.err+"08":T.warn+"04"}}>
              <td style={{...TD,fontWeight:700}}>{l.name}</td>
              <td style={{...TD,textAlign:"center"}}><span style={{padding:"2px 6px",borderRadius:6,fontSize:FS-3,background:l.type==="fabric"?T.accent+"15":"#8B5CF615",color:l.type==="fabric"?T.accent:"#8B5CF6"}}>{l.type==="fabric"?"🧵 خامة":"🪡 إكسسوار"}</span></td>
              <td style={{...TD,textAlign:"center",fontWeight:800,color:l.stock===0?T.err:T.warn}}>{fmt(l.stock)+" "+l.unit}</td>
              <td style={{...TD,textAlign:"center",color:T.textSec}}>{fmt(l.minStock)+" "+l.unit}</td>
              <td style={{...TD,textAlign:"center",color:T.err,fontWeight:800}}>{fmt(r2(l.minStock-l.stock))+" "+l.unit}</td>
            </tr>)}</tbody>
          </table>
        </Card>}
      </div>}
    </>}
    
    {/* ════ V16.31: SUB-TAB: CATEGORIES (الأصناف) ════ */}
    {subTab==="categories"&&(()=>{
      const cats=getCategories(data);
      return<>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
          <div style={{fontSize:FS-1,color:T.textSec,lineHeight:1.6}}>
            💡 الأصناف بتنظّم المخزن والمشتريات. الأصناف الأساسية (قماش + اكسسوار) ثابتة لأنها مرتبطة بالأوردرات. تقدر تضيف أصناف جديدة (قطع غيار، مواد تنظيف، إلخ).
          </div>
          {canEdit&&<Btn primary small onClick={()=>setCatEditPopup({name:"",emoji:"📦"})}>+ صنف جديد</Btn>}
        </div>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
          {cats.map(cat=>{
            const items=getItemsForCategory(data,cat.id);
            const lowStock=items.filter(it=>it.minStock>0&&it.stock<=it.minStock).length;
            return<Card key={cat.id}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,gap:8}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:FS+6,fontWeight:800,color:T.text,display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:FS+10}}>{cat.emoji||"📦"}</span>
                    <span>{cat.name}</span>
                    {cat.isCore&&<span style={{fontSize:FS-3,padding:"2px 6px",borderRadius:4,background:T.accent+"15",color:T.accent,fontWeight:700}} title="صنف أساسي">أساسي</span>}
                  </div>
                </div>
                {canEdit&&!cat.isCore&&<div style={{display:"flex",gap:4}}>
                  <Btn small ghost onClick={()=>setCatEditPopup({id:cat.id,name:cat.name,emoji:cat.emoji||"📦"})} title="تعديل">✏️</Btn>
                  <Btn small ghost onClick={async()=>{
                    /* V16.67: Use central dataIntegrity — same check as before
                       (items.length) plus future-proofing if more refs get added. */
                    const blocker=formatBlockerMessage(data,"itemCategory",cat.id,cat.name);
                    if(blocker){await tell("لا يمكن حذف الفئة",blocker,{type:"warning"});return}
                    if(!await ask("حذف الصنف","سيتم حذف \""+cat.name+"\" — هل أنت متأكد؟",{danger:true}))return;
                    upConfig(d=>{deleteCategory(d,cat.id)});
                    showToast("✓ تم الحذف");
                  }} title="حذف">🗑️</Btn>
                </div>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:10}}>
                <div style={{padding:"6px 8px",borderRadius:6,background:T.bg,textAlign:"center"}}>
                  <div style={{fontSize:FS-3,color:T.textMut}}>الأنواع</div>
                  <div style={{fontSize:FS+1,fontWeight:800,color:"#8B5CF6"}}>{(cat.types||[]).length}</div>
                </div>
                <div style={{padding:"6px 8px",borderRadius:6,background:T.bg,textAlign:"center"}}>
                  <div style={{fontSize:FS-3,color:T.textMut}}>الأصناف</div>
                  <div style={{fontSize:FS+1,fontWeight:800,color:T.accent}}>{items.length}</div>
                </div>
                <div style={{padding:"6px 8px",borderRadius:6,background:lowStock>0?T.warn+"15":T.bg,textAlign:"center"}}>
                  <div style={{fontSize:FS-3,color:T.textMut}}>ناقص</div>
                  <div style={{fontSize:FS+1,fontWeight:800,color:lowStock>0?T.warn:T.textMut}}>{lowStock}</div>
                </div>
              </div>
              {(cat.types||[]).length>0&&<div style={{marginBottom:10,display:"flex",flexWrap:"wrap",gap:4}}>
                {(cat.types||[]).slice(0,8).map(t=><span key={t} style={{padding:"2px 8px",borderRadius:4,background:"#8B5CF610",color:"#8B5CF6",fontSize:FS-3,fontWeight:600}}>{t}</span>)}
                {(cat.types||[]).length>8&&<span style={{fontSize:FS-3,color:T.textMut}}>+{(cat.types||[]).length-8}</span>}
              </div>}
              {canEdit&&<Btn small onClick={()=>setCatTypesPopup({categoryId:cat.id})} style={{width:"100%",background:"#8B5CF610",color:"#8B5CF6",border:"1px solid #8B5CF640"}}>🏷️ إدارة الأنواع</Btn>}
            </Card>;
          })}
        </div>
      </>;
    })()}
    
    {/* ════ V16.31: Category create/edit popup ════ */}
    {catEditPopup&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setCatEditPopup(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:420,border:"1px solid "+T.brd}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>{catEditPopup.id?"✏️ تعديل صنف":"+ صنف جديد"}</div>
          <Btn ghost small onClick={()=>setCatEditPopup(null)}>✕</Btn>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الإيموجي</label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
              {["📦","🧵","🪡","🔧","🛠️","⚙️","🧴","📐","✂️","🎨","🧪","💡"].map(e=><span key={e} onClick={()=>setCatEditPopup({...catEditPopup,emoji:e})} style={{cursor:"pointer",fontSize:24,padding:6,borderRadius:8,background:catEditPopup.emoji===e?T.accent+"20":T.bg,border:"2px solid "+(catEditPopup.emoji===e?T.accent:"transparent")}}>{e}</span>)}
            </div>
          </div>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>اسم الصنف *</label>
            <Inp value={catEditPopup.name} onChange={v=>setCatEditPopup({...catEditPopup,name:v})} placeholder="مثلاً: قطع غيار"/>
          </div>
        </div>
        <div style={{display:"flex",gap:8,marginTop:14,justifyContent:"flex-end"}}>
          <Btn ghost onClick={()=>setCatEditPopup(null)}>إلغاء</Btn>
          <Btn primary onClick={()=>{
            const name=(catEditPopup.name||"").trim();
            if(!name){showToast("⚠️ ادخل اسم الصنف");return}
            upConfig(d=>{
              if(catEditPopup.id)updateCategory(d,catEditPopup.id,{name,emoji:catEditPopup.emoji});
              else addCategory(d,{name,emoji:catEditPopup.emoji});
            });
            setCatEditPopup(null);
            showToast("✓ تم الحفظ");
          }}>💾 حفظ</Btn>
        </div>
      </div>
    </div>}

    {/* ════ V16.31: Category types management popup ════ */}
    {catTypesPopup&&(()=>{
      const cat=getCategoryById(data,catTypesPopup.categoryId);
      if(!cat)return null;
      const newType=catTypesPopup.newType||"";
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setCatTypesPopup(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:480,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>🏷️ أنواع: {cat.emoji} {cat.name}</div>
            <Btn ghost small onClick={()=>setCatTypesPopup(null)}>✕</Btn>
          </div>
          <div style={{padding:"8px 12px",borderRadius:8,background:"#8B5CF608",border:"1px solid #8B5CF620",fontSize:FS-2,color:T.textSec,marginBottom:12,lineHeight:1.6}}>
            💡 الأنواع تنظّم الأصناف داخل الصنف. مثلاً صنف "قماش" أنواعه: قطن، تريكو، إلخ.
          </div>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <Inp value={newType} onChange={v=>setCatTypesPopup({...catTypesPopup,newType:v})} placeholder="نوع جديد..." style={{flex:1}}/>
            <Btn small primary onClick={()=>{
              const t=(newType||"").trim();
              if(!t){showToast("⚠️ ادخل اسم النوع");return}
              upConfig(d=>{
                if(!addTypeToCategory(d,cat.id,t)){showToast("⚠️ النوع موجود بالفعل")}
              });
              setCatTypesPopup({...catTypesPopup,newType:""});
            }}>+ إضافة</Btn>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {(cat.types||[]).length===0?<div style={{textAlign:"center",padding:20,color:T.textMut,fontSize:FS-1}}>لا توجد أنواع بعد — أضف أول نوع</div>
            :(cat.types||[]).map(t=><div key={t} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",borderRadius:8,background:T.bg,border:"1px solid "+T.brd}}>
              <span style={{fontWeight:600,fontSize:FS-1}}>🏷️ {t}</span>
              <Btn small ghost onClick={async()=>{
                if(!await ask("حذف النوع","حذف \""+t+"\" من أنواع "+cat.name+"؟",{danger:true}))return;
                upConfig(d=>{removeTypeFromCategory(d,cat.id,t)});
              }} title="حذف">🗑️</Btn>
            </div>)}
          </div>
        </div>
      </div>;
    })()}

    {/* ════ V16.31: Inventory item create/edit popup
        V16.60: Now supports legacy fabric/accessory too. When _legacy is set,
        the popup hides the type/notes fields (legacy records don't have them)
        and the save handler writes to data.fabrics / data.accessories instead
        of data.inventoryItems. ════ */}
    {itemEditPopup&&(()=>{
      const cat=getCategoryById(data,itemEditPopup.categoryId);
      if(!cat)return null;
      const isLegacy=!!itemEditPopup._legacy;
      const isEdit=!!itemEditPopup.id;
      const set=(patch)=>setItemEditPopup({...itemEditPopup,...patch});
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setItemEditPopup(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:520,maxHeight:"90vh",overflowY:"auto",border:"1px solid "+T.brd}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>{isEdit?"✏️ تعديل "+(itemEditPopup._legacy==="fabric"?"خامة":itemEditPopup._legacy==="accessory"?"إكسسوار":"صنف"):"+ "+(itemEditPopup._legacy==="fabric"?"خامة جديدة":itemEditPopup._legacy==="accessory"?"إكسسوار جديد":"صنف جديد")}</div>
            <Btn ghost small onClick={()=>setItemEditPopup(null)}>✕</Btn>
          </div>
          <div style={{padding:"6px 10px",borderRadius:6,background:T.bg,fontSize:FS-2,color:T.textSec,marginBottom:12}}>الصنف الرئيسي: <b>{cat.emoji} {cat.name}</b></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div style={{gridColumn:"1 / -1"}}>
              <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الاسم *</label>
              <Inp value={itemEditPopup.name} onChange={v=>set({name:v})} placeholder={itemEditPopup._legacy==="fabric"?"مثلاً: قطن مفرد 30":itemEditPopup._legacy==="accessory"?"مثلاً: زرار بلاستيك ابيض":"مثلاً: إبرة سنجر مقاس 12"}/>
            </div>
            {!isLegacy&&<div>
              <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>النوع</label>
              <Sel value={itemEditPopup.type} onChange={v=>set({type:v})}><option value="">— بدون —</option>{(cat.types||[]).map(t=><option key={t} value={t}>{t}</option>)}</Sel>
            </div>}
            <div>
              <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الوحدة</label>
              <Sel value={itemEditPopup.unit} onChange={v=>set({unit:v})}>{getUnits(data,itemEditPopup.unit).map(u=><option key={u} value={u}>{u}</option>)}</Sel>
            </div>
            <div>
              <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الحد الأدنى</label>
              <Inp type="number" value={itemEditPopup.minStock} onChange={v=>set({minStock:v})} placeholder="0"/>
            </div>
            <div>
              <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>{isEdit?"متوسط التكلفة الحالي":(isLegacy?"السعر":"التكلفة الافتتاحية")}</label>
              <Inp type="number" value={itemEditPopup.avgCost} onChange={v=>set({avgCost:v})} placeholder="0"/>
            </div>
            <div style={{gridColumn:"1 / -1"}}>
              <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>المورد الافتراضي (اختياري)</label>
              <Sel value={itemEditPopup.defaultSupplierId} onChange={v=>set({defaultSupplierId:v})}><option value="">— بدون —</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</Sel>
            </div>
            {!isLegacy&&<div style={{gridColumn:"1 / -1"}}>
              <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>ملاحظات</label>
              <Inp value={itemEditPopup.notes} onChange={v=>set({notes:v})} placeholder="..."/>
            </div>}
          </div>
          <div style={{display:"flex",gap:8,marginTop:14,justifyContent:"flex-end"}}>
            <Btn ghost onClick={()=>setItemEditPopup(null)}>إلغاء</Btn>
            <Btn primary onClick={()=>{
              const name=(itemEditPopup.name||"").trim();
              if(!name){showToast("⚠️ ادخل الاسم");return}
              upConfig(d=>{
                if(itemEditPopup._legacy==="fabric"){
                  /* V16.60: Legacy fabric — write directly to d.fabrics */
                  if(!d.fabrics)d.fabrics=[];
                  if(isEdit){
                    const idx=d.fabrics.findIndex(x=>x.id===itemEditPopup.id);
                    if(idx>=0){const o=d.fabrics[idx];d.fabrics[idx]={...o,name,unit:itemEditPopup.unit,minStock:Number(itemEditPopup.minStock)||0,price:Number(itemEditPopup.avgCost)||0,avgCost:Number(itemEditPopup.avgCost)||0,defaultSupplierId:itemEditPopup.defaultSupplierId||""}}
                  }else{
                    d.fabrics.push({id:Date.now()+Math.floor(Math.random()*1000),name,unit:itemEditPopup.unit,minStock:Number(itemEditPopup.minStock)||0,price:Number(itemEditPopup.avgCost)||0,avgCost:Number(itemEditPopup.avgCost)||0,stock:0,defaultSupplierId:itemEditPopup.defaultSupplierId||""});
                  }
                }else if(itemEditPopup._legacy==="accessory"){
                  /* V16.60: Legacy accessory — write directly to d.accessories */
                  if(!d.accessories)d.accessories=[];
                  if(isEdit){
                    const idx=d.accessories.findIndex(x=>x.id===itemEditPopup.id);
                    if(idx>=0){const o=d.accessories[idx];d.accessories[idx]={...o,name,unit:itemEditPopup.unit,minStock:Number(itemEditPopup.minStock)||0,price:Number(itemEditPopup.avgCost)||0,avgCost:Number(itemEditPopup.avgCost)||0,defaultSupplierId:itemEditPopup.defaultSupplierId||""}}
                  }else{
                    d.accessories.push({id:Date.now()+Math.floor(Math.random()*1000),name,unit:itemEditPopup.unit,minStock:Number(itemEditPopup.minStock)||0,price:Number(itemEditPopup.avgCost)||0,avgCost:Number(itemEditPopup.avgCost)||0,stock:0,qtyPerPiece:1,defaultSupplierId:itemEditPopup.defaultSupplierId||""});
                  }
                }else{
                  /* Non-legacy inventoryItems[] — original path */
                  if(isEdit)updateInventoryItem(d,itemEditPopup.id,{name,type:itemEditPopup.type,unit:itemEditPopup.unit,minStock:itemEditPopup.minStock,avgCost:itemEditPopup.avgCost,defaultSupplierId:itemEditPopup.defaultSupplierId,notes:itemEditPopup.notes});
                  else addInventoryItem(d,itemEditPopup.categoryId,{name,type:itemEditPopup.type,unit:itemEditPopup.unit,minStock:itemEditPopup.minStock,avgCost:itemEditPopup.avgCost,defaultSupplierId:itemEditPopup.defaultSupplierId,notes:itemEditPopup.notes,stock:0},userName);
                }
              });
              setItemEditPopup(null);
              showToast("✓ تم الحفظ");
            }}>💾 حفظ</Btn>
          </div>
        </div>
      </div>;
    })()}

    {/* ════ SUB-TAB: SUPPLIERS ════ */}
    {subTab==="suppliers"&&<>
      {/* Supplier totals cards */}
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(4,1fr)",gap:10,marginBottom:12}}>
        <div style={{padding:12,borderRadius:10,background:T.accent+"06",border:"1px solid "+T.accent+"20"}}>
          <div style={{fontSize:FS-2,color:T.textSec}}>إجمالي المشتريات</div>
          <div style={{fontSize:FS+6,fontWeight:800,color:T.accent}}>{fmt(supplierTotals.invoiced)}</div>
          <div style={{fontSize:FS-3,color:T.textMut}}>ج.م</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:T.ok+"06",border:"1px solid "+T.ok+"20"}}>
          <div style={{fontSize:FS-2,color:T.textSec}}>إجمالي المدفوع</div>
          <div style={{fontSize:FS+6,fontWeight:800,color:T.ok}}>{fmt(supplierTotals.paid)}</div>
          <div style={{fontSize:FS-3,color:T.textMut}}>ج.م</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:T.err+"06",border:"1px solid "+T.err+"20"}}>
          <div style={{fontSize:FS-2,color:T.textSec}}>الرصيد المستحق</div>
          <div style={{fontSize:FS+6,fontWeight:800,color:T.err}}>{fmt(supplierTotals.balance)}</div>
          <div style={{fontSize:FS-3,color:T.textMut}}>ج.م</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:T.warn+"06",border:"1px solid "+T.warn+"20"}}>
          <div style={{fontSize:FS-2,color:T.textSec}}>موردين لهم رصيد</div>
          <div style={{fontSize:FS+6,fontWeight:800,color:T.warn}}>{supplierTotals.countWithBalance}</div>
          <div style={{fontSize:FS-3,color:T.textMut}}>من {suppliers.length} مورد</div>
        </div>
      </div>
      
      <Card>
        {/* Filters */}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end",marginBottom:10}}>
          <div style={{flex:1,minWidth:200}}>
            <label style={{fontSize:FS-3,color:T.textSec,fontWeight:600}}>بحث</label>
            <Inp value={supFilter} onChange={setSupFilter} placeholder="🔍 اسم المورد أو التليفون..."/>
          </div>
          <div style={{minWidth:140}}>
            <label style={{fontSize:FS-3,color:T.textSec,fontWeight:600}}>ترتيب</label>
            <Sel value={supSortBy} onChange={setSupSortBy}>
              <option value="balance">الرصيد (الأكبر أولاً)</option>
              <option value="name">الاسم</option>
              <option value="total">إجمالي المشتريات</option>
              <option value="recent">الأحدث نشاطاً</option>
            </Sel>
          </div>
          {canEdit&&<Btn onClick={openAddSupplier} style={{background:T.accent,color:"#fff",border:"none",fontWeight:700,display:"flex",alignItems:"center",gap:6}}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>مورد جديد</span>
          </Btn>}
        </div>
        
        {/* Suppliers table */}
        {suppliers.length===0?<div style={{padding:"40px 20px",textAlign:"center"}}>
          <div style={{fontSize:48,marginBottom:12}}>👥</div>
          <div style={{fontSize:FS+2,fontWeight:700,color:T.text,marginBottom:6}}>لا يوجد موردين مسجلين</div>
          <div style={{fontSize:FS-1,color:T.textMut,marginBottom:16}}>ابدأ بإضافة أول مورد لتسجيل فواتير الشراء</div>
          {canEdit&&<Btn onClick={openAddSupplier} style={{background:T.accent,color:"#fff",border:"none",fontWeight:700,padding:"10px 20px",fontSize:FS}}>
            <span style={{marginLeft:6}}>➕</span>إضافة أول مورد
          </Btn>}
        </div>:(()=>{
          let list=suppliers.map(s=>{const st=supplierStats[s.id]||{};return{...s,_stats:st}});
          const q=supFilterDeb.trim().toLowerCase();
          if(q)list=list.filter(s=>(s.name||"").toLowerCase().includes(q)||(s.phone||"").includes(q));
          if(supSortBy==="balance")list.sort((a,b)=>(b._stats.balance||0)-(a._stats.balance||0));
          else if(supSortBy==="name")list.sort((a,b)=>(a.name||"").localeCompare(b.name||"","ar"));
          else if(supSortBy==="total")list.sort((a,b)=>(b._stats.totalInvoiced||0)-(a._stats.totalInvoiced||0));
          else if(supSortBy==="recent")list.sort((a,b)=>(b._stats.lastActivity||"").localeCompare(a._stats.lastActivity||""));
          
          if(list.length===0)return<div style={{padding:30,textAlign:"center",color:T.textMut}}>لا توجد نتائج لهذا البحث</div>;
          
          return<div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
              <thead><tr>
                <th style={TH}>المورد</th>
                <th style={TH}>التليفون</th>
                <th style={{...TH,textAlign:"center"}}>الفواتير</th>
                <th style={{...TH,textAlign:"center"}}>إجمالي المشتريات</th>
                <th style={{...TH,textAlign:"center"}}>المدفوع</th>
                <th style={{...TH,textAlign:"center"}}>الرصيد</th>
                <th style={{...TH,textAlign:"center"}}>آخر نشاط</th>
                <th style={{...TH,textAlign:"center"}}></th>
              </tr></thead>
              <tbody>
                {list.map(s=>{const st=s._stats;const bal=Number(st.balance)||0;const isOwed=bal>1;const isOverpaid=bal<-1;
                  return<tr key={s.id} style={{borderBottom:"1px solid "+T.brd,cursor:"pointer"}} onClick={()=>setActiveSupplier(s)}>
                    <td style={{...TD,fontWeight:700,color:T.text}}>{s.name}</td>
                    <td style={{...TD,color:T.textSec,fontSize:FS-2}}>{s.phone||"—"}</td>
                    <td style={{...TD,textAlign:"center"}}>{st.receiptCount||0}</td>
                    <td style={{...TD,textAlign:"center",fontWeight:600}}>{fmt(r2(st.totalInvoiced||0))}</td>
                    <td style={{...TD,textAlign:"center",color:T.ok,fontWeight:600}}>{fmt(r2(st.totalPaid||0))}</td>
                    <td style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS,color:isOwed?T.err:isOverpaid?T.accent:T.textMut}}>{isOwed?fmt(r2(bal)):isOverpaid?"+"+fmt(r2(Math.abs(bal))):"مسدد"}</td>
                    <td style={{...TD,textAlign:"center",fontSize:FS-2,color:T.textMut}}>{st.lastActivity||"—"}</td>
                    <td style={{...TD,textAlign:"center"}} onClick={e=>e.stopPropagation()}>
                      <div style={{display:"flex",gap:4,justifyContent:"center",flexWrap:"wrap"}}>
                        {canEdit&&isOwed&&<Btn small onClick={()=>openPayForm(s)} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30",padding:"3px 8px",fontSize:FS-3}}>💰 دفعة</Btn>}
                        {canEdit&&<Btn small onClick={()=>openEditSupplier(s)} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30",padding:"3px 8px",fontSize:FS-3}} title="تعديل">✏️</Btn>}
                        {canEdit&&(st.receiptCount||0)===0&&Math.abs(st.balance||0)<0.01&&<Btn small onClick={()=>deleteSupplier(s)} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30",padding:"3px 8px",fontSize:FS-3}} title="حذف">🗑️</Btn>}
                      </div>
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>;
        })()}
      </Card>
    </>}

    {/* ════ SUPPLIER ADD/EDIT POPUP — V14.49 ════ */}
    {showSupForm&&supForm&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:99998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>{setShowSupForm(false);setSupForm(null)}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:isMob?18:24,width:"100%",maxWidth:480,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",maxHeight:"92vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:FS+3,fontWeight:800,color:T.accent,display:"flex",alignItems:"center",gap:8}}>
            <span>{supForm.id?"✏️":"➕"}</span>
            <span>{supForm.id?"تعديل بيانات المورد":"إضافة مورد جديد"}</span>
          </div>
          <Btn ghost small onClick={()=>{setShowSupForm(false);setSupForm(null)}}>✕</Btn>
        </div>
        
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div>
            <label style={{fontSize:FS-1,color:T.textSec,fontWeight:700,marginBottom:4,display:"block"}}>
              اسم المورد <span style={{color:T.err}}>*</span>
            </label>
            <Inp value={supForm.name} onChange={v=>setSupForm(p=>({...p,name:v}))} placeholder="مثلاً: مؤسسة النصر للأقمشة"/>
          </div>
          
          <div>
            <label style={{fontSize:FS-1,color:T.textSec,fontWeight:700,marginBottom:4,display:"block"}}>
              التليفون <span style={{color:T.textMut,fontWeight:500}}>(اختياري)</span>
            </label>
            <Inp value={supForm.phone} onChange={v=>setSupForm(p=>({...p,phone:v}))} placeholder="+201xxxxxxxxx" style={{direction:"ltr",textAlign:"left",fontFamily:"monospace"}}/>
          </div>
          
          <div>
            <label style={{fontSize:FS-1,color:T.textSec,fontWeight:700,marginBottom:4,display:"block"}}>
              العنوان <span style={{color:T.textMut,fontWeight:500}}>(اختياري)</span>
            </label>
            <Inp value={supForm.address} onChange={v=>setSupForm(p=>({...p,address:v}))} placeholder="العنوان / المنطقة"/>
          </div>
          
          <div>
            <label style={{fontSize:FS-1,color:T.textSec,fontWeight:700,marginBottom:4,display:"block"}}>
              ملاحظات <span style={{color:T.textMut,fontWeight:500}}>(اختياري)</span>
            </label>
            <textarea value={supForm.notes} onChange={e=>setSupForm(p=>({...p,notes:e.target.value}))} placeholder="شروط الدفع، ساعات العمل، ملاحظات أخرى..." rows={3} style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"inherit",background:T.inputBg||T.cardSolid,color:T.text,boxSizing:"border-box",resize:"vertical",minHeight:60,outline:"none"}}/>
          </div>
        </div>
        
        <div style={{display:"flex",gap:8,marginTop:18,justifyContent:"flex-end"}}>
          <Btn ghost onClick={()=>{setShowSupForm(false);setSupForm(null)}}>إلغاء</Btn>
          <Btn onClick={saveSupplier} style={{background:T.accent,color:"#fff",border:"none",fontWeight:700}}>💾 حفظ</Btn>
        </div>
      </div>
    </div>}

    {/* ════ ACTIVATE POPUP ════ */}
    {showActivate&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowActivate(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:420,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>🚀 تفعيل المخزن</div>
          <Btn ghost small onClick={()=>setShowActivate(false)}>✕</Btn>
        </div>
        <div style={{padding:12,background:T.accent+"08",borderRadius:10,marginBottom:14,fontSize:FS-1,lineHeight:1.7}}>
          <div style={{marginBottom:6}}>عند التفعيل:</div>
          <div>✅ الاستلامات الجديدة ستُضاف للمخزن</div>
          <div>✅ الأوردرات ستخصم الخامات تلقائياً</div>
          <div>✅ حماية: لن يمكن القص إذا المخزن ناقص</div>
          <div style={{marginTop:6,color:T.warn}}>⚠️ الأوردرات القديمة لن تتأثر</div>
        </div>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,marginBottom:4,display:"block"}}>تاريخ التفعيل</label>
          <Inp type="date" value={activateDate} onChange={setActivateDate}/>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <Btn ghost onClick={()=>setShowActivate(false)}>إلغاء</Btn>
          <Btn primary onClick={activateStockModule}>🚀 تفعيل</Btn>
        </div>
      </div>
    </div>}

    {/* ════ OPENING BALANCE POPUP ════ */}
    {showOpeningBal&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowOpeningBal(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:20,width:"100%",maxWidth:700,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:"#F59E0B"}}>➕ الرصيد الابتدائي</div>
          <Btn ghost small onClick={()=>setShowOpeningBal(false)}>✕</Btn>
        </div>
        <div style={{padding:10,background:"#F59E0B10",borderRadius:8,marginBottom:12,fontSize:FS-2,color:T.textSec}}>
          أدخل الكمية الموجودة حالياً لكل صنف وتكلفتها. الحقول الفارغة ستُتجاهل.
        </div>
        
        {/* Type switch */}
        <div style={{display:"flex",gap:6,marginBottom:10}}>
          <div onClick={()=>setOpeningType("fabric")} style={{padding:"6px 14px",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:FS-1,background:openingType==="fabric"?T.accent:T.bg,color:openingType==="fabric"?"#fff":T.text}}>🧵 خامات</div>
          <div onClick={()=>setOpeningType("accessory")} style={{padding:"6px 14px",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:FS-1,background:openingType==="accessory"?"#8B5CF6":T.bg,color:openingType==="accessory"?"#fff":T.text}}>🪡 إكسسوار</div>
        </div>
        
        <div style={{flex:1,overflowY:"auto",border:"1px solid "+T.brd,borderRadius:10}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
            <thead style={{position:"sticky",top:0,background:T.cardSolid,zIndex:1}}><tr>
              <th style={TH}>الصنف</th>
              <th style={{...TH,textAlign:"center"}}>الرصيد الحالي</th>
              <th style={{...TH,textAlign:"center"}}>الكمية</th>
              <th style={{...TH,textAlign:"center"}}>تكلفة الوحدة</th>
              <th style={{...TH,textAlign:"center"}}>القيمة</th>
            </tr></thead>
            <tbody>
              {(openingType==="fabric"?fabrics:accessories).map(item=>{const d=openingData[item.id]||{};const qty=Number(d.qty)||0;const cost=Number(d.cost)||0;
                return<tr key={item.id} style={{borderBottom:"1px solid "+T.brd}}>
                  <td style={{...TD,fontWeight:700}}>{item.name}</td>
                  <td style={{...TD,textAlign:"center",color:T.textMut}}>{fmt(Number(item.stock)||0)+" "+(item.unit||"")}</td>
                  <td style={{...TD,textAlign:"center"}}><Inp type="number" value={d.qty||""} onChange={v=>setOpeningData(p=>({...p,[item.id]:{...p[item.id],qty:v}}))} placeholder="0" style={{width:80,padding:"3px 6px",textAlign:"center"}}/></td>
                  <td style={{...TD,textAlign:"center"}}><Inp type="number" value={d.cost||""} onChange={v=>setOpeningData(p=>({...p,[item.id]:{...p[item.id],cost:v}}))} placeholder={item.price||"0"} style={{width:80,padding:"3px 6px",textAlign:"center"}}/></td>
                  <td style={{...TD,textAlign:"center",fontWeight:700,color:T.accent}}>{qty&&cost?fmt(r2(qty*cost)):"—"}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}>
          <Btn ghost onClick={()=>setShowOpeningBal(false)}>إلغاء</Btn>
          <Btn primary onClick={saveOpeningBalance}>💾 حفظ الرصيد الابتدائي</Btn>
        </div>
      </div>
    </div>}

    {/* ════ NEW RECEIPT FORM POPUP ════ */}
    {showReceiptForm&&rcpt&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowReceiptForm(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:20,width:"100%",maxWidth:900,maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>📥 استلام جديد</div>
          <Btn ghost small onClick={()=>setShowReceiptForm(false)}>✕</Btn>
        </div>
        
        <div style={{flex:1,overflowY:"auto",paddingRight:4}}>
          {/* Header: supplier + date */}
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"2fr 1fr",gap:12,marginBottom:14}}>
            <div>
              <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,marginBottom:4,display:"block"}}>المورد <span style={{color:T.err}}>*</span></label>
              <div style={{display:"flex",gap:6,alignItems:"stretch"}}>
                <div style={{flex:1}}>
                  <SearchSel value={rcpt.supplierId} onChange={v=>{const s=suppliers.find(x=>String(x.id)===String(v));setRcpt(p=>({...p,supplierId:v,supplierName:s?.name||""}))}} options={suppliers.map(s=>({value:s.id,label:s.name+(s.phone?" — "+s.phone:"")}))} placeholder="ابحث عن المورد..."/>
                </div>
                {canEdit&&<button onClick={openAddSupplier} title="إضافة مورد جديد" style={{padding:"8px 12px",borderRadius:8,border:"1px solid "+T.accent+"40",background:T.accent+"12",color:T.accent,cursor:"pointer",fontSize:FS,fontWeight:700,fontFamily:"inherit",display:"flex",alignItems:"center",gap:4,whiteSpace:"nowrap"}}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  <span>جديد</span>
                </button>}
              </div>
              {suppliers.length===0&&<div style={{fontSize:FS-3,color:T.err,marginTop:4}}>⚠️ لا يوجد موردين — اضغط "جديد" لإضافة أول مورد</div>}
            </div>
            <div>
              <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,marginBottom:4,display:"block"}}>التاريخ</label>
              <Inp type="date" value={rcpt.date} onChange={v=>setRcpt(p=>({...p,date:v}))}/>
            </div>
          </div>
          
          {/* Items section */}
          <div style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <label style={{fontSize:FS,color:T.text,fontWeight:700}}>البنود <span style={{color:T.err}}>*</span></label>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {/* V16.31: One add button per category. Legacy stays as "fabric"/"accessory" string for back-compat */}
                {getCategories(data).map(cat=>{
                  const itemTypeKey=cat.legacy||cat.id;
                  const color=cat.legacy==="fabric"?T.accent:cat.legacy==="accessory"?"#8B5CF6":"#F59E0B";
                  return<Btn key={cat.id} small onClick={()=>addRcptItem(itemTypeKey)} style={{background:color+"12",color:color,border:"1px solid "+color+"30"}}>{"+ "+(cat.emoji||"📦")+" "+cat.name}</Btn>;
                })}
              </div>
            </div>
            
            {(rcpt.items||[]).length===0?<div style={{padding:24,textAlign:"center",color:T.textMut,background:T.bg,borderRadius:10,border:"1px dashed "+T.brd}}>
              <div style={{fontSize:32,marginBottom:6}}>📋</div>
              <div style={{fontSize:FS-1}}>لا توجد بنود — أضف خامة أو إكسسوار</div>
            </div>:<div style={{overflowX:"auto",border:"1px solid "+T.brd,borderRadius:10}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
                <thead><tr>
                  <th style={{...TH,fontSize:FS-3}}>النوع</th>
                  <th style={{...TH,fontSize:FS-3,minWidth:180}}>الصنف</th>
                  <th style={{...TH,fontSize:FS-3,textAlign:"center",width:90}}>الكمية</th>
                  <th style={{...TH,fontSize:FS-3,textAlign:"center",width:70}}>الوحدة</th>
                  <th style={{...TH,fontSize:FS-3,textAlign:"center",width:100}}>السعر</th>
                  <th style={{...TH,fontSize:FS-3,textAlign:"center",width:100}}>الإجمالي</th>
                  <th style={{...TH,fontSize:FS-3,width:40}}></th>
                </tr></thead>
                <tbody>
                  {(rcpt.items||[]).map((it,idx)=>{
                    /* V16.31: resolve category from itemType (legacy "fabric"/"accessory" or categoryId) */
                    let catId=it.itemType;
                    if(catId==="fabric")catId="core_fabric";
                    else if(catId==="accessory")catId="core_accessory";
                    const cat=getCategoryById(data,catId);
                    const itemsForCat=getItemsForCategory(data,catId);
                    const options=itemsForCat.map(x=>({value:x.id,label:x.name+(x.type?" — "+x.type:"")+(x.unit?" ("+x.unit+")":"")}));
                    const badgeColor=cat?.legacy==="fabric"?T.accent:cat?.legacy==="accessory"?"#8B5CF6":"#F59E0B";
                    return<tr key={it.id} style={{borderBottom:"1px solid "+T.brd}}>
                      <td style={{...TD,padding:"4px 6px"}}>
                        <span style={{padding:"2px 8px",borderRadius:8,fontSize:FS-3,fontWeight:700,background:badgeColor+"15",color:badgeColor,whiteSpace:"nowrap"}}>{(cat?.emoji||"📦")+" "+(cat?.name||it.itemType)}</span>
                      </td>
                      <td style={{...TD,padding:"4px 6px"}}>
                        <SearchSel value={it.itemId} onChange={v=>updateRcptItem(idx,"itemId",v)} options={options} placeholder="اختر..."/>
                      </td>
                      <td style={{...TD,padding:"4px 6px"}}>
                        <Inp type="number" value={it.qty||""} onChange={v=>updateRcptItem(idx,"qty",v)} style={{textAlign:"center",padding:"5px 6px"}}/>
                      </td>
                      <td style={{...TD,padding:"4px 6px",textAlign:"center",color:T.textMut,fontSize:FS-2}}>{it.unit||"—"}</td>
                      <td style={{...TD,padding:"4px 6px"}}>
                        <Inp type="number" value={it.price||""} onChange={v=>updateRcptItem(idx,"price",v)} style={{textAlign:"center",padding:"5px 6px"}}/>
                      </td>
                      <td style={{...TD,padding:"4px 6px",textAlign:"center",fontWeight:700,color:T.accent}}>{fmt(r2(Number(it.amount)||0))}</td>
                      <td style={{...TD,padding:"4px 6px",textAlign:"center"}}>
                        <span onClick={()=>removeRcptItem(idx)} style={{cursor:"pointer",color:T.err,fontSize:14,padding:4}}>🗑</span>
                      </td>
                    </tr>;
                  })}
                  {/* Total row */}
                  <tr style={{background:T.accent+"06",fontWeight:800}}>
                    <td style={{...TD,padding:"8px 6px"}} colSpan="5"><span style={{textAlign:"left"}}>الإجمالي</span></td>
                    <td style={{...TD,padding:"8px 6px",textAlign:"center",fontSize:FS+2,color:T.accent,fontWeight:800}}>{fmt(r2((rcpt.items||[]).reduce((s,it)=>s+(Number(it.amount)||0),0)))}</td>
                    <td style={{...TD,padding:"8px 6px"}}></td>
                  </tr>
                </tbody>
              </table>
            </div>}
          </div>
          
          {/* Payment section */}
          <div style={{padding:12,background:T.bg,borderRadius:10,border:"1px solid "+T.brd,marginBottom:12}}>
            <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:8}}>💰 طريقة الدفع</div>
            <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
              {[{key:"credit",label:"⏳ آجل",color:T.warn},{key:"cash",label:"💵 كاش",color:T.ok},{key:"check",label:"📄 شيك",color:"#8B5CF6"}].map(pm=>{const active=rcpt.paymentMethod===pm.key;
                return<div key={pm.key} onClick={()=>setRcpt(p=>({...p,paymentMethod:pm.key,paidAmount:pm.key==="credit"?0:p.paidAmount}))} style={{padding:"8px 16px",borderRadius:10,cursor:"pointer",fontWeight:700,fontSize:FS-1,background:active?pm.color:T.cardSolid,color:active?"#fff":T.text,border:"1px solid "+(active?pm.color:T.brd),flex:isMob?"1 1 100%":"initial",textAlign:"center"}}>{pm.label}</div>;
              })}
            </div>
            
            {rcpt.paymentMethod==="cash"&&<div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:10}}>
              <div>
                <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>الخزنة <span style={{color:T.err}}>*</span></label>
                <Sel value={rcpt.treasuryAccount} onChange={v=>setRcpt(p=>({...p,treasuryAccount:v}))}>
                  <option value="">اختر الخزنة</option>
                  {treasuryAccounts.map(a=><option key={a.id||a.name} value={a.name}>{a.name}</option>)}
                </Sel>
              </div>
              <div>
                <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>المبلغ المدفوع <span style={{color:T.err}}>*</span></label>
                <div style={{display:"flex",gap:4}}>
                  <Inp type="number" value={rcpt.paidAmount||""} onChange={v=>setRcpt(p=>({...p,paidAmount:v}))} placeholder="0"/>
                  <Btn small onClick={()=>{const total=(rcpt.items||[]).reduce((s,it)=>s+(Number(it.amount)||0),0);setRcpt(p=>({...p,paidAmount:r2(total)}))}} style={{whiteSpace:"nowrap"}}>كل الإجمالي</Btn>
                </div>
              </div>
            </div>}
            
            {rcpt.paymentMethod==="check"&&<div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(4,1fr)",gap:8}}>
              <div>
                <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>البنك <span style={{color:T.err}}>*</span></label>
                <Inp value={rcpt.checkBank||""} onChange={v=>setRcpt(p=>({...p,checkBank:v}))} placeholder="اسم البنك"/>
              </div>
              <div>
                <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>رقم الشيك <span style={{color:T.err}}>*</span></label>
                <Inp value={rcpt.checkNo||""} onChange={v=>setRcpt(p=>({...p,checkNo:v}))} placeholder="0000"/>
              </div>
              <div>
                <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>مبلغ الشيك <span style={{color:T.err}}>*</span></label>
                <Inp type="number" value={rcpt.paidAmount||""} onChange={v=>setRcpt(p=>({...p,paidAmount:v}))} placeholder="0"/>
              </div>
              <div>
                <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>تاريخ الاستحقاق</label>
                <Inp type="date" value={rcpt.checkDueDate||""} onChange={v=>setRcpt(p=>({...p,checkDueDate:v}))}/>
              </div>
            </div>}
            
            {rcpt.paymentMethod==="credit"&&<div style={{padding:10,background:T.warn+"08",borderRadius:8,border:"1px solid "+T.warn+"20",fontSize:FS-1,color:T.warn}}>⏳ سيتم إضافة المبلغ لرصيد المورد — يمكنك الدفع لاحقاً من كشف الحساب</div>}
          </div>
          
          {/* Notes */}
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>ملاحظات</label>
            <textarea value={rcpt.notes||""} onChange={e=>setRcpt(p=>({...p,notes:e.target.value}))} placeholder="ملاحظات إضافية..." style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"inherit",background:T.cardSolid,color:T.text,boxSizing:"border-box",resize:"vertical",minHeight:60}}/>
          </div>
        </div>
        
        {/* Footer buttons */}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14,paddingTop:12,borderTop:"1px solid "+T.brd}}>
          <Btn ghost onClick={()=>setShowReceiptForm(false)}>إلغاء</Btn>
          <Btn primary onClick={saveReceipt}>💾 حفظ الاستلام</Btn>
        </div>
      </div>
    </div>}

    {/* ════ VIEW RECEIPT DETAIL POPUP ════ */}
    {viewReceipt&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setViewReceipt(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:700,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div>
            <div style={{fontSize:FS+4,fontWeight:800,color:T.accent}}>📥 {viewReceipt.receiptNo}</div>
            <div style={{fontSize:FS-1,color:T.textMut,marginTop:2}}>{viewReceipt.date} — بواسطة {viewReceipt.createdBy||"—"}</div>
          </div>
          <Btn ghost small onClick={()=>setViewReceipt(null)}>✕</Btn>
        </div>
        
        {/* Summary grid */}
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(4,1fr)",gap:10,marginBottom:14}}>
          <div style={{padding:10,borderRadius:8,background:T.bg}}>
            <div style={{fontSize:FS-3,color:T.textSec}}>المورد</div>
            <div style={{fontSize:FS,fontWeight:700,color:T.text}}>{viewReceipt.supplierName||"—"}</div>
          </div>
          <div style={{padding:10,borderRadius:8,background:T.bg}}>
            <div style={{fontSize:FS-3,color:T.textSec}}>الإجمالي</div>
            <div style={{fontSize:FS,fontWeight:800,color:T.accent}}>{fmt(r2(viewReceipt.totalAmount))+" ج"}</div>
          </div>
          <div style={{padding:10,borderRadius:8,background:T.bg}}>
            <div style={{fontSize:FS-3,color:T.textSec}}>المدفوع</div>
            <div style={{fontSize:FS,fontWeight:800,color:T.ok}}>{fmt(r2(viewReceipt.paidAmount||0))+" ج"}</div>
          </div>
          <div style={{padding:10,borderRadius:8,background:T.bg}}>
            <div style={{fontSize:FS-3,color:T.textSec}}>المتبقي</div>
            <div style={{fontSize:FS,fontWeight:800,color:T.err}}>{fmt(r2((viewReceipt.totalAmount||0)-(viewReceipt.paidAmount||0)))+" ج"}</div>
          </div>
        </div>
        
        {/* Items table */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:6}}>البنود</div>
          <div style={{overflowX:"auto",border:"1px solid "+T.brd,borderRadius:8}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
              <thead><tr>
                <th style={TH}>الصنف</th>
                <th style={{...TH,textAlign:"center"}}>الكمية</th>
                <th style={{...TH,textAlign:"center"}}>الوحدة</th>
                <th style={{...TH,textAlign:"center"}}>السعر</th>
                <th style={{...TH,textAlign:"center"}}>الإجمالي</th>
              </tr></thead>
              <tbody>
                {(viewReceipt.items||[]).map((it,i)=><tr key={i} style={{borderBottom:"1px solid "+T.brd}}>
                  <td style={{...TD,fontWeight:700}}>
                    <span style={{padding:"1px 6px",borderRadius:6,fontSize:FS-3,marginLeft:4,background:it.itemType==="fabric"?T.accent+"15":"#8B5CF615",color:it.itemType==="fabric"?T.accent:"#8B5CF6"}}>{(getCategoryById(data,it.itemType==="fabric"?"core_fabric":it.itemType==="accessory"?"core_accessory":it.itemType)?.emoji||"📦")}</span>
                    {it.itemName}
                  </td>
                  <td style={{...TD,textAlign:"center"}}>{fmt(it.qty)}</td>
                  <td style={{...TD,textAlign:"center",color:T.textSec}}>{it.unit||"—"}</td>
                  <td style={{...TD,textAlign:"center"}}>{fmt(r2(it.price))}</td>
                  <td style={{...TD,textAlign:"center",fontWeight:700,color:T.accent}}>{fmt(r2(it.amount))}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Payment info */}
        <div style={{padding:12,background:T.bg,borderRadius:8,marginBottom:12}}>
          <div style={{fontSize:FS-1,fontWeight:700,color:T.textSec,marginBottom:6}}>تفاصيل الدفع</div>
          <div style={{fontSize:FS-1}}>
            <div>طريقة الدفع: <strong>{viewReceipt.paymentMethod==="cash"?"💵 كاش":viewReceipt.paymentMethod==="check"?"📄 شيك":"⏳ آجل"}</strong></div>
            {viewReceipt.treasuryAccount&&<div>الخزنة: <strong>{viewReceipt.treasuryAccount}</strong></div>}
            <div>الحالة: <strong style={{color:viewReceipt.paymentStatus==="paid"?T.ok:viewReceipt.paymentStatus==="partial"?T.warn:T.err}}>{viewReceipt.paymentStatus==="paid"?"مدفوع كلياً":viewReceipt.paymentStatus==="partial"?"مدفوع جزئياً":"غير مدفوع"}</strong></div>
          </div>
        </div>
        
        {viewReceipt.notes&&<div style={{padding:10,background:"#F59E0B08",borderRadius:8,fontSize:FS-1,color:T.textSec,marginBottom:12}}>📝 {viewReceipt.notes}</div>}
        
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",paddingTop:12,borderTop:"1px solid "+T.brd,flexWrap:"wrap"}}>
          {/* V18.49: Convert receipt to invoice (or show link if already done) */}
          {(()=>{
            const linkedInv=findInvoiceByReceipt(data,viewReceipt.id);
            if(linkedInv){
              return <span style={{padding:"7px 14px",borderRadius:8,fontSize:FS-1,fontWeight:700,background:"#10B98115",color:"#10B981",border:"1px solid #10B98140"}}>
                ✓ مرتبطة بفاتورة {linkedInv.invoiceNo}
              </span>;
            }
            return <Btn onClick={()=>{
              const supplier=(data.suppliers||[]).find(s=>s.id===viewReceipt.supplierId);
              upConfig(d=>{
                if(!Array.isArray(d.purchaseInvoices))d.purchaseInvoices=[];
                const inv=buildPurchaseInvoiceFromReceipt(d,viewReceipt,supplier,userName);
                d.purchaseInvoices.unshift(inv);
              });
              showToast("✓ تم إنشاء فاتورة مسودة — راجعها في تبويب 'فواتير المشتريات'");
            }} style={{background:"#F59E0B15",color:"#F59E0B",border:"1px solid #F59E0B40",fontWeight:700}}>📥 تحويل لفاتورة</Btn>;
          })()}
          <Btn onClick={()=>printReceipt(viewReceipt)} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>🖨️ طباعة</Btn>
          <Btn ghost onClick={()=>setViewReceipt(null)}>إغلاق</Btn>
        </div>
      </div>
    </div>}

    {/* ════ SUPPLIER STATEMENT POPUP ════ */}
    {activeSupplier&&(()=>{const st=supplierStats[activeSupplier.id]||{};const entries=buildStatement(activeSupplier.id);
      const printStatement=()=>{
        const w=openPrintWindow();if(!w){tell("المتصفح يمنع الطباعة","فعّل النوافذ المنبثقة",{danger:true});return}
        const rows=entries.map(e=>"<tr><td>"+e.date+"</td><td>"+(e.type==="invoice"?"🧾 فاتورة":"💰 دفعة")+"</td><td>"+e.ref+"</td><td>"+e.desc+"</td><td class='center'>"+(e.debit?fmt(r2(e.debit)):"—")+"</td><td class='center'>"+(e.credit?fmt(r2(e.credit)):"—")+"</td><td class='center' style='font-weight:700;color:"+(e.balance>0?"#EF4444":e.balance<0?"#0EA5E9":"#10B981")+"'>"+fmt(r2(e.balance))+"</td></tr>").join("");
        const html="<html dir='rtl'><head><meta charset='UTF-8'><title>كشف حساب "+activeSupplier.name+"</title><style>"+PRINT_CSS+".center{text-align:center}</style></head><body><div class='hdr'><div style='font-size:18px;font-weight:800;color:#0284C7'>📊 كشف حساب مورد</div><div class='hdr-info'><div>تاريخ الطباعة: "+today+"</div></div></div><h3>بيانات المورد</h3><table><tr><th style='width:30%'>الاسم</th><td>"+activeSupplier.name+"</td></tr>"+(activeSupplier.phone?"<tr><th>التليفون</th><td>"+activeSupplier.phone+"</td></tr>":"")+(activeSupplier.address?"<tr><th>العنوان</th><td>"+activeSupplier.address+"</td></tr>":"")+"</table><h3>ملخص الحساب</h3><table><tr><th>إجمالي المشتريات</th><td class='info'>"+fmt(r2(st.totalInvoiced||0))+" ج.م</td><th>إجمالي المدفوع</th><td class='ok'>"+fmt(r2(st.totalPaid||0))+" ج.م</td><th>الرصيد المستحق</th><td class='err'>"+fmt(r2(st.balance||0))+" ج.م</td></tr></table><h3>كشف الحركات</h3><table><thead><tr><th>التاريخ</th><th>النوع</th><th>المرجع</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead><tbody>"+rows+"</tbody></table><div class='foot'>CLARK Factory Management — كشف حساب "+activeSupplier.name+"</div><script>setTimeout(function(){window.print()},500)</"+"script></body></html>";
        w.document.write(html);w.document.close();
      };
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setActiveSupplier(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:20,width:"100%",maxWidth:900,maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
            <div>
              <div style={{fontSize:FS+4,fontWeight:800,color:T.accent}}>📊 كشف حساب — {activeSupplier.name}</div>
              <div style={{fontSize:FS-1,color:T.textMut,marginTop:2}}>{activeSupplier.phone||""} {activeSupplier.address?" • "+activeSupplier.address:""}</div>
            </div>
            <div style={{display:"flex",gap:6}}>
              {canEdit&&<Btn small onClick={()=>openPayForm(activeSupplier)} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>💰 تسجيل دفعة</Btn>}
              <Btn small ghost onClick={printStatement}>🖨️ طباعة</Btn>
              <Btn small ghost onClick={()=>setActiveSupplier(null)}>✕</Btn>
            </div>
          </div>
          
          {/* Summary */}
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(4,1fr)",gap:10,marginBottom:14}}>
            <div style={{padding:10,borderRadius:8,background:T.bg}}>
              <div style={{fontSize:FS-3,color:T.textSec}}>الفواتير</div>
              <div style={{fontSize:FS,fontWeight:800,color:T.text}}>{st.receiptCount||0}</div>
            </div>
            <div style={{padding:10,borderRadius:8,background:T.bg}}>
              <div style={{fontSize:FS-3,color:T.textSec}}>إجمالي المشتريات</div>
              <div style={{fontSize:FS,fontWeight:800,color:T.accent}}>{fmt(r2(st.totalInvoiced||0))}</div>
            </div>
            <div style={{padding:10,borderRadius:8,background:T.bg}}>
              <div style={{fontSize:FS-3,color:T.textSec}}>المدفوع</div>
              <div style={{fontSize:FS,fontWeight:800,color:T.ok}}>{fmt(r2(st.totalPaid||0))}</div>
            </div>
            <div style={{padding:10,borderRadius:8,background:(st.balance||0)>1?T.err+"08":(st.balance||0)<-1?T.accent+"08":T.ok+"08"}}>
              <div style={{fontSize:FS-3,color:T.textSec}}>الرصيد</div>
              <div style={{fontSize:FS,fontWeight:800,color:(st.balance||0)>1?T.err:(st.balance||0)<-1?T.accent:T.ok}}>{(st.balance||0)>1?fmt(r2(st.balance))+" (عليه)":(st.balance||0)<-1?"+"+fmt(r2(Math.abs(st.balance)))+" (له)":"مسدد"}</div>
            </div>
          </div>
          
          {/* Statement table */}
          <div style={{flex:1,overflowY:"auto",border:"1px solid "+T.brd,borderRadius:10}}>
            {entries.length===0?<div style={{padding:40,textAlign:"center",color:T.textMut}}>لا توجد حركات لهذا المورد</div>:<table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
              <thead style={{position:"sticky",top:0,background:T.cardSolid,zIndex:1}}><tr>
                <th style={TH}>التاريخ</th>
                <th style={TH}>النوع</th>
                <th style={TH}>المرجع</th>
                <th style={TH}>البيان</th>
                <th style={{...TH,textAlign:"center"}}>مدين</th>
                <th style={{...TH,textAlign:"center"}}>دائن</th>
                <th style={{...TH,textAlign:"center"}}>الرصيد</th>
                <th style={{...TH,width:40}}></th>
              </tr></thead>
              <tbody>
                {entries.map((e,i)=>{const balColor=e.balance>1?T.err:e.balance<-1?T.accent:T.ok;
                  return<tr key={i} style={{borderBottom:"1px solid "+T.brd,background:e.type==="payment"?T.ok+"04":"transparent"}}>
                    <td style={{...TD,fontSize:FS-2}}>{e.date}</td>
                    <td style={{...TD}}>{e.type==="invoice"?<span style={{padding:"1px 6px",borderRadius:6,fontSize:FS-3,background:T.accent+"15",color:T.accent,fontWeight:700}}>🧾 فاتورة</span>:<span style={{padding:"1px 6px",borderRadius:6,fontSize:FS-3,background:T.ok+"15",color:T.ok,fontWeight:700}}>💰 دفعة</span>}</td>
                    <td style={{...TD,fontWeight:700,color:T.textSec,fontSize:FS-2}}>{e.ref}</td>
                    <td style={{...TD,fontSize:FS-2}}>{e.desc}</td>
                    <td style={{...TD,textAlign:"center",fontWeight:700,color:T.err}}>{e.debit?fmt(r2(e.debit)):"—"}</td>
                    <td style={{...TD,textAlign:"center",fontWeight:700,color:T.ok}}>{e.credit?fmt(r2(e.credit)):"—"}</td>
                    <td style={{...TD,textAlign:"center",fontWeight:800,color:balColor}}>{fmt(r2(e.balance))}</td>
                    <td style={{...TD,textAlign:"center"}}>
                      {e.paymentId&&canEdit&&userRole==="admin"&&<span onClick={()=>deletePayment(e.paymentId)} style={{cursor:"pointer",color:T.err,fontSize:13,padding:4}} title="حذف الدفعة">🗑</span>}
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>}
          </div>
        </div>
      </div>;
    })()}
    
    {/* ════ NEW/EDIT PO FORM POPUP ════ */}
    {showPoForm&&po&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowPoForm(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:20,width:"100%",maxWidth:900,maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>📋 {po.id?"تعديل أمر الشراء "+po.poNo:"أمر شراء جديد"}</div>
          <Btn ghost small onClick={()=>setShowPoForm(false)}>✕</Btn>
        </div>
        
        <div style={{flex:1,overflowY:"auto",paddingRight:4}}>
          {/* Header */}
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"2fr 1fr",gap:12,marginBottom:14}}>
            <div>
              <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,marginBottom:4,display:"block"}}>المورد <span style={{color:T.err}}>*</span></label>
              <div style={{display:"flex",gap:6,alignItems:"stretch"}}>
                <div style={{flex:1}}>
                  <SearchSel value={po.supplierId} onChange={v=>{const s=suppliers.find(x=>String(x.id)===String(v));setPo(p=>({...p,supplierId:v,supplierName:s?.name||""}))}} options={suppliers.map(s=>({value:s.id,label:s.name+(s.phone?" — "+s.phone:"")}))} placeholder="ابحث عن المورد..."/>
                </div>
                {canEdit&&<button onClick={openAddSupplier} title="إضافة مورد جديد" style={{padding:"8px 12px",borderRadius:8,border:"1px solid "+T.accent+"40",background:T.accent+"12",color:T.accent,cursor:"pointer",fontSize:FS,fontWeight:700,fontFamily:"inherit",display:"flex",alignItems:"center",gap:4,whiteSpace:"nowrap"}}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  <span>جديد</span>
                </button>}
              </div>
            </div>
            <div>
              <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,marginBottom:4,display:"block"}}>التاريخ</label>
              <Inp type="date" value={po.date} onChange={v=>setPo(p=>({...p,date:v}))}/>
            </div>
          </div>
          
          {/* Items */}
          <div style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <label style={{fontSize:FS,color:T.text,fontWeight:700}}>البنود المطلوبة <span style={{color:T.err}}>*</span></label>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {getCategories(data).map(cat=>{
                  const itemTypeKey=cat.legacy||cat.id;
                  const color=cat.legacy==="fabric"?T.accent:cat.legacy==="accessory"?"#8B5CF6":"#F59E0B";
                  return<Btn key={cat.id} small onClick={()=>addPoItem(itemTypeKey)} style={{background:color+"12",color:color,border:"1px solid "+color+"30"}}>{"+ "+(cat.emoji||"📦")+" "+cat.name}</Btn>;
                })}
              </div>
            </div>
            
            {(po.items||[]).length===0?<div style={{padding:24,textAlign:"center",color:T.textMut,background:T.bg,borderRadius:10,border:"1px dashed "+T.brd}}>
              <div style={{fontSize:32,marginBottom:6}}>📋</div>
              <div style={{fontSize:FS-1}}>لا توجد بنود</div>
            </div>:<div style={{overflowX:"auto",border:"1px solid "+T.brd,borderRadius:10}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
                <thead><tr>
                  <th style={{...TH,fontSize:FS-3}}>النوع</th>
                  <th style={{...TH,fontSize:FS-3,minWidth:180}}>الصنف</th>
                  <th style={{...TH,fontSize:FS-3,textAlign:"center",width:90}}>الكمية</th>
                  <th style={{...TH,fontSize:FS-3,textAlign:"center",width:70}}>الوحدة</th>
                  <th style={{...TH,fontSize:FS-3,textAlign:"center",width:100}}>السعر</th>
                  <th style={{...TH,fontSize:FS-3,textAlign:"center",width:100}}>الإجمالي</th>
                  <th style={{...TH,fontSize:FS-3,width:40}}></th>
                </tr></thead>
                <tbody>
                  {(po.items||[]).map((it,idx)=>{
                    /* V16.31: resolve category from itemType */
                    let catId=it.itemType;
                    if(catId==="fabric")catId="core_fabric";
                    else if(catId==="accessory")catId="core_accessory";
                    const cat=getCategoryById(data,catId);
                    const itemsForCat=getItemsForCategory(data,catId);
                    const options=itemsForCat.map(x=>({value:x.id,label:x.name+(x.type?" — "+x.type:"")+(x.unit?" ("+x.unit+")":"")}));
                    const badgeColor=cat?.legacy==="fabric"?T.accent:cat?.legacy==="accessory"?"#8B5CF6":"#F59E0B";
                    return<tr key={it.id} style={{borderBottom:"1px solid "+T.brd}}>
                      <td style={{...TD,padding:"4px 6px"}}><span style={{padding:"2px 8px",borderRadius:8,fontSize:FS-3,fontWeight:700,background:badgeColor+"15",color:badgeColor,whiteSpace:"nowrap"}}>{(cat?.emoji||"📦")+" "+(cat?.name||it.itemType)}</span></td>
                      <td style={{...TD,padding:"4px 6px"}}><SearchSel value={it.itemId} onChange={v=>updatePoItem(idx,"itemId",v)} options={options} placeholder="اختر..."/></td>
                      <td style={{...TD,padding:"4px 6px"}}><Inp type="number" value={it.qty||""} onChange={v=>updatePoItem(idx,"qty",v)} style={{textAlign:"center",padding:"5px 6px"}}/></td>
                      <td style={{...TD,padding:"4px 6px",textAlign:"center",color:T.textMut,fontSize:FS-2}}>{it.unit||"—"}</td>
                      <td style={{...TD,padding:"4px 6px"}}><Inp type="number" value={it.price||""} onChange={v=>updatePoItem(idx,"price",v)} style={{textAlign:"center",padding:"5px 6px"}}/></td>
                      <td style={{...TD,padding:"4px 6px",textAlign:"center",fontWeight:700,color:T.accent}}>{fmt(r2(Number(it.amount)||0))}</td>
                      <td style={{...TD,padding:"4px 6px",textAlign:"center"}}><span onClick={()=>removePoItem(idx)} style={{cursor:"pointer",color:T.err,fontSize:14,padding:4}}>🗑</span></td>
                    </tr>;
                  })}
                  <tr style={{background:"#8B5CF608",fontWeight:800}}>
                    <td style={{...TD,padding:"8px 6px"}} colSpan="5"><span style={{textAlign:"left"}}>الإجمالي</span></td>
                    <td style={{...TD,padding:"8px 6px",textAlign:"center",fontSize:FS+2,color:"#8B5CF6",fontWeight:800}}>{fmt(r2((po.items||[]).reduce((s,it)=>s+(Number(it.amount)||0),0)))}</td>
                    <td style={{...TD,padding:"8px 6px"}}></td>
                  </tr>
                </tbody>
              </table>
            </div>}
          </div>
          
          {/* Notes */}
          <div style={{marginBottom:12}}>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>ملاحظات</label>
            <textarea value={po.notes||""} onChange={e=>setPo(p=>({...p,notes:e.target.value}))} placeholder="ملاحظات إضافية..." style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"inherit",background:T.cardSolid,color:T.text,boxSizing:"border-box",resize:"vertical",minHeight:50}}/>
          </div>
          
          <div style={{padding:10,background:T.warn+"08",borderRadius:8,fontSize:FS-1,color:T.warn,marginBottom:8}}>⚠️ أمر الشراء توثيق فقط — لا يؤثر على المخزن حتى تقوم بتحويله لاستلام</div>
        </div>
        
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14,paddingTop:12,borderTop:"1px solid "+T.brd}}>
          <Btn ghost onClick={()=>setShowPoForm(false)}>إلغاء</Btn>
          <Btn primary onClick={savePo} style={{background:"#8B5CF6",color:"#fff",border:"none"}}>💾 {po.id?"حفظ التعديل":"إنشاء"}</Btn>
        </div>
      </div>
    </div>}
    
    {/* ════ VIEW PO POPUP ════ */}
    {viewPo&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setViewPo(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:700,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div>
            <div style={{fontSize:FS+4,fontWeight:800,color:"#8B5CF6"}}>📋 {viewPo.poNo}</div>
            <div style={{fontSize:FS-1,color:T.textMut,marginTop:2}}>{viewPo.date} — {viewPo.supplierName||"—"}</div>
          </div>
          <div style={{display:"flex",gap:6}}>
            {canEdit&&<>
              <Btn small onClick={()=>convertPoToReceipt(viewPo)} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>📥 تحويل لاستلام</Btn>
              <Btn small onClick={()=>editPo(viewPo)} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>✏️</Btn>
            </>}
            <Btn small ghost onClick={()=>printPo(viewPo)}>🖨️</Btn>
            <Btn small ghost onClick={()=>setViewPo(null)}>✕</Btn>
          </div>
        </div>
        
        <div style={{padding:12,background:T.bg,borderRadius:10,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:FS-3,color:T.textSec}}>إجمالي قيمة الأمر</div>
            <div style={{fontSize:FS+4,fontWeight:800,color:"#8B5CF6"}}>{fmt(r2(viewPo.totalAmount))+" ج.م"}</div>
          </div>
          <div>
            <div style={{fontSize:FS-3,color:T.textSec}}>عدد البنود</div>
            <div style={{fontSize:FS+2,fontWeight:800,color:T.text}}>{(viewPo.items||[]).length}</div>
          </div>
        </div>
        
        <div style={{marginBottom:14}}>
          <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:6}}>البنود المطلوبة</div>
          <div style={{overflowX:"auto",border:"1px solid "+T.brd,borderRadius:8}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-1}}>
              <thead><tr>
                <th style={TH}>الصنف</th>
                <th style={{...TH,textAlign:"center"}}>الكمية</th>
                <th style={{...TH,textAlign:"center"}}>الوحدة</th>
                <th style={{...TH,textAlign:"center"}}>السعر</th>
                <th style={{...TH,textAlign:"center"}}>الإجمالي</th>
              </tr></thead>
              <tbody>
                {(viewPo.items||[]).map((it,i)=><tr key={i} style={{borderBottom:"1px solid "+T.brd}}>
                  <td style={{...TD,fontWeight:700}}><span style={{padding:"1px 6px",borderRadius:6,fontSize:FS-3,marginLeft:4,background:it.itemType==="fabric"?T.accent+"15":"#8B5CF615",color:it.itemType==="fabric"?T.accent:"#8B5CF6"}}>{(getCategoryById(data,it.itemType==="fabric"?"core_fabric":it.itemType==="accessory"?"core_accessory":it.itemType)?.emoji||"📦")}</span>{it.itemName}</td>
                  <td style={{...TD,textAlign:"center"}}>{fmt(it.qty)}</td>
                  <td style={{...TD,textAlign:"center",color:T.textSec}}>{it.unit||"—"}</td>
                  <td style={{...TD,textAlign:"center"}}>{fmt(r2(it.price))}</td>
                  <td style={{...TD,textAlign:"center",fontWeight:700,color:T.accent}}>{fmt(r2(it.amount))}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </div>
        
        {viewPo.notes&&<div style={{padding:10,background:"#F59E0B08",borderRadius:8,fontSize:FS-1,color:T.textSec,marginBottom:12}}>📝 {viewPo.notes}</div>}
        
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",paddingTop:12,borderTop:"1px solid "+T.brd}}>
          <Btn ghost onClick={()=>setViewPo(null)}>إغلاق</Btn>
        </div>
      </div>
    </div>}

    {/* ════ PAY SUPPLIER FORM POPUP ════ */}
    {showPayForm&&payForm&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowPayForm(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:20,width:"100%",maxWidth:500,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:T.ok}}>💰 تسجيل دفعة لـ {payForm.supplierName}</div>
          <Btn ghost small onClick={()=>setShowPayForm(false)}>✕</Btn>
        </div>
        
        {/* Current balance info */}
        {(()=>{const st=supplierStats[payForm.supplierId]||{};const bal=Number(st.balance)||0;
          return<div style={{padding:10,background:bal>1?T.err+"08":T.ok+"08",borderRadius:8,marginBottom:12,fontSize:FS-1}}>
            الرصيد الحالي: <strong style={{color:bal>1?T.err:T.ok}}>{bal>1?fmt(r2(bal))+" ج.م (عليه)":bal<-1?"+"+fmt(r2(Math.abs(bal)))+" ج.م (له)":"مسدد"}</strong>
          </div>;
        })()}
        
        {/* Amount + date */}
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10,marginBottom:12}}>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>المبلغ <span style={{color:T.err}}>*</span></label>
            <Inp type="number" value={payForm.amount||""} onChange={v=>setPayForm(p=>({...p,amount:v}))}/>
          </div>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>التاريخ</label>
            <Inp type="date" value={payForm.date} onChange={v=>setPayForm(p=>({...p,date:v}))}/>
          </div>
        </div>
        
        {/* Method */}
        <div style={{marginBottom:12}}>
          <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:6}}>طريقة الدفع</label>
          <div style={{display:"flex",gap:6}}>
            {[{key:"cash",label:"💵 كاش",color:T.ok},{key:"check",label:"📄 شيك",color:"#8B5CF6"}].map(pm=>{const active=payForm.method===pm.key;
              return<div key={pm.key} onClick={()=>setPayForm(p=>({...p,method:pm.key}))} style={{flex:1,padding:"8px 16px",borderRadius:10,cursor:"pointer",fontWeight:700,fontSize:FS-1,background:active?pm.color:T.bg,color:active?"#fff":T.text,border:"1px solid "+(active?pm.color:T.brd),textAlign:"center"}}>{pm.label}</div>;
            })}
          </div>
        </div>
        
        {/* Cash: account */}
        {payForm.method==="cash"&&<div style={{marginBottom:12}}>
          <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>الخزنة <span style={{color:T.err}}>*</span></label>
          <Sel value={payForm.treasuryAccount} onChange={v=>setPayForm(p=>({...p,treasuryAccount:v}))}>
            <option value="">اختر الخزنة</option>
            {treasuryAccounts.map(a=><option key={a.id||a.name} value={a.name}>{a.name}</option>)}
          </Sel>
        </div>}
        
        {/* Check: details */}
        {payForm.method==="check"&&<div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(3,1fr)",gap:8,marginBottom:12}}>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>البنك <span style={{color:T.err}}>*</span></label>
            <Inp value={payForm.checkBank||""} onChange={v=>setPayForm(p=>({...p,checkBank:v}))} placeholder="اسم البنك"/>
          </div>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>رقم الشيك <span style={{color:T.err}}>*</span></label>
            <Inp value={payForm.checkNo||""} onChange={v=>setPayForm(p=>({...p,checkNo:v}))} placeholder="0000"/>
          </div>
          <div>
            <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>تاريخ الاستحقاق</label>
            <Inp type="date" value={payForm.checkDueDate||""} onChange={v=>setPayForm(p=>({...p,checkDueDate:v}))}/>
          </div>
        </div>}
        
        {/* Notes */}
        <div style={{marginBottom:14}}>
          <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,display:"block",marginBottom:4}}>ملاحظات</label>
          <textarea value={payForm.notes||""} onChange={e=>setPayForm(p=>({...p,notes:e.target.value}))} placeholder="ملاحظات إضافية..." style={{width:"100%",padding:"8px 12px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"inherit",background:T.cardSolid,color:T.text,boxSizing:"border-box",resize:"vertical",minHeight:50}}/>
        </div>
        
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <Btn ghost onClick={()=>setShowPayForm(false)}>إلغاء</Btn>
          <Btn primary onClick={savePayment} style={{background:T.ok,color:"#fff",border:"none"}}>💾 حفظ الدفعة</Btn>
        </div>
      </div>
    </div>}

  </div>;
}

/* ═══════════════════════════════════════════════════════════════
   TREASURY PAGE — يومية الصندوق
   نظام مطابق لملف JOURNAL_File
   ═══════════════════════════════════════════════════════════════ */
