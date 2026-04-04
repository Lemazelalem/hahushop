// Clean up stale seller_status='pending' on profiles that are NOT actual seller applicants.
// These are regular customers whose profiles got seller_status='pending' from earlier code.
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://nixefnraeldbkqolymwt.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5peGVmbnJhZWxkYmtxb2x5bXd0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODY4MTMzMCwiZXhwIjoyMDg0MjU3MzMwfQ.kt6y4Dc11DaGXeLWIKPiKxMhXiMCiyKC4BQkrh5ugmM";

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // 1) Get all profiles with seller_status='pending' and role='customer'
  const { data: pendingCustomers, error: err1 } = await db
    .from("profiles")
    .select("id, display_name, full_name, role, seller_status")
    .eq("seller_status", "pending")
    .eq("role", "customer");

  if (err1) { console.error("Query error:", err1); return; }
  console.log(`Found ${pendingCustomers.length} customers with seller_status=pending`);

  // 2) Get all seller_application user IDs (actual applicants)
  const { data: apps } = await db
    .from("seller_applications")
    .select("user_id");
  const applicantIds = new Set((apps ?? []).map(a => a.user_id));

  // 3) Get all seller_document user IDs
  const { data: docs } = await db
    .from("seller_documents")
    .select("seller_id");
  const docIds = new Set((docs ?? []).map(d => d.seller_id));

  // 4) Get all product seller IDs
  const { data: prods } = await db
    .from("products")
    .select("seller_id");
  const prodIds = new Set((prods ?? []).map(p => p.seller_id).filter(Boolean));

  // 5) Find customers with pending status who are NOT actual applicants
  const staleIds = [];
  const keepIds = [];
  for (const p of pendingCustomers) {
    const isApplicant = applicantIds.has(p.id) || docIds.has(p.id) || prodIds.has(p.id);
    if (isApplicant) {
      keepIds.push(p.id);
      console.log(`  KEEP: ${p.id.slice(0,8)} "${p.display_name || p.full_name || '?'}" (has application/docs/products)`);
    } else {
      staleIds.push(p.id);
      console.log(`  STALE: ${p.id.slice(0,8)} "${p.display_name || p.full_name || '?'}" (no application/docs/products)`);
    }
  }

  console.log(`\nStale: ${staleIds.length}, Keep: ${keepIds.length}`);

  if (staleIds.length === 0) {
    console.log("Nothing to clean up.");
    return;
  }

  // 6) Clear seller_status for stale profiles
  const { error: updateErr, data: updateData } = await db
    .from("profiles")
    .update({ seller_status: null })
    .in("id", staleIds)
    .select("id");

  if (updateErr) {
    console.error("Update error:", updateErr);
  } else {
    console.log(`\n✅ Cleaned ${updateData?.length ?? 0} stale profiles (seller_status set to null)`);
  }
}

main().catch(console.error);
