"use client";
import { useState } from "react";
import { Mail, ArrowRight } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Button } from "./ui/button";
type Step = "email" | "code" | "password" | "reset" | "reset-code";
function authMessage(error:unknown,step:Step) {
 const message=error instanceof Error ? error.message : "";
 if (/[\u0600-\u06ff]/.test(message)) return message;
 if(step === "reset-code") return "تعذر تعيين كلمة المرور. تأكد من الرمز وصلاحيته ثم حاول مجددًا.";
 if(step === "code") return "الرمز غير صحيح أو انتهت صلاحيته. أعد إرساله وحاول مجددًا.";
 if(step === "password") return "البريد أو كلمة المرور غير صحيحين. حاول مجددًا أو عيّن كلمة مرور.";
 return "تعذر إرسال الرمز. تحقق من البريد وحاول مجددًا.";
}
export function AccountForm({ onSuccess, initialReset=false, initialEmail="" }: { onSuccess: () => void; initialReset?: boolean; initialEmail?: string }) {
 const [step,setStep]=useState<Step>(initialReset ? "reset" : "password");
 const [email,setEmail]=useState(initialEmail);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const resetting=step === "reset" || step === "reset-code";
 const coded=step === "code" || step === "reset-code";
 async function sendCode(reset: boolean) {
   const {error}=await authClient.emailOtp.sendVerificationOtp({email,type:reset ? "forget-password" : "sign-in"});
   if(error) throw Error(error.code === "TOO_MANY_ATTEMPTS" ? "محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا." : "تعذر إرسال الرمز. تحقق من البريد وحاول مجددًا.");
   setStep(reset ? "reset-code" : "code");
   setMessage(reset ? "أرسلنا رمز تعيين كلمة المرور إلى بريدك. أدخله هنا مع كلمة المرور الجديدة." : "أرسلنا رمز الدخول إلى بريدك. تحقق من البريد غير الهام أيضًا.");
 }
 return <form className="stack" onSubmit={async e=>{
   e.preventDefault();if(busy)return;setBusy(true);setMessage("");
   const element=e.currentTarget;
   const fields=new FormData(element);
   try {
     if(step === "email" || step === "reset") { await sendCode(step === "reset");return; }
     if(step === "reset-code") {
       const password=String(fields.get("new-password"));
       if(password !== String(fields.get("confirm-password"))) throw Error("كلمتا المرور غير متطابقتين.");
       const {error}=await authClient.emailOtp.resetPassword({email,otp:String(fields.get("code")).trim(),password});
       if(error) throw Error("تعذر تعيين كلمة المرور. تأكد من الرمز وصلاحيته ثم حاول مجددًا.");
       element.reset();
       try {
         const signed=await authClient.signIn.email({email,password});
         if(signed.error) throw Error();
       } catch {setStep("password");setMessage("تم حفظ كلمة المرور. سجّل الدخول باستخدامها الآن.");return;}
       onSuccess();return;
     }
     const result=step === "code" ? await authClient.signIn.emailOtp({email,otp:String(fields.get("code")).trim()}) : await authClient.signIn.email({email,password:String(fields.get("password"))});
     if(result.error)throw Error(step === "code" ? "الرمز غير صحيح أو انتهت صلاحيته. أعد إرساله وحاول مجددًا." : "البريد أو كلمة المرور غير صحيحين. يمكنك تعيين كلمة مرور من الزر أدناه.");
     element.reset();onSuccess();
   } catch(error) {setMessage(authMessage(error,step));}
   finally {setBusy(false);}
 }}>
   <div className="auth-intro"><span><Mail size={23}/></span>
     <h3>{resetting ? "تعيين كلمة المرور" : coded ? "أدخل رمز الدخول" : "دخول آمن لحساب najd"}</h3>
     <p>{resetting ? "نؤكد ملكية بريدك برمز قبل حفظ كلمة المرور. أدخل الرمز داخل الموقع فقط." : step === "password" ? "ادخل ببريدك وكلمة المرور، أو استخدم رمز البريد." : "الرمز يصلك إلى بريدك، ولا تشاركه مع أي شخص."}</p>
   </div>
   <label>البريد الإلكتروني<input name="email" type="email" dir="ltr" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required readOnly={coded} autoFocus={!coded}/></label>
   {coded && <label>رمز الدخول<input name="code" type="text" dir="ltr" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoFocus placeholder="000000" className="otp-input"/></label>}
   {step === "password" && <label>كلمة المرور<input name="password" type="password" dir="ltr" autoComplete="current-password" required/></label>}
   {step === "reset-code" && <>
     <label>كلمة المرور الجديدة<input name="new-password" type="password" dir="ltr" autoComplete="new-password" minLength={8} maxLength={128} required/></label>
     <label>تأكيد كلمة المرور<input name="confirm-password" type="password" dir="ltr" autoComplete="new-password" minLength={8} maxLength={128} required/></label>
   </>}
   {message && <p role="status" className="auth-message">{message}</p>}
   <Button disabled={busy}>{busy ? "لحظة من فضلك…" : step === "reset" ? "إرسال رمز تعيين كلمة المرور" : step === "reset-code" ? "حفظ كلمة المرور والدخول" : step === "email" ? "إرسال رمز إلى البريد" : step === "code" ? "تأكيد الرمز والدخول" : "تسجيل الدخول"}</Button>
   {coded ? <div className="auth-secondary">
     <Button type="button" variant="ghost" disabled={busy} onClick={()=>{setStep(resetting ? "reset" : "email");setMessage("");}}><ArrowRight size={15}/>تغيير البريد</Button>
     <Button type="button" variant="ghost" disabled={busy} onClick={async()=>{setBusy(true);try{await sendCode(resetting);}catch(error){setMessage(authMessage(error,resetting ? "reset" : "email"));}finally{setBusy(false);}}}>إرسال رمز جديد</Button>
   </div> : <>
     <Button type="button" variant="ghost" disabled={busy} onClick={()=>{setStep(step === "email" ? "password" : "email");setMessage("");}}>{step === "email" ? "لديّ كلمة مرور، أريد استخدامها" : "الدخول برمز يصل إلى البريد"}</Button>
     <Button type="button" variant="outline" disabled={busy} onClick={()=>{setStep(resetting ? "password" : "reset");setMessage("");}}>{resetting ? "العودة لتسجيل الدخول" : "تعيين أو تغيير كلمة المرور"}</Button>
   </>}
   <p className="auth-footnote">صلاحيات الحساب يحددها مسؤول المتجر؛ إنشاء حساب وحده لا يتيح الوصول إلى بيانات الفرعين.</p>
 </form>;
}
