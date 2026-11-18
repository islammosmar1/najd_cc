import type { Metadata } from "next";
import "./globals.css";
import "./daily.css";
export const metadata: Metadata = {
  title: "najd POS | إدارة فروعك بذكاء",
  description: "نظام إدارة المبيعات والمخزون متعدد الفروع",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
