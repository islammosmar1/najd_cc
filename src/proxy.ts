import { NextResponse, type NextRequest } from "next/server";
// Every API verifies Neon Auth and PostgreSQL RLS. Public onboarding stays open.
export function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
