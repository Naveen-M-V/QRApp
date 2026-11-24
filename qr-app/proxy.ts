import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Server-side access check for every request (Next.js 16 "proxy", formerly middleware).
 *
 * Public:  /login, the student form pages (/f/...), and the student form API (/api/forms/...).
 * Everything else requires a signed-in Supabase user. Which data that user can actually read
 * or change is enforced by the database's row-level security (admins only).
 */
const PUBLIC_PATHS = [/^\/login\/?$/, /^\/f\/[^/]+\/?$/, /^\/api\/forms\/[^/]+(\/submit)?\/?$/];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Without Supabase there is no server-side data or sign-in; the app runs on browser storage only.
  if (!supabaseUrl || !supabaseKey) return NextResponse.next();

  if (PUBLIC_PATHS.some((re) => re.test(pathname))) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Refreshed session tokens must reach both this request and the browser
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  // Everything except Next.js build assets and images. Documents in /public (PDF, HTML) stay protected.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
