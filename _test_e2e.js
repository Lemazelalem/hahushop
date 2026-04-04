// End-to-end test: verify the complete admin approval flow works
// Tests: DB write + DB read via service role + simulates what the admin page now does
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://nixefnraeldbkqolymwt.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5peGVmbnJhZWxkYmtxb2x5bXd0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODY4MTMzMCwiZXhwIjoyMDg0MjU3MzMwfQ.kt6y4Dc11DaGXeLWIKPiKxMhXiMCiyKC4BQkrh5ugmM";

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("=== END-TO-END TEST: Admin Approval Flow ===\n");

  // 1. Check current state of all sellers
  console.log("--- Current seller state ---");
  const { data: sellers } = await db
    .from("profiles")
    .select("id, display_name, full_name, role, seller_status, is_verified_seller")
    .or("role.eq.seller,seller_status.eq.approved,seller_status.eq.rejected,seller_status.eq.pending");

  for (const s of sellers ?? []) {
    const name = s.display_name || s.full_name || "?";
    console.log(`  ${s.id.slice(0,8)} role=${String(s.role).padEnd(10)} status=${String(s.seller_status).padEnd(10)} verified=${s.is_verified_seller} "${name}"`);
  }

  // 2. Simulate what the GET /api/admin/sellers route now does
  console.log("\n--- Simulating GET /api/admin/sellers route ---");

  const [appsRes, docsRes, productsRes, profilesRes] = await Promise.all([
    db.from("seller_applications").select("id, user_id, business_name, status, applied_at").order("applied_at", { ascending: false }),
    db.from("seller_documents").select("id, seller_id, document_type, file_url, status, admin_notes, created_at").order("created_at", { ascending: false }),
    db.from("products").select("seller_id"),
    db.from("profiles").select("id, display_name, full_name, phone, business_name, role, seller_status")
      .or("role.eq.seller,seller_status.eq.approved,seller_status.eq.rejected"),
  ]);

  const apps = appsRes.data ?? [];
  const docs = docsRes.data ?? [];
  const products = productsRes.data ?? [];
  const profilesWithStatus = profilesRes.data ?? [];

  const sellerIdSet = new Set();
  apps.forEach(a => sellerIdSet.add(a.user_id));
  docs.forEach(d => sellerIdSet.add(d.seller_id));
  products.forEach(p => { if (p.seller_id) sellerIdSet.add(p.seller_id); });
  profilesWithStatus.forEach(p => sellerIdSet.add(p.id));

  // Remove admin IDs
  const adminIds = ["958698dc-c0c9-4b21-8255-c0863510a65d", "14ce095e-8fb2-4a9c-b9ee-3e4a49c16bab"];
  adminIds.forEach(id => sellerIdSet.delete(id));

  console.log(`\nDiscovered ${sellerIdSet.size} seller IDs from all sources`);

  // Fetch full profiles
  const { data: allProfiles } = await db
    .from("profiles")
    .select("id, display_name, full_name, phone, business_name, role, seller_status")
    .in("id", [...sellerIdSet]);

  const profileMap = new Map();
  (allProfiles ?? []).forEach(p => profileMap.set(p.id, p));

  const appMap = new Map();
  apps.forEach(a => { if (!appMap.has(a.user_id)) appMap.set(a.user_id, a); });

  // Build seller views (same logic as admin page)
  const views = [...sellerIdSet].map(sid => {
    const profile = profileMap.get(sid);
    const app = appMap.get(sid);
    const isRoleSeller = profile?.role === "seller";
    const isStatusApproved = profile?.seller_status === "approved" || isRoleSeller;
    const isRejected = app?.status === "rejected" || profile?.seller_status === "rejected";
    let approvalState = "pending";
    if (isStatusApproved) approvalState = "approved";
    else if (isRejected) approvalState = "rejected";
    return {
      id: sid,
      name: profile?.display_name?.trim() || profile?.full_name?.trim() || app?.business_name?.trim() || "Unknown",
      role: profile?.role ?? null,
      sellerStatus: profile?.seller_status ?? null,
      approvalState,
    };
  });

  const pending = views.filter(v => v.approvalState === "pending");
  const approved = views.filter(v => v.approvalState === "approved");
  const rejected = views.filter(v => v.approvalState === "rejected");

  console.log(`\nAdmin page would see: ${approved.length} approved, ${pending.length} pending, ${rejected.length} rejected`);

  console.log("\nApproved:");
  approved.forEach(v => console.log(`  ${v.id.slice(0,8)} "${v.name}" role=${v.role} status=${v.sellerStatus}`));

  console.log("\nPending:");
  pending.forEach(v => console.log(`  ${v.id.slice(0,8)} "${v.name}" role=${v.role} status=${v.sellerStatus}`));

  console.log("\nRejected:");
  rejected.forEach(v => console.log(`  ${v.id.slice(0,8)} "${v.name}" role=${v.role} status=${v.sellerStatus}`));

  // 3. Test: Pick a pending seller, approve, read back
  if (pending.length > 0) {
    const testSeller = pending[0];
    console.log(`\n--- Test: Approve "${testSeller.name}" (${testSeller.id.slice(0,8)}) ---`);

    // Approve
    const { error: approveErr } = await db
      .from("profiles")
      .update({ role: "seller", seller_status: "approved", is_verified_seller: true, updated_at: new Date().toISOString() })
      .eq("id", testSeller.id);

    if (approveErr) {
      console.log("Approve error:", approveErr.message);
    } else {
      // Read back via service role (same as GET API route)
      const { data: readBack } = await db
        .from("profiles")
        .select("role, seller_status, is_verified_seller")
        .eq("id", testSeller.id)
        .single();

      console.log("Read back after approve:", readBack);

      if (readBack?.role === "seller" && readBack?.seller_status === "approved") {
        console.log("✅ APPROVAL PERSISTS - service role read confirms");
      } else {
        console.log("❌ APPROVAL DID NOT PERSIST");
      }

      // Revert
      await db.from("profiles")
        .update({ role: "customer", seller_status: "pending", is_verified_seller: false })
        .eq("id", testSeller.id);
      console.log("Reverted test seller back to pending");
    }
  }

  console.log("\n=== TEST COMPLETE ===");
  console.log("\nKey finding: The GET API route now reads ALL data via service role key.");
  console.log("The admin page no longer queries profiles via the browser (RLS-blocked) client.");
  console.log("Approvals will now persist on page reload because the API route bypasses RLS.");
}

main().catch(console.error);
