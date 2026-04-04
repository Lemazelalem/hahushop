// Comprehensive diagnostic script for admin seller approval issue
// Tests: service role key, DB reads, DB writes, approval persistence
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://nixefnraeldbkqolymwt.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5peGVmbnJhZWxkYmtxb2x5bXd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODEzMzAsImV4cCI6MjA4NDI1NzMzMH0.Vr1vskigkpSm4l7Yl8ZFQb8seWw1OGpZ9SQhoptH9vk";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5peGVmbnJhZWxkYmtxb2x5bXd0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODY4MTMzMCwiZXhwIjoyMDg0MjU3MzMwfQ.kt6y4Dc11DaGXeLWIKPiKxMhXiMCiyKC4BQkrh5ugmM";

const adminDb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const anonDb = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("=== STEP 1: List ALL profiles with seller-related fields ===\n");

  const { data: allProfiles, error: profErr } = await adminDb
    .from("profiles")
    .select("id, display_name, full_name, role, seller_status, is_verified_seller, business_name, updated_at")
    .or("role.eq.seller,role.eq.admin,seller_status.eq.pending,seller_status.eq.approved,seller_status.eq.rejected,seller_status.neq.null");

  if (profErr) {
    console.error("Profile query error:", profErr);
    return;
  }

  console.log(`Found ${allProfiles.length} profiles:`);
  for (const p of allProfiles) {
    const name = p.display_name || p.full_name || p.business_name || "?";
    console.log(`  ${p.id.slice(0,8)}  role=${String(p.role).padEnd(10)} seller_status=${String(p.seller_status).padEnd(10)} verified=${p.is_verified_seller}  name="${name}"`);
  }

  console.log("\n=== STEP 2: List ALL seller_applications ===\n");

  const { data: apps, error: appsErr } = await adminDb
    .from("seller_applications")
    .select("id, user_id, business_name, status, applied_at")
    .order("applied_at", { ascending: false });

  if (appsErr) {
    console.error("Applications query error:", appsErr);
  } else {
    console.log(`Found ${apps.length} applications:`);
    for (const a of apps) {
      console.log(`  user=${a.user_id.slice(0,8)}  status=${String(a.status).padEnd(10)} business="${a.business_name}" applied=${a.applied_at}`);
    }
  }

  console.log("\n=== STEP 3: List ALL seller_documents ===\n");

  const { data: docs, error: docsErr } = await adminDb
    .from("seller_documents")
    .select("id, seller_id, document_type, status, created_at");

  if (docsErr) {
    console.error("Documents query error:", docsErr);
  } else {
    console.log(`Found ${docs.length} documents:`);
    for (const d of docs) {
      console.log(`  seller=${d.seller_id.slice(0,8)}  type=${d.document_type.padEnd(20)} status=${d.status}`);
    }
  }

  // Pick a pending seller to test
  const pendingSeller = allProfiles.find(p => p.seller_status === "pending" && p.role !== "admin");
  if (!pendingSeller) {
    console.log("\n⚠ No pending sellers to test with. Let me find any non-admin seller...");
    // Try an approved one and test revert/approve cycle
    const approvedSeller = allProfiles.find(p => p.seller_status === "approved" || p.role === "seller");
    if (!approvedSeller) {
      console.log("No sellers at all. Cannot test.");
      return;
    }
    console.log(`\nWill test with approved seller: ${approvedSeller.id.slice(0,8)} (${approvedSeller.display_name || approvedSeller.full_name})`);
    await testApprovalCycle(approvedSeller.id);
  } else {
    console.log(`\nWill test with pending seller: ${pendingSeller.id.slice(0,8)} (${pendingSeller.display_name || pendingSeller.full_name})`);
    await testApprovalCycle(pendingSeller.id);
  }

  console.log("\n=== STEP 5: Check RLS policies — can anon key read profiles? ===\n");

  const { data: anonProfiles, error: anonErr } = await anonDb
    .from("profiles")
    .select("id, role, seller_status")
    .or("role.eq.seller,seller_status.eq.pending,seller_status.eq.approved,seller_status.eq.rejected");

  if (anonErr) {
    console.log("Anon key CANNOT read profiles:", anonErr.message);
  } else {
    console.log(`Anon key can read ${anonProfiles.length} profiles (without auth)`);
    for (const p of anonProfiles) {
      console.log(`  ${p.id.slice(0,8)}  role=${String(p.role).padEnd(10)} seller_status=${p.seller_status}`);
    }
  }

  console.log("\n=== STEP 6: Check for DB triggers on profiles table ===\n");
  
  // Check if there's a trigger that resets role/seller_status
  const { data: triggers, error: trigErr } = await adminDb.rpc("pg_catalog", undefined).catch(() => null) || { data: null, error: null };
  
  // Use raw SQL to check triggers
  const { data: triggerData, error: triggerErr } = await adminDb
    .from("information_schema.triggers" )
    .select("*")
    .catch(() => ({ data: null, error: { message: "Cannot query triggers via REST" } }));
  
  if (triggerErr) {
    console.log("Cannot check triggers via REST API (expected).");
    console.log("Check Supabase Dashboard > Database > Triggers manually.");
  } else if (triggerData) {
    console.log("Triggers found:", triggerData);
  }

  console.log("\n=== STEP 7: Test profile update with service role key ===\n");
  
  // Pick any profile and try a simple field update
  const testProfile = pendingSeller || allProfiles[0];
  if (testProfile) {
    // First set to pending explicitly
    console.log(`Setting ${testProfile.id.slice(0,8)} to seller_status=pending...`);
    const { error: resetErr, data: resetData, count: resetCount } = await adminDb
      .from("profiles")
      .update({ seller_status: "pending", role: "customer" })
      .eq("id", testProfile.id)
      .select("id, role, seller_status");

    console.log("Reset result:", { error: resetErr?.message, data: resetData, count: resetCount });

    // Now approve
    console.log(`Approving ${testProfile.id.slice(0,8)}...`);
    const { error: approveErr, data: approveData } = await adminDb
      .from("profiles")
      .update({ 
        role: "seller", 
        seller_status: "approved", 
        is_verified_seller: true,
        updated_at: new Date().toISOString()
      })
      .eq("id", testProfile.id)
      .select("id, role, seller_status, is_verified_seller");

    console.log("Approve result:", { error: approveErr?.message, data: approveData });

    // Read back immediately
    const { data: readBack, error: readErr } = await adminDb
      .from("profiles")
      .select("id, role, seller_status, is_verified_seller")
      .eq("id", testProfile.id)
      .single();

    console.log("Read back after approve:", { error: readErr?.message, data: readBack });

    // Read back with ANON key
    const { data: anonReadBack, error: anonReadErr } = await anonDb
      .from("profiles")
      .select("id, role, seller_status, is_verified_seller")
      .eq("id", testProfile.id)
      .single();

    console.log("Anon key read back:", { error: anonReadErr?.message, data: anonReadBack });
    
    if (readBack && readBack.role === "seller" && readBack.seller_status === "approved") {
      console.log("\n✅ Service role key update WORKS — approval persists in DB");
    } else {
      console.log("\n❌ Service role key update FAILED or was reverted!");
    }
    
    if (anonReadBack) {
      if (anonReadBack.role === "seller" && anonReadBack.seller_status === "approved") {
        console.log("✅ Anon key can read the approved status correctly");
      } else {
        console.log("❌ Anon key reads DIFFERENT data:", anonReadBack);
        console.log("   This means RLS is filtering/transforming the data!");
      }
    } else {
      console.log("❌ Anon key CANNOT read this profile at all (RLS blocks it)");
      console.log("   Error:", anonReadErr?.message);
    }
  }
}

async function testApprovalCycle(sellerId) {
  console.log(`\n=== STEP 4: Test approval cycle for ${sellerId.slice(0,8)} ===\n`);

  // Read current state
  const { data: before } = await adminDb
    .from("profiles")
    .select("role, seller_status, is_verified_seller")
    .eq("id", sellerId)
    .single();
  
  console.log("Before:", before);

  // Approve
  const { error: approveErr, data: approveResult } = await adminDb
    .from("profiles")
    .update({
      role: "seller",
      seller_status: "approved",
      is_verified_seller: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sellerId)
    .select();

  console.log("Approve update error:", approveErr?.message || "none");
  console.log("Approve update returned rows:", approveResult?.length || 0);
  if (approveResult?.length) {
    console.log("Approve update data:", approveResult[0]);
  }

  // Read back with service role
  const { data: afterService } = await adminDb
    .from("profiles")
    .select("role, seller_status, is_verified_seller")
    .eq("id", sellerId)
    .single();
  
  console.log("After (service key read):", afterService);

  // Read back with anon key
  const { data: afterAnon, error: anonErr } = await anonDb
    .from("profiles")
    .select("role, seller_status, is_verified_seller")
    .eq("id", sellerId)
    .single();
  
  if (anonErr) {
    console.log("After (anon key read) ERROR:", anonErr.message);
  } else {
    console.log("After (anon key read):", afterAnon);
  }

  // Compare
  const serviceOk = afterService?.role === "seller" && afterService?.seller_status === "approved";
  const anonOk = afterAnon?.role === "seller" && afterAnon?.seller_status === "approved";
  
  console.log(`\nService role sees approved: ${serviceOk ? "✅" : "❌"}`);
  console.log(`Anon key sees approved: ${anonOk ? "✅" : "❌"}`);
  
  if (serviceOk && !anonOk) {
    console.log("\n🔴 CRITICAL: Data persists but RLS blocks the anon key from reading it correctly!");
    console.log("   The admin page reads profiles with the anon key (browser client).");
    console.log("   This means the admin page will ALWAYS see stale/wrong data.");
    console.log("   FIX: Either use a server component or API route for the admin page query, or fix RLS policies.");
  }
}

main().catch(console.error);
