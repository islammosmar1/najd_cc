"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="setup">
      <h1>تعذر تحميل الصفحة</h1>
      <p>تحقق من الاتصال وحاول مجددًا. لم يتم تأكيد أي عملية جديدة.</p>
      <button className="btn btn-primary" onClick={reset}>
        إعادة المحاولة
      </button>
    </main>
  );
}
