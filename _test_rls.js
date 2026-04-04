// Test what an authenticated admin sees when reading profiles via anon key
// Uses service role to generate a token for admin, then tests with anon key
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://nixefnraeldbkqolymwt.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5peGVmbnJhZWxkYmtxb2x5bXd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODEzMzAsImV4cCI6MjA4NDI1NzMzMH0.Vr1vskigkpSm4l7Yl8ZFQb8seWw1OGpZ9SQhoptH9vk";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5peGVmbnJhZWxkYmtxb2x5bXd0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODY4MTMzMCwiZXhwIjoyMDg0MjU3MzMwfQ.kt6y4Dc11DaGXeLWIKPiKxMhXiMCiyKC4BQkrh5ugmM";

// Admin user IDs from the diagnostic
const ADMIN_IDS = ["958698dc", "14ce095e"];

const adminDb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // Get full admin user ID
  const { data: adminProfile } = await adminDb
    .from("profiles")
    .select("id, display_name, role")
    .eq("role", "admin")
    .limit(1)
    .single();
  
  if (!adminProfile) {
    console.log("No admin found!");
    return;
  }
  
  console.log("Admin:", adminProfile.id, adminProfile.display_name);
  
  // Generate a magic link / OTP for the admin to get their JWT
  // Actually, let's use the admin API to get the user and generate a session
  const { data: adminUser, error: userErr } = await adminDb.auth.admin.getUserById(adminProfile.id);
  
  if (userErr) {
    console.log("Cannot get admin user:", userErr.message);
  } else {
    console.log("Admin user email:", adminUser.user?.email);
  }
  
  // Use generateLink to create a session for the admin
  const { data: linkData, error: linkErr } = await adminDb.auth.admin.generateLink({
    type: "magiclink",
    email: adminUser.user?.email,
  });
  
  if (linkErr) {
    console.log("Cannot generate link:", linkErr.message);
  } else {
    // The link data contains a hashed_token we can exchange
    console.log("Link data properties:", linkData?.properties);
  }

  // Simpler approach: test with anon key + admin JWT
  // The admin's access token would be in the browser cookies
  // Let's check what the profiles SELECT RLS looks like by testing different queries

  console.log("\n=== Test 1: Anon key + no auth — read all profiles ===");
  const anonDb = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  
  const { data: anonAll, error: anonAllErr, count: anonCount } = await anonDb
    .from("profiles")
    .select("id, role, seller_status", { count: "exact" });
  
  console.log("Anon (no auth) profiles count:", anonAll?.length ?? 0, "error:", anonAllErr?.message ?? "none");

  console.log("\n=== Test 2: Service role — count profiles in admin page query ===");
  const { data: svcAll, count: svcCount } = await adminDb
    .from("profiles")
    .select("id, display_name, full_name, phone, business_name, role, seller_status", { count: "exact" })
    .or("role.eq.seller,seller_status.eq.pending,seller_status.eq.approved,seller_status.eq.rejected");
  
  console.log("Service role matched profiles:", svcAll?.length, "count:", svcCount);
  
  // Show what the admin page would see
  const sellerIds = svcAll?.map(p => p.id) ?? [];
  console.log("\n=== Test 3: Service role — the exact admin page query ===");
  console.log("Seller IDs to query:", sellerIds.length);
  
  const { data: svcProfiles } = await adminDb
    .from("profiles")
    .select("id, display_name, full_name, phone, business_name, role, seller_status")
    .in("id", sellerIds);
  
  const approvedCount = svcProfiles?.filter(p => p.role === "seller" || p.seller_status === "approved").length ?? 0;
  const pendingCount = svcProfiles?.filter(p => p.seller_status === "pending" && p.role !== "seller").length ?? 0;
  const rejectedCount = svcProfiles?.filter(p => p.seller_status === "rejected").length ?? 0;
  
  console.log(`Approved: ${approvedCount}, Pending: ${pendingCount}, Rejected: ${rejectedCount}`);
  
  // Show the approved sellers
  console.log("\nApproved sellers:");
  svcProfiles?.filter(p => p.role === "seller" || p.seller_status === "approved").forEach(p => {
    console.log(`  ${p.id.slice(0,8)} role=${p.role} status=${p.seller_status} name="${p.display_name || p.full_name || '?'}"`);
  });

  // Now the key question: does the anon key (no auth) see the same data?
  console.log("\n=== Test 4: Compare anon vs service role for a SPECIFIC approved seller ===");
  
  // Pick an approved seller
  const approvedSeller = svcProfiles?.find(p => p.role === "seller" && p.seller_status === "approved");
  if (approvedSeller) {
    console.log(`Testing with approved seller: ${approvedSeller.id.slice(0,8)} (${approvedSeller.display_name || approvedSeller.full_name})`);
    
    // Service role read
    const { data: svcRead } = await adminDb
      .from("profiles")
      .select("role, seller_status")
      .eq("id", approvedSeller.id)
      .maybeSingle();
    console.log("Service role read:", svcRead);
    
    // Anon key read (no auth)
    const { data: anonRead, error: anonReadErr } = await anonDb
      .from("profiles")
      .select("role, seller_status")
      .eq("id", approvedSeller.id)
      .maybeSingle();
    console.log("Anon key read:", anonRead, "error:", anonReadErr?.message ?? "none");
    
    if (!anonRead && !anonReadErr) {
      console.log("\n🔴 CONFIRMED: Anon key returns NULL for approved seller (RLS blocks read)");
      console.log("   But error is null — this means the query succeeds but returns 0 rows.");
      console.log("   The admin page (browser client) IS authenticated, so auth.uid() is set.");
      console.log("   If RLS policy is 'auth.uid() = id' (own profile only), admin CANNOT read others.");
      console.log("   HOWEVER — the admin page has BEEN showing sellers, so there MUST be another policy.");
    }
  }
  
  // Revert test seller (307cb2b7) back to pending so we don't leave test data
  console.log("\n=== Cleanup: revert test seller 307cb2b7 to original state ===");
  const { error: revertErr } = await adminDb
    .from("profiles")
    .update({ role: "customer", seller_status: "pending", is_verified_seller: false })
    .eq("id", "307cb2b7-9a93-4939-aeec-e1ee2c8513ec");
  console.log("Revert:", revertErr?.message ?? "done");
}

main().catch(console.error);
