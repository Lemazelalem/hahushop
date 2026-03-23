// lib/supabaseClient.ts
// Uses @supabase/ssr so the session is stored in cookies (readable by middleware)
// rather than only in localStorage. Drop-in replacement — all imports unchanged.
import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// This client is for the BROWSER (client components like Header, login, etc.)
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);