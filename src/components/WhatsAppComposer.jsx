/* ═══════════════════════════════════════════════════════════════════════
   CLARK · WhatsAppComposer (V21.9.8)
   ───────────────────────────────────────────────────────────────────────
   Professional WhatsApp message composer modal — replaces the small
   askInput popup that was used in V21.9.7 and earlier.

   Features:
   • Large textarea (10 rows)
   • Quick-insert toolbar: emojis, variables, image
   • Image upload (Firebase Storage) — inserts URL into the text,
     WhatsApp shows it as a link preview when sent
   • Variable insertion: {name}, {phone}, {order}, {total}, {discount}
   • Live preview pane (sample customer rendered inline)
   • Recipient count + warning if many
   • Cancel / Send

   Usage:
     <WhatsAppComposer
       open={open}
       recipients={[{ name, phone, ... }, ...]}
       initialMessage=""
       onClose={() => ...}
       onSend={(message, imageUrl) => ...}
     />
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useRef, useEffect } from "react";
import { Btn, LoadingBtn } from "./ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { showToast } from "../utils/popups.js";
import { compressImage } from "../utils/image.js";
import { storage } from "../firebase.js";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

/* Common WhatsApp emojis (popular for marketing in Arabic context) */
const EMOJI_BAR = [
  "👋", "🎉", "🛍️", "💰", "✨", "🔥", "❤️", "👑",
  "⏰", "📦", "🎁", "💎", "✅", "📲", "🌟", "💯",
  "🥳", "😍", "💝", "🛒", "💸", "🎯", "🆕", "⚡",
];

/* Variables that can be inserted into the message — replaced per-customer */
const VARIABLES = [
  { key: "{name}", label: "اسم العميل", color: "#0EA5E9" },
  { key: "{phone}", label: "تليفون", color: "#10B981" },
  { key: "{order}", label: "رقم الطلب", color: "#8B5CF6" },
  { key: "{total}", label: "المبلغ", color: "#F59E0B" },
  { key: "{discount}", label: "كود خصم", color: "#DC2626" },
];

/* Quick template buttons */
const TEMPLATES = [
  {
    label: "👋 ترحيب",
    text: "أهلاً {name} 👋\n\nمعاك CLARK Store ✨\nشكراً إنك معانا 🌹\n\nخصم خاص ليك 🎁",
  },
  {
    label: "🛍️ متابعة طلب",
    text: "أهلاً {name} 🛍️\n\nطلبك رقم #{order} في الطريق ليك 🚚\nهنتواصل معاك قريب لتأكيد الميعاد ⏰",
  },
  {
    label: "💔 ترك السلة",
    text: "أهلاً {name} 👋\n\nلاحظنا إنك بدأت شراء من CLARK بس ما خلّصت 🥺\n\nخصم 10% ليك بكود BACK10 🎁\nصالح 24 ساعة فقط ⏰",
  },
  {
    label: "👑 VIP",
    text: "أهلاً {name} 👑\n\nأنت من عملاء VIP عندنا في CLARK ❤️\nحاجة جديدة وصلت ومحجوزة ليك بخصم خاص 💎",
  },
  {
    label: "⭐ تقييم",
    text: "أهلاً {name} 🌟\n\nيا ريت تقيّم منتجك من CLARK\nرأيك بـ يساعدنا نوصل لعملاء أكتر ✨\n\nرابط التقييم 👇",
  },
];

export function WhatsAppComposer({ open, recipients, initialMessage, onClose, onSend, busy }){
  const [message, setMessage] = useState(initialMessage || "");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  /* Reset on open */
  useEffect(() => {
    if(open){
      setMessage(initialMessage || "");
      setImageUrl("");
    }
  }, [open, initialMessage]);

  if(!open) return null;

  const recipientCount = Array.isArray(recipients) ? recipients.length : 0;
  const previewCustomer = recipientCount > 0 ? recipients[0] : { name: "أحمد محمد", phone: "201234567890" };

  /* Insert text at the cursor position in the textarea */
  const insertAtCursor = (text) => {
    const ta = textareaRef.current;
    if(!ta){
      setMessage(prev => prev + text);
      return;
    }
    const start = ta.selectionStart || message.length;
    const end = ta.selectionEnd || message.length;
    const next = message.slice(0, start) + text + message.slice(end);
    setMessage(next);
    /* Restore caret after the inserted text on next render */
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + text.length, start + text.length);
    });
  };

  const handleImageUpload = async (file) => {
    if(!file){
      showToast("⚠️ مفيش ملف");
      return;
    }
    setUploading(true);
    try {
      const compressed = await compressImage(file, 1200, 0.85);
      const blob = compressed instanceof Blob ? compressed : new Blob([compressed]);
      const fname = String(file.name || "img.jpg").replace(/[^a-zA-Z0-9.-]/g, "_");
      const path = "whatsapp-campaigns/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "-" + fname;
      const ref = storageRef(storage, path);
      await uploadBytes(ref, blob, { contentType: blob.type || "image/jpeg" });
      const url = await getDownloadURL(ref);
      setImageUrl(url);
      /* Auto-insert image URL at the end with a separator */
      const sep = message.endsWith("\n") || message === "" ? "" : "\n\n";
      setMessage(prev => prev + sep + "📸 الصورة: " + url);
      showToast("✅ تم رفع الصورة");
    } catch(e){
      showToast("⛔ فشل رفع الصورة: " + e.message);
      console.error("[WhatsAppComposer] upload failed:", e);
    } finally {
      setUploading(false);
    }
  };

  const removeImage = () => {
    /* Strip the auto-added image line */
    if(imageUrl){
      setMessage(prev => prev.replace(/\n*📸 الصورة:[^\n]+/g, "").trim());
    }
    setImageUrl("");
  };

  /* Render the preview with variables substituted */
  const renderPreview = (text, customer) => {
    return String(text || "")
      .replace(/\{name\}/g, customer?.name || "العميل")
      .replace(/\{phone\}/g, customer?.phone || "—")
      .replace(/\{order\}/g, customer?.shopify_order_number || customer?.order || "—")
      .replace(/\{total\}/g, customer?.total ? customer.total + " ج" : "—")
      .replace(/\{discount\}/g, customer?.discount_code || "BACK10");
  };

  const previewText = renderPreview(message, previewCustomer);

  const charCount = message.length;
  const charLimit = 4096; /* WhatsApp message limit */

  const handleSubmit = () => {
    if(!message.trim()){
      showToast("⚠️ ادخل رسالة");
      return;
    }
    if(charCount > charLimit){
      showToast("⚠️ الرسالة طويلة جداً (الحد الأقصى " + charLimit + " حرف)");
      return;
    }
    onSend(message, imageUrl);
  };

  return (
    <div className="pop-overlay" style={{
      position: "fixed", inset: 0, zIndex: 99998,
      background: "rgba(0,0,0,0.55)",
      backdropFilter: "blur(3px)",
      WebkitBackdropFilter: "blur(3px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 12, direction: "rtl",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.cardSolid,
        borderRadius: 16,
        width: "100%",
        maxWidth: 880,
        maxHeight: "92vh",
        overflowY: "auto",
        boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          background: "linear-gradient(135deg, #25D36615, #128C7E08)",
          borderBottom: "1px solid " + T.brd,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexWrap: "wrap", gap: 8,
          position: "sticky", top: 0, zIndex: 5, backdropFilter: "blur(10px)",
        }}>
          <div>
            <div style={{ fontSize: FS + 2, fontWeight: 800, color: "#128C7E" }}>
              💬 رسالة WhatsApp احترافية
            </div>
            <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 2 }}>
              {recipientCount > 0
                ? `هتـ open ${recipientCount} tab في WhatsApp Web (واحد لكل عميل)`
                : "اكتب رسالة + استخدم الـ variables والـ emoji والصور"}
            </div>
          </div>
          <Btn small onClick={onClose}>✕ إغلاق</Btn>
        </div>

        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Quick templates */}
          <div>
            <div style={{ fontSize: FS - 2, fontWeight: 700, color: T.textSec, marginBottom: 6 }}>
              🚀 قوالب سريعة:
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {TEMPLATES.map((t, i) => (
                <button
                  key={i}
                  onClick={() => setMessage(t.text)}
                  style={{
                    padding: "5px 11px",
                    borderRadius: 8,
                    border: "1px solid " + T.brd,
                    background: T.bg,
                    color: T.text,
                    fontSize: FS - 2,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "'Cairo', sans-serif",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Variables toolbar */}
          <div>
            <div style={{ fontSize: FS - 2, fontWeight: 700, color: T.textSec, marginBottom: 6 }}>
              🏷 الـ Variables — هتُستبدل تلقائياً لكل عميل:
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {VARIABLES.map(v => (
                <button
                  key={v.key}
                  onClick={() => insertAtCursor(v.key)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 6,
                    border: "1px solid " + v.color + "40",
                    background: v.color + "10",
                    color: v.color,
                    fontSize: FS - 2,
                    fontWeight: 800,
                    cursor: "pointer",
                    fontFamily: "monospace",
                  }}
                  title={v.label}
                >
                  {v.key}
                </button>
              ))}
            </div>
          </div>

          {/* Emoji bar */}
          <div>
            <div style={{ fontSize: FS - 2, fontWeight: 700, color: T.textSec, marginBottom: 6 }}>
              😊 إيموجي سريعة:
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {EMOJI_BAR.map((e, i) => (
                <button
                  key={i}
                  onClick={() => insertAtCursor(e)}
                  style={{
                    width: 36, height: 36,
                    borderRadius: 6,
                    border: "1px solid " + T.brd,
                    background: T.bg,
                    fontSize: 20,
                    cursor: "pointer",
                    padding: 0,
                  }}
                  title={e}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Textarea */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label style={{ fontSize: FS - 1, fontWeight: 700, color: T.text }}>
                ✍️ نص الرسالة:
              </label>
              <span style={{
                fontSize: FS - 3,
                color: charCount > charLimit ? T.err : (charCount > 1000 ? T.warn : T.textMut),
                fontFamily: "monospace",
              }}>
                {charCount}/{charLimit}
              </span>
            </div>
            <textarea
              ref={textareaRef}
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={10}
              placeholder="أهلاً {name} 👋&#10;&#10;معاك CLARK Store ✨&#10;..."
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 10,
                border: "1.5px solid " + T.brd,
                background: T.bg,
                color: T.text,
                fontSize: FS,
                lineHeight: 1.7,
                fontFamily: "'Cairo', sans-serif",
                boxSizing: "border-box",
                resize: "vertical",
                minHeight: 200,
              }}
            />
          </div>

          {/* Image upload */}
          <div>
            <div style={{ fontSize: FS - 2, fontWeight: 700, color: T.textSec, marginBottom: 6 }}>
              📸 الصور — هـ يـ upload على Firebase والـ URL يتـ insert في الرسالة:
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={e => {
                if(e.target.files?.[0]) handleImageUpload(e.target.files[0]);
                e.target.value = "";
              }}
            />
            {imageUrl ? (
              <div style={{
                display: "flex", gap: 12, alignItems: "center",
                padding: 10, borderRadius: 10, border: "1px solid " + T.ok + "40",
                background: T.ok + "08",
              }}>
                <img src={imageUrl} alt="" style={{
                  width: 80, height: 80, objectFit: "cover", borderRadius: 8,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: T.ok, fontSize: FS - 2 }}>✅ صورة مرفوعة</div>
                  <div style={{ fontSize: FS - 4, color: T.textMut, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {imageUrl}
                  </div>
                  <div style={{ fontSize: FS - 4, color: T.textMut, marginTop: 4 }}>
                    💡 الـ URL تـ insert تلقائياً في نهاية الرسالة. WhatsApp بـ يعرضها كـ link preview.
                  </div>
                </div>
                <Btn small ghost danger onClick={removeImage}>🗑 حذف</Btn>
              </div>
            ) : (
              <Btn small onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? "⏳ جاري الرفع..." : "➕ ارفع صورة"}
              </Btn>
            )}
          </div>

          {/* Preview */}
          <div>
            <div style={{ fontSize: FS - 2, fontWeight: 700, color: T.textSec, marginBottom: 6 }}>
              👁 معاينة (مع بيانات أول عميل):
            </div>
            <div style={{
              padding: 14,
              borderRadius: 10,
              background: "linear-gradient(135deg, #ECE5DD, #DCF8C6)",
              border: "1px solid #25D36640",
              minHeight: 80,
              maxHeight: 240,
              overflowY: "auto",
              direction: "rtl",
            }}>
              <div style={{
                background: "#fff",
                padding: "10px 14px",
                borderRadius: 12,
                borderTopLeftRadius: 4,
                fontSize: FS,
                lineHeight: 1.7,
                color: "#111",
                fontFamily: "'Cairo', sans-serif",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                maxWidth: 480,
              }}>
                {previewText || "(الرسالة هتظهر هنا)"}
              </div>
              {recipientCount > 0 && (
                <div style={{ fontSize: FS - 3, color: "#075E54", marginTop: 8, fontWeight: 700 }}>
                  📤 سيتم إرسالها لـ <b>{recipientCount}</b> عميل
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div style={{
          position: "sticky", bottom: 0,
          padding: "12px 20px",
          background: T.cardSolid,
          borderTop: "1px solid " + T.brd,
          display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap",
        }}>
          <div style={{ fontSize: FS - 3, color: T.textMut }}>
            💡 الـ WhatsApp Web هـ يفتح tab لكل عميل — تأكد من الـ login قبل الإرسال
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn small onClick={onClose}>إلغاء</Btn>
            <LoadingBtn
              primary
              loading={!!busy}
              loadingText="جاري الإرسال..."
              onClick={handleSubmit}
              disabled={!message.trim() || charCount > charLimit}
              style={{ background: "#25D366", color: "#fff", border: "none", fontWeight: 800, padding: "8px 18px" }}
            >
              📤 إرسال {recipientCount > 0 ? `(${recipientCount})` : ""}
            </LoadingBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Helper: render a message template with a customer's variables substituted.
   Used by both the bulk sender and the campaigns runner to ensure consistency. */
export function renderMessageWithVariables(template, customer){
  return String(template || "")
    .replace(/\{name\}/g, customer?.name || "العميل")
    .replace(/\{phone\}/g, customer?.phone || "—")
    .replace(/\{order\}/g, customer?.shopify_order_number || customer?.order || "—")
    .replace(/\{total\}/g, customer?.total ? customer.total + " ج" : (customer?.total_revenue ? customer.total_revenue + " ج" : "—"))
    .replace(/\{discount\}/g, customer?.discount_code || "BACK10");
}
