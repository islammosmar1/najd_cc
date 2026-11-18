"use client";
import { useEffect, useRef, useState } from "react";
import { BrowserCodeReader, BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";
import { CameraScanGate } from "@/lib/domain";
function reader() {
 return new BrowserMultiFormatReader(new Map([[DecodeHintType.TRY_HARDER, true]]), { delayBetweenScanAttempts: 180, delayBetweenScanSuccess: 180 });
}
export function CameraScanner({ onScan }: { onScan: (text: string) => boolean }) {
 const video = useRef<HTMLVideoElement>(null);
 const callback = useRef(onScan);
 const [error, setError] = useState("");
 const [decoded, setDecoded] = useState("");
 const [device, setDevice] = useState("");
 const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
 const [busy, setBusy] = useState(false);
 const mounted = useRef(false);
 const gate = useRef(new CameraScanGate());
 useEffect(() => { callback.current = onScan; }, [onScan]);
 useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
 function accept(text: string) {
   if (!gate.current.accept(text, Date.now())) return;
   setDecoded(text);
   const accepted = callback.current(text);
   setError(accepted ? "" : "تمت قراءة الرمز، لكن لم يُضف للفاتورة. راجع الرقم المحفوظ للمنتج والكمية المتوفرة.");
 }
 const acceptRef = useRef(accept);
 useEffect(() => { acceptRef.current = accept; });
 useEffect(() => {
   let controls: IScannerControls | undefined;
   let cancelled = false;
   const scanner = reader();
   scanner.decodeFromConstraints({ video: {
     ...(device ? {deviceId: {exact: device}} : {facingMode: {ideal: "environment"}}),
     width: {ideal: 1920}, height: {ideal: 1080}
   }, audio: false }, video.current!, result => {
     if (cancelled) return;
     if (result) acceptRef.current(result.getText());
     else gate.current.absent(Date.now());
   }).then(async control => {
     if (cancelled) { control.stop(); return; }
     controls = control;
     const inputs = await BrowserCodeReader.listVideoInputDevices();
     if (!cancelled) setDevices(inputs);
   }).catch((fault: Error) => {
     if (cancelled) return;
     setError(fault.name === "NotAllowedError"
       ? "المتصفح منع الكاميرا. اسمح بها من رمز الكاميرا بجانب عنوان الموقع، أو اختر صورة الباركود أدناه."
       : fault.name === "NotFoundError" ? "لم نجد كاميرا. يمكنك اختيار صورة الباركود أو كتابة رقمه في شاشة البيع."
       : "تعذر تشغيل الكاميرا. أغلق التطبيقات الأخرى التي تستخدمها، أو اختر صورة الباركود أدناه.");
   });
   return () => { cancelled = true; controls?.stop(); };
 }, [device]);
 return <div className="stack barcode-camera">
   {devices.length > 1 && <label>الكاميرا<select aria-label="الكاميرا" value={device} onChange={e => {setDevice(e.target.value);setError("");}}>
     <option value="">اختيار تلقائي</option>{devices.map((item, i) => <option key={item.deviceId} value={item.deviceId}>{item.label || "كاميرا " + (i + 1)}</option>)}
   </select></label>}
   <div className="camera-preview"><video ref={video} className="camera" muted playsInline /><div className="camera-target" aria-hidden="true" /></div>
   <p>قراءة تلقائية بدون التقاط. ضع الباركود كاملًا داخل الإطار. لقطعة أخرى تحمل الرمز نفسه، أبعده ثانية ثم أعده.</p>
   {decoded && <p role="status">الرمز المقروء: <strong dir="ltr">{decoded}</strong></p>}
   {error && <p role="alert" className="error-banner">{error}</p>}
   <label>قراءة باركود من صورة
     <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={async e => {
       const file = e.target.files?.[0]; if (!file) return;
       if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {setError("اختر صورة JPG أو PNG أو WebP أصغر من 10 ميغابايت.");return;}
       setBusy(true);setError("");
       const url = URL.createObjectURL(file);
       try { const result = await reader().decodeFromImageUrl(url);if (mounted.current) {gate.current.reset();acceptRef.current(result.getText());} }
       catch { if (mounted.current) setError("لم نتمكن من قراءة الصورة. اختر الصورة الأصلية للباركود كاملة وبوضوح، أو اكتب الرقم يدويًا."); }
       finally { URL.revokeObjectURL(url);if (mounted.current) setBusy(false); }
     }} />
   </label>
   {busy && <p role="status">جارٍ قراءة الصورة…</p>}
 </div>;
}
