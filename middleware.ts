import { NextResponse, type NextRequest } from "next/server";

// The hosted demo is for invited reviewers only. Every page and API route
// sits behind a username and password (the browser's standard sign-in box).
// Set DEMO_USER and DEMO_PASSWORD on Vercel. If HOSTED is on but either is
// missing, everything stays locked. On Mike's laptop HOSTED is unset and this
// does nothing.
//
// Public paths (the landing page, its sign-up form and its assets) are listed in PUBLIC.

const PUBLIC = [/^\/$/, /^\/api\/waitlist$/, /^\/favicon\.ico$/, /^\/_next\//];

export function middleware(req: NextRequest) {
  if (process.env.HOSTED !== "true") return NextResponse.next();
  if (PUBLIC.some((p) => p.test(req.nextUrl.pathname))) return NextResponse.next();

  const user = process.env.DEMO_USER;
  const password = process.env.DEMO_PASSWORD;
  if (user && password && credentialsMatch(req.headers.get("authorization"), user, password)) {
    return NextResponse.next();
  }
  return new NextResponse("Sign in to see the 1City demo.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="1City demo", charset="UTF-8"' },
  });
}

function credentialsMatch(header: string | null, user: string, password: string) {
  if (!header?.startsWith("Basic ")) return false;
  let decoded = "";
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false;
  }
  const i = decoded.indexOf(":");
  return i > 0 && sameText(decoded.slice(0, i), user) && sameText(decoded.slice(i + 1), password);
}

/** Compare without stopping at the first wrong character. */
function sameText(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export const config = { matcher: "/:path*" };
