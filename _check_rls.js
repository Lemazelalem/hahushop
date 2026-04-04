// Check RLS policies and database triggers on profiles table
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://nixefnraeldbkqolymwt.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5peGVmbnJhZWxkYmtxb2x5bXd0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODY4MTMzMCwiZXhwIjoyMDg0MjU3MzMwfQ.kt6y4Dc11DaGXeLWIKPiKxMhXiMCiyKC4BQkrh5ugmM";

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // 1. Check RLS policies on profiles table
  console.log("=== RLS Policies on 'profiles' table ===\n");
  
  const { data: policies, error: polErr } = await db.rpc("exec_sql", {
    query: `
      SELECT policyname, cmd, qual, with_check
      FROM pg_policies
      WHERE tablename = 'profiles'
      ORDER BY policyname
    `
  });
  
  if (polErr) {
    console.log("Cannot query pg_policies via rpc:", polErr.message);
    
    // Try alternative: query from pg_catalog directly
    const { data: policies2, error: polErr2 } = await db
      .from("pg_policies")
      .select("*")
      .eq("tablename", "profiles");
    
    if (polErr2) {
      console.log("Cannot query pg_policies via REST either:", polErr2.message);
    } else {
      console.log("Policies:", JSON.stringify(policies2, null, 2));
    }
  } else {
    console.log("Policies:", JSON.stringify(policies, null, 2));
  }

  // 2. Check triggers on profiles table
  console.log("\n=== Triggers on 'profiles' table ===\n");
  
  const { data: triggers, error: trigErr } = await db.rpc("exec_sql", {
    query: `
      SELECT tgname, tgtype, tgenabled, 
             pg_get_triggerdef(oid) as definition
      FROM pg_trigger
      WHERE tgrelid = 'public.profiles'::regclass
      AND NOT tgisinternal
    `
  });
  
  if (trigErr) {
    console.log("Cannot query triggers via rpc:", trigErr.message);
  } else {
    console.log("Triggers:", JSON.stringify(triggers, null, 2));
  }

  // 3. Check the profiles table definition
  console.log("\n=== Profiles table columns ===\n");
  
  const { data: columns, error: colErr } = await db.rpc("exec_sql", {
    query: `
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'profiles' AND table_schema = 'public'
      ORDER BY ordinal_position
    `
  });
  
  if (colErr) {
    console.log("Cannot query columns via rpc:", colErr.message);
  } else {
    console.log("Columns:", JSON.stringify(columns, null, 2));
  }

  // 4. Check if RLS is enabled on profiles
  console.log("\n=== RLS enabled check ===\n");
  
  const { data: rlsCheck, error: rlsErr } = await db.rpc("exec_sql", {
    query: `
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE relname = 'profiles' AND relnamespace = 'public'::regnamespace
    `
  });
  
  if (rlsErr) {
    console.log("Cannot check RLS status via rpc:", rlsErr.message);
  } else {
    console.log("RLS status:", JSON.stringify(rlsCheck, null, 2));
  }

  // 5. Check column defaults (especially seller_status)
  console.log("\n=== Column defaults for seller_status and role ===\n");
  
  // Check if there's a default value for seller_status
  const { data: defaults, error: defErr } = await db.rpc("exec_sql", {
    query: `
      SELECT column_name, column_default
      FROM information_schema.columns
      WHERE table_name = 'profiles' 
        AND table_schema = 'public'
        AND column_name IN ('role', 'seller_status', 'is_verified_seller')
    `
  });
  
  if (defErr) {
    console.log("Cannot check defaults via rpc:", defErr.message);
  } else {
    console.log("Defaults:", JSON.stringify(defaults, null, 2));
  }
}

main().catch(console.error);
