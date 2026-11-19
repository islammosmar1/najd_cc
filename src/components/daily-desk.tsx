"use client";
import { useState, useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ScanLine,
  Package,
  ReceiptText,
  Store,
  ChevronLeft,
  Plus,
  Search,
  RefreshCw,
  LogOut,
  Settings2,
  TriangleAlert,
  Printer,
  PencilLine,
  Box,
  LockKeyhole,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { authClient } from "@/lib/auth/client";
import { variants, type Dataset, type Row } from "@/lib/types";
import { normalizeBarcode, type Variant } from "@/lib/domain";
import { localDay } from "@/lib/dates";
import { money } from "@/lib/utils";
import { Button } from "./ui/button";
import { Modal } from "./modal";
import { POS } from "./pos";
import { AccountForm } from "./account-form";
const ProductBarcodeScanner = dynamic(() => import("./camera-scanner").then(module => module.CameraScanner), {ssr:false});

type Props = {
  data: Dataset;
  business: string;
  branch: string;
  configured: boolean;
  signed: boolean;
  online: boolean;
  loading: boolean;
  error: string;
  from: string;
  to: string;
  allBranches: boolean;
  onAllBranches: (value: boolean) => void;
  onDates: (from: string, to: string) => void;
  onBranch: (id: string) => void;
  onSigned: (signed: boolean) => void;
  refresh: () => Promise<void>;
  execute: (
    action: string,
    p: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
};
type EditProduct = Variant & { cost?: number; description?: string };
type DeskDialog = {
  type:
    "login" | "password" | "product" | "stock" | "receipt" | "return";
  product?: EditProduct;
  mode?: "add" | "set";
  expected?: number;
  sale?: Row;
};
const sections = [
  {
    id: "sell",
    label: "البيع",
    icon: ScanLine,
    description: "مسح الباركود وتأكيد البيع",
  },
  {
    id: "stock",
    label: "المنتجات والكميات",
    icon: Package,
    description: "إضافة وتعديل المخزون",
  },
  {
    id: "history",
    label: "سجل المبيعات",
    icon: ReceiptText,
    description: "مراجعة الفواتير",
  },
] as const;
export function DailyDesk(props: Props) {
  const {
    data,
    business,
    branch,
    configured,
    signed,
    online,
    loading,
    error,
    from,
    to,
    onAllBranches,
    onDates,
    onBranch,
    onSigned,
    refresh,
    execute,
  } = props;
  const [tab, setTab] = useState<string>("sell");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<DeskDialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const branches = data.branches.filter((b) => b.business_id === business);
  const saleBranches = branches.filter(b => b.id !== data.inventory_branch_id);
  const summary = data.daily_summary?.branch_id === branch ? data.daily_summary : undefined;
  const selectedBranch = saleBranches.find(b => b.id === branch);
  const memberships = data.memberships.filter(
    (m) =>
      m.business_id === business &&
      m.user_id === data.user_id &&
      (!m.branch_id || m.branch_id === branch),
  );
  const canManage = memberships.some((m) =>
    ["owner", "super_admin", "manager"].includes(String(m.role)),
  );
  const canStock = canManage || memberships.some((m) => m.role === "inventory");
  const canSell = canManage || memberships.some((m) => m.role === "cashier");
  const current =
    tab === "sell" && signed && memberships.length > 0 && !canSell
      ? canStock
        ? "stock"
        : "history"
      : tab;
  const enabled = configured && signed && Boolean(branch) && online && !error;
  const catalog = variants(data, business, branch);
  const stock = (id: string) => data.branch_inventory.filter(i => i.variant_id === id && i.business_id === business).reduce((sum, i) => sum + Number(i.quantity), 0);
  const openShift = data.cash_shifts.find(
    (s) => s.user_id === data.user_id && s.branch_id === branch && !s.closed_at,
  );
  const tax = Number(
    data.businesses.find((b) => b.id === business)?.tax_bps ?? 0,
  );
  const filteredProducts = catalog.filter((p) =>
    (p.name + " " + p.barcode + " " + p.sku)
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const sales = data.sales
    .filter(
      (s) =>
        s.business_id === business &&
        true &&
        localDay(String(s.created_at)) >= from &&
        localDay(String(s.created_at)) <= to,
    )
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  async function save(action: string, p: Record<string, unknown>) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      await execute(action, p);
      setDialog(null);
      toast.success("تم الحفظ بنجاح");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function edit(product: Variant) {
    try {
      const response = await fetch(
        "/api/product?" +
          new URLSearchParams({ b: business, br: branch, v: product.id }),
        { cache: "no-store" },
      );
      const detail = await response.json();
      if (!response.ok) throw Error(detail.error);
      setDialog({ type: "product", product: { ...product, ...detail } });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  const navigate = (id: string) => {
    if (pending) {
      toast.error("تحقق من نتيجة البيع المعلق أولًا");
      return;
    }
    setTab(id);
    setSearch("");
  };
  return (
    <div className="daily-app" dir="rtl">
      <Toaster richColors position="top-center" dir="rtl" />
      <header className="daily-header">
        <Link href="/" className="daily-brand">
          <span>
            <Store size={24} />
          </span>
          <div>
            <strong>
              najd<span> للحسابات</span>
            </strong>

          </div>
        </Link>
        <div className="daily-header-tools">
          <span className={"daily-connection " + (enabled ? "connected" : "")}>
            <i />
            {!online
              ? "الاتصال مقطوع"
              : signed
                ? "حسابك متصل"
                : "ابدأ بتسجيل الدخول"}
          </span>
          <button
            aria-label="تحديث البيانات"
            title="تحديث البيانات"
            className="icon-btn"
            disabled={loading || pending}
            onClick={() => void refresh()}
          >
            <RefreshCw size={19} />
          </button>
          {signed ? (
            <>
              <Button variant="ghost" disabled={pending} onClick={() => setDialog({type:"password"})}>كلمة المرور</Button>
              <button
                className="icon-btn"
                aria-label="تسجيل الخروج"
                disabled={pending}
                onClick={async () => {
                  await authClient.signOut();
                  onSigned(false);
                }}
              >
                <LogOut size={19} />
              </button>
            </>
          ) : (
            <Button
              disabled={!configured}
              onClick={() => setDialog({ type: "login" })}
            >
              <LockKeyhole size={16} />
              تسجيل الدخول
            </Button>
          )}
        </div>
      </header>
      <main className="daily-main">
        <section className="sale-branch-picker" aria-label="اختر فرع البيع">
          <strong><Store size={18} /> فرع البيع</strong>
          {saleBranches.length ? saleBranches.map(item => <Button key={item.id} variant={branch === item.id ? "default" : "outline"} disabled={pending || busy} aria-pressed={branch === item.id} onClick={() => onBranch(item.id)}>{String(item.name)}</Button>) : <span>سجّل الدخول لاختيار الفرع</span>}
          <small>المخزون إجمالي واحد للفرعين</small>
        </section>
        {signed && <section className="today-cards" aria-label="ملخص اليوم">
          <article><small>مبيعات اليوم · {String(selectedBranch?.name || "اختر الفرع")}</small><strong>{summary ? money(summary.sales) : "—"}</strong></article>
          <article><small>القطع المباعة اليوم</small><strong>{summary?.pieces ?? "—"}<span> قطعة</span></strong></article>
          <article><small>فواتير اليوم</small><strong>{summary?.tickets ?? "—"}</strong></article>
          <article><small>إجمالي المخزون المتوفر</small><strong>{summary?.stock ?? "—"}<span> قطعة</span></strong></article>
        </section>}
        <div className="shared-stock-note"><Package size={19} /><strong>مخزون إجمالي واحد</strong><span>اختر الشنطة بالاسم أو الصورة · الباركود اختياري</span></div>
        {!configured && <div className="error-banner">تعذر الاتصال بالخدمة. حاول مجددًا لاحقًا.</div>}
        {configured && !signed && (
          <div className="daily-notice">
            <LockKeyhole size={22} />
            <div>
              <strong>أهلًا بك في najd</strong>
              <p>سجّل الدخول لعرض المنتجات والبدء بالبيع.</p>
            </div>
            <Button onClick={() => setDialog({ type: "login" })}>
              تسجيل الدخول
            </Button>
          </div>
        )}
        {signed && !loading && !data.businesses.length && (
          <div className="daily-notice">
            <TriangleAlert size={22} />
            <div>
              <strong>
                {data.email_verified === false
                  ? "أكّد ملكية بريدك للدخول إلى حسابات المتجر"
                  : "الحساب غير مرتبط بالمتجر بعد"}
              </strong>
              <p>
                {data.email_verified === false
                  ? "سجّل الخروج وادخل باستخدام الرمز الذي يصلك إلى البريد المعتمد."
                  : "يحتاج المسؤول إلى إضافة عضويتك في najd قبل تسجيل المبيعات."}
              </p>
            </div>
          </div>
        )}
        {error && (
          <div role="alert" className="error-banner">
            {error}
            <Button size="sm" variant="outline" onClick={() => void refresh()}>
              تحديث البيانات
            </Button>
          </div>
        )}
        {!online && (
          <div role="alert" className="error-banner">
            الاتصال مقطوع. البيع والحفظ متوقفان حتى يعود الاتصال.
          </div>
        )}
        <nav className="daily-tabs" aria-label="العمل اليومي">
          {sections
            .filter(
              (s) =>
                !signed ||
                s.id === "history" ||
                (s.id === "sell" && canSell) ||
                (s.id === "stock" && canStock),
            )
            .map((s) => (
              <button
                key={s.id}
                className={current === s.id ? "active" : ""}
                onClick={() => navigate(s.id)}
                disabled={pending}
              >
                <s.icon size={22} />
                <span>
                  <strong>{s.label}</strong>
                  <small>{s.description}</small>
                </span>
                {current === s.id && <ChevronLeft size={17} />}
              </button>
            ))}
        </nav>
        {current === "sell" && (
          <section className="daily-sell">
            <div className="daily-section-title">
              <div>
                <h2>فاتورة بيع جديدة</h2>
                <strong className="active-sale-branch">{String(selectedBranch?.name || "اختر فرع البيع")}</strong>
                <p>
                  اختر المنتج بالاسم أو الصورة، أو امسح باركوده. الكمية تنقص من المخزون الإجمالي بعد تأكيد البيع.
                </p>
              </div>
              <span className="daily-shortcut">
                <ScanLine size={17} />
                اختيار أو مسح <kbd>F2</kbd>
              </span>
            </div>
            <POS
              key={branch || "setup"}
              products={catalog}
              stock={stock}
              branch={branch}
              shift={openShift?.id || ""}
              taxBps={tax}
              online={online}
              enabled={enabled && canSell}
              checkout={(p) => execute("checkout", p)}
              onPendingChange={setPending}
            />
          </section>
        )}
        {current === "stock" && (
          <>
            <div className="daily-section-title">
              <div>
                <h2>المنتجات والكميات</h2>
                <p>كل منتجاتك وكمياتها الإجمالية من مكان واحد.</p>
              </div>
              <Button
                disabled={!enabled || !canManage}
                onClick={() => setDialog({ type: "product" })}
              >
                <Plus size={19} />
                إضافة منتج
              </Button>
            </div>
            <section className="panel daily-stock-panel">
              <div className="daily-stock-toolbar">
                <label className="daily-search">
                  <Search size={19} />
                  <input
                    aria-label="ابحث عن منتج أو امسح باركوده"
                    placeholder="ابحث باسم المنتج أو امسح الباركود هنا…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.preventDefault();
                    }}
                  />
                </label>
                <span>
                  {catalog.length} منتج
                </span>
              </div>
              <div className="table-wrap">
                <table className="daily-stock-table">
                  <thead>
                    <tr>
                      <th>المنتج</th>
                      <th>سعر البيع</th>
                      <th>الكمية الإجمالية</th><th>تعديل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div className="daily-product-title">
                            <span>
                              <Package size={20} />
                            </span>
                            <div>
                              <strong>{p.name}</strong>
                              <small dir="ltr">{p.sku}{p.barcode && !p.barcode.startsWith("AUTO-") ? " · " + p.barcode : ""}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <strong>{money(p.price)}</strong>
                        </td>
                        <td><span className="stock-number">{stock(p.id)}<small>قطعة</small></span></td>
                        <td>
                          <div className="daily-row-actions">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!enabled || !canStock}
                              onClick={() =>
                                setDialog({
                                  type: "stock",
                                  product: p,
                                  mode: "add",
                                  expected: stock(p.id),
                                })
                              }
                            >
                              <Plus size={16} />
                              إضافة بضاعة
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!enabled || !canStock}
                              onClick={() =>
                                setDialog({
                                  type: "stock",
                                  product: p,
                                  mode: "set",
                                  expected: stock(p.id),
                                })
                              }
                            >
                              <PencilLine size={16} />
                              تعديل الكمية
                            </Button>
                            {canManage && (
                              <button
                                className="icon-btn"
                                aria-label={"تعديل بيانات " + p.name}
                                onClick={() => void edit(p)}
                              >
                                <Settings2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!filteredProducts.length && (
                <div className="daily-empty">
                  <Box size={43} />
                  <h3>
                    {search
                      ? "لم نجد هذا المنتج"
                      : "أضف أول منتج وابدأ ترتيب المخزون"}
                  </h3>
                  <p>
                    {search
                      ? "جرّب اسم المنتج أو الباركود الكامل."
                      : "أدخل اسم الشنطة وسعرها وكميتها الإجمالية. الصورة والباركود اختياريان."}
                  </p>
                  {!search && (
                    <Button
                      disabled={!enabled || !canManage}
                      onClick={() => setDialog({ type: "product" })}
                    >
                      <Plus size={18} />
                      إضافة منتج
                    </Button>
                  )}
                </div>
              )}
            </section>
          </>
        )}
        {current === "history" && (
          <>
            <div className="daily-section-title">
              <div>
                <h2>سجل المبيعات</h2>
                <p>كل فاتورة محفوظة. افتحها للطباعة أو الإرجاع.</p>
              </div>
            </div>
            <DateRange
              from={from}
              to={to}
              onChange={onDates}
              canAll={false}
              all={true}
              onAll={onAllBranches}
            />
            <section className="panel">
              <div className="table-wrap">
                <table className="daily-sales-table">
                  <thead>
                    <tr>
                      <th>الفاتورة</th>
                      <th>التاريخ</th>
                      <th>الفرع</th>
                      <th>القيمة</th>
                      <th>الحالة</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <b className="mono">
                            #{s.id.slice(0, 8).toUpperCase()}
                          </b>
                        </td>
                        <td>
                          {new Date(String(s.created_at)).toLocaleString(
                            "ar-PS",
                            { timeZone: "Asia/Hebron" },
                          )}
                        </td>
                        <td>
                          {String(
                            branches.find((b) => b.id === s.branch_id)?.name ||
                              "",
                          )}
                        </td>
                        <td>
                          <b>{money(Number(s.total))}</b>
                        </td>
                        <td>
                          <span
                            className={
                              "badge " +
                              (s.status === "completed" ? "green" : "amber")
                            }
                          >
                            {
                              (
                                {
                                  completed: "مكتملة",
                                  returned: "مرتجعة",
                                  cancelled: "ملغاة",
                                } as Record<string, string>
                              )[String(s.status)]
                            }
                          </span>
                        </td>
                        <td>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setDialog({ type: "receipt", sale: s })
                            }
                          >
                            عرض الفاتورة
                            <ChevronLeft size={15} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!sales.length && (
                <div className="daily-empty">
                  <ReceiptText size={42} />
                  <h3>الفواتير تظهر هنا بعد تأكيد البيع</h3>
                  <p>ستجد تفاصيل كل عملية وقيمتها والفرع الذي تمت فيه.</p>
                </div>
              )}
            </section>
          </>
        )}
      </main>
      <Modal
        title={
          dialog?.type === "login" || dialog?.type === "password"
            ? dialog?.type === "password" ? "تعيين كلمة المرور" : "تسجيل الدخول"
            : dialog?.type === "product"
              ? dialog.product
                ? "تعديل بيانات المنتج"
                : "إضافة منتج جديد"
              : dialog?.type === "stock"
                ? dialog.mode === "add"
                  ? "إضافة بضاعة"
                  : "تعديل الكمية الفعلية"
                : dialog?.type === "return"
                    ? "تأكيد إرجاع الفاتورة"
                    : dialog?.type === "receipt"
                      ? "تفاصيل الفاتورة"
                      : "تفعيل حفظ الحسابات"
        }
        open={Boolean(dialog)}
        onClose={() => {
          if (!busy) setDialog(null);
        }}
      >
        {(dialog?.type === "login" || dialog?.type === "password") && (
          <AccountForm
            initialReset={dialog?.type === "password"}
            initialEmail={data.user_email || ""}
            onSuccess={() => {
              onSigned(true);
              setDialog(null);
              toast.success("أهلًا بك في najd");
            }}
          />
        )}
        {dialog?.type === "product" && (
          <QuickProductForm
            key={dialog.product?.id || "new"}
            product={dialog.product}
            branches={branches.filter(b => b.id === branch)}
            busy={busy}
            onSave={(p) => save("product", p)}
          />
        )}
        {dialog?.type === "stock" && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const amount = Number(form.get("quantity"));
              if (dialog.mode === "add")
                void save("stock", {
                  variant_id: dialog.product!.id,
                  delta: amount,
                  reason: String(form.get("reason") || "استلام بضاعة"),
                });
              else
                void save("stock_set", {
                  variant_id: dialog.product!.id,
                  quantity: amount,
                  expected_qty: dialog.expected,
                  reason: String(form.get("reason") || "تعديل الكمية"),
                });
            }}
          >
            <div className="stock-edit-summary">
              <Package size={25} />
              <div>
                <strong>{dialog.product?.name}</strong>
                <small>المخزون الإجمالي</small>
              </div>
              <b>
                {dialog.expected}
                <small>الكمية الحالية</small>
              </b>
            </div>
            <label>
              {dialog.mode === "add"
                ? "عدد القطع التي وصلت"
                : "الكمية الصحيحة الموجودة الآن"}
              <input
                name="quantity"
                type="number"
                min={dialog.mode === "add" ? 1 : 0}
                step="1"
                required
                autoFocus
                defaultValue={
                  dialog.mode === "set" ? dialog.expected : undefined
                }
              />
            </label>
            <label>
              السبب
              <input
                name="reason"
                minLength={3}
                required
                defaultValue={dialog.mode === "add" ? "استلام بضاعة" : "تعديل الكمية"}
                placeholder="جرد فعلي، تصحيح إدخال، بضاعة تالفة…"
              />
            </label>
            {dialog.mode === "set" && (
              <p className="muted">
                هذا يضبط الكمية الإجمالية للمنتج. إذا تغيّر المخزون
                أثناء التعديل، سنطلب منك مراجعته قبل الحفظ.
              </p>
            )}
            <Button disabled={busy}>
              {busy
                ? "جارٍ الحفظ…"
                : dialog.mode === "add"
                  ? "إضافة القطع للمخزون"
                  : "حفظ الكمية الجديدة"}
            </Button>
          </form>
        )}
        {dialog?.type === "receipt" && (
          <>
            <div className="receipt">
              <h2>najd</h2>
              <p>
                {String(
                  branches.find((b) => b.id === dialog.sale?.branch_id)?.name ||
                    "",
                )}
              </p>
              <p dir="ltr">{dialog.sale?.id}</p>
              {data.sale_items
                .filter((i) => i.sale_id === dialog.sale?.id)
                .map((i) => (
                  <div key={i.id}>
                    <span>
                      {String(
                        i.name_snapshot ||
                          catalog.find((p) => p.id === i.variant_id)?.name ||
                          "منتج",
                      )}{" "}
                      × {Number(i.qty)}
                    </span>
                    <b>
                      {money(
                        Number(i.qty) * Number(i.price) - Number(i.discount),
                      )}
                    </b>
                  </div>
                ))}
              <hr />
              <div>
                <span>الضريبة</span>
                <b>{money(Number(dialog.sale?.tax))}</b>
              </div>
              <div>
                <span>الإجمالي</span>
                <b>{money(Number(dialog.sale?.total))}</b>
              </div>
            </div>
            <div className="daily-dialog-actions">
              <Button onClick={() => window.print()}>
                <Printer size={18} />
                طباعة الفاتورة
              </Button>
              {canManage &&
                dialog.sale?.status === "completed" &&
                (
                  <Button
                    variant="outline"
                    onClick={() =>
                      setDialog({ type: "return", sale: dialog.sale })
                    }
                  >
                    إرجاع الفاتورة
                  </Button>
                )}
            </div>
          </>
        )}
        {dialog?.type === "return" && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void save("return", {
                id: dialog.sale!.id,
                branch_id: dialog.sale!.branch_id,
                reason: String(new FormData(e.currentTarget).get("reason")),
              });
            }}
          >
            <p>
              سيُسجَّل إرجاع نقدي بقيمة <b>{money(Number(dialog.sale?.total))}</b>{" "}
              وتعود القطع إلى المخزون الإجمالي. سلّم المبلغ للعميل بعد نجاح التسجيل.
            </p>
            <label>
              سبب الإرجاع
              <input name="reason" minLength={3} required autoFocus />
            </label>
            <Button variant="destructive" disabled={busy}>
              تأكيد إرجاع الفاتورة كاملة
            </Button>
          </form>
        )}
      </Modal>
    </div>
  );
}
function DateRange({
  from,
  to,
  onChange,
  canAll,
  all,
  onAll,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  canAll: boolean;
  all: boolean;
  onAll: (value: boolean) => void;
}) {
  return (
    <div className="daily-date-range">
      <div>
        <label>
          من
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => {
              if (e.target.value) onChange(e.target.value, to);
            }}
          />
        </label>
        <label>
          إلى
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => {
              if (e.target.value) onChange(from, e.target.value);
            }}
          />
        </label>
        <Button
          variant="outline"
          onClick={() => {
            const today = localDay(new Date());
            onChange(today, today);
          }}
        >
          اليوم
        </Button>
      </div>
      {canAll && (
        <label className="daily-check">
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => onAll(e.target.checked)}
          />
          حسابات الفرعين معًا
        </label>
      )}
    </div>
  );
}
function QuickProductForm({
  product,
  branches,
  busy,
  onSave,
}: {
  product?: EditProduct;
  branches: Row[];
  busy: boolean;
  onSave: (p: Record<string, unknown>) => Promise<void>;
}) {
  const [barcode, setBarcode] = useState(product?.barcode?.startsWith("AUTO-") ? "" : product?.barcode || "");
  const [scanningBarcode, setScanningBarcode] = useState(false);
  const [photo, setPhoto] = useState(product?.image_url || "");
  const [reading, setReading] = useState(false);
  const [sku] = useState(
    () => product?.sku || "NJ-" + crypto.randomUUID().slice(0, 12),
  );
  return (
    <form
      className="stack quick-product-form"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const price = Math.round(Number(form.get("price")) * 100),
          cost = Math.round(Number(form.get("cost")) * 100);
        void onSave({
          name: String(form.get("name")),
          barcode: barcode.trim(),
          sku,
          price,
          cost,
          min_stock: product?.min_stock ?? 5,
          category: product?.category || "",
          description: product?.description || "",
          image_url: photo,
          ...(product
            ? { product_id: product.product_id, variant_id: product.id }
            : {
                initial_stock: branches.map((b) => ({
                  branch_id: b.id,
                  quantity: Number(form.get("quantity") || 0),
                })),
              }),
        });
      }}
    >
      <label>
        اسم المنتج
        <input
          name="name"
          required
          minLength={2}
          maxLength={160}
          defaultValue={product?.name}
          autoFocus
          placeholder="مثال: شنطة كتف سوداء"
        />
      </label>
      <label>
        صورة الشنطة (اختياري)
        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={reading || busy}
          onChange={async e => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
              toast.error("اختر صورة JPG أو PNG أو WebP أصغر من 8 ميغابايت"); return;
            }
            setReading(true);
            try {
              const bitmap = await createImageBitmap(file);
              const scale = Math.min(1, 360 / Math.max(bitmap.width, bitmap.height));
              const canvas = document.createElement("canvas");
              canvas.width = Math.max(1, Math.round(bitmap.width * scale));
              canvas.height = Math.max(1, Math.round(bitmap.height * scale));
              const context = canvas.getContext("2d");
              if (!context) throw Error();
              context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
              context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
              const result = canvas.toDataURL("image/jpeg", 0.65);
              if (result.length > 160000) throw Error();
              setPhoto(result);
            } catch { toast.error("تعذر تجهيز الصورة. جرّب صورة أخرى."); }
            finally { setReading(false); }
          }} />
      </label>
      {photo && <div className="product-photo-preview">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt="صورة المنتج" width={90} height={90} />
        <Button type="button" variant="ghost" onClick={() => setPhoto("")}>إزالة الصورة</Button>
      </div>}
      <label>
        الباركود (اختياري)
        <div className="inline">
          <input
            name="barcode"
            aria-label="باركود المنتج الجديد"
            maxLength={80}
            dir="ltr"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.form?.querySelector<HTMLInputElement>('[name="price"]')?.focus(); } }}
            placeholder="اكتب الرقم أو امسحه بالقارئ هنا"
          />
          <Button type="button" variant="outline" disabled={busy || reading} onClick={() => setScanningBarcode(value => !value)}>
            <ScanLine size={18} />{scanningBarcode ? "إيقاف المسح" : "مسح باركود المنتج"}
          </Button>
        </div>
      </label>
      <small className="barcode-save-hint">يُحفظ الرقم المكتوب أو المقروء عند حفظ المنتج، ويمكنك البيع به بعدها.</small>
      {scanningBarcode && <section aria-label="مسح باركود المنتج الجديد" className="product-barcode-scanner">
        <ProductBarcodeScanner onScan={text => {
          const value = normalizeBarcode(text);
          if (!value || value.length > 80) return "رقم الباركود يجب أن يكون بين 1 و80 حرفًا.";
          setBarcode(value); setScanningBarcode(false);
          toast.success("تمت قراءة الباركود. احفظ المنتج لتثبيت الرقم.");
          return true;
        }} />
      </section>}
      <div className="form-grid">
        <label>
          تكلفة الشراء ₪ (اختياري)
          <input
            name="cost"
            type="number"
            step="0.01"
            min="0"
            defaultValue={(product?.cost ?? 0) / 100}
          />
        </label>
        <label>
          سعر البيع ₪
          <input
            name="price"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={(product?.price ?? 0) / 100}
          />
        </label>
      </div>
      {!product && (
        <div className="initial-stock-fields">
          <label>الكمية الإجمالية<input name="quantity" aria-label="الكمية الإجمالية" type="number" min="0" max="1000000" step="1" defaultValue="0" required /></label>
        </div>
      )}
      <Button disabled={busy || reading}>
        {busy
          ? "جارٍ الحفظ…"
          : product
            ? "حفظ بيانات المنتج"
            : "حفظ المنتج والكميات"}
      </Button>
    </form>
  );
}
