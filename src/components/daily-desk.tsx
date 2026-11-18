"use client";
import { useState, useRef } from "react";
import Link from "next/link";
import {
  ScanLine,
  Package,
  Wallet,
  ReceiptText,
  Store,
  ChevronLeft,
  Plus,
  Search,
  RefreshCw,
  LogOut,
  Settings2,
  ArrowDownLeft,
  ArrowUpLeft,
  CheckCircle2,
  TriangleAlert,
  Printer,
  PencilLine,
  Box,
  LockKeyhole,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { authClient } from "@/lib/auth/client";
import { branchNames } from "@/lib/company";
import { variants, type Dataset, type Row } from "@/lib/types";
import { type Variant } from "@/lib/domain";
import { localDay } from "@/lib/dates";
import { money } from "@/lib/utils";
import { Button } from "./ui/button";
import { Modal } from "./modal";
import { POS } from "./pos";
import { AccountForm } from "./account-form";

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
  onAdvanced: () => void;
};
type EditProduct = Variant & { cost?: number; description?: string };
type DeskDialog = {
  type:
    "login" | "product" | "stock" | "expense" | "receipt" | "return" | "setup";
  product?: EditProduct;
  mode?: "add" | "set";
  expected?: number;
  sale?: Row;
};
const sections = [
  {
    id: "sell",
    label: "بيع بالباركود",
    icon: ScanLine,
    description: "فاتورة جديدة",
  },
  {
    id: "stock",
    label: "المنتجات والكميات",
    icon: Package,
    description: "إضافة وتعديل المخزون",
  },
  {
    id: "accounts",
    label: "الحسابات",
    icon: Wallet,
    description: "المبيعات والمصاريف والأرباح",
  },
  {
    id: "history",
    label: "سجل المبيعات",
    icon: ReceiptText,
    description: "الفواتير والمرتجعات",
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
    allBranches,
    onAllBranches,
    onDates,
    onBranch,
    onSigned,
    refresh,
    execute,
    onAdvanced,
  } = props;
  const [tab, setTab] = useState<string>("sell");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<DeskDialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const branches = data.branches.filter((b) => b.business_id === business);
  const selectedBranch = branches.find((b) => b.id === branch);
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
  const canFinance =
    canManage || memberships.some((m) => m.role === "accountant");
  const canAll = memberships.some(
    (m) =>
      !m.branch_id &&
      ["owner", "super_admin", "accountant"].includes(String(m.role)),
  );
  const current =
    tab === "sell" && signed && memberships.length > 0 && !canSell
      ? canStock
        ? "stock"
        : "accounts"
      : tab;
  const enabled = configured && signed && Boolean(branch) && online && !error;
  const catalog = variants(data, business, branch);
  const stock = (id: string, br = branch) =>
    Number(
      data.branch_inventory.find(
        (i) => i.branch_id === br && i.variant_id === id,
      )?.quantity ?? 0,
    );
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
        (allBranches || s.branch_id === branch) &&
        localDay(String(s.created_at)) >= from &&
        localDay(String(s.created_at)) <= to,
    )
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const expenses = data.expenses.filter(
    (s) =>
      s.business_id === business &&
      (allBranches || s.branch_id === branch) &&
      localDay(String(s.created_at)) >= from &&
      localDay(String(s.created_at)) <= to,
  );
  const movement = data.inventory_movements
    .filter((m) => m.branch_id === branch)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 8);
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
  const metrics = [
    {
      label: "المبيعات الصافية",
      value: data.financial?.sales_gross,
      icon: ReceiptText,
      theme: "blue",
      note: "بعد المرتجعات، شاملة الضريبة",
    },
    {
      label: "المصاريف",
      value: data.financial?.expenses,
      icon: ArrowUpLeft,
      theme: "orange",
      note: "مصاريف الفترة المحددة",
    },
    {
      label: "تكلفة القطع المباعة",
      value: data.financial?.cogs,
      icon: Package,
      theme: "purple",
      note: "تكلفة الشراء وقت البيع",
    },
    {
      label: "صافي الربح التقديري",
      value: data.financial?.net,
      icon: ArrowDownLeft,
      theme: "green",
      note: "دون الضريبة، وبعد التكلفة والمصاريف",
    },
  ];
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
            <small>كل قطعة محسوبة، وكل فرع واضح</small>
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
              <Button variant="ghost" disabled={pending} onClick={onAdvanced}>
                <Settings2 size={18} />
                <span>الإعدادات والإدارة</span>
              </Button>
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
        <div className="daily-welcome">
          <div>
            <span className="daily-kicker">يومك أبسط مع najd</span>
            <h1>بيع أسرع. مخزون مرتب. حسابات أوضح.</h1>
            <p>اختر الفرع، امسح القطعة، وأكّد البيع. الباقي يحسبه النظام.</p>
          </div>
          <div className="daily-today">
            <strong>
              {new Date().toLocaleDateString("ar-PS", {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: "Asia/Hebron",
              })}
            </strong>
            <span>العملة: الشيكل ₪</span>
          </div>
        </div>
        <section className="daily-branches" aria-label="اختر الفرع">
          <span className="branch-prompt">
            <Store size={19} />
            أنت تعمل الآن في
          </span>
          <div className="branch-options">
            {branches.length
              ? branches.map((b) => (
                  <button
                    key={b.id}
                    disabled={pending}
                    className={branch === b.id ? "selected" : ""}
                    aria-pressed={branch === b.id}
                    onClick={() => onBranch(b.id)}
                  >
                    <Store size={20} />
                    <strong>{String(b.name)}</strong>
                    {branch === b.id && <CheckCircle2 size={18} />}
                  </button>
                ))
              : branchNames.map((name) => (
                  <div className="unconfigured-branch" key={name}>
                    <Store size={19} />
                    <strong>{name}</strong>
                    <small>بانتظار تفعيل الحساب</small>
                  </div>
                ))}
          </div>
          <small className="branch-separate">كمية مستقلة لكل فرع</small>
        </section>
        {!configured && (
          <div className="daily-notice">
            <div className="notice-icon">
              <LockKeyhole size={21} />
            </div>
            <div>
              <strong>فروعك جاهزة في الواجهة. بقي تفعيل حفظ الحسابات.</strong>
              <p>
                لن تُسجَّل مبيعات أو تتغيّر كميات حتى نربط قاعدة البيانات ونسجّل
                الدخول.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setDialog({ type: "setup" })}
            >
              ما الخطوة التالية؟
              <ChevronLeft size={15} />
            </Button>
          </div>
        )}
        {configured && !signed && (
          <div className="daily-notice">
            <LockKeyhole size={22} />
            <div>
              <strong>أهلًا بك في najd</strong>
              <p>سجّل الدخول لتظهر منتجات الفرعين وحساباتهما الحقيقية.</p>
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
                (s.id === "stock" && canStock) ||
                (s.id === "accounts" && canFinance),
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
                <p>
                  {selectedBranch
                    ? String(selectedBranch.name)
                    : "اختر الفرع بعد تسجيل الدخول"}{" "}
                  · تُخصم الكمية من هذا الفرع عند تأكيد البيع
                </p>
              </div>
              <span className="daily-shortcut">
                <ScanLine size={17} />
                جاهز للمسح <kbd>F2</kbd>
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
                <p>كل منتجاتك، وكميات الفرعين، من مكان واحد.</p>
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
                  {catalog.length} منتج ·{" "}
                  {String(selectedBranch?.name || "اختر الفرع")}
                </span>
              </div>
              <div className="table-wrap">
                <table className="daily-stock-table">
                  <thead>
                    <tr>
                      <th>المنتج</th>
                      <th>سعر البيع</th>
                      {branches.length
                        ? branches.map((b) => (
                            <th key={b.id}>{String(b.name)}</th>
                          ))
                        : branchNames.map((n) => <th key={n}>{n}</th>)}
                      <th>
                        تعديل {String(selectedBranch?.name || "الفرع المختار")}
                      </th>
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
                              <small dir="ltr">{p.barcode}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <strong>{money(p.price)}</strong>
                        </td>
                        {branches.map((b) => (
                          <td key={b.id}>
                            <span
                              className={
                                "stock-number " +
                                (stock(p.id, b.id) === 0
                                  ? "empty-stock"
                                  : stock(p.id, b.id) <= p.min_stock
                                    ? "low-stock"
                                    : "")
                              }
                            >
                              {stock(p.id, b.id)}
                              <small>قطعة</small>
                            </span>
                          </td>
                        ))}
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
                      : "أدخل الاسم والسعر والباركود وكمية كل فرع. لا تحتاج إلى إعدادات معقدة."}
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
            <section className="panel daily-movements">
              <div className="daily-section-title">
                <div>
                  <h2>آخر تغييرات الكمية</h2>
                  <p>نعرض كل بيع أو توريد أو تعديل مع سببه.</p>
                </div>
              </div>
              {movement.length ? (
                <div className="daily-movement-list">
                  {movement.map((m) => (
                    <div key={m.id}>
                      <span
                        className={
                          Number(m.delta) > 0
                            ? "movement-plus"
                            : "movement-minus"
                        }
                      >
                        {Number(m.delta) > 0 ? "+" : ""}
                        {Number(m.delta)}
                      </span>
                      <div>
                        <strong>
                          {catalog.find((p) => p.id === m.variant_id)?.name ||
                            "منتج"}
                        </strong>
                        <small>
                          {(
                            {
                              sale: "بيع",
                              return: "إرجاع",
                              cancel_sale: "إلغاء بيع",
                            } as Record<string, string>
                          )[String(m.reason)] || String(m.reason)}
                        </small>
                      </div>
                      <time>
                        {new Date(String(m.created_at)).toLocaleString(
                          "ar-PS",
                          { timeZone: "Asia/Hebron" },
                        )}
                      </time>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty">
                  ستظهر حركات المخزون هنا بعد أول عملية.
                </div>
              )}
            </section>
          </>
        )}
        {current === "accounts" && (
          <>
            <div className="daily-section-title">
              <div>
                <h2>
                  حسابات{" "}
                  {allBranches
                    ? "الفرعين"
                    : String(selectedBranch?.name || "المتجر")}
                </h2>
                <p>
                  المبيعات والتكاليف والمصاريف والأرباح للفترة التي تختارها.
                </p>
              </div>
              <Button
                disabled={!enabled || !canFinance}
                onClick={() => setDialog({ type: "expense" })}
              >
                <Plus size={18} />
                تسجيل مصروف
              </Button>
            </div>
            <DateRange
              from={from}
              to={to}
              onChange={onDates}
              canAll={canAll}
              all={allBranches}
              onAll={onAllBranches}
            />
            <div className="daily-metrics">
              {metrics.map((m) => (
                <article key={m.label}>
                  <div>
                    <span className={m.theme}>
                      <m.icon size={22} />
                    </span>
                    <p>{m.label}</p>
                  </div>
                  <strong>
                    {enabled && canFinance && m.value !== undefined
                      ? money(m.value)
                      : "—"}
                  </strong>
                  <small>{m.note}</small>
                </article>
              ))}
            </div>
            <div className="daily-account-grid">
              <section className="panel">
                <div className="daily-section-title">
                  <div>
                    <h2>المصاريف المسجلة</h2>
                    <p>راجع أين تذهب مصاريف الفرع.</p>
                  </div>
                </div>
                {expenses.length ? (
                  <div className="daily-movement-list">
                    {expenses.map((e) => (
                      <div key={e.id}>
                        <span className="expense-mark">
                          <Wallet size={19} />
                        </span>
                        <div>
                          <strong>{String(e.title)}</strong>
                          <small>{localDay(String(e.created_at))}</small>
                        </div>
                        <b>{money(Number(e.amount))}</b>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="daily-empty small">
                    <Wallet size={35} />
                    <p>لا توجد مصاريف مسجلة في هذه الفترة.</p>
                  </div>
                )}
              </section>
              <section className="panel daily-profit-note">
                <span className="green">
                  <Wallet size={26} />
                </span>
                <h2>كيف نحسب الربح؟</h2>
                <p>
                  صافي المبيعات دون الضريبة
                  <br />− تكلفة شراء القطع التي بعتها
                  <br />− المصاريف المسجلة
                </p>
                <hr />
                <strong>النتيجة = الربح التقديري</strong>
                <p>
                  المرتجعات تُحسب في يوم إرجاعها. الربح يختلف عن النقد الموجود في
                  الصندوق.
                </p>
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer size={17} />
                  طباعة الحسابات
                </Button>
              </section>
            </div>
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
              canAll={canAll}
              all={allBranches}
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
        <footer className="daily-footer">
          <strong>najd</strong>
          <span>حسابات مرتبة. شغل أخف.</span>
          <small>البيع لا يُحفظ إلا بعد تأكيده بنجاح.</small>
        </footer>
      </main>
      <Modal
        title={
          dialog?.type === "login"
            ? "تسجيل الدخول"
            : dialog?.type === "product"
              ? dialog.product
                ? "تعديل بيانات المنتج"
                : "إضافة منتج جديد"
              : dialog?.type === "stock"
                ? dialog.mode === "add"
                  ? "إضافة بضاعة"
                  : "تعديل الكمية الفعلية"
                : dialog?.type === "expense"
                  ? "تسجيل مصروف"
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
        {dialog?.type === "setup" && (
          <div className="stack">
            <p>
              يحتاج najd إلى قاعدة بيانات مستقلة وحساب دخول حتى يحفظ مبيعاتك
              وكميات الفرعين بأمان.
            </p>
            <div className="branch-setup-list">
              {branchNames.map((name) => (
                <div key={name}>
                  <Store size={19} />
                  {name}
                </div>
              ))}
            </div>
            <p className="muted">
              الواجهة لا تستخدم كميات أو مبيعات وهمية. ستصبح أزرار البيع متاحة
              بعد تفعيل الحساب وربط المنتجات.
            </p>
          </div>
        )}
        {dialog?.type === "login" && (
          <AccountForm
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
            branches={branches}
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
                  reason: String(form.get("reason")),
                });
            }}
          >
            <div className="stock-edit-summary">
              <Package size={25} />
              <div>
                <strong>{dialog.product?.name}</strong>
                <small>{String(selectedBranch?.name)}</small>
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
                defaultValue={dialog.mode === "add" ? "استلام بضاعة" : ""}
                placeholder="جرد فعلي، تصحيح إدخال، بضاعة تالفة…"
              />
            </label>
            {dialog.mode === "set" && (
              <p className="muted">
                هذا يضبط الكمية الإجمالية في الفرع المختار. إذا تغيّر المخزون
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
        {dialog?.type === "expense" && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              void save("expense", {
                title: String(form.get("title")),
                amount: Math.round(Number(form.get("amount")) * 100),
              });
            }}
          >
            <p className="muted">
              سيُسجَّل المصروف على {String(selectedBranch?.name)}.
            </p>
            <label>
              وصف المصروف
              <input
                name="title"
                minLength={2}
                required
                placeholder="كهرباء، إيجار، تغليف…"
                autoFocus
              />
            </label>
            <label>
              المبلغ بالشيكل ₪
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                required
              />
            </label>
            <Button disabled={busy}>حفظ المصروف</Button>
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
                dialog.sale.branch_id === branch && (
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
                reason: String(new FormData(e.currentTarget).get("reason")),
              });
            }}
          >
            <p>
              سيُسجَّل إرجاع نقدي بقيمة <b>{money(Number(dialog.sale?.total))}</b>{" "}
              وتعود القطع إلى مخزون الفرع. سلّم المبلغ للعميل بعد نجاح التسجيل.
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
  const [barcode, setBarcode] = useState(product?.barcode || "");
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
          image_url: product?.image_url || "",
          ...(product
            ? { product_id: product.product_id, variant_id: product.id }
            : {
                initial_stock: branches.map((b) => ({
                  branch_id: b.id,
                  quantity: Number(form.get("stock-" + b.id) || 0),
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
          placeholder="مثال: كريم ترطيب 50 مل"
        />
      </label>
      <label>
        الباركود
        <div className="inline">
          <input
            name="barcode"
            aria-label="باركود المنتج الجديد"
            required
            dir="ltr"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="امسح باركود القطعة هنا"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setBarcode(
                "NJ" + crypto.randomUUID().replaceAll("-", "").slice(0, 16),
              )
            }
          >
            توليد باركود
          </Button>
        </div>
      </label>
      <div className="form-grid">
        <label>
          تكلفة الشراء ₪
          <input
            name="cost"
            type="number"
            step="0.01"
            min="0"
            required
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
          <h3>الكمية الموجودة في كل فرع</h3>
          {branches.map((b) => (
            <label key={b.id}>
              <span>
                <Store size={17} />
                {String(b.name)}
              </span>
              <input
                name={"stock-" + b.id}
                aria-label={"كمية " + String(b.name)}
                type="number"
                min="0"
                step="1"
                defaultValue="0"
                required
              />
            </label>
          ))}
        </div>
      )}
      <Button disabled={busy}>
        {busy
          ? "جارٍ الحفظ…"
          : product
            ? "حفظ بيانات المنتج"
            : "حفظ المنتج والكميات"}
      </Button>
    </form>
  );
}
