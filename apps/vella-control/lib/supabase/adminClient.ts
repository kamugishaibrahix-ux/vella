import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
}

if (!serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
}

export function getAdminClient() {
  // Runtime check ensures serviceRoleKey is defined, use non-null assertion for TypeScript
  return createClient(url!, serviceRoleKey!, {
    auth: {
      persistSession: false,
    },
  });
}
