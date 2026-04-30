/* ═══════════════════════════════════════════════════════════════
   CLARK — Default Print Templates (V16.4)
   
   Each template is:
   - id: stable identifier
   - name: Arabic display name
   - category: grouping
   - variables: list of available data paths with descriptions
   - template: handlebars-style HTML
   - css: scoped CSS
   - sampleData: for preview
   ═══════════════════════════════════════════════════════════════ */

export const TEMPLATE_CATEGORIES={
  customer:{label:"📄 العملاء",icon:"📄"},
  workshop:{label:"🏭 الورش",icon:"🏭"},
  hr:{label:"💰 الموظفين",icon:"💰"},
  inventory:{label:"📦 المخزون",icon:"📦"},
};

/* ══════════════════════════════════════════════
   1. CUSTOMER DELIVERY RECEIPT
   ══════════════════════════════════════════════ */
const RECEIPT_TEMPLATE=`
<div class="receipt">
  <div class="header">
    {{#if factory.logo}}<img src="{{{factory.logo}}}" class="logo" alt="logo"/>{{/if}}
    <div class="title-block">
      <div class="factory-name">{{factory.name}}</div>
      {{#if factory.address}}<div class="factory-line">{{factory.address}}</div>{{/if}}
      {{#if factory.phone}}<div class="factory-line">☎ {{factory.phone}}</div>{{/if}}
    </div>
    <div class="doc-title">إيصال تسليم عميل</div>
  </div>

  <div class="info-row">
    <div><b>العميل:</b> {{customer.name}}</div>
    <div><b>التاريخ:</b> {{date session.date}}</div>
    <div><b>رقم الجلسة:</b> {{session.id}}</div>
    {{#if customer.phone}}<div><b>الهاتف:</b> {{customer.phone}}</div>{{/if}}
    {{#if session.receiver}}<div><b>المستلم:</b> {{session.receiver}}</div>{{/if}}
  </div>

  <table class="items">
    <thead>
      <tr>
        <th>#</th>
        <th>الموديل</th>
        <th>الوصف</th>
        <th>الكمية</th>
        <th>السعر</th>
        <th>الإجمالي</th>
      </tr>
    </thead>
    <tbody>
      {{#each items}}
      <tr>
        <td>{{@index}}</td>
        <td><b>{{this.modelNo}}</b></td>
        <td>{{this.modelDesc}}</td>
        <td class="num">{{this.qty}}</td>
        <td class="num">{{fmt this.price}}</td>
        <td class="num"><b>{{fmt this.total}}</b></td>
      </tr>
      {{/each}}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3">الإجمالي</td>
        <td class="num"><b>{{totals.qty}}</b></td>
        <td></td>
        <td class="num total"><b>{{fmt totals.value}} ج</b></td>
      </tr>
    </tfoot>
  </table>

  {{#if customer.discount}}
  <div class="discount-row">
    <div>إجمالي قبل الخصم: <b>{{fmt totals.value}} ج</b></div>
    <div>الخصم ({{customer.discount}}%): <b class="discount">-{{fmt totals.discAmount}} ج</b></div>
    <div class="final">الإجمالي بعد الخصم: <b>{{fmt totals.afterDisc}} ج</b></div>
  </div>
  {{/if}}

  {{#if options.showFooterMessage}}
  <div class="footer-msg">{{options.footerMessage}}</div>
  {{/if}}

  <div class="signatures">
    <div class="sig-box">
      <div>توقيع المستلم</div>
      <div class="sig-line">ــــــــــــــــــــــــــــــــ</div>
    </div>
    <div class="sig-box">
      <div>توقيع المسؤول</div>
      <div class="sig-line">ــــــــــــــــــــــــــــــــ</div>
    </div>
  </div>

  {{#if options.showQR}}{{#if session.qrUrl}}
  <div class="qr-block">
    <img src="{{{session.qrUrl}}}" class="qr-img" alt="QR"/>
    <div class="qr-text">امسح الكود لتأكيد الاستلام</div>
  </div>
  {{/if}}{{/if}}
</div>
`;

const RECEIPT_CSS=`
body{font-family:'Cairo',sans-serif;direction:rtl;margin:0;padding:12mm;background:#fff;color:#1F2937}
.receipt{max-width:210mm;margin:0 auto}
.header{display:flex;align-items:center;gap:16px;padding-bottom:12px;border-bottom:2px solid #6366F1;margin-bottom:16px}
.logo{width:60px;height:60px;object-fit:contain}
.title-block{flex:1}
.factory-name{font-size:20px;font-weight:800;color:#6366F1}
.factory-line{font-size:12px;color:#64748B;margin-top:2px}
.doc-title{font-size:18px;font-weight:800;padding:6px 16px;background:#6366F1;color:#fff;border-radius:8px}
.info-row{display:flex;gap:20px;flex-wrap:wrap;margin-bottom:16px;padding:10px 14px;background:#F8FAFC;border-radius:10px;font-size:13px}
.info-row b{color:#475569}
table.items{width:100%;border-collapse:collapse;margin-bottom:12px;font-size:12px}
.items th{background:#F1F5F9;padding:8px 6px;text-align:right;border-bottom:2px solid #CBD5E1;font-weight:700}
.items td{padding:6px;border-bottom:1px solid #E2E8F0}
.items .num{text-align:center;direction:ltr;font-family:monospace}
.items tfoot td{background:#EEF2FF;font-weight:700;padding:8px 6px}
.items tfoot .total{color:#6366F1;font-size:14px}
.discount-row{margin:10px 0;padding:10px 14px;background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;font-size:13px}
.discount-row div{margin:2px 0}
.discount{color:#D97706}
.discount-row .final{font-size:15px;color:#0284C7;margin-top:6px;padding-top:6px;border-top:1px dashed #F59E0B}
.footer-msg{margin-top:16px;padding:10px;background:#F0FDF4;border-right:3px solid #10B981;font-size:12px;color:#475569;text-align:center}
.signatures{display:flex;justify-content:space-around;margin-top:30px;gap:30px}
.sig-box{flex:1;text-align:center;font-size:11px;color:#64748B}
.sig-line{margin-top:24px;color:#CBD5E1;letter-spacing:-2px}
.qr-block{text-align:center;margin-top:20px}
.qr-img{width:100px;height:100px}
.qr-text{font-size:10px;color:#64748B;margin-top:4px}
@media print{body{padding:8mm}}
`;

/* ══════════════════════════════════════════════
   2. SALARY SLIP
   ══════════════════════════════════════════════ */
const SALARY_TEMPLATE=`
<div class="slip">
  <div class="header">
    {{#if factory.logo}}<img src="{{{factory.logo}}}" class="logo"/>{{/if}}
    <div class="factory-name">{{factory.name}}</div>
    <div class="doc-title">قسيمة مرتب — W{{week.num}}</div>
  </div>
  <div class="info">
    <div>الاسم: <b>{{employee.name}}</b></div>
    {{#if employee.code}}<div>الكود: <b>{{employee.code}}</b></div>{{/if}}
    <div>الفترة: <b>{{week.start}} → {{week.end}}</b></div>
  </div>
  <table>
    <tr><th colspan="2">المستحقات</th></tr>
    <tr><td>أساسي</td><td class="num">{{fmt salary.basic}}</td></tr>
    {{#if salary.overtime}}<tr><td>ساعات إضافية</td><td class="num">{{fmt salary.overtime}}</td></tr>{{/if}}
    {{#if salary.bonus}}<tr><td>مكافأة</td><td class="num">{{fmt salary.bonus}}</td></tr>{{/if}}
    <tr class="total"><td>إجمالي المستحق</td><td class="num"><b>{{fmt salary.grossPay}}</b></td></tr>
    <tr><th colspan="2">الخصومات</th></tr>
    {{#if salary.advances}}<tr><td>السلف</td><td class="num neg">-{{fmt salary.advances}}</td></tr>{{/if}}
    {{#if salary.deductions}}<tr><td>خصومات أخرى</td><td class="num neg">-{{fmt salary.deductions}}</td></tr>{{/if}}
    {{#if salary.debtInstall}}<tr><td>قسط جزاءات</td><td class="num neg">-{{fmt salary.debtInstall}}</td></tr>{{/if}}
    <tr class="total"><td>إجمالي الخصومات</td><td class="num"><b>{{fmt salary.totalDeductions}}</b></td></tr>
    <tr class="final"><td>صافي المستحق</td><td class="num"><b>{{fmt salary.thursdayPay}} ج</b></td></tr>
    {{#if salary.remainingBalance}}<tr><td>رصيد مُرحّل</td><td class="num">{{fmt salary.remainingBalance}}</td></tr>{{/if}}
  </table>
  <div class="sig">
    <div>استلمت المبلغ المذكور</div>
    <div class="sig-line">الاسم: ــــــــــــــــــ  التوقيع: ــــــــــــــــــ</div>
  </div>
</div>
`;

const SALARY_CSS=`
body{font-family:'Cairo',sans-serif;direction:rtl;margin:0;padding:10mm;font-size:13px;color:#1F2937}
.slip{max-width:148mm;margin:0 auto;border:2px solid #6366F1;border-radius:12px;padding:12px;background:#fff}
.header{text-align:center;padding-bottom:10px;border-bottom:2px solid #6366F1;margin-bottom:10px}
.logo{width:40px;height:40px;object-fit:contain}
.factory-name{font-size:16px;font-weight:800;color:#6366F1;margin-top:4px}
.doc-title{font-size:14px;background:#6366F1;color:#fff;padding:4px 14px;border-radius:6px;display:inline-block;margin-top:6px}
.info{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:8px 10px;background:#F8FAFC;border-radius:8px;margin-bottom:10px;font-size:12px}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{padding:6px 8px;border-bottom:1px solid #E2E8F0}
th{background:#F1F5F9;text-align:right;color:#475569;font-weight:700}
.num{text-align:left;direction:ltr;font-family:monospace}
.neg{color:#DC2626}
.total td{background:#EEF2FF;font-weight:700;color:#6366F1}
.final td{background:#10B981;color:#fff;font-size:14px;padding:10px}
.sig{margin-top:14px;padding-top:10px;border-top:1px dashed #CBD5E1;font-size:11px;text-align:center;color:#64748B}
.sig-line{margin-top:10px}
@media print{body{padding:6mm}}
`;

/* ══════════════════════════════════════════════
   3. WORKSHOP ORDER (إذن تسليم ورشة)
   ══════════════════════════════════════════════ */
const WS_ORDER_TEMPLATE=`
<div class="order">
  <div class="header">
    {{#if factory.logo}}<img src="{{{factory.logo}}}" class="logo"/>{{/if}}
    <div class="factory-name">{{factory.name}}</div>
    <div class="doc-title">إذن تسليم ورشة</div>
  </div>
  <table class="info">
    <tr><th>رقم الموديل</th><td><b>{{order.modelNo}}</b></td><th>التاريخ</th><td>{{date delivery.date}}</td></tr>
    <tr><th>الوصف</th><td colspan="3">{{order.modelDesc}}</td></tr>
    <tr><th>الورشة</th><td><b>{{delivery.workshop}}</b></td><th>الكمية</th><td><b class="big">{{delivery.qty}}</b> قطعة</td></tr>
    {{#if delivery.garmentType}}<tr><th>قطعة التسليم</th><td colspan="3"><b>{{delivery.garmentType}}</b></td></tr>{{/if}}
    {{#if order.marker}}<tr><th>ماركر</th><td colspan="3">{{order.marker}}</td></tr>{{/if}}
  </table>
  {{#if fabrics}}
  <h3>الأقمشة</h3>
  {{#each fabrics}}
    <div class="fabric-block">
      <div class="fabric-name"><b>{{this.label}}</b></div>
      <table class="fabric-tbl">
        <thead><tr><th>اللون</th><th>الكمية</th></tr></thead>
        <tbody>
          {{#each this.colors}}
          <tr><td>{{this.color}}</td><td class="num">{{this.qty}}</td></tr>
          {{/each}}
        </tbody>
      </table>
    </div>
  {{/each}}
  {{/if}}
  <div class="notes">
    {{#if order.instructions}}<div><b>تعليمات:</b> {{order.instructions}}</div>{{/if}}
    {{#if delivery.notes}}<div><b>ملاحظات التسليم:</b> {{delivery.notes}}</div>{{/if}}
  </div>
  <div class="signatures">
    <div>توقيع الورشة: ــــــــــــــــــ</div>
    <div>توقيع المصنع: ــــــــــــــــــ</div>
  </div>
</div>
`;

const WS_ORDER_CSS=`
body{font-family:'Cairo',sans-serif;direction:rtl;margin:0;padding:10mm;color:#1F2937}
.order{max-width:210mm;margin:0 auto}
.header{display:flex;align-items:center;gap:14px;padding-bottom:10px;border-bottom:2px solid #8B5CF6;margin-bottom:12px}
.logo{width:50px;height:50px;object-fit:contain}
.factory-name{flex:1;font-size:18px;font-weight:800;color:#8B5CF6}
.doc-title{font-size:15px;padding:6px 14px;background:#8B5CF6;color:#fff;border-radius:8px}
table.info{width:100%;border-collapse:collapse;margin-bottom:10px;font-size:13px}
.info th,.info td{padding:7px 10px;border:1px solid #E2E8F0}
.info th{background:#F5F3FF;color:#6B21A8;font-weight:700;width:20%}
.big{font-size:18px;color:#0284C7}
h3{font-size:14px;margin:14px 0 6px;color:#6B21A8}
.fabric-block{margin-bottom:10px;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden}
.fabric-name{background:#F5F3FF;padding:6px 10px;color:#6B21A8}
.fabric-tbl{width:100%;border-collapse:collapse;font-size:12px}
.fabric-tbl th{background:#FAFAFA;padding:5px 10px;text-align:right;font-weight:600;color:#64748B}
.fabric-tbl td{padding:4px 10px;border-top:1px solid #F1F5F9}
.num{text-align:left;direction:ltr;font-family:monospace}
.notes{margin-top:12px;padding:10px;background:#FEF3C7;border-radius:8px;font-size:12px;line-height:1.6}
.signatures{display:flex;justify-content:space-around;margin-top:30px;font-size:12px;color:#64748B}
@media print{body{padding:8mm}}
`;

/* ══════════════════════════════════════════════
   4. CUSTOMER STATEMENT
   ══════════════════════════════════════════════ */
const STATEMENT_TEMPLATE=`
<div class="stmt">
  <div class="header">
    {{#if factory.logo}}<img src="{{{factory.logo}}}" class="logo"/>{{/if}}
    <div class="header-mid">
      <div class="factory-name">{{factory.name}}</div>
      {{#if factory.phone}}<div class="factory-line">☎ {{factory.phone}}</div>{{/if}}
    </div>
    <div class="doc-title">كشف حساب</div>
  </div>
  <div class="cust-info">
    <div><b>العميل:</b> {{customer.name}}</div>
    {{#if customer.phone}}<div><b>الهاتف:</b> {{customer.phone}}</div>{{/if}}
    <div><b>التاريخ:</b> {{date today}}</div>
  </div>
  <h3>حركات الحساب</h3>
  <table class="items">
    <thead>
      <tr><th>الموديل</th><th>الوصف</th><th>تسليم</th><th>مرتجع</th><th>صافي</th><th>سعر</th><th>القيمة</th></tr>
    </thead>
    <tbody>
      {{#each rows}}
      <tr>
        <td><b>{{this.modelNo}}</b></td>
        <td>{{this.modelDesc}}</td>
        <td class="num">{{this.delivered}}</td>
        <td class="num">{{#if this.returned}}{{this.returned}}{{else}}—{{/if}}</td>
        <td class="num"><b>{{this.net}}</b></td>
        <td class="num">{{fmt this.sellPrice}}</td>
        <td class="num"><b>{{fmt this.value}}</b></td>
      </tr>
      {{/each}}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2"><b>الإجمالي</b></td>
        <td class="num"><b>{{totals.delivered}}</b></td>
        <td class="num"><b>{{totals.returned}}</b></td>
        <td class="num"><b>{{totals.net}}</b></td>
        <td></td>
        <td class="num total"><b>{{fmt totals.value}} ج</b></td>
      </tr>
    </tfoot>
  </table>
  <h3>ملخص الحساب</h3>
  <table class="summary">
    <tr><td>إجمالي المبيعات{{#if customer.discount}} (قبل الخصم){{/if}}</td><td class="num"><b>{{fmt summary.grossValue}} ج</b></td></tr>
    {{#if customer.discount}}
    <tr><td>قيمة الخصم ({{customer.discount}}%)</td><td class="num neg">-{{fmt summary.discountAmount}} ج</td></tr>
    <tr><td><b>المبيعات بعد الخصم</b></td><td class="num"><b>{{fmt summary.afterDiscount}} ج</b></td></tr>
    {{/if}}
    {{#if summary.totalPaid}}<tr><td>المدفوع</td><td class="num paid">-{{fmt summary.totalPaid}} ج</td></tr>{{/if}}
    <tr class="final"><td>الرصيد المتبقي</td><td class="num"><b>{{fmt summary.balance}} ج</b></td></tr>
  </table>
  {{#if options.showFooterMessage}}
  <div class="footer-msg">{{options.footerMessage}}</div>
  {{/if}}
</div>
`;

const STATEMENT_CSS=`
body{font-family:'Cairo',sans-serif;direction:rtl;margin:0;padding:10mm;color:#1F2937;font-size:12px}
.stmt{max-width:210mm;margin:0 auto}
.header{display:flex;align-items:center;gap:14px;padding-bottom:10px;border-bottom:2px solid #0EA5E9;margin-bottom:12px}
.logo{width:50px;height:50px;object-fit:contain}
.header-mid{flex:1}
.factory-name{font-size:18px;font-weight:800;color:#0EA5E9}
.factory-line{font-size:11px;color:#64748B;margin-top:2px}
.doc-title{font-size:15px;padding:6px 14px;background:#0EA5E9;color:#fff;border-radius:8px}
.cust-info{display:flex;gap:20px;padding:10px 14px;background:#F0F9FF;border-radius:8px;margin-bottom:12px}
h3{font-size:13px;margin:12px 0 6px;color:#0C4A6E}
table.items,table.summary{width:100%;border-collapse:collapse;font-size:11px}
.items th,.items td{padding:5px 6px;border-bottom:1px solid #E2E8F0}
.items th{background:#E0F2FE;text-align:right;color:#0C4A6E;font-weight:700}
.items tfoot td{background:#F0F9FF;font-weight:700;padding:7px 6px}
.items .total{color:#0EA5E9;font-size:13px}
.num{text-align:left;direction:ltr;font-family:monospace}
.summary td{padding:6px 10px;border-bottom:1px solid #F1F5F9}
.summary .neg{color:#D97706}
.summary .paid{color:#10B981}
.summary .final td{background:#0EA5E9;color:#fff;font-size:14px;padding:10px;font-weight:700}
.footer-msg{margin-top:20px;padding:10px;background:#F0FDF4;border-right:3px solid #10B981;font-size:12px;text-align:center}
@media print{body{padding:6mm}}
`;

/* ══════════════════════════════════════════════
   5. WORKSHOP RECEIVE (إيصال استلام من ورشة)
   ══════════════════════════════════════════════ */
const WS_RECEIVE_TEMPLATE=`
<div class="rcv">
  <div class="header">
    {{#if factory.logo}}<img src="{{{factory.logo}}}" class="logo"/>{{/if}}
    <div class="factory-name">{{factory.name}}</div>
    <div class="doc-title">إيصال استلام من ورشة</div>
  </div>
  <table>
    <tr><th>الورشة</th><td><b>{{workshop.name}}</b></td><th>التاريخ</th><td>{{date date}}</td></tr>
    <tr><th>الموديل</th><td><b>{{order.modelNo}}</b></td><th>الوصف</th><td>{{order.modelDesc}}</td></tr>
    <tr><th>الكمية المستلمة</th><td><b class="big">{{qty}}</b> قطعة</td><th>المستلم</th><td>{{receiver}}</td></tr>
    {{#if notes}}<tr><th>ملاحظات</th><td colspan="3">{{notes}}</td></tr>{{/if}}
  </table>
  <div class="sig">
    <div>توقيع الورشة: ــــــــــــــــــ</div>
    <div>توقيع المستلم: ــــــــــــــــــ</div>
  </div>
</div>
`;

const WS_RECEIVE_CSS=`
body{font-family:'Cairo',sans-serif;direction:rtl;margin:0;padding:10mm;color:#1F2937}
.rcv{max-width:148mm;margin:0 auto;border:2px solid #10B981;border-radius:12px;padding:12px}
.header{text-align:center;padding-bottom:10px;border-bottom:2px solid #10B981;margin-bottom:12px}
.logo{width:40px;height:40px}
.factory-name{font-size:16px;font-weight:800;color:#10B981;margin-top:4px}
.doc-title{font-size:14px;background:#10B981;color:#fff;padding:4px 14px;border-radius:6px;display:inline-block;margin-top:6px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:7px 10px;border:1px solid #E2E8F0}
th{background:#ECFDF5;color:#047857;font-weight:700;width:20%}
.big{font-size:18px;color:#10B981}
.sig{display:flex;justify-content:space-around;margin-top:30px;font-size:11px;color:#64748B}
@media print{body{padding:6mm}}
`;

/* ══════════════════════════════════════════════
   COMPILE & EXPORT DEFAULTS
   ══════════════════════════════════════════════ */

export const DEFAULT_TEMPLATES={
  receipt:{
    id:"receipt",
    name:"إيصال تسليم عميل",
    category:"customer",
    icon:"🧾",
    description:"يطبع عند تسليم بضاعة للعميل. يشمل قائمة الموديلات والأسعار والخصم.",
    template:RECEIPT_TEMPLATE.trim(),
    css:RECEIPT_CSS.trim(),
    variables:[
      {path:"factory.name",desc:"اسم المصنع"},
      {path:"factory.logo",desc:"شعار المصنع (base64)"},
      {path:"factory.phone",desc:"هاتف المصنع"},
      {path:"factory.address",desc:"عنوان المصنع"},
      {path:"customer.name",desc:"اسم العميل"},
      {path:"customer.phone",desc:"هاتف العميل"},
      {path:"customer.discount",desc:"نسبة الخصم %"},
      {path:"session.date",desc:"تاريخ الجلسة"},
      {path:"session.id",desc:"رقم الجلسة"},
      {path:"session.receiver",desc:"اسم المستلم"},
      {path:"session.qrUrl",desc:"رابط QR للتأكيد"},
      {path:"items",desc:"مصفوفة [{modelNo, modelDesc, qty, price, total}]"},
      {path:"totals.qty",desc:"إجمالي الكميات"},
      {path:"totals.value",desc:"إجمالي القيمة"},
      {path:"totals.discAmount",desc:"قيمة الخصم"},
      {path:"totals.afterDisc",desc:"الإجمالي بعد الخصم"},
      {path:"options.showQR",desc:"عرض QR (true/false)"},
      {path:"options.showFooterMessage",desc:"عرض رسالة أسفل"},
      {path:"options.footerMessage",desc:"نص الرسالة"},
    ],
  },
  salary:{
    id:"salary",
    name:"قسيمة مرتب",
    category:"hr",
    icon:"💰",
    description:"قسيمة مرتب الموظف الأسبوعي مع تفصيل المستحقات والخصومات.",
    template:SALARY_TEMPLATE.trim(),
    css:SALARY_CSS.trim(),
    variables:[
      {path:"factory.name",desc:"اسم المصنع"},
      {path:"factory.logo",desc:"شعار المصنع"},
      {path:"employee.name",desc:"اسم الموظف"},
      {path:"employee.code",desc:"كود الموظف"},
      {path:"week.num",desc:"رقم الأسبوع"},
      {path:"week.start",desc:"بداية الأسبوع"},
      {path:"week.end",desc:"نهاية الأسبوع"},
      {path:"salary.basic",desc:"الأساسي"},
      {path:"salary.overtime",desc:"ساعات إضافية"},
      {path:"salary.bonus",desc:"مكافأة"},
      {path:"salary.grossPay",desc:"إجمالي المستحق"},
      {path:"salary.advances",desc:"السلف"},
      {path:"salary.deductions",desc:"خصومات"},
      {path:"salary.debtInstall",desc:"قسط جزاءات"},
      {path:"salary.totalDeductions",desc:"إجمالي الخصومات"},
      {path:"salary.thursdayPay",desc:"صافي المستحق"},
      {path:"salary.remainingBalance",desc:"رصيد مُرحّل"},
    ],
  },
  wsOrder:{
    id:"wsOrder",
    name:"إذن تسليم ورشة",
    category:"workshop",
    icon:"📋",
    description:"إذن التسليم الخارجي للورش — يشمل القماش والألوان والكميات.",
    template:WS_ORDER_TEMPLATE.trim(),
    css:WS_ORDER_CSS.trim(),
    variables:[
      {path:"factory.name",desc:"اسم المصنع"},
      {path:"factory.logo",desc:"شعار المصنع"},
      {path:"order.modelNo",desc:"رقم الموديل"},
      {path:"order.modelDesc",desc:"وصف الموديل"},
      {path:"order.marker",desc:"ماركر"},
      {path:"order.instructions",desc:"تعليمات التشغيل"},
      {path:"delivery.date",desc:"تاريخ التسليم"},
      {path:"delivery.workshop",desc:"اسم الورشة"},
      {path:"delivery.qty",desc:"الكمية"},
      {path:"delivery.garmentType",desc:"نوع القطعة"},
      {path:"delivery.notes",desc:"ملاحظات"},
      {path:"fabrics",desc:"مصفوفة [{label, colors:[{color, qty}]}]"},
    ],
  },
  statement:{
    id:"statement",
    name:"كشف حساب عميل",
    category:"customer",
    icon:"📊",
    description:"كشف حساب تفصيلي لعميل يشمل المبيعات والمدفوعات والرصيد.",
    template:STATEMENT_TEMPLATE.trim(),
    css:STATEMENT_CSS.trim(),
    variables:[
      {path:"factory.name",desc:"اسم المصنع"},
      {path:"factory.logo",desc:"شعار المصنع"},
      {path:"factory.phone",desc:"هاتف المصنع"},
      {path:"customer.name",desc:"اسم العميل"},
      {path:"customer.phone",desc:"هاتف العميل"},
      {path:"customer.discount",desc:"نسبة الخصم %"},
      {path:"today",desc:"تاريخ اليوم"},
      {path:"rows",desc:"مصفوفة [{modelNo, modelDesc, delivered, returned, net, sellPrice, value}]"},
      {path:"totals.delivered",desc:"إجمالي المسلّم"},
      {path:"totals.returned",desc:"إجمالي المرتجع"},
      {path:"totals.net",desc:"صافي القطع"},
      {path:"totals.value",desc:"إجمالي القيمة"},
      {path:"summary.grossValue",desc:"إجمالي المبيعات"},
      {path:"summary.discountAmount",desc:"قيمة الخصم"},
      {path:"summary.afterDiscount",desc:"بعد الخصم"},
      {path:"summary.totalPaid",desc:"المدفوع"},
      {path:"summary.balance",desc:"الرصيد"},
    ],
  },
  wsReceive:{
    id:"wsReceive",
    name:"إيصال استلام من ورشة",
    category:"workshop",
    icon:"📥",
    description:"إيصال استلام البضاعة التامة من الورشة.",
    template:WS_RECEIVE_TEMPLATE.trim(),
    css:WS_RECEIVE_CSS.trim(),
    variables:[
      {path:"factory.name",desc:"اسم المصنع"},
      {path:"factory.logo",desc:"شعار المصنع"},
      {path:"workshop.name",desc:"اسم الورشة"},
      {path:"order.modelNo",desc:"رقم الموديل"},
      {path:"order.modelDesc",desc:"وصف الموديل"},
      {path:"qty",desc:"الكمية المستلمة"},
      {path:"date",desc:"التاريخ"},
      {path:"receiver",desc:"اسم المستلم"},
      {path:"notes",desc:"ملاحظات"},
    ],
  },
};

/* Sample data for previews */
export const SAMPLE_DATA={
  receipt:{
    factory:{name:"CLARK Factory",phone:"01000000000",address:"القاهرة, مصر",logo:""},
    customer:{name:"مكتب سينا كيدز",phone:"01111111111",discount:5},
    session:{date:"2026-04-23",id:"SESS-001",receiver:"أحمد محمد"},
    items:[
      {modelNo:"3262112",modelDesc:"تويز 4 قطع",qty:40,price:345,total:13800},
      {modelNo:"3261113",modelDesc:"توين أولادي",qty:24,price:320,total:7680},
      {modelNo:"3261101",modelDesc:"تي شيرت طباعة",qty:60,price:280,total:16800},
    ],
    totals:{qty:124,value:38280,discAmount:1914,afterDisc:36366},
    options:{showQR:false,showFooterMessage:true,footerMessage:"نسعد بخدمتكم — شكراً لتعاملكم معنا"},
  },
  salary:{
    factory:{name:"CLARK Factory",logo:""},
    employee:{name:"أحمد فوزي",code:"EMP-017"},
    week:{num:23,start:"2026-04-17",end:"2026-04-23"},
    salary:{basic:800,overtime:120,bonus:50,grossPay:970,advances:200,deductions:30,debtInstall:50,totalDeductions:280,thursdayPay:690,remainingBalance:0},
  },
  wsOrder:{
    factory:{name:"CLARK Factory",logo:""},
    order:{modelNo:"3262112",modelDesc:"تويز 4 قطع بناتي",marker:"MK-045",instructions:"حياكة بخيوط سرج، كي ملابس قبل التسليم"},
    delivery:{date:"2026-04-20",workshop:"ورشة الأمانة",qty:120,garmentType:"قميص",notes:""},
    fabrics:[
      {label:"قماش الجسم",colors:[{color:"أزرق",qty:60},{color:"أخضر",qty:60}]},
      {label:"قماش البطانة",colors:[{color:"أبيض",qty:120}]},
    ],
  },
  statement:{
    factory:{name:"CLARK Factory",phone:"01000000000",logo:""},
    customer:{name:"مكتب سينا كيدز",phone:"01111111111",discount:5},
    today:"2026-04-23",
    rows:[
      {modelNo:"3262112",modelDesc:"تويز",delivered:40,returned:2,net:38,sellPrice:345,value:13110},
      {modelNo:"3261113",modelDesc:"توين",delivered:24,returned:0,net:24,sellPrice:320,value:7680},
    ],
    totals:{delivered:64,returned:2,net:62,value:20790},
    summary:{grossValue:20790,discountAmount:1040,afterDiscount:19750,totalPaid:10000,balance:9750},
    options:{showFooterMessage:true,footerMessage:"نرحب بتعاملكم المستمر"},
  },
  wsReceive:{
    factory:{name:"CLARK Factory",logo:""},
    workshop:{name:"ورشة الأمانة"},
    order:{modelNo:"3262112",modelDesc:"تويز 4 قطع"},
    qty:60,date:"2026-04-22",receiver:"محمد سعيد",notes:"",
  },
};

/* Get template: user-customized if exists, else default */
export function getTemplate(templates,templateId){
  const userTpl=templates&&templates[templateId];
  if(userTpl&&userTpl.template)return userTpl;
  return DEFAULT_TEMPLATES[templateId];
}

/* Check if a template has been customized */
export function isCustomized(templates,templateId){
  return!!(templates&&templates[templateId]&&templates[templateId].template);
}
