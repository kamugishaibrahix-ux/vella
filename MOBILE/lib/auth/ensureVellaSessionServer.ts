import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

export async function ensureVellaSessionServer() {
  const supabase = createServerComponentClient({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Local-first: no anonymous sign-in. Return null if no session exists.
  return session ?? null;
}
