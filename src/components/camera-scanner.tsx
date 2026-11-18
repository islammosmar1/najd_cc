"use client";
import { useEffect, useRef, useState } from "react";
import { CameraScanGate } from "@/lib/domain";
import { BarcodeReader } from "@/lib/barcode-reader";
export function CameraScanner({ onScan }: { onScan: (text: string) => boolean | string }) {
 const video = useRef<HTMLVideoElement>(null);
 const callback = useRef(onScan);
 const decoder = useRef<BarcodeReader | null>(null);
 const [error, setError] = useState("");
 const [decoded, setDecoded] = useState("");
 const [device, setDevice] = useState("");
 const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
 const [busy, setBusy] = useState(false);
 const [ready, setReady] = useState(false);
 const mounted = useRef(false);
 const fileBusy = useRef(false);
 const gate = useRef(new CameraScanGate());
 useEffect(() => { callback.current = onScan; }, [onScan]);
 useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
 function accept(text: string) {
   if (!gate.current.accept(text, Date.now())) return;
   setDecoded(text);
   const accepted = callback.current(text);
   setError(accepted === true ? "" : typeof accepted === "string" ? accepted : "لم يُضف الرقم للفاتورة. راجع المنتج والكمية.");
 }
 const acceptRef = useRef(accept);
 useEffect(() => { acceptRef.current = accept; });
 useEffect(() => {
   let cancelled = false;
   let stream: MediaStream | undefined;
   let timer: ReturnType<typeof setTimeout>;
   let frame = 0;
   const reader = new BarcodeReader();
   decoder.current = reader;
   const canvas = document.createElement("canvas");
   const context = canvas.getContext("2d", { willReadFrequently: true });
   async function scanFrame() {
     if (cancelled) return;
     const start = performance.now();
     const source = video.current;
     if (!source || source.readyState < 2 || !context || fileBusy.current || document.hidden) {
       timer = setTimeout(scanFrame, 150); return;
     }
     const full = ++frame % 3 === 0;
     const width = source.videoWidth, height = source.videoHeight;
     const sx = full ? 0 : width * 0.08, sy = full ? 0 : height * 0.2;
     const sw = full ? width : width * 0.84, sh = full ? height : height * 0.6;
     const scale = Math.min(1, 1280 / sw, 960 / sh);
     canvas.width = Math.max(1, Math.round(sw * scale)); canvas.height = Math.max(1, Math.round(sh * scale));
     context.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
     try {
       const results = await reader.read(context.getImageData(0, 0, canvas.width, canvas.height), frame % 2 === 0);
       if (!cancelled) {
         if (results[0]) acceptRef.current(results[0].text);
         else gate.current.absent(Date.now());
       }
     } catch { if (!cancelled) setError("تعذر تحليل إطار الكاميرا. يمكنك تجربة صورة الباركود."); }
     if (!cancelled) timer = setTimeout(scanFrame, Math.max(20, 100 - (performance.now() - start)));
   }
   async function start() {
     try {
       await reader.ready;
       if (cancelled) return;
       setReady(true);
       stream = await navigator.mediaDevices.getUserMedia({video: {
         ...(device ? { deviceId: { exact: device } } : { facingMode: { ideal: "environment" } }),
         width: { ideal: 1920 }, height: { ideal: 1080 }
       }, audio: false});
       if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
       const track = stream.getVideoTracks()[0];
       const caps = track.getCapabilities?.() as MediaTrackCapabilities & {focusMode?: string[]};
       if (caps?.focusMode?.includes("continuous")) await track.applyConstraints({advanced: [{focusMode: "continuous"} as MediaTrackConstraintSet]}).catch(() => undefined);
       if (cancelled) return;
       video.current!.srcObject = stream;
       await video.current!.play();
       if (cancelled) return;
       const inputs = await navigator.mediaDevices.enumerateDevices();
       if (cancelled) return;
       setDevices(inputs.filter(input => input.kind === "videoinput"));
       void scanFrame();
     } catch (fault) {
       if (cancelled) return;
       const error = fault as Error;
       setError(error.name === "NotAllowedError" ? "المتصفح منع الكاميرا. اسمح بها من رمز الكاميرا بجانب عنوان الموقع، أو اختر صورة الباركود أدناه."
         : error.name === "NotFoundError" ? "لم نجد كاميرا. يمكنك اختيار صورة الباركود أو كتابة رقمه في شاشة البيع."
         : error.message.includes("قارئ الباركود") ? error.message : "تعذر تشغيل الكاميرا. أغلق التطبيقات الأخرى التي تستخدمها أو جرّب صورة الباركود.");
     }
   }
   void start();
   return () => { cancelled = true; clearTimeout(timer); stream?.getTracks().forEach(track => track.stop()); reader.close(); decoder.current = null; };
 }, [device]);
 return <div className="stack barcode-camera">
   {devices.length > 1 && <label>الكاميرا<select aria-label="الكاميرا" value={device} onChange={e => {setDevice(e.target.value);setError("");gate.current.reset();}}>
     <option value="">اختيار تلقائي</option>{devices.map((item, i) => <option key={item.deviceId} value={item.deviceId}>{item.label || "كاميرا " + (i + 1)}</option>)}
   </select></label>}
   <div className="camera-preview"><video ref={video} className="camera" muted playsInline /><div className="camera-target" aria-hidden="true" /></div>
   <p>{ready ? "قراءة تلقائية بدون التقاط. ضع الباركود كاملًا داخل الإطار. لقطعة أخرى تحمل الرمز نفسه، أبعده ثانية ثم أعده." : "جارٍ تجهيز قارئ الباركود…"}</p>
   {decoded && <p role="status">الرمز المقروء: <strong dir="ltr">{decoded}</strong></p>}
   {error && <p role="alert" className="error-banner">{error}</p>}
   <label>قراءة باركود من صورة
     <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || !ready} onChange={async e => {
       const file = e.target.files?.[0]; if (!file || !decoder.current) return;
       e.currentTarget.value = "";
       if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {setError("اختر صورة JPG أو PNG أو WebP أصغر من 10 ميغابايت.");return;}
       setBusy(true);fileBusy.current=true;setError("");
       try {
         const image = await createImageBitmap(file);
         const canvas = document.createElement("canvas");
         const scale = Math.min(1, 2400 / Math.max(image.width, image.height));
         canvas.width = Math.max(1,Math.round(image.width*scale));canvas.height = Math.max(1,Math.round(image.height*scale));
         const context=canvas.getContext("2d")!;context.drawImage(image,0,0,canvas.width,canvas.height);image.close();
         if (!mounted.current || !decoder.current) return;
         const results=await decoder.current.read(context.getImageData(0,0,canvas.width,canvas.height),true);
         if (!mounted.current) return;
         if (!results[0]) throw Error();
         gate.current.reset();acceptRef.current(results[0].text);
       } catch { if (mounted.current) setError("لم نتمكن من قراءة الصورة. اختر الصورة الأصلية للباركود كاملة وبوضوح، أو اكتب الرقم يدويًا."); }
       finally { fileBusy.current=false;if (mounted.current) setBusy(false); }
     }} />
   </label>
   {busy && <p role="status">جارٍ قراءة الصورة…</p>}
 </div>;
}
