/* ════════════════════════════════════════════════════════════════════════
   CLARK V19.58 — Zod schemas for the most-written entities.
   ════════════════════════════════════════════════════════════════════════

   Why this exists:
   Most pages have form-level validation (input field rules) but bugs slip
   through when:
     - data arrives via import/restore
     - a different page mutates an entity
     - a future refactor changes a shape silently
   These schemas are a SAFETY NET — they're checked on every write to
   factory/config (and sales/tasks), and any drift surfaces in Settings →
   "Recent validation errors" so we catch it early.

   ─── Mode ───
   V19.58 ships in WARN-only mode: validation failures are logged to console
   and recorded but never block the write. After observing real production
   for a few weeks (no false positives), we can promote individual schemas
   to STRICT mode (rejects writes).

   ─── Coverage ───
   Only schemas for entities with high write velocity + financial impact:
     - customer, supplier, workshop, employee, empDebt
     - salesInvoice, purchaseInvoice, purchaseOrder
     - custPayment, supplierPayment, wsPayment, check
     - treasuryEntry
   Less critical entities (fabrics, accessories, tasks, sticky notes) are
   intentionally NOT validated to keep the surface tight.

   ─── Permissive philosophy ───
   Real-world data has surprises (legacy fields, optional metadata that
   creeps in). We use `.passthrough()` so unknown keys are allowed; we
   only enforce the SHAPE of the keys we explicitly model.
   ════════════════════════════════════════════════════════════════════════ */

import { z } from "zod";

/* ─── primitives ──────────────────────────────────────────────────────── */

/* IDs: legacy data has both string and number IDs (numeric ids exist for
   workshops 1-3 from INIT_CONFIG). Accept both — never reject on id-type. */
const idLike = z.union([z.string(), z.number()]);

/* Phone — accept any non-empty string OR empty (some entries have no phone). */
const phoneLike = z.string().optional().or(z.literal(""));

/* ISO date string — YYYY-MM-DD or full ISO. Permissive; we just want
   "looks like a date". */
const dateLike = z.string().min(8).optional().or(z.literal(""));

/* Money/quantity — accept number OR numeric string ("100", "100.5"). Some
   legacy entries store these as strings. */
const numLike = z.union([z.number(), z.string()]).optional();

/* User stamp — who created/updated, sometimes empty. */
const userStamp = z.string().optional().or(z.literal(""));

/* ─── master data — partitioned (V19.57) ─────────────────────────────── */

export const customerSchema = z.object({
  id: idLike,
  name: z.string().min(1, "اسم العميل مطلوب"),
  phone: phoneLike,
  address: z.string().optional().or(z.literal("")),
  type: z.string().optional().or(z.literal("")),
  archived: z.boolean().optional(),
  discount: numLike,
}).passthrough();

export const supplierSchema = z.object({
  id: idLike,
  name: z.string().min(1, "اسم المورد مطلوب"),
  phone: phoneLike,
  address: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  archived: z.boolean().optional(),
}).passthrough();

export const workshopSchema = z.object({
  id: idLike,
  name: z.string().min(1, "اسم الورشة مطلوب"),
  type: z.string().optional().or(z.literal("")),
  rating: numLike,
  payPercent: numLike,
  phone: phoneLike,
}).passthrough();

export const employeeSchema = z.object({
  id: idLike,
  name: z.string().min(1, "اسم الموظف مطلوب"),
  phone: phoneLike,
  role: z.string().optional().or(z.literal("")),
  basicSalary: numLike,
  archived: z.boolean().optional(),
}).passthrough();

export const empDebtSchema = z.object({
  id: idLike,
  empId: idLike,
  amount: numLike,
  date: dateLike,
  notes: z.string().optional().or(z.literal("")),
}).passthrough();

/* ─── invoices (V19.50 daily-split) ──────────────────────────────────── */

const invoiceItemSchema = z.object({
  qty: numLike,
  unitPrice: numLike,
  lineTotal: numLike,
}).passthrough();

export const salesInvoiceSchema = z.object({
  id: z.string().min(1),
  invoiceNo: z.string().optional().or(z.literal("")),
  type: z.literal("sales").optional(),
  customerId: idLike.optional(),
  customerName: z.string().optional().or(z.literal("")),
  date: dateLike,
  items: z.array(invoiceItemSchema).optional(),
  total: numLike,
  status: z.enum(["draft", "posted", "void"]).optional(),
  postedAt: z.string().optional().or(z.literal("")),
  postedBy: userStamp,
}).passthrough();

export const purchaseInvoiceSchema = z.object({
  id: z.string().min(1),
  invoiceNo: z.string().optional().or(z.literal("")),
  type: z.literal("purchase").optional(),
  supplierId: idLike.optional(),
  supplierName: z.string().optional().or(z.literal("")),
  date: dateLike,
  items: z.array(invoiceItemSchema).optional(),
  total: numLike,
  status: z.enum(["draft", "posted", "void"]).optional(),
  postedAt: z.string().optional().or(z.literal("")),
  postedBy: userStamp,
}).passthrough();

export const purchaseOrderSchema = z.object({
  id: z.string().min(1),
  poNo: z.string().optional().or(z.literal("")),
  supplierId: idLike.optional(),
  supplierName: z.string().optional().or(z.literal("")),
  date: dateLike,
  totalAmount: numLike,
  items: z.array(z.any()).optional(),
}).passthrough();

/* ─── payments (V19.49 daily-split) ──────────────────────────────────── */

export const custPaymentSchema = z.object({
  id: z.string().min(1),
  custId: idLike,
  amount: numLike,
  date: dateLike,
  method: z.string().optional().or(z.literal("")),
}).passthrough();

export const supplierPaymentSchema = z.object({
  id: z.string().min(1),
  supplierId: idLike,
  amount: numLike,
  date: dateLike,
  method: z.string().optional().or(z.literal("")),
}).passthrough();

export const wsPaymentSchema = z.object({
  id: z.string().min(1),
  wsName: z.string().optional().or(z.literal("")),
  amount: numLike,
  date: dateLike,
  type: z.string().optional().or(z.literal("")),
}).passthrough();

export const checkSchema = z.object({
  id: z.string().min(1),
  type: z.string().optional().or(z.literal("")),
  amount: numLike,
  date: dateLike,
  bank: z.string().optional().or(z.literal("")),
  checkNo: z.string().optional().or(z.literal("")),
  status: z.string().optional().or(z.literal("")),
}).passthrough();

/* ─── treasury (V16.74 daily-split) ──────────────────────────────────── */

export const treasuryEntrySchema = z.object({
  id: z.string().min(1),
  type: z.string().optional().or(z.literal("")),
  amount: numLike,
  date: dateLike,
  category: z.string().optional().or(z.literal("")),
  desc: z.string().optional().or(z.literal("")),
}).passthrough();

/* ════════════════════════════════════════════════════════════════════════
   Mapping: field name → array element schema. Drives the validator.
   Adding a new field here = automatic validation on every write to that
   field. Removing = no validation (silent skip).
   ════════════════════════════════════════════════════════════════════════ */

export const FIELD_SCHEMAS = {
  /* master data */
  customers:        customerSchema,
  suppliers:        supplierSchema,
  workshops:        workshopSchema,
  employees:        employeeSchema,
  empDebts:         empDebtSchema,
  /* invoices */
  salesInvoices:    salesInvoiceSchema,
  purchaseInvoices: purchaseInvoiceSchema,
  purchaseOrders:   purchaseOrderSchema,
  /* payments */
  custPayments:     custPaymentSchema,
  supplierPayments: supplierPaymentSchema,
  wsPayments:       wsPaymentSchema,
  checks:           checkSchema,
  /* treasury */
  treasury:         treasuryEntrySchema,
};

export const VALIDATED_FIELDS = Object.keys(FIELD_SCHEMAS);
