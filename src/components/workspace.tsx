"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  LayoutDashboard,
  ScanLine,
  Package,
  Boxes,
  ArrowLeftRight,
  ReceiptText,
  Wallet,
  ChartNoAxesCombined,
  Building2,
  Users,
  Settings,
  ChevronDown,
  ArrowUpLeft,
  Plus,
  Search,
  Bell,
  LogOut,
  Menu,
  Store,
  TrendingUp,
  ShoppingBag,
  TriangleAlert,
  ArrowLeft,
  Download,
  Upload,
  Printer,
  RefreshCw,
  Check,
  Clock,
  WifiOff,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import Papa from "papaparse";
import JsBarcode from "jsbarcode";
import type { ColumnDef } from "@tanstack/react-table";
import { authClient } from "@/lib/auth/client";
import { emptyData, variants, type Dataset, type Row } from "@/lib/types";
import { money } from "@/lib/utils";
import { dayStart, nextDay, localDay } from "@/lib/dates";
import { OperationError, type Variant } from "@/lib/domain";
import { Button } from "./ui/button";
import { Modal } from "./modal";
import { ProductForm } from "./product-form";
import { DataTable } from "./data-table";
import { POS } from "./pos";
import { DailyDesk } from "./daily-desk";
const nav = [
  { id: "dashboard", ar: "لوحة التحكم", en: "Overview", icon: LayoutDashboard },
  { id: "pos", ar: "نقطة البيع", en: "Point of sale", icon: ScanLine },
  { id: "products", ar: "المنتجات", en: "Products", icon: Package },
  { id: "inventory", ar: "المخزون", en: "Inventory", icon: Boxes },
  { id: "transfers", ar: "التحويلات", en: "Transfers", icon: ArrowLeftRight },
  { id: "sales", ar: "المبيعات", en: "Sales", icon: ReceiptText },
  { id: "expenses", ar: "المصروفات", en: "Expenses", icon: Wallet },
  {
    id: "reports",
    ar: "التقارير المالية",
    en: "Financial reports",
    icon: ChartNoAxesCombined,
  },
  { id: "branches", ar: "الفروع", en: "Branches", icon: Building2 },
  { id: "staff", ar: "الموظفون", en: "Employees", icon: Users },
  { id: "shifts", ar: "الورديات", en: "Cash shifts", icon: Clock },
  { id: "settings", ar: "الإعدادات", en: "Settings", icon: Settings },
];
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Hebron" });
const labels: Record<string, string> = {
  pending: "بانتظار الشحن",
  shipped: "قيد النقل",
  received: "تم الاستلام",
  cancelled: "ملغاة",
  completed: "مكتملة",
  returned: "مرتجعة",
  owner: "مالك",
  manager: "مدير فرع",
  cashier: "كاشير",
  inventory: "موظف مخزون",
  accountant: "محاسب",
  super_admin: "مدير النظام",
};
type Dialog = { type: string; title: string; row?: Row | Variant };
export function Workspace({
  configured,
  signedIn,
}: {
  configured: boolean;
  signedIn: boolean;
}) {
  const [page, setPage] = useState("dashboard");
  const [advanced, setAdvanced] = useState(false);
  const [data, setData] = useState<Dataset>(emptyData);
  const [business, setBusiness] = useState("");
  const [branch, setBranch] = useState("");
  const [signed, setSigned] = useState(signedIn);
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(true);
  const [sync, setSync] = useState("");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [menu, setMenu] = useState(false);
  const [english, setEnglish] = useState(false);
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [busy, setBusy] = useState(false);
  const [allBranches, setAllBranches] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const file = useRef<HTMLInputElement>(null);
  const labelRefs = useRef<Map<string, SVGSVGElement>>(new Map());
  const requestKeys = useRef(new Map<string, string>());
  const refresh = useCallback(async () => {
    if (!configured || !signed) return;
    setLoading(true);
    try {
      const q = new URLSearchParams({
        business,
        from: dayStart(from),
        to: dayStart(nextDay(to)),
      });
      if (branch && !allBranches) q.set("branch", branch);
      const r = await fetch("/api/data?" + q, { cache: "no-store" });
      const json = await r.json();
      if (r.status === 401) {
        setSigned(false);
        setData(emptyData);
        setBusiness("");
        setBranch("");
        return;
      }
      if (!r.ok) throw Error(json.error);
      setData(json);
      setBusiness((old) => old || json.businesses[0]?.id || "");
      setBranch((old) => old || json.branches[0]?.id || "");
      setSync("");
    } catch (e) {
      setSync((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [configured, signed, business, branch, from, to, allBranches]);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    const on = () => {
      setOnline(true);
      void refresh();
    };
    const off = () => setOnline(false);
    const timer = setTimeout(() => setOnline(navigator.onLine), 0);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [refresh]);
  useEffect(() => {
    if (!configured || !signed) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine)
        void refresh();
    }, 15000);
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [configured, signed, refresh]);
  useEffect(() => {
    if (dialog?.type === "labels")
      selected.forEach((id) => {
        const el = labelRefs.current.get(id);
        const v = variants(data, business, branch).find((v) => v.id === id);
        if (el && v)
          try {
            JsBarcode(el, v.barcode, {
              format: "CODE128",
              height: 45,
              width: 1.5,
              fontSize: 12,
              margin: 8,
            });
          } catch {
            toast.error("تعذر إنشاء ملصق: " + v.name);
          }
      });
  }, [dialog, selected, data, business, branch]);
  const branches = data.branches.filter((b) => b.business_id === business);
  const currentBranch = branches.find((b) => b.id === branch);
  const members = data.memberships.filter(
    (m) =>
      m.business_id === business &&
      m.user_id === data.user_id &&
      (!m.branch_id || m.branch_id === branch),
  );
  const role = String(
    members.find((m) => !m.branch_id)?.role || members[0]?.role || "",
  );
  const canFinance = ["owner", "super_admin", "manager", "accountant"].includes(
    role,
  );
  const canManage = ["owner", "super_admin", "manager"].includes(role);
  const canStock = canManage || role === "inventory";
  const canSell = canManage || role === "cashier";
  const catalog = variants(data, business, branch);
  const stock = (id: string, br = branch) =>
    Number(
      data.branch_inventory.find(
        (i) => i.variant_id === id && i.branch_id === br,
      )?.quantity ?? 0,
    );
  const shift = data.cash_shifts.find(
    (s) => s.branch_id === branch && s.user_id === data.user_id && !s.closed_at,
  );
  const activeBusiness = data.businesses.find((b) => b.id === business);
  const taxBps = Number(activeBusiness?.tax_bps ?? 0);
  const sales = data.sales.filter(
    (s) =>
      s.business_id === business &&
      (allBranches || s.branch_id === branch) &&
      localDay(String(s.created_at)) >= from &&
      localDay(String(s.created_at)) <= to,
  );
  const completed = sales.filter((s) => s.status === "completed");
  const revenue = completed.reduce((a, s) => a + Number(s.total), 0);
  const low = catalog.filter(
    (p) => stock(p.id) > 0 && stock(p.id) <= p.min_stock,
  );
  const out = catalog.filter((p) => stock(p.id) === 0);
  const enabled = configured && signed && Boolean(branch) && online && !sync;
  async function execute(action: string, payload: Record<string, unknown>) {
    if (!online) throw Error("الاتصال مقطوع؛ لم يتم تأكيد العملية");
    const signature = JSON.stringify({ action, business, branch, payload });
    const retryKey = requestKeys.current.get(signature) || crypto.randomUUID();
    requestKeys.current.set(signature, retryKey);
    const response = await fetch("/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        payload:
          action === "checkout"
            ? payload
            : {
                ...payload,
                business_id: business,
                branch_id: branch || null,
                key: payload.key || retryKey,
              },
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      if (result.rolledBack) requestKeys.current.delete(signature);
      throw new OperationError(result.error, result.rolledBack === true);
    }
    requestKeys.current.delete(signature);
    void refresh();
    return result;
  }
  async function submit(action: string, payload: Record<string, unknown>) {
    setBusy(true);
    try {
      await execute(action, payload);
      setDialog(null);
      toast.success("تم حفظ العملية بنجاح");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function navigate(id: string) {
    setPage(id);
    setSearch("");
    setMenu(false);
  }
  function exportProducts() {
    const csv = Papa.unparse(
      catalog.map((p) => ({
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        price: (p.price / 100).toFixed(2),
        category: p.category,
        min_stock: p.min_stock,
      })),
    );
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "smartbranch-products.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  async function importProducts(f: File) {
    Papa.parse<Record<string, string>>(f, {
      header: true,
      skipEmptyLines: true,
      complete: async (result) => {
        if (result.errors.length) {
          toast.error("ملف CSV غير صالح");
          return;
        }
        if (result.data.length > 500) {
          toast.error("الحد الأقصى 500 منتج لكل ملف");
          return;
        }
        let count = 0;
        for (const row of result.data) {
          try {
            await execute("product", {
              name: row.name,
              sku: row.sku,
              barcode: row.barcode,
              price: Math.round(Number(row.price) * 100),
              cost: Math.round(Number(row.cost || 0) * 100),
              min_stock: Number(row.min_stock || 5),
              category: row.category || "",
              description: "",
              image_url: "",
            });
            count++;
          } catch (e) {
            toast.error(
              `السطر ${count + 2}: ${(e as Error).message}. تم حفظ ${count} منتج.`,
            );
            break;
          }
        }
        toast.success(`تم استيراد ${count} منتج`);
        void refresh();
      },
    });
  }
  const productColumns: ColumnDef<Variant>[] = [
    {
      id: "select",
      header: () => (
        <input
          type="checkbox"
          aria-label="تحديد جميع المنتجات"
          checked={
            Boolean(catalog.length) && selected.length === catalog.length
          }
          onChange={(e) =>
            setSelected(e.target.checked ? catalog.map((p) => p.id) : [])
          }
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={"تحديد " + row.original.name}
          checked={selected.includes(row.original.id)}
          onChange={(e) =>
            setSelected((s) =>
              e.target.checked
                ? [...s, row.original.id]
                : s.filter((id) => id !== row.original.id),
            )
          }
        />
      ),
    },
    {
      accessorKey: "name",
      header: "المنتج",
      cell: ({ row }) => (
        <div className="product-cell">
          <div className="mini-art">
            <Package size={20} />
          </div>
          <div>
            <strong>{row.original.name}</strong>
            <small>{row.original.sku}</small>
          </div>
        </div>
      ),
    },
    { accessorKey: "category", header: "التصنيف" },
    {
      accessorKey: "barcode",
      header: "الباركود",
      cell: ({ getValue }) => (
        <span className="mono">{String(getValue())}</span>
      ),
    },
    {
      accessorKey: "price",
      header: "سعر البيع",
      cell: ({ getValue }) => money(Number(getValue())),
    },
    {
      id: "stock",
      header: "المخزون",
      cell: ({ row }) => (
        <span
          className={
            "badge " +
            (stock(row.original.id) === 0
              ? "red"
              : stock(row.original.id) <= row.original.min_stock
                ? "amber"
                : "green")
          }
        >
          {stock(row.original.id)} وحدة
        </span>
      ),
    },
    {
      id: "edit",
      header: "",
      cell: ({ row }) =>
        canManage && (
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              try {
                const res = await fetch(
                  "/api/product?" +
                    new URLSearchParams({
                      b: business,
                      br: branch,
                      v: row.original.id,
                    }),
                  { cache: "no-store" },
                );
                const detail = await res.json();
                if (!res.ok) throw Error(detail.error);
                setDialog({
                  type: "edit-product",
                  title: "تعديل المنتج",
                  row: { ...row.original, ...detail },
                });
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            تعديل
          </Button>
        ),
    },
  ];
  const salesColumns: ColumnDef<Row>[] = [
    {
      accessorKey: "id",
      header: "رقم الفاتورة",
      cell: ({ getValue }) => (
        <span className="mono">
          #{String(getValue()).slice(0, 8).toUpperCase()}
        </span>
      ),
    },
    {
      accessorKey: "created_at",
      header: "التاريخ",
      cell: ({ getValue }) =>
        new Date(String(getValue())).toLocaleString("ar-PS"),
    },
    {
      accessorKey: "branch_id",
      header: "الفرع",
      cell: ({ getValue }) =>
        String(data.branches.find((b) => b.id === getValue())?.name ?? ""),
    },
    {
      accessorKey: "total",
      header: "الإجمالي",
      cell: ({ getValue }) => <b>{money(Number(getValue()))}</b>,
    },
    {
      accessorKey: "status",
      header: "الحالة",
      cell: ({ getValue }) => (
        <span
          className={
            "badge " + (getValue() === "completed" ? "green" : "amber")
          }
        >
          {labels[String(getValue())]}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="inline">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setDialog({
                type: "sale",
                title: "تفاصيل الفاتورة",
                row: row.original,
              })
            }
          >
            عرض
          </Button>
          {canManage && row.original.status === "completed" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setDialog({
                  type: "return",
                  title: "إرجاع الفاتورة كاملة",
                  row: row.original,
                })
              }
            >
              إرجاع
            </Button>
          )}
        </div>
      ),
    },
  ];
  const chart = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(
      new Date(to + "T12:00:00").getTime() - (6 - i) * 86400000,
    );
    const iso = day.toLocaleDateString("en-CA");
    return {
      name: day.toLocaleDateString("ar-PS", { weekday: "short" }),
      sales: data.sales
        .filter(
          (s) =>
            s.business_id === business &&
            (allBranches || s.branch_id === branch) &&
            s.status === "completed" &&
            localDay(String(s.created_at)) === iso,
        )
        .reduce((a, s) => a + Number(s.total) / 100, 0),
    };
  });
  const best = catalog
    .map((p) => ({
      ...p,
      sold: data.sale_items
        .filter(
          (i) =>
            i.variant_id === p.id && completed.some((s) => s.id === i.sale_id),
        )
        .reduce((a, i) => a + Number(i.qty), 0),
    }))
    .filter((p) => p.sold > 0)
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 4);
  const visibleNav = nav.filter(
    (n) =>
      !(["reports", "expenses"].includes(n.id) && !canFinance && signed) &&
      !(["staff", "settings"].includes(n.id) && !canManage && signed),
  );
  if (!advanced)
    return (
      <DailyDesk
        data={data}
        business={business}
        branch={branch}
        configured={configured}
        signed={signed}
        online={online}
        loading={loading}
        error={sync}
        from={from}
        to={to}
        allBranches={allBranches}
        onAllBranches={setAllBranches}
        onDates={(start, end) => {
          setFrom(start);
          setTo(end);
        }}
        onBranch={(id) => {
          setBranch(id);
          setAllBranches(false);
          setSelected([]);
        }}
        onSigned={(value) => {
          setSigned(value);
          if (!value) {
            setData(emptyData);
            setBusiness("");
            setBranch("");
            setSync("");
          }
        }}
        refresh={refresh}
        execute={execute}
        onAdvanced={() => setAdvanced(true)}
      />
    );
  return (
    <div className="app" dir={english ? "ltr" : "rtl"}>
      <Button className="back-to-daily" onClick={() => setAdvanced(false)}>
        العودة للبيع والحسابات المبسطة
      </Button>
      <Toaster richColors position="top-center" dir="rtl" />
      <aside className={"sidebar " + (menu ? "is-open" : "")}>
        <Link className="brand" href="/" aria-label="najd">
          <div className="brand-mark">
            <Store size={25} />
          </div>
          <div>
            <strong>
              najd<span>POS</span>
            </strong>
            <small>كل فروعك، في مكان واحد</small>
          </div>
        </Link>
        <div className="workspace-picker">
          <div className="store-avatar">
            <Store size={18} />
          </div>
          <div>
            <strong>{String(activeBusiness?.name || "najd")}</strong>
            <small>{branches.length} فروع متصلة</small>
          </div>
          {data.businesses.length > 1 ? (
            <select
              aria-label="النشاط التجاري"
              value={business}
              onChange={(e) => {
                setBusiness(e.target.value);
                setBranch("");
              }}
            >
              {data.businesses.map((b) => (
                <option value={b.id} key={b.id}>
                  {String(b.name)}
                </option>
              ))}
            </select>
          ) : (
            <ChevronDown size={15} />
          )}
        </div>
        <p className="nav-label">مساحة العمل</p>
        <nav>
          {visibleNav.slice(0, 8).map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "active" : ""}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={19} />
              <span>{english ? n.en : n.ar}</span>
              {n.id === "pos" && <small>F2</small>}
              {n.id === "inventory" && low.length > 0 && <i>{low.length}</i>}
            </button>
          ))}
          <p className="nav-label">إدارة النظام</p>
          {visibleNav.slice(8).map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "active" : ""}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={19} />
              <span>{english ? n.en : n.ar}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-icon">✦</span>
            <strong>تجارة أذكى. وقت أكثر.</strong>
            <p>تابع أعمالك من أي مكان.</p>
            <button
              onClick={() =>
                setDialog({ type: "guide", title: "دليل الاستخدام السريع" })
              }
            >
              دليل الاستخدام <ArrowUpLeft size={14} />
            </button>
          </div>
          <div className="user">
            <div className="user-avatar">
              {String(members[0]?.display_name || "S").slice(0, 1)}
            </div>
            <div>
              <strong>{String(members[0]?.display_name || "مرحبًا بك")}</strong>
              <small>{labels[role] || "أكمل إعداد مساحة العمل"}</small>
            </div>
            <button
              aria-label={signed ? "تسجيل الخروج" : "تسجيل الدخول"}
              onClick={async () => {
                if (signed) {
                  await authClient.signOut();
                  setSigned(false);
                  setData(emptyData);
                } else setDialog({ type: "login", title: "تسجيل الدخول" });
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-btn"
              aria-label="فتح القائمة"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={22} />
            </button>
            <span>مساحة العمل</span>
            <span>/</span>
            <b>
              {english
                ? nav.find((n) => n.id === page)?.en
                : nav.find((n) => n.id === page)?.ar}
            </b>
          </div>
          <div className="top-actions">
            <div className="connection">
              <i className={online && signed && !sync ? "online" : ""} />
              {!online
                ? "غير متصل"
                : signed && !sync
                  ? "متصل بالنظام"
                  : "بانتظار الإعداد"}
            </div>
            <button
              className="icon-btn"
              aria-label="التنبيهات"
              onClick={() =>
                setDialog({ type: "alerts", title: "تنبيهات المخزون" })
              }
            >
              <Bell size={19} />
              {low.length + out.length > 0 && <em />}
            </button>
            <span className="divider" />
            <button
              className="language"
              onClick={() => {
                setEnglish(!english);
                document.documentElement.dir = english ? "rtl" : "ltr";
                document.documentElement.lang = english ? "ar" : "en";
              }}
            >
              {english ? "العربية" : "EN"}
            </button>
          </div>
        </header>
        <main className="content">
          {!configured && (
            <div className="setup-banner">
              <div>
                <span className="badge">الخطوة الأولى</span>
                <strong>أهلًا بك في najd. لنبدأ بربط مساحة عملك.</strong>
                <p>
                  أضف إعدادات Neon لتفعيل المبيعات والمخزون والتحديث اللحظي.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() =>
                  setDialog({ type: "setup", title: "ربط قاعدة البيانات" })
                }
              >
                إعداد الاتصال <ArrowLeft size={16} />
              </Button>
            </div>
          )}
          {configured && !signed && (
            <div className="setup-banner">
              <strong>سجّل دخولك للوصول إلى فروعك وبياناتك</strong>
              <Button
                onClick={() =>
                  setDialog({ type: "login", title: "تسجيل الدخول" })
                }
              >
                تسجيل الدخول
              </Button>
            </div>
          )}
          {sync && (
            <div className="error-banner">
              {sync}
              <Button
                size="sm"
                variant="outline"
                onClick={() => void refresh()}
              >
                إعادة المحاولة
              </Button>
            </div>
          )}
          {!online && (
            <div className="error-banner">
              <WifiOff size={18} />
              الاتصال مقطوع. إتمام البيع والحفظ متوقفان حتى عودة الاتصال.
            </div>
          )}
          {configured && signed && !loading && !data.businesses.length && (
            <div className="setup-banner">
              <p>
                لا توجد عضوية مرتبطة بحسابك. اتبع خطوات إنشاء المنشأة في README
                باستخدام SQL الإداري.
              </p>
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === "dashboard"
                  ? "نظرة شاملة على أعمالك"
                  : "NAJD WORKSPACE"}
              </div>
              <h1>
                {page === "dashboard"
                  ? english
                    ? "Your business, at a glance"
                    : "كل ما تحتاجه، في نظرة واحدة"
                  : english
                    ? nav.find((n) => n.id === page)?.en
                    : nav.find((n) => n.id === page)?.ar}
              </h1>
              <p>
                {page === "dashboard"
                  ? "أهلًا بعودتك 👋 إليك ما يحدث في متاجرك اليوم."
                  : "إدارة بسيطة وواضحة، وبيانات محدّثة من فروعك."}
              </p>
            </div>
            <div className="heading-actions">
              {page === "dashboard" ? (
                <Button
                  disabled={!canSell || !enabled}
                  onClick={() => navigate("pos")}
                >
                  <Plus size={18} />
                  عملية بيع جديدة
                </Button>
              ) : page === "products" ? (
                <Button
                  disabled={!canManage || !enabled}
                  onClick={() =>
                    setDialog({ type: "product", title: "إضافة منتج جديد" })
                  }
                >
                  <Plus size={18} />
                  إضافة منتج
                </Button>
              ) : [
                  "inventory",
                  "transfers",
                  "expenses",
                  "branches",
                  "staff",
                  "shifts",
                ].includes(page) ? (
                <Button
                  disabled={
                    !enabled ||
                    (page === "inventory" || page === "transfers"
                      ? !canStock
                      : page === "expenses"
                        ? !canFinance
                        : page === "shifts"
                          ? !canSell
                          : !canManage)
                  }
                  onClick={() =>
                    setDialog({
                      type: page,
                      title: (
                        {
                          inventory: "تسجيل حركة مخزون",
                          transfers: "تحويل مخزون بين الفروع",
                          expenses: "إضافة مصروف",
                          branches: "إضافة فرع",
                          staff: "إضافة عضوية موظف",
                          shifts: shift ? "إغلاق الوردية" : "فتح وردية",
                        } as Record<string, string>
                      )[page],
                    })
                  }
                >
                  <Plus size={18} />
                  {page === "shifts"
                    ? shift
                      ? "إغلاق الوردية"
                      : "فتح وردية"
                    : "إضافة جديد"}
                </Button>
              ) : null}
            </div>
          </div>
          <div className="filterbar">
            <div className="inline">
              <Building2 size={17} />
              <select
                aria-label="الفرع النشط"
                value={branch}
                onChange={(e) => {
                  setBranch(e.target.value);
                  setSelected([]);
                }}
              >
                <option value="" disabled>
                  اختر الفرع
                </option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {String(b.name)}
                  </option>
                ))}
              </select>
              {["dashboard", "reports", "sales"].includes(page) && (
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={allBranches}
                    onChange={(e) => setAllBranches(e.target.checked)}
                  />
                  كل الفروع المسموحة
                </label>
              )}
            </div>
            <div className="date-filter">
              <input
                aria-label="من تاريخ"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
              <span>—</span>
              <input
                aria-label="إلى تاريخ"
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
              />
              <button
                aria-label="تحديث البيانات"
                className={"icon-btn " + (loading ? "spinning" : "")}
                onClick={() => void refresh()}
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>
          {page === "dashboard" && (
            <>
              <div className="stats-grid">
                <Stat
                  title="إجمالي المبيعات"
                  value={money(revenue)}
                  icon={Wallet}
                  color="blue"
                  note={`${completed.length} عملية بيع مكتملة`}
                />
                <Stat
                  title="صافي الربح التقديري"
                  value={
                    canFinance && data.financial
                      ? money(data.financial.net)
                      : "—"
                  }
                  icon={TrendingUp}
                  color="green"
                  note={
                    canFinance
                      ? "بعد تكلفة البضاعة والمصروفات"
                      : "متاح لأصحاب الصلاحية المالية"
                  }
                />
                <Stat
                  title="قيمة المخزون"
                  value={
                    canFinance && data.financial
                      ? money(data.financial.inventory_value)
                      : "—"
                  }
                  icon={Boxes}
                  color="purple"
                  note={`${catalog.length} منتج في الكتالوج`}
                />
                <Stat
                  title="منتجات تحتاج انتباهك"
                  value={String(low.length + out.length)}
                  icon={TriangleAlert}
                  color="orange"
                  note={`${low.length} منخفضة · ${out.length} نافدة`}
                />
              </div>
              <div className="analytics-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>أداء المبيعات</h2>
                      <p>تابع حركة الإيرادات خلال آخر 7 أيام</p>
                    </div>
                    <span className="badge neutral">آخر 7 أيام</span>
                  </div>
                  <div className="chart-top">
                    <b>{money(chart.reduce((a, d) => a + d.sales * 100, 0))}</b>
                    <span>
                      <i />
                      المبيعات
                    </span>
                  </div>
                  <div className="chart" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={chart}
                        margin={{ top: 15, right: 10, left: -15, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="salesGradient"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#3478f6"
                              stopOpacity={0.22}
                            />
                            <stop
                              offset="100%"
                              stopColor="#3478f6"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          vertical={false}
                          stroke="#edf0f5"
                          strokeDasharray="4 4"
                        />
                        <XAxis
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "#8b95a7", fontSize: 11 }}
                          dy={10}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "#8b95a7", fontSize: 11 }}
                        />
                        <Tooltip
                          formatter={(v) => money(Number(v) * 100)}
                          contentStyle={{
                            borderRadius: 12,
                            border: "1px solid #e8edf5",
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="sales"
                          stroke="#377cf6"
                          strokeWidth={3}
                          fill="url(#salesGradient)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  {!completed.length && (
                    <p className="chart-note">
                      سيظهر منحنى المبيعات عند تسجيل أول عملية بيع
                    </p>
                  )}
                </section>
                <section className="panel branch-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>أداء الفروع</h2>
                      <p>إيرادات الفترة المحددة</p>
                    </div>
                    <Building2 size={18} />
                  </div>
                  {branches.length ? (
                    branches.map((b, i) => {
                      const amount = data.sales
                        .filter(
                          (s) =>
                            s.branch_id === b.id &&
                            s.status === "completed" &&
                            localDay(String(s.created_at)) >= from &&
                            localDay(String(s.created_at)) <= to,
                        )
                        .reduce((a, s) => a + Number(s.total), 0);
                      const total = data.sales
                        .filter((s) => s.status === "completed")
                        .reduce((a, s) => a + Number(s.total), 0);
                      return (
                        <div className="branch-performance" key={b.id}>
                          <div>
                            <span className={"branch-icon color" + (i % 4)}>
                              <Store size={18} />
                            </span>
                            <div>
                              <strong>{String(b.name)}</strong>
                              <small>{String(b.address) || "فرع المتجر"}</small>
                            </div>
                            <b>{money(amount)}</b>
                          </div>
                          <div className="progress">
                            <i
                              style={{
                                width:
                                  (total ? (amount / total) * 100 : 0) + "%",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="empty">
                      <Building2 size={32} />
                      <h3>فروعك تبدأ من هنا</h3>
                      <p>اربط قاعدة البيانات وأضف فروعك</p>
                    </div>
                  )}
                  <button
                    className="panel-link"
                    onClick={() => navigate("branches")}
                  >
                    إدارة جميع الفروع <ArrowLeft size={15} />
                  </button>
                </section>
              </div>
              <div className="bottom-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>آخر المبيعات</h2>
                      <p>أحدث العمليات في متاجرك</p>
                    </div>
                    <button
                      className="text-link"
                      onClick={() => navigate("sales")}
                    >
                      عرض الكل <ArrowLeft size={14} />
                    </button>
                  </div>
                  <DataTable
                    rows={[...sales]
                      .sort((a, b) =>
                        String(b.created_at).localeCompare(
                          String(a.created_at),
                        ),
                      )
                      .slice(0, 5)}
                    columns={salesColumns.slice(0, 5)}
                  />
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>المنتجات الأكثر مبيعًا</h2>
                      <p>الأكثر طلبًا خلال الفترة</p>
                    </div>
                    <ShoppingBag size={18} />
                  </div>
                  {best.length ? (
                    best.map((p, i) => (
                      <div className="best-product" key={p.id}>
                        <span className="rank">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div className={"mini-art color" + i}>
                          <Package size={22} />
                        </div>
                        <div>
                          <strong>{p.name}</strong>
                          <small>{p.sold} قطعة مباعة</small>
                        </div>
                        <b>{money(p.price)}</b>
                      </div>
                    ))
                  ) : (
                    <div className="empty">
                      <Package size={34} />
                      <p>ستظهر منتجاتك الأكثر مبيعًا هنا</p>
                    </div>
                  )}
                </section>
              </div>
              <div className="tip">
                <span>✦</span>
                <p>
                  <strong>أعمالك أقرب إليك.</strong> مخزون كل فرع مستقل، وكتالوج
                  منتجاتك موحّد في مكان واحد.
                </p>
                <span>najd POS</span>
              </div>
            </>
          )}
          {page === "pos" && (
            <POS
              key={branch}
              products={catalog}
              stock={stock}
              branch={branch}
              shift={shift?.id || ""}
              taxBps={taxBps}
              online={online}
              enabled={enabled && canSell}
              checkout={(p) => execute("checkout", p)}
            />
          )}
          {page === "products" && (
            <section className="panel">
              <div className="table-toolbar">
                <div className="search-field">
                  <Search size={17} />
                  <input
                    placeholder="ابحث بالاسم أو SKU أو الباركود"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="inline">
                  <input
                    hidden
                    type="file"
                    ref={file}
                    accept=".csv"
                    onChange={(e) => {
                      if (e.target.files?.[0])
                        void importProducts(e.target.files[0]);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    variant="outline"
                    disabled={!enabled || !canManage}
                    onClick={() => file.current?.click()}
                  >
                    <Upload size={16} />
                    استيراد CSV
                  </Button>
                  <Button variant="outline" onClick={exportProducts}>
                    <Download size={16} />
                    تصدير
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!selected.length}
                    onClick={() =>
                      setDialog({ type: "labels", title: "ملصقات الباركود" })
                    }
                  >
                    <Printer size={16} />
                    ملصقات ({selected.length})
                  </Button>
                </div>
              </div>
              <DataTable
                columns={productColumns}
                rows={catalog.filter((p) =>
                  (p.name + p.sku + p.barcode)
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )}
              />
            </section>
          )}
          {page === "inventory" && (
            <>
              <div className="stats-grid small-stats">
                <Stat
                  title="وحدات متوفرة في الفرع"
                  value={String(catalog.reduce((a, p) => a + stock(p.id), 0))}
                  icon={Boxes}
                  color="blue"
                  note={String(currentBranch?.name || "اختر فرعًا")}
                />
                <Stat
                  title="مخزون منخفض"
                  value={String(low.length)}
                  icon={TriangleAlert}
                  color="orange"
                  note="أقل من الحد الأدنى"
                />
                <Stat
                  title="نفد المخزون"
                  value={String(out.length)}
                  icon={Package}
                  color="purple"
                  note="منتجات تحتاج إلى توريد"
                />
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <h2>المخزون حسب الفرع</h2>
                  <span className="badge green">تحديث تلقائي</span>
                </div>
                <DataTable
                  rows={catalog}
                  columns={[
                    { accessorKey: "name", header: "المنتج" },
                    ...branches.map((b) => ({
                      id: b.id,
                      header: String(b.name),
                      cell: ({ row }: { row: { original: Variant } }) =>
                        stock(row.original.id, b.id),
                    })),
                    {
                      id: "total",
                      header: "الإجمالي",
                      cell: ({ row }) =>
                        branches.reduce(
                          (sum, b) => sum + stock(row.original.id, b.id),
                          0,
                        ),
                    },
                  ]}
                />
              </section>
              <section className="panel section-gap">
                <div className="panel-heading">
                  <h2>سجل حركات المخزون</h2>
                </div>
                <DataTable
                  rows={[...data.inventory_movements]
                    .filter((m) => m.branch_id === branch)
                    .reverse()}
                  columns={[
                    {
                      accessorKey: "created_at",
                      header: "التاريخ",
                      cell: ({ getValue }) =>
                        new Date(String(getValue())).toLocaleString("ar-PS"),
                    },
                    {
                      accessorKey: "variant_id",
                      header: "المنتج",
                      cell: ({ getValue }) =>
                        catalog.find((p) => p.id === getValue())?.name,
                    },
                    { accessorKey: "delta", header: "التغيير" },
                    { accessorKey: "reason", header: "السبب" },
                    {
                      accessorKey: "user_id",
                      header: "المسؤول",
                      cell: ({ getValue }) =>
                        String(
                          data.memberships.find((m) => m.user_id === getValue())
                            ?.display_name || String(getValue()).slice(0, 8),
                        ),
                    },
                  ]}
                />
              </section>
            </>
          )}
          {page === "sales" && (
            <section className="panel">
              <div className="panel-heading">
                <h2>سجل المبيعات</h2>
                <span className="badge">{sales.length} فاتورة</span>
              </div>
              <DataTable rows={[...sales].reverse()} columns={salesColumns} />
            </section>
          )}
          {page === "transfers" && (
            <section className="panel">
              <DataTable
                rows={[...data.stock_transfers]
                  .filter(
                    (t) =>
                      t.business_id === business &&
                      (t.source_id === branch || t.destination_id === branch),
                  )
                  .reverse()}
                columns={[
                  {
                    accessorKey: "id",
                    header: "رقم التحويل",
                    cell: ({ getValue }) => String(getValue()).slice(0, 8),
                  },
                  {
                    accessorKey: "source_id",
                    header: "من",
                    cell: ({ getValue }) =>
                      String(
                        data.branches.find((b) => b.id === getValue())?.name ??
                          "فرع آخر",
                      ),
                  },
                  {
                    accessorKey: "destination_id",
                    header: "إلى",
                    cell: ({ getValue }) =>
                      String(
                        data.branches.find((b) => b.id === getValue())?.name ??
                          "فرع آخر",
                      ),
                  },
                  {
                    accessorKey: "status",
                    header: "الحالة",
                    cell: ({ getValue }) => (
                      <span className="badge">
                        {labels[String(getValue())]}
                      </span>
                    ),
                  },
                  {
                    id: "action",
                    header: "الإجراء",
                    cell: ({ row }) => (
                      <div className="inline">
                        {canStock &&
                          row.original.source_id === branch &&
                          row.original.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  void submit("transfer_ship", {
                                    id: row.original.id,
                                  })
                                }
                              >
                                شحن
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() =>
                                  setDialog({
                                    type: "transfer_cancel",
                                    title: "إلغاء التحويل؟",
                                    row: row.original,
                                  })
                                }
                              >
                                إلغاء
                              </Button>
                            </>
                          )}
                        {canStock &&
                          row.original.destination_id === branch &&
                          row.original.status === "shipped" && (
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                setDialog({
                                  type: "transfer_receive",
                                  title: "تأكيد استلام التحويل",
                                  row: row.original,
                                })
                              }
                            >
                              <Check size={14} />
                              تأكيد الاستلام
                            </Button>
                          )}
                      </div>
                    ),
                  },
                ]}
              />
            </section>
          )}
          {page === "expenses" && (
            <section className="panel">
              <DataTable
                rows={data.expenses.filter((e) => e.branch_id === branch)}
                columns={[
                  { accessorKey: "title", header: "المصروف" },
                  {
                    accessorKey: "amount",
                    header: "المبلغ",
                    cell: ({ getValue }) => money(Number(getValue())),
                  },
                  {
                    accessorKey: "created_at",
                    header: "التاريخ",
                    cell: ({ getValue }) =>
                      new Date(String(getValue())).toLocaleString("ar-PS"),
                  },
                ]}
              />
            </section>
          )}
          {page === "reports" && (
            <>
              <div className="stats-grid">
                <Stat
                  title="الإيرادات دون الضريبة"
                  value={money(data.financial?.revenue ?? 0)}
                  icon={Wallet}
                  color="blue"
                  note="المبيعات المكتملة فقط"
                />
                <Stat
                  title="تكلفة البضاعة المباعة"
                  value={money(data.financial?.cogs ?? 0)}
                  icon={Package}
                  color="purple"
                  note="التكلفة التاريخية وقت البيع"
                />
                <Stat
                  title="المصروفات التشغيلية"
                  value={money(data.financial?.expenses ?? 0)}
                  icon={ReceiptText}
                  color="orange"
                  note="المصروفات في الفترة المحددة"
                />
                <Stat
                  title="صافي الربح التقديري"
                  value={money(data.financial?.net ?? 0)}
                  icon={TrendingUp}
                  color="green"
                  note="الإيرادات − التكلفة − المصروفات"
                />
              </div>
              <div className="panel report-details">
                <h2>ملخص الأداء المالي</h2>
                {[
                  ["إجمالي الربح", "gross"],
                  ["الضريبة المحصلة", "tax"],
                  ["قيمة المخزون الحالية", "inventory_value"],
                ].map(([title, k]) => (
                  <div key={k}>
                    <span>{title}</span>
                    <b>{money(data.financial?.[k] ?? 0)}</b>
                  </div>
                ))}
                <p className="muted">
                  صافي الربح تقديري ولا يمثل الرصيد النقدي. تقرير المشتريات
                  والذمم وتسويات الدفع الجزئي غير مكتمل بعد.
                </p>
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer size={16} />
                  طباعة التقرير
                </Button>
              </div>
            </>
          )}
          {page === "branches" && (
            <div className="branch-cards">
              {branches.map((b, i) => (
                <section className="panel branch-card" key={b.id}>
                  <div className={"large-art color" + (i % 4)}>
                    <Store size={27} />
                  </div>
                  <span className="badge green">نشط</span>
                  <h2>{String(b.name)}</h2>
                  <p>{String(b.address) || "لم يحدد العنوان"}</p>
                  <div>
                    <span>وحدات المخزون</span>
                    <b>
                      {data.branch_inventory
                        .filter((s) => s.branch_id === b.id)
                        .reduce((a, s) => a + Number(s.quantity), 0)}
                    </b>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setBranch(b.id);
                      navigate("inventory");
                    }}
                  >
                    عرض مخزون الفرع <ArrowLeft size={15} />
                  </Button>
                </section>
              ))}
            </div>
          )}
          {page === "staff" && (
            <section className="panel">
              <DataTable
                rows={data.memberships.filter(
                  (m) => m.business_id === business,
                )}
                columns={[
                  { accessorKey: "display_name", header: "الموظف" },
                  {
                    accessorKey: "role",
                    header: "الدور",
                    cell: ({ getValue }) => (
                      <span className="badge">
                        {labels[String(getValue())]}
                      </span>
                    ),
                  },
                  {
                    accessorKey: "branch_id",
                    header: "الفرع",
                    cell: ({ getValue }) =>
                      getValue()
                        ? String(
                            data.branches.find((b) => b.id === getValue())
                              ?.name || "",
                          )
                        : "جميع الفروع",
                  },
                  {
                    accessorKey: "user_id",
                    header: "معرف الحساب",
                    cell: ({ getValue }) => (
                      <span className="mono">{String(getValue())}</span>
                    ),
                  },
                ]}
              />
            </section>
          )}
          {page === "shifts" && (
            <section className="panel">
              <DataTable
                rows={data.cash_shifts.filter((s) => s.branch_id === branch)}
                columns={[
                  {
                    accessorKey: "opened_at",
                    header: "بداية الوردية",
                    cell: ({ getValue }) =>
                      new Date(String(getValue())).toLocaleString("ar-PS"),
                  },
                  {
                    accessorKey: "opening",
                    header: "رصيد الافتتاح",
                    cell: ({ getValue }) => money(Number(getValue())),
                  },
                  {
                    accessorKey: "closing",
                    header: "النقد المعدود",
                    cell: ({ getValue }) =>
                      getValue() === null
                        ? "مفتوحة"
                        : money(Number(getValue())),
                  },
                  {
                    accessorKey: "expected",
                    header: "المتوقع",
                    cell: ({ getValue }) =>
                      getValue() === null ? "—" : money(Number(getValue())),
                  },
                  {
                    id: "diff",
                    header: "فرق الصندوق",
                    cell: ({ row }) =>
                      row.original.closed_at
                        ? money(
                            Number(row.original.closing) -
                              Number(row.original.expected),
                          )
                        : "—",
                  },
                ]}
              />
            </section>
          )}
          {page === "settings" && (
            <section className="panel settings-panel">
              <h2>إعدادات المنشأة</h2>
              <p>العملة: الشيكل الإسرائيلي (₪ ILS)</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  void submit("settings", {
                    tax_bps: Math.round(Number(form.get("tax")) * 100),
                  });
                }}
              >
                <label>
                  نسبة الضريبة %
                  <input
                    name="tax"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    defaultValue={taxBps / 100}
                  />
                </label>
                <Button
                  disabled={
                    !enabled || busy || !["owner", "super_admin"].includes(role)
                  }
                >
                  حفظ الإعدادات
                </Button>
              </form>
              <hr />
              <h2>إعداد قارئ الباركود</h2>
              <p>
                استخدم وضع USB HID / Keyboard وأضف Enter في نهاية المسح. اضغط F2
                للتركيز على حقل الباركود وF8 للدفع.
              </p>
              <p>
                المسح لا يخصم المخزون. الخصم يحدث بعد تأكيد البيع في قاعدة
                البيانات.
              </p>
            </section>
          )}
          <footer className="footer">
            <span>
              najd POS <i />
              إدارة أبسط، تجارة أذكى
            </span>
            <span>
              ₪ ILS ·{" "}
              {new Date().toLocaleDateString("ar-PS", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </footer>
        </main>
      </div>
      <Modal
        title={dialog?.title || ""}
        open={Boolean(dialog)}
        onClose={() => {
          if (!busy) setDialog(null);
        }}
      >
        {dialog?.type === "setup" && (
          <div className="guide">
            <p>
              أنشئ مشروع Neon مستقلًا وطبّق ملف migration، ثم أضف المتغيرين
              التاليين في <code>.env.local</code> وأعد تشغيل الخادم.
            </p>
            <pre dir="ltr">
              DATABASE_URL=…{"\n"}
              NEON_AUTH_BASE_URL=…
            </pre>
            <p>
              لا تشارك كلمة مرور قاعدة البيانات. دليل الإعداد الكامل في README.md.
            </p>
          </div>
        )}
        {dialog?.type === "login" && (
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!configured) {
                toast.error("أكمل إعداد الاتصال أولاً");
                return;
              }
              setBusy(true);
              const f = new FormData(e.currentTarget);
              try {
                const { error } = await authClient.signIn.email({
                  email: String(f.get("email")),
                  password: String(f.get("password")),
                });
                if (error) throw Error("البريد أو كلمة المرور غير صحيحة");
                setSigned(true);
                setDialog(null);
                toast.success("تم تسجيل الدخول");
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              البريد الإلكتروني
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                dir="ltr"
              />
            </label>
            <label>
              كلمة المرور
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                dir="ltr"
              />
            </label>
            <Button disabled={busy || !configured}>تسجيل الدخول</Button>
          </form>
        )}
        {dialog?.type === "product" && (
          <ProductForm
            onSave={async (p) => {
              try {
                await execute("product", p);
                setDialog(null);
                toast.success("تمت إضافة المنتج");
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          />
        )}
        {dialog?.type === "edit-product" && (
          <div className="guide">
            <p>
              تُعرض تكلفة الشراء للمسؤول المصرح فقط. لا تؤثر التكلفة الجديدة على
              ربح المبيعات السابقة.
            </p>
            <ProductForm
              initial={dialog.row as unknown as Variant}
              onSave={async (p) => {
                try {
                  await execute("product", {
                    ...p,
                    product_id: (dialog.row as Variant).product_id,
                    variant_id: dialog.row!.id,
                  });
                  setDialog(null);
                  toast.success("تم التعديل");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            />
          </div>
        )}
        {dialog &&
          [
            "inventory",
            "transfers",
            "expenses",
            "branches",
            "staff",
            "shifts",
            "return",
          ].includes(dialog.type) && (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const number = (s: string) => Number(f.get(s));
                const amount = (s: string) => Math.round(number(s) * 100);
                const val = (s: string) => String(f.get(s) || "");
                const p: Record<string, unknown> = {};
                let action = "";
                switch (dialog.type) {
                  case "inventory":
                    action = "stock";
                    Object.assign(p, {
                      variant_id: val("variant"),
                      delta: number("delta"),
                      reason: val("reason"),
                    });
                    break;
                  case "transfers":
                    action = "transfer_create";
                    Object.assign(p, {
                      variant_id: val("variant"),
                      qty: number("qty"),
                      destination_id: val("destination"),
                    });
                    break;
                  case "expenses":
                    action = "expense";
                    Object.assign(p, {
                      title: val("title"),
                      amount: amount("amount"),
                    });
                    break;
                  case "branches":
                    action = "branch";
                    Object.assign(p, {
                      name: val("name"),
                      address: val("address"),
                    });
                    break;
                  case "staff":
                    action = "staff";
                    Object.assign(p, {
                      user_id: val("user"),
                      display_name: val("name"),
                      role: val("role"),
                    });
                    break;
                  case "shifts":
                    action = shift ? "shift_close" : "shift_open";
                    Object.assign(
                      p,
                      shift
                        ? { id: shift.id, closing: amount("amount") }
                        : { opening: amount("amount") },
                    );
                    break;
                  case "return":
                    action = "return";
                    Object.assign(p, {
                      id: dialog.row!.id,
                      reason: val("reason"),
                    });
                    break;
                }
                void submit(action, p);
              }}
            >
              {["inventory", "transfers"].includes(dialog.type) && (
                <label>
                  المنتج
                  <select name="variant" required>
                    <option value="">اختر المنتج</option>
                    {catalog.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name} ({stock(p.id)} متوفر)
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {dialog.type === "inventory" && (
                <>
                  <label>
                    التغيير في الكمية
                    <input
                      name="delta"
                      type="number"
                      step="1"
                      required
                      placeholder="20 للاستلام أو -2 للتالف"
                    />
                  </label>
                  <label>
                    سبب الحركة
                    <input
                      name="reason"
                      required
                      minLength={3}
                      placeholder="استلام بضاعة / جرد / تالف…"
                    />
                  </label>
                </>
              )}
              {dialog.type === "transfers" && (
                <>
                  <label>
                    الفرع المستلم
                    <select name="destination" required>
                      <option value="">اختر الفرع</option>
                      {branches
                        .filter((b) => b.id !== branch)
                        .map((b) => (
                          <option value={b.id} key={b.id}>
                            {String(b.name)}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    الكمية
                    <input name="qty" type="number" min="1" step="1" required />
                  </label>
                  <p className="muted">
                    يُخصم المخزون عند الشحن، ويضاف للوجهة عند تأكيد الاستلام.
                  </p>
                </>
              )}
              {["expenses", "shifts"].includes(dialog.type) && (
                <>
                  {dialog.type === "expenses" && (
                    <label>
                      وصف المصروف
                      <input name="title" required minLength={2} />
                    </label>
                  )}
                  <label>
                    {dialog.type === "shifts"
                      ? shift
                        ? "النقد المعدود عند الإغلاق ₪"
                        : "رصيد الافتتاح ₪"
                      : "المبلغ ₪"}
                    <input
                      name="amount"
                      type="number"
                      min="0"
                      step="0.01"
                      required
                    />
                  </label>
                </>
              )}
              {["branches", "staff"].includes(dialog.type) && (
                <label>
                  {dialog.type === "staff" ? "اسم الموظف" : "اسم الفرع"}
                  <input name="name" required minLength={2} />
                </label>
              )}
              {dialog.type === "branches" && (
                <label>
                  العنوان
                  <input name="address" />
                </label>
              )}
              {dialog.type === "staff" && (
                <>
                  <p className="muted">
                    أنشئ الحساب في Neon Auth أولاً ثم أدخل UUID. تُربط العضوية
                    بالفرع النشط.
                  </p>
                  <label>
                    معرف المستخدم UUID
                    <input name="user" required dir="ltr" />
                  </label>
                  <label>
                    الدور
                    <select name="role">
                      {["manager", "cashier", "inventory", "accountant"].map(
                        (r) => (
                          <option value={r} key={r}>
                            {labels[r]}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                </>
              )}
              {dialog.type === "return" && (
                <>
                  <p>
                    سيعاد كامل المخزون وتسجل قيمة رد نقدي قدرها{" "}
                    {money(Number((dialog.row as Row).total))}. سلّم المبلغ
                    للعميل بعد نجاح العملية.
                  </p>
                  <label>
                    سبب الإرجاع
                    <input name="reason" required minLength={3} />
                  </label>
                </>
              )}
              <Button disabled={busy}>
                {busy
                  ? "جارٍ الحفظ…"
                  : dialog.type === "return"
                    ? "تأكيد الإرجاع"
                    : "حفظ العملية"}
              </Button>
            </form>
          )}
        {dialog &&
          ["transfer_cancel", "transfer_receive"].includes(dialog.type) && (
            <div className="stack">
              <p>
                {dialog.type === "transfer_cancel"
                  ? "سيتم إلغاء التحويل قبل شحنه."
                  : "تأكد من استلام كامل الأصناف فعليًا. لا يمكن الاستلام مرتين."}
              </p>
              <Button
                disabled={busy}
                onClick={() => void submit(dialog.type, { id: dialog.row!.id })}
              >
                تأكيد
              </Button>
            </div>
          )}
        {dialog?.type === "labels" && (
          <>
            <div className="label-sheet">
              {catalog
                .filter((p) => selected.includes(p.id))
                .map((p) => (
                  <div className="barcode-label" key={p.id}>
                    <strong>{p.name}</strong>
                    <svg
                      ref={(el) => {
                        if (el) labelRefs.current.set(p.id, el);
                        else labelRefs.current.delete(p.id);
                      }}
                    />
                    <b>{money(p.price)}</b>
                  </div>
                ))}
            </div>
            <Button onClick={() => window.print()}>
              <Printer size={17} />
              طباعة الملصقات
            </Button>
          </>
        )}
        {dialog?.type === "sale" && (
          <div className="receipt">
            <h2>najd POS</h2>
            <p dir="ltr">{dialog.row?.id}</p>
            {data.sale_items
              .filter((i) => i.sale_id === dialog.row?.id)
              .map((i) => (
                <div key={i.id}>
                  <span>
                    {catalog.find((p) => p.id === i.variant_id)?.name} ×{" "}
                    {Number(i.qty)}
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
              الإجمالي <b>{money(Number((dialog.row as Row).total))}</b>
            </div>
            <p>{labels[String((dialog.row as Row).status)]}</p>
            <Button onClick={() => window.print()}>
              <Printer size={17} />
              طباعة
            </Button>
            {canManage && (dialog.row as Row).status === "completed" && (
              <Button
                variant="destructive"
                onClick={() =>
                  setDialog({
                    type: "return",
                    title: "إرجاع الفاتورة",
                    row: dialog.row,
                  })
                }
              >
                إرجاع الفاتورة
              </Button>
            )}
          </div>
        )}
        {dialog?.type === "alerts" && (
          <div className="stack">
            {[...out, ...low].map((p) => (
              <div className="alert-item" key={p.id}>
                <TriangleAlert size={18} />
                <strong>{p.name}</strong>
                <span className="badge amber">{stock(p.id)} متوفر</span>
              </div>
            ))}
            {!out.length && !low.length && <p>لا توجد تنبيهات مخزون حاليًا</p>}
          </div>
        )}
        {dialog?.type === "guide" && (
          <ol className="guide">
            <li>اربط Neon وسجّل الدخول بحساب له عضوية.</li>
            <li>أضف المنتج وباركوده من صفحة المنتجات.</li>
            <li>استلم المخزون في كل فرع على حدة.</li>
            <li>افتح وردية، ثم انتقل إلى نقطة البيع.</li>
            <li>امسح الباركود، راجع السلة ثم أكّد الدفع النقدي.</li>
            <li>
              للتحويل: أنشئ الطلب ثم اشحنه، وانتقل للفرع المستلم لتأكيد
              الاستلام.
            </li>
            <li>أغلق الوردية وسجّل النقد المعدود.</li>
          </ol>
        )}
      </Modal>
    </div>
  );
}
function Stat({
  title,
  value,
  icon: Icon,
  color,
  note,
}: {
  title: string;
  value: string;
  icon: typeof Wallet;
  color: string;
  note: string;
}) {
  return (
    <section className="stat-card">
      <div className="stat-top">
        <span>{title}</span>
        <div className={"stat-icon " + color}>
          <Icon size={20} />
        </div>
      </div>
      <strong>{value}</strong>
      <div className="stat-note">
        <span className={"note-dot " + color} />
        {note}
      </div>
    </section>
  );
}
