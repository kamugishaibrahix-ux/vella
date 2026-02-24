MOBILE/package.json
PATCH:
--- a/MOBILE/package.json
+++ b/MOBILE/package.json
@@ -14,7 +14,7 @@
   },
   "dependencies": {
-    "@supabase/auth-helpers-nextjs": "^0.10.0",
+    "@supabase/ssr": "^0.4.0",
     "@supabase/supabase-js": "^2.47.10",
     "clsx": "^2.1.1",
     "framer-motion": "^12.23.24",

MOBILE/lib/supabase/server.ts
PATCH:
--- /dev/null
+++ b/MOBILE/lib/supabase/server.ts
@@ -0,0 +1,30 @@
+"use server";
+
+import { createServerClient } from "@supabase/ssr";
+import { cookies } from "next/headers";
+import type { Database } from "@/lib/supabase/types";
+
+export function createSupabaseServerClient() {
+  const cookieStore = cookies();
+
+  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
+  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
+
+  if (!supabaseUrl || !supabaseAnonKey) {
+    throw new Error(
+      "[supabase/server] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
+    );
+  }
+
+  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
+    cookies: {
+      getAll() {
+        return cookieStore.getAll();
+      },
+      setAll(cookiesToSet) {
+        try {
+          cookiesToSet.forEach(({ name, value, options }) =>
+            cookieStore.set(name, value, options)
+          );
+        } catch {
+          // The `setAll` method was called from a Server Component.
+          // This can be ignored if you have middleware refreshing
+          // user sessions.
+        }
+      },
+    },
+  });
+}

MOBILE/middleware.ts
PATCH:
--- a/MOBILE/middleware.ts
+++ b/MOBILE/middleware.ts
@@ -1,25 +1,42 @@
-import { NextResponse } from "next/server";
-import type { NextRequest } from "next/server";
+import { createServerClient } from "@supabase/ssr";
+import { NextResponse } from "next/server";
+import type { NextRequest } from "next/server";
 
-const PUBLIC_PATHS = ["/onboarding", "/pricing", "/manifest", "/favicon", "/icons", "/api"];
+const PUBLIC_PATHS = ["/onboarding", "/pricing", "/manifest", "/favicon", "/icons"];
 
 export function middleware(request: NextRequest) {
   const { pathname } = request.nextUrl;
 
   const isStaticAsset = pathname.startsWith("/_next") || pathname.startsWith("/static");
   const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));
 
   if (isStaticAsset || isPublic) {
     return NextResponse.next();
   }
 
+  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
+  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
+
+  if (!supabaseUrl || !supabaseAnonKey) {
+    return NextResponse.next();
+  }
+
+  const response = NextResponse.next({
+    request: {
+      headers: request.headers,
+    },
+  });
+
+  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
+    cookies: {
+      getAll() {
+        return request.cookies.getAll();
+      },
+      setAll(cookiesToSet) {
+        cookiesToSet.forEach(({ name, value, options }) => {
+          response.cookies.set(name, value, options);
+        });
+      },
+    },
+  });
+
+  // Refresh session to ensure cookies are up to date
+  await supabase.auth.getUser();
+
   const onboarded = request.cookies.get("vella_onboarded")?.value === "true";
   if (!onboarded) {
     const url = request.nextUrl.clone();
     url.pathname = "/onboarding/name";
     url.search = "";
-    return NextResponse.redirect(url);
+    return NextResponse.redirect(url, {
+      headers: response.headers,
+    });
   }
 
-  return NextResponse.next();
+  return response;
 }
 
 export const config = {
   matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
 };

MOBILE/lib/auth/getServerUser.ts
PATCH:
--- a/MOBILE/lib/auth/getServerUser.ts
+++ b/MOBILE/lib/auth/getServerUser.ts
@@ -1,37 +1,12 @@
 "use server";
 
-import { cookies } from "next/headers";
-import { supabaseAdmin } from "@/lib/supabase/admin";
-
-type AuthCookiePayload = {
-  access_token?: string;
-  refresh_token?: string;
-};
+import { createSupabaseServerClient } from "@/lib/supabase/server";
 
 export async function getAuthenticatedUserId(): Promise<string | null> {
-  if (!supabaseAdmin) return null;
-  const cookieStore = cookies();
-  const authCookie = cookieStore
-    .getAll()
-    .find((entry) => entry.name.startsWith("sb-") && entry.name.endsWith("-auth-token"));
-  if (!authCookie?.value) {
+  try {
+    const supabase = createSupabaseServerClient();
+    const { data, error } = await supabase.auth.getUser();
+    if (error || !data?.user) {
+      return null;
+    }
+    return data.user.id;
+  } catch (error) {
+    console.error("[auth] Failed to get authenticated user", error);
     return null;
   }
-
-  try {
-    const decoded = decodeURIComponent(authCookie.value);
-    const payload: AuthCookiePayload = JSON.parse(decoded);
-    if (!payload?.access_token) {
-      return null;
-    }
-
-    const { data, error } = await supabaseAdmin.auth.getUser(payload.access_token);
-    if (error || !data?.user) {
-      return null;
-    }
-    return data.user.id;
-  } catch (error) {
-    console.error("[auth] Failed to parse auth cookie", error);
-    return null;
-  }
 }

MOBILE/lib/auth/ensureVellaSessionServer.ts
PATCH:
--- a/MOBILE/lib/auth/ensureVellaSessionServer.ts
+++ b/MOBILE/lib/auth/ensureVellaSessionServer.ts
@@ -1,55 +1,15 @@
 "use server";
 
-import { cookies } from "next/headers";
-import { createClient } from "@supabase/supabase-js";
-import type { Session } from "@supabase/supabase-js";
+import { createSupabaseServerClient } from "@/lib/supabase/server";
 
 export async function ensureVellaSessionServer(): Promise<{ user: { id: string } } | null> {
   try {
-    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
-    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
-
-    if (!url || !anonKey) {
+    const supabase = createSupabaseServerClient();
+    const { data, error } = await supabase.auth.getUser();
+    if (error || !data?.user) {
       return null;
     }
-
-    // Create a server-side Supabase client
-    const supabase = createClient(url, anonKey, {
-      auth: {
-        persistSession: false,
-      },
-    });
-
-    // Try to get existing session from cookies
-    const cookieStore = cookies();
-    const sessionCookie = cookieStore
-      .getAll()
-      .find((entry) => entry.name.startsWith("sb-") && entry.name.endsWith("-auth-token"));
-
-    if (sessionCookie?.value) {
-      try {
-        const decoded = decodeURIComponent(sessionCookie.value);
-        const payload = JSON.parse(decoded);
-        if (payload?.access_token) {
-          const { data, error } = await supabase.auth.getUser(payload.access_token);
-          if (!error && data?.user) {
-            return { user: { id: data.user.id } };
-          }
-        }
-      } catch (err) {
-        // Cookie parsing failed, continue to anonymous auth
-      }
-    }
-
-    // No existing session - attempt anonymous sign-in
-    const { data, error } = await supabase.auth.signInAnonymously();
-    if (error || !data?.session?.user) {
-      return null;
-    }
-
-    return { user: { id: data.session.user.id } };
+    return { user: { id: data.user.id } };
   } catch (error) {
     console.error("[ensureVellaSessionServer] Error:", error);
     return null;
   }
 }

