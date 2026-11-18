"use client";
import { useState } from "react";
import { Mail, ArrowRight } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Button } from "./ui/button";
export function AccountForm({ onSuccess }: { onSuccess: () => void }) {
  const [step, setStep] = useState<"email" | "code" | "password">("email");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function sendCode() {
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "sign-in",
    });
    if (error)
      throw Error(error.code==='INVALID_ORIGIN'?'تسجيل الدخول غير مفعّل لهذا الرابط بعد. تواصل مع مسؤول المتجر.':"تعذر إرسال الرمز الآن. تحقق من البريد وحاول مجددًا.");
    setStep("code");
    setMessage(
      "أرسلنا رمز الدخول إلى بريدك. استخدم آخر رمز يصلك وتحقق من البريد غير الهام أيضًا.",
    );
  }
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setMessage("");
        const form = new FormData(e.currentTarget);
        try {
          if (step === "email") {
            await sendCode();
            return;
          }
          const result =
            step === "code"
              ? await authClient.signIn.emailOtp({
                  email,
                  otp: String(form.get("code")).trim(),
                })
              : await authClient.signIn.email({
                  email,
                  password: String(form.get("password")),
                });
          if (result.error)
            throw Error(
              step === "code"
                ? "الرمز غير صحيح أو انتهت صلاحيته. أعد إرسال الرمز وحاول مجددًا."
                : "البريد أو كلمة المرور غير صحيحين.",
            );
          onSuccess();
        } catch (error) {
          setMessage((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="auth-intro">
        <span>
          <Mail size={23} />
        </span>
        <h3>{step === "code" ? "أدخل رمز الدخول" : "دخول آمن لحساب najd"}</h3>
        <p>
          {step === "code"
            ? "الرمز يصلك إلى بريدك، ولا تشاركه مع أي شخص."
            : "أدخل بريدك وسنرسل لك رمزًا. لا تحتاج إلى إنشاء كلمة مرور للبدء."}
        </p>
      </div>
      <label>
        البريد الإلكتروني
        <input
          name="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          readOnly={step === "code"}
          autoFocus={step !== "code"}
        />
      </label>
      {step === "code" && (
        <label>
          رمز الدخول
          <input
            name="code"
            type="text"
            dir="ltr"
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            minLength={6}
            maxLength={6}
            required
            autoFocus
            placeholder="000000"
            className="otp-input"
          />
        </label>
      )}
      {step === "password" && (
        <label>
          كلمة المرور
          <input
            name="password"
            type="password"
            dir="ltr"
            autoComplete="current-password"
            required
          />
        </label>
      )}
      {message && (
        <p role="status" className="auth-message">
          {message}
        </p>
      )}
      <Button disabled={busy}>
        {busy
          ? "لحظة من فضلك…"
          : step === "email"
            ? "إرسال رمز إلى البريد"
            : step === "code"
              ? "تأكيد الرمز والدخول"
              : "تسجيل الدخول"}
      </Button>
      {step === "code" ? (
        <div className="auth-secondary">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setStep("email");
              setMessage("");
            }}
          >
            <ArrowRight size={15} />
            تغيير البريد
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await sendCode();
              } catch (error) {
                setMessage((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            إرسال رمز جديد
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setStep(step === "password" ? "email" : "password");
            setMessage("");
          }}
        >
          {step === "password"
            ? "الدخول برمز يصل إلى البريد"
            : "لديّ كلمة مرور، أريد استخدامها"}
        </Button>
      )}
      <p className="auth-footnote">
        صلاحيات الحساب يحددها مسؤول المتجر؛ إنشاء حساب وحده لا يتيح الوصول إلى
        بيانات الفرعين.
      </p>
    </form>
  );
}
