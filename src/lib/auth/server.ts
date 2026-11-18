import "server-only";
import { createNeonAuth } from "@neon/auth/next/server";
let instance: ReturnType<typeof createNeonAuth> | undefined;
export function neonAuth() {
  if (!process.env.NEON_AUTH_BASE_URL || !process.env.NEON_AUTH_COOKIE_SECRET)
    throw Error("تسجيل الدخول غير مفعّل بعد");
  return (instance ??= createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL,
    cookies: {
      secret: process.env.NEON_AUTH_COOKIE_SECRET,
      sessionDataTtl: 30,
    },
  }));
}
