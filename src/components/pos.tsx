"use client";
import { useEffect, useRef, useState } from "react";
import {
  Barcode,
  Camera,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import {
  addScan,
  setCartQuantity,
  cartTotal,
  ScanGate,
  OperationError,
  normalizeBarcode,
  barcodeIdentity,
  type CartLine,
  type Variant,
} from "@/lib/domain";
import { money } from "@/lib/utils";
import { Button } from "./ui/button";
import { Modal } from "./modal";
import dynamic from "next/dynamic";
const CameraScanner = dynamic(
  () => import("./camera-scanner").then((m) => m.CameraScanner),
  { ssr: false },
);
type Receipt = {
  id: string;
  total: number;
  tax: number;
  cash: number;
  lines: CartLine[];
};
export function POS({
  products,
  stock,
  branch,
  shift,
  taxBps,
  online,
  enabled,
  checkout,
  onPendingChange,
}: {
  products: Variant[];
  stock: (id: string) => number;
  branch: string;
  shift: string;
  taxBps: number;
  online: boolean;
  enabled: boolean;
  checkout: (p: Record<string, unknown>) => Promise<Record<string, unknown>>;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const [code, setCode] = useState("");
  const discount = 0;

  const [busy, setBusy] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const [camera, setCamera] = useState(true);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const input = useRef<HTMLInputElement>(null);
  const paymentButton = useRef<HTMLButtonElement>(null);
  const gate = useRef(new ScanGate());
  const key = useRef<string | null>(null);
  const lock = useRef(false);
  const pending = useRef<Record<string, unknown> | null>(null);
  const totals = cartTotal(cart, discount, taxBps);
  useEffect(() => {
    function hot(e: KeyboardEvent) {
      if (e.key === "F2") {
        e.preventDefault();
        input.current?.focus();
      }
      if (e.key === "F8") {
        e.preventDefault();
        paymentButton.current?.click();
      }
    }
    input.current?.focus();
    window.addEventListener("keydown", hot);
    return () => window.removeEventListener("keydown", hot);
  }, []);
  useEffect(() => {
    if (!hasPending) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [hasPending]);
  function add(v: Variant) {
    if (pending.current) {
      toast.error("أعد محاولة تأكيد الطلب المعلق أولاً");
      return;
    }
    try {
      setCart(addScan(cart, v, stock(v.id)));
      key.current = null;
      input.current?.focus();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  function scan(text: string, source: "keyboard" | "camera" = "keyboard") {
    if (pending.current) {
      toast.error("أعد محاولة تأكيد الطلب المعلق أولاً");
      return false;
    }
    const cleaned = normalizeBarcode(text);
    setCode(cleaned);
    if (!gate.current.accept(cleaned, Date.now())) return false;
    const matches = products.filter((p) => barcodeIdentity(p.barcode) === barcodeIdentity(cleaned) && p.active);
    if (matches.length > 1) {
      toast.error("هذا الرقم مرتبط بأكثر من منتج. راجع باركود المنتجات أولًا.");
      return false;
    }
    const v = matches[0];
    if (!v) {
      toast.error("الباركود غير معروف. ابحث عن المنتج أو أضفه أولاً.");
      return "الرقم مقروء، لكنه غير مسجّل على أي منتج. أضف الرقم المقروء إلى بيانات المنتج أولًا.";
    }
    if ((cart.find((l) => l.variant.id === v.id)?.qty ?? 0) >= stock(v.id)) {
      toast.error("الكمية المتوفرة غير كافية");
      return "تم التعرف على المنتج، لكن كميته المتوفرة غير كافية.";
    }
    add(v);
    if (source === "keyboard") setCamera(false);
    setCode("");
    input.current?.focus();
    return true;
  }
  useEffect(() => {
    let buffer = "";
    let last = 0;
    function hardware(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (
        target.closest(
          'input,textarea,select,[contenteditable="true"],[role="dialog"]',
        ) ||
        document.querySelector('[role="dialog"]') ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      if (event.key === "Enter" && buffer.length >= 3) {
        event.preventDefault();
        scan(buffer);
        buffer = "";
        return;
      }
      if (event.key.length === 1 && event.key !== " ") {
        if (Date.now() - last > 80) buffer = "";
        last = Date.now();
        buffer += event.key;
        event.preventDefault();
      }
    }
    window.addEventListener("keydown", hardware, true);
    return () => window.removeEventListener("keydown", hardware, true);
  });
  async function finalize() {
    if (lock.current) return;
    if (!online || !enabled) {
      toast.error("يلزم تسجيل الدخول واتصال لإتمام البيع");
      return;
    }
    if (!cart.length) {
      toast.error("راجع السلة والمبلغ المدفوع");
      return;
    }
    lock.current = true;
    setBusy(true);
    key.current ??= crypto.randomUUID();
    pending.current ??= {
      branch_id: branch,
      ...(shift ? { shift_id: shift } : {}),
      key: key.current,
      items: cart.map((l) => ({
        variant_id: l.variant.id,
        qty: l.qty,
        discount: l.discount,
      })),
      discount,
      cash: totals.total,
    };
    setHasPending(true);
    onPendingChange?.(true);
    try {
      const r = await checkout(pending.current);
      setReceipt({
        id: String(r.id),
        total: Number(r.total),
        tax: Number(r.tax ?? 0),
        cash: Number(r.total),
        lines: Array.isArray(r.items)
          ? r.items.map((item) => ({
              variant: {
                ...cart.find((l) => l.variant.id === item.variant_id)!.variant,
                name: item.name,
                price: Number(item.price),
              },
              qty: Number(item.qty),
              discount: Number(item.discount),
            }))
          : cart,
      });
      setCart([]);
      key.current = null;
      pending.current = null;
      setHasPending(false);
      onPendingChange?.(false);
      toast.success("تم البيع وتحديث المخزون");
    } catch (e) {
      if (e instanceof OperationError && e.rolledBack) {
        pending.current = null;
        setHasPending(false);
        onPendingChange?.(false);
        key.current = null;
        toast.error(e.message);
      } else toast.error((e as Error).message + " — أعد المحاولة بنفس الطلب.");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <div className="pos-grid">
      <section>
        <div className="scanner-box">
          <Barcode />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              scan(code);
            }}
          >
            <input
              aria-label="باركود المنتج"
              ref={input}
              placeholder="امسح الباركود أو أدخله ثم Enter · F2"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              dir="ltr"
              disabled={hasPending}
            />
          </form>
          <Button variant="outline" disabled={!code.trim() || hasPending} onClick={() => scan(code)}>إضافة</Button>
          <Button
            variant="outline"
            onClick={() => setCamera(value => !value)}
            disabled={hasPending}
            aria-label={camera ? "إيقاف الكاميرا" : "تشغيل الكاميرا"}
            aria-pressed={camera}
          >
            <Camera size={19} />
          </Button>
        </div>
        {camera && enabled && !hasPending && !receipt && (
          <section className="auto-camera" aria-label="قراءة الباركود التلقائية">
            <strong>الكاميرا تقرأ تلقائيًا</strong>
            <CameraScanner onScan={text => scan(text,"camera")} />
          </section>
        )}
        <input
          className="product-search"
          aria-label="ابحث عن منتج للبيع"
          placeholder="ابحث باسم الشنطة أو رقم الصنف أو الباركود…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="product-grid">
          {products
            .filter(
              (p) =>
                p.active &&
                (p.name + p.sku + p.barcode).toLowerCase().includes(search.toLowerCase()),
            )
            .map((p) => (
              <button
                aria-label={"إضافة " + p.name + " إلى الفاتورة"}
                disabled={!stock(p.id) || hasPending}
                className="product-tile"
                key={p.id}
                onClick={() => {
                  if (
                    (cart.find((l) => l.variant.id === p.id)?.qty ?? 0) <
                    stock(p.id)
                  )
                    add(p);
                  else toast.error("الكمية المتوفرة غير كافية");
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.image_url && <img className="sale-product-photo" src={p.image_url} alt={p.name} width={96} height={96} loading="lazy" />}
                <strong>{p.name}</strong>
                <span dir="ltr">{p.sku}{p.barcode && !p.barcode.startsWith("AUTO-") ? " · " + p.barcode : ""}</span>
                <div>
                  <b>{money(p.price)}</b>
                  <small>{stock(p.id)} متوفر</small>
                </div>
              </button>
            ))}
        </div>
        {!products.length && (
          <div className="empty">أضف أول منتج من صفحة المنتجات والكميات، ثم امسح باركوده هنا.</div>
        )}
      </section>
      <section className="panel cart-panel">
        <div className="panel-heading">
          <h2>الفاتورة الحالية</h2>
          <span className="badge">
            {cart.reduce((a, l) => a + l.qty, 0)} قطع
          </span>
        </div>
        <div className="cart-lines">
          {!cart.length ? (
            <div className="empty">
              <ShoppingBag size={40} />
              <h3>اختر الشنطة لبدء البيع</h3>
              <p>اضغط اسم الشنطة أو صورتها، أو ابحث عنها</p>
            </div>
          ) : (
            cart.map((l) => (
              <div className="cart-line" key={l.variant.id}>
                <div>
                  <strong>{l.variant.name}</strong>
                  <small>{money(l.variant.price)}</small>
                </div>
                <div className="quantity">
                  <button
                    aria-label="إنقاص"
                    disabled={hasPending}
                    onClick={() =>
                      setCart(
                        cart.flatMap((x) =>
                          x === l
                            ? x.qty > 1
                              ? [{ ...x, qty: x.qty - 1, discount: 0 }]
                              : []
                            : [x],
                        ),
                      )
                    }
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    aria-label={"كمية " + l.variant.name}
                    type="number"
                    min="1"
                    max={stock(l.variant.id)}
                    step="1"
                    value={l.qty}
                    disabled={hasPending}
                    onChange={(e) => {
                      try {
                        setCart(
                          setCartQuantity(
                            cart,
                            l.variant.id,
                            Number(e.target.value),
                            stock(l.variant.id),
                          ),
                        );
                      } catch (error) {
                        toast.error((error as Error).message);
                      }
                    }}
                  />
                  <button
                    aria-label="زيادة"
                    disabled={hasPending}
                    onClick={() => {
                      if (l.qty < stock(l.variant.id)) add(l.variant);
                      else toast.error("المخزون غير كاف");
                    }}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <b>{money(l.qty * l.variant.price - l.discount)}</b>
              </div>
            ))
          )}
        </div>
        <div className="cart-summary">
          <div>
            <span>المجموع الفرعي</span>
            <b>{money(totals.subtotal)}</b>
          </div>
          {taxBps > 0 && <div><span>الضريبة</span><b>{money(totals.tax)}</b></div>}
          <div className="grand-total">
            <span>الإجمالي</span>
            <b>{money(totals.total)}</b>
          </div>
          <Button
            ref={paymentButton}
            disabled={busy || !cart.length || !online || !enabled}
            onClick={() => void finalize()}
          >
            {busy ? "جارٍ حفظ البيع…" : hasPending ? "إعادة تأكيد البيع نفسه" : "تأكيد البيع وخصم الكمية"} <span>F8</span>
          </Button>
          <Button
            variant="ghost"
            disabled={busy || hasPending}
            onClick={() => {
              setCart([]);
            }}
          >
            <Trash2 size={15} />
            تفريغ السلة
          </Button>
          <p className="pos-help">
            تنقص الكمية من المخزون الإجمالي عند تأكيد البيع.
          </p>
        </div>
      </section>
      <Modal
        title="تم إصدار الإيصال"
        open={Boolean(receipt)}
        onClose={() => {
          setReceipt(null);
          input.current?.focus();
        }}
      >
        <div className="receipt" id="receipt">
          <h2>najd POS</h2>
          <p>إيصال بيع · ₪ ILS</p>
          <p dir="ltr">{receipt?.id}</p>
          {receipt?.lines.map((l) => (
            <div key={l.variant.id}>
              <span>
                {l.variant.name} × {l.qty}
              </span>
              <b>{money(l.variant.price * l.qty - l.discount)}</b>
            </div>
          ))}
          <hr />
          <div>
            الضريبة <b>{money(receipt?.tax ?? 0)}</b>
          </div>
          <div>
            الإجمالي <b>{money(receipt?.total ?? 0)}</b>
          </div>
          <div>
            المدفوع <b>{money(receipt?.cash ?? 0)}</b>
          </div>
          <div>
            الباقي <b>{money((receipt?.cash ?? 0) - (receipt?.total ?? 0))}</b>
          </div>
          <p>شكرًا لزيارتكم</p>
        </div>
        <Button onClick={() => { setReceipt(null); input.current?.focus(); }}>بيع جديد</Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer size={17} />
          طباعة الإيصال
        </Button>
      </Modal>
    </div>
  );
}
