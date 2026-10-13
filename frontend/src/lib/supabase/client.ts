import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

// Browser client: signs in, stores the session in cookies, refreshes tokens.
export function createClient() {
  return createBrowserClient(env.supabaseUrl, env.supabaseKey);
}
