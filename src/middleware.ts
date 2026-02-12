import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // API cron routes - verify cron secret
  if (request.nextUrl.pathname.startsWith("/api/cron/")) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/cron/:path*"],
};
