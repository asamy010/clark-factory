/* ═══════════════════════════════════════════════════════════════════════
   CLARK · FixedAssetsPg (V18.67)
   ───────────────────────────────────────────────────────────────────────
   Three tabs:
     1. سجل الأصول        — list, filter, add, edit, dispose
     2. الإهلاك الشهري    — preview & run monthly depreciation
     3. التقارير          — asset register summary + future depreciation schedule
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo, useEffect } from "react";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { Btn, Card, Inp, Sel } from "../components/ui.jsx";
import { FixedAssetEditModal } from "../components/fixedAssets/FixedAssetEditModal.jsx";
import { FixedAssetDisposalModal } from "../components/fixedAssets/FixedAssetDisposalModal.jsx";
import { MonthlyDepreciationModal } from "../components/fixedAssets/MonthlyDepreciationModal.jsx";
import {
  subscribeFixedAssets, deleteFixedAsset,
  monthlyDepreciation, bookValue, ASSET_CATEGORIES,
} from "../utils/accounting/fixedAssets.js";
import { fmt } from "../utils/format.js";
import { ask, tell } from "../utils/popups.js";
/* V21.9.188: cross-page action handoff (Dashboard "+ جديد" button). */
import { consumePendingAction } from "../utils/pendingAction.js";

const TAB_DEFS = [
  { key: "register",     label: "سجل الأصول",      icon: "📋" },
  { key: "depreciation", label: "الإهلاك الشهري",  icon: "⚡" },
  { key: "reports",      label: "التقارير",         icon: "📊" },
];

const STATUS_META = {
  active:             { label: "نشط",             color: "#10B981", bg: "#10B98115" },
  fully_depreciated:  { label: "مُهلك بالكامل",    color: "#F59E0B", bg: "#F59E0B15" },
  disposed:           { label: "تم التصرف فيه",   color: "#6B7280", bg: "#6B728015" },
};

function useToast(){
  const [msg, setMsg] = useState("");
  const show = (m) => { setMsg(m); setTimeout(() => setMsg(""), 2200); };
  const node = msg ? <div style={{
    position: "fixed", bottom: 24, insetInlineStart: "50%", transform: "translateX(-50%)",
    background: T.text, color: T.cardSolid, padding: "10px 18px", borderRadius: 8,
    fontSize: FS-1, fontWeight: 700, zIndex: 99999, boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
  }}>{msg}</div> : null;
  return { show, node };
}

export function FixedAssetsPg({ data, config, isMob, user }){
  const userName = user?.email || "";
  const { show: showToast, node: toastNode } = useToast();

  const [active, setActive] = useState("register");
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);

  /* Modal state */
  const [editingAsset, setEditingAsset] = useState(null);  /* null | "new" | asset object */
  const [disposingAsset, setDisposingAsset] = useState(null);
  const [showDepRun, setShowDepRun] = useState(false);

  /* Subscribe to assets collection */
  useEffect(() => {
    const unsub = subscribeFixedAssets(
      list => { setAssets(list); setLoading(false); },
      err => { setLoading(false); console.error(err); },
    );
    return () => unsub();
  }, []);

  /* V21.9.188: consume pending action from Accounting Dashboard's
     "+ جديد" button. If action === "new", switch to the register tab
     (where the asset edit modal lives) and open it in create mode. */
  useEffect(() => {
    const act = consumePendingAction("fixedAssets");
    if (!act) return;
    if (act.action === "new") {
      setActive("register");
      setEditingAsset("new");
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  /* Filters for register tab */
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [search, setSearch] = useState("");

  const coa = Array.isArray(config?.coa) ? config.coa : [];

  const filteredAssets = useMemo(() => {
    let list = assets;
    if(filterStatus !== "all") list = list.filter(a => a.status === filterStatus);
    if(filterCategory !== "all") list = list.filter(a => a.category === filterCategory);
    if(search.trim()){
      const q = search.trim().toLowerCase();
      list = list.filter(a =>
        (a.name || "").toLowerCase().includes(q) ||
        (a.code || "").toLowerCase().includes(q) ||
        (a.notes || "").toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => (b.code || "").localeCompare(a.code || ""));
  }, [assets, filterStatus, filterCategory, search]);

  /* Stats */
  const stats = useMemo(() => {
    let totalCost = 0, totalDep = 0, totalBV = 0;
    let active = 0, fully = 0, disposed = 0;
    assets.forEach(a => {
      const cost = Number(a.acquisitionCost) || 0;
      const dep = Number(a.totalDepreciated) || 0;
      if(a.status === "disposed"){ disposed++; return; }
      totalCost += cost;
      totalDep += dep;
      totalBV += (cost - dep);
      if(a.status === "fully_depreciated") fully++;
      else active++;
    });
    return { totalCost, totalDep, totalBV, active, fully, disposed, total: assets.length };
  }, [assets]);

  /* Handlers */
  const handleDelete = async (asset) => {
    if(!await ask("حذف الأصل",
      `حذف الأصل "${asset.code} ${asset.name}"؟\n\nمسموح فقط لو الأصل لم يُهلك بعد.`,
      { danger: true, confirmText: "حذف" })) return;
    try {
      await deleteFixedAsset(asset.id);
      showToast("✓ تم الحذف");
    } catch(e){
      await tell("لا يمكن الحذف", e.message || String(e), { danger: true });
    }
  };

  const _amt = (n) => Math.abs(n) < 0.005 ? "—" : fmt(n.toFixed(2));

  return <div style={{padding: isMob ? 12 : 20, maxWidth: 1400, margin: "0 auto"}}>
    {/* Header */}
    <div style={{display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap"}}>
      <span style={{fontSize: isMob ? 22 : 28}}>🏭</span>
      <div style={{flex: 1, minWidth: 200}}>
        <div style={{fontSize: isMob ? 18 : 22, fontWeight: 800, color: T.text}}>الأصول الثابتة</div>
        <div style={{fontSize: FS-2, color: T.textSec}}>إدارة الأصول الثابتة + الإهلاك التلقائي</div>
      </div>
      {active === "register" && <Btn primary onClick={() => setEditingAsset("new")} style={{
        background: T.accent, color: "#fff", border: "none", fontWeight: 800,
      }}>
        ➕ أصل جديد
      </Btn>}
      {active === "depreciation" && <Btn primary onClick={() => setShowDepRun(true)} style={{
        background: T.accent, color: "#fff", border: "none", fontWeight: 800,
      }}>
        ⚡ تشغيل إهلاك الشهر
      </Btn>}
    </div>

    {/* Stats cards (always visible) */}
    <div style={{
      display: "grid", gridTemplateColumns: isMob ? "repeat(2,1fr)" : "repeat(4,1fr)",
      gap: 8, marginBottom: 14,
    }}>
      <div style={{padding: 10, background: T.cardSolid, borderRadius: 8, border: "1px solid "+T.brd, textAlign: "center"}}>
        <div style={{fontSize: FS-3, color: T.textSec, fontWeight: 600}}>إجمالي الأصول</div>
        <div style={{fontSize: FS+4, fontWeight: 800, color: T.text}}>{stats.total}</div>
        <div style={{fontSize: FS-3, color: T.textMut, marginTop: 2}}>
          نشط: {stats.active} · مُهلك: {stats.fully} · تم التصرف: {stats.disposed}
        </div>
      </div>
      <div style={{padding: 10, background: T.cardSolid, borderRadius: 8, border: "1px solid "+T.brd, textAlign: "center"}}>
        <div style={{fontSize: FS-3, color: T.textSec, fontWeight: 600}}>إجمالي التكلفة</div>
        <div style={{fontSize: FS+1, fontWeight: 800, color: T.text, direction: "ltr", fontFamily: "monospace"}}>
          {fmt(stats.totalCost.toFixed(0))}
        </div>
      </div>
      <div style={{padding: 10, background: T.cardSolid, borderRadius: 8, border: "1px solid "+T.brd, textAlign: "center"}}>
        <div style={{fontSize: FS-3, color: T.textSec, fontWeight: 600}}>الإهلاك المتراكم</div>
        <div style={{fontSize: FS+1, fontWeight: 800, color: T.err, direction: "ltr", fontFamily: "monospace"}}>
          {fmt(stats.totalDep.toFixed(0))}
        </div>
      </div>
      <div style={{padding: 10, background: T.cardSolid, borderRadius: 8, border: "1px solid "+T.brd, textAlign: "center"}}>
        <div style={{fontSize: FS-3, color: T.textSec, fontWeight: 600}}>القيمة الدفترية</div>
        <div style={{fontSize: FS+1, fontWeight: 800, color: T.accent, direction: "ltr", fontFamily: "monospace"}}>
          {fmt(stats.totalBV.toFixed(0))}
        </div>
      </div>
    </div>

    {/* Tab strip */}
    <div style={{
      display: "flex", gap: 4, padding: 4, background: T.cardSolid, borderRadius: 10,
      border: "1px solid "+T.brd, marginBottom: 14, flexWrap: "wrap",
    }}>
      {TAB_DEFS.map(t => {
        const isActive = active === t.key;
        return <div key={t.key} onClick={() => setActive(t.key)} style={{
          flex: 1, padding: "10px 14px", borderRadius: 8, cursor: "pointer",
          fontSize: FS-1, fontWeight: isActive ? 800 : 600,
          color: isActive ? "#fff" : T.textSec,
          background: isActive ? T.accent : "transparent",
          textAlign: "center", transition: "all 0.15s",
        }}>{t.icon} {t.label}</div>;
      })}
    </div>

    {/* TAB 1: REGISTER */}
    {active === "register" && <Card>
      {/* Filters */}
      <div style={{display: "grid", gridTemplateColumns: isMob ? "1fr" : "2fr 1fr 1fr", gap: 8, marginBottom: 12}}>
        <Inp value={search} onChange={setSearch} placeholder="🔍 بحث بالاسم أو الكود أو الملاحظات..."/>
        <Sel value={filterStatus} onChange={setFilterStatus}>
          <option value="all">كل الحالات</option>
          <option value="active">نشط</option>
          <option value="fully_depreciated">مُهلك بالكامل</option>
          <option value="disposed">تم التصرف فيه</option>
        </Sel>
        <Sel value={filterCategory} onChange={setFilterCategory}>
          <option value="all">كل الفئات</option>
          {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </Sel>
      </div>

      {loading ? <div style={{padding: 30, textAlign: "center", color: T.textMut}}>
        ⏳ جاري التحميل...
      </div> : filteredAssets.length === 0 ? <div style={{
        padding: 40, textAlign: "center", color: T.textMut,
        background: T.bg, borderRadius: 8, border: "1px dashed "+T.brd,
      }}>
        {assets.length === 0
          ? <>
            🏭 لا توجد أصول ثابتة بعد<br/>
            <span style={{fontSize: FS-2}}>اضغط "➕ أصل جديد" لإضافة أول أصل</span>
          </>
          : "لا توجد نتائج للفلتر المحدد"}
      </div> : <div style={{overflowX: "auto"}}>
        <table style={{width: "100%", borderCollapse: "collapse", fontSize: FS-1}}>
          <thead>
            <tr style={{background: T.bg, borderBottom: "2px solid "+T.brd}}>
              <th style={{padding: 8, textAlign: "right", fontWeight: 800, color: T.textSec, fontSize: FS-2}}>الكود</th>
              <th style={{padding: 8, textAlign: "right", fontWeight: 800, color: T.textSec, fontSize: FS-2}}>الاسم</th>
              <th style={{padding: 8, textAlign: "right", fontWeight: 800, color: T.textSec, fontSize: FS-2}}>الفئة</th>
              <th style={{padding: 8, textAlign: "right", fontWeight: 800, color: T.textSec, fontSize: FS-2}}>تاريخ الاقتناء</th>
              <th style={{padding: 8, textAlign: "left",  fontWeight: 800, color: T.textSec, fontSize: FS-2}}>التكلفة</th>
              <th style={{padding: 8, textAlign: "left",  fontWeight: 800, color: T.textSec, fontSize: FS-2}}>الإهلاك</th>
              <th style={{padding: 8, textAlign: "left",  fontWeight: 800, color: T.textSec, fontSize: FS-2}}>القيمة الدفترية</th>
              <th style={{padding: 8, textAlign: "center",fontWeight: 800, color: T.textSec, fontSize: FS-2}}>الحالة</th>
              <th style={{padding: 8, textAlign: "center",fontWeight: 800, color: T.textSec, fontSize: FS-2}}>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filteredAssets.map(a => {
              const bv = bookValue(a);
              const status = STATUS_META[a.status] || STATUS_META.active;
              return <tr key={a.id} style={{borderBottom: "1px solid "+T.brd, background: a.status === "disposed" ? T.bg : "transparent"}}>
                <td style={{padding: 8, fontFamily: "monospace", color: T.accent, fontWeight: 700}}>{a.code}</td>
                <td style={{padding: 8, fontWeight: 700}}>{a.name}</td>
                <td style={{padding: 8, color: T.textSec, fontSize: FS-2}}>{a.category}</td>
                <td style={{padding: 8, color: T.textSec, fontFamily: "monospace", fontSize: FS-2}}>{a.acquisitionDate}</td>
                <td style={{padding: 8, textAlign: "left", direction: "ltr", fontFamily: "monospace", fontWeight: 700}}>{_amt(Number(a.acquisitionCost) || 0)}</td>
                <td style={{padding: 8, textAlign: "left", direction: "ltr", fontFamily: "monospace", color: T.err}}>({_amt(Number(a.totalDepreciated) || 0)})</td>
                <td style={{padding: 8, textAlign: "left", direction: "ltr", fontFamily: "monospace", fontWeight: 800, color: T.accent}}>{_amt(bv)}</td>
                <td style={{padding: 8, textAlign: "center"}}>
                  <span style={{
                    fontSize: FS-3, fontWeight: 800, color: status.color, background: status.bg,
                    padding: "3px 10px", borderRadius: 12, whiteSpace: "nowrap",
                  }}>{status.label}</span>
                </td>
                <td style={{padding: 8, textAlign: "center"}}>
                  <div style={{display: "inline-flex", gap: 4}}>
                    <Btn small ghost onClick={() => setEditingAsset(a)} title="تعديل">✏️</Btn>
                    {a.status !== "disposed" && <Btn small ghost onClick={() => setDisposingAsset(a)} title="تصرف">🗑️</Btn>}
                    {Number(a.totalDepreciated) === 0 && a.status !== "disposed" && (
                      <Btn small ghost onClick={() => handleDelete(a)} title="حذف">❌</Btn>
                    )}
                  </div>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>}
    </Card>}

    {/* TAB 2: DEPRECIATION */}
    {active === "depreciation" && <Card>
      <div style={{padding: 14, lineHeight: 1.7}}>
        <div style={{fontSize: FS, fontWeight: 800, color: T.text, marginBottom: 8}}>
          ⚡ كيف يعمل الإهلاك الشهري؟
        </div>
        <ul style={{paddingInlineStart: 20, color: T.textSec, fontSize: FS-1}}>
          <li>اضغط <b>"تشغيل إهلاك الشهر"</b> أعلى الصفحة لاختيار الشهر المراد إهلاكه.</li>
          <li>المعاينة تعرض كل أصل + قيمة إهلاكه + إجمالي الإهلاك للشهر.</li>
          <li>التشغيل بيعمل قيد <b>(Dr مصروف الإهلاك / Cr مجمع الإهلاك)</b> لكل أصل في يومية المحاسبة.</li>
          <li>لو نسيت تشغيل شهر أو شهرين، التشغيل التالي بيلحقهم تلقائياً.</li>
          <li>كل قيد له <code>sourceId</code> فريد — مينفعش يتسجل مرتين بالغلط.</li>
          <li>الفترات المُقفلة محاسبياً مش هيتم الترحيل عليها.</li>
        </ul>
      </div>

      <div style={{
        marginTop: 14, padding: "12px 14px",
        background: T.accent+"08", borderRadius: 8, border: "1px solid "+T.accent+"30",
      }}>
        <div style={{fontSize: FS-1, fontWeight: 800, color: T.accent, marginBottom: 6}}>
          💡 ملخص الأصول الجاهزة للإهلاك
        </div>
        <div style={{fontSize: FS-2, color: T.text, lineHeight: 1.7}}>
          • أصول نشطة قابلة للإهلاك: <b>{stats.active}</b><br/>
          • أصول مُهلكة بالكامل: <b>{stats.fully}</b><br/>
          • أصول تم التصرف فيها: <b>{stats.disposed}</b>
        </div>
      </div>
    </Card>}

    {/* TAB 3: REPORTS */}
    {active === "reports" && <Card>
      {assets.length === 0 ? <div style={{padding: 40, textAlign: "center", color: T.textMut}}>
        لا توجد بيانات لعرضها
      </div> : <div style={{overflowX: "auto"}}>
        <div style={{fontSize: FS, fontWeight: 800, color: T.text, marginBottom: 12}}>
          📊 سجل الأصول الكامل
        </div>
        <table style={{width: "100%", borderCollapse: "collapse", fontSize: FS-1}}>
          <thead>
            <tr style={{background: T.bg, borderBottom: "2px solid "+T.brd}}>
              <th style={{padding: 8, textAlign: "right", fontWeight: 800, color: T.textSec, fontSize: FS-2}}>الكود</th>
              <th style={{padding: 8, textAlign: "right", fontWeight: 800, color: T.textSec, fontSize: FS-2}}>الاسم</th>
              <th style={{padding: 8, textAlign: "right", fontWeight: 800, color: T.textSec, fontSize: FS-2}}>الفئة</th>
              <th style={{padding: 8, textAlign: "left",  fontWeight: 800, color: T.textSec, fontSize: FS-2}}>إهلاك شهري</th>
              <th style={{padding: 8, textAlign: "right", fontWeight: 800, color: T.textSec, fontSize: FS-2}}>بداية الإهلاك</th>
              <th style={{padding: 8, textAlign: "right", fontWeight: 800, color: T.textSec, fontSize: FS-2}}>نهاية الإهلاك</th>
              <th style={{padding: 8, textAlign: "right", fontWeight: 800, color: T.textSec, fontSize: FS-2}}>آخر إهلاك</th>
              <th style={{padding: 8, textAlign: "left",  fontWeight: 800, color: T.textSec, fontSize: FS-2}}>المتبقي</th>
            </tr>
          </thead>
          <tbody>
            {assets.map(a => {
              const monthly = monthlyDepreciation(a);
              const remaining = (Number(a.acquisitionCost) || 0) - (Number(a.salvageValue) || 0) - (Number(a.totalDepreciated) || 0);
              return <tr key={a.id} style={{borderBottom: "1px solid "+T.brd}}>
                <td style={{padding: 8, fontFamily: "monospace", color: T.accent, fontWeight: 700}}>{a.code}</td>
                <td style={{padding: 8, fontWeight: 700}}>{a.name}</td>
                <td style={{padding: 8, color: T.textSec, fontSize: FS-2}}>{a.category}</td>
                <td style={{padding: 8, textAlign: "left", direction: "ltr", fontFamily: "monospace"}}>{_amt(monthly)}</td>
                <td style={{padding: 8, fontFamily: "monospace", fontSize: FS-2}}>{a.depreciationStartMonth || "—"}</td>
                <td style={{padding: 8, fontFamily: "monospace", fontSize: FS-2}}>{a.depreciationEndMonth || "—"}</td>
                <td style={{padding: 8, fontFamily: "monospace", fontSize: FS-2}}>{a.lastDepreciatedThrough || "—"}</td>
                <td style={{padding: 8, textAlign: "left", direction: "ltr", fontFamily: "monospace", fontWeight: 800, color: remaining > 0 ? T.accent : T.textMut}}>
                  {_amt(Math.max(0, remaining))}
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>}
    </Card>}

    {/* Modals */}
    {editingAsset && <FixedAssetEditModal
      asset={editingAsset === "new" ? null : editingAsset}
      allAssets={assets}
      coa={coa} T={T} FS={FS} isMob={isMob}
      onClose={() => setEditingAsset(null)}
      showToast={showToast} userName={userName}
    />}
    {disposingAsset && <FixedAssetDisposalModal
      asset={disposingAsset}
      coa={coa} config={config}
      T={T} FS={FS} isMob={isMob}
      onClose={() => setDisposingAsset(null)}
      showToast={showToast} userName={userName}
    />}
    {showDepRun && <MonthlyDepreciationModal
      assets={assets.filter(a => a.status === "active")}
      coa={coa} config={config}
      T={T} FS={FS} isMob={isMob}
      onClose={() => setShowDepRun(false)}
      showToast={showToast} userName={userName}
    />}

    {toastNode}
  </div>;
}

export default FixedAssetsPg;
