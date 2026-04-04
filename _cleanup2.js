// Clean up stale seller_status - one by one to avoid trigger issues
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://nixefnraeldbkqolymwt.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5peGVmbnJhZWxkYmtxb2x5bXd0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODY4MTMzMCwiZXhwIjoyMDg0MjU3MzMwfQ.kt6y4Dc11DaGXeLWIKPiKxMhXiMCiyKC4BQkrh5ugmM";

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const staleIds = [
  "d5597b73", "89422d24", "80a0a4e5", "bb6b6989", "7048a82c", "9b8b3cd7",
  "ee33c2b0", "dca2a651", "fd0d739a", "6478954c", "211272ed", "2713032a",
  "d9c4c36d", "7b089581", "906a9aad", "cbb05591", "5e78569c", "d4a67e17",
  "ddea2242", "82a01c60", "f43c70ea", "307cb2b7", "90cc6e8e", "31a5b6fe",
  "a31042f0", "c49f968b", "52b09a8e", "73ef0e0a", "5ef8da97", "79ac5528",
  "13a6661b", "89aa854d", "b718a1b2"
];

async function main() {
  // Get full UUIDs for each prefix
  const { data: allProfiles } = await db
    .from("profiles")
    .select("id")
    .eq("seller_status", "pending")
    .eq("role", "customer");

  let cleaned = 0, skipped = 0;
  for (const p of allProfiles ?? []) {
    const prefix = p.id.slice(0, 8);
    if (!staleIds.includes(prefix)) continue;

    const { error } = await db
      .from("profiles")
      .update({ seller_status: null })
      .eq("id", p.id);

    if (error) {
      console.log(`SKIP ${prefix}: ${error.message}`);
      skipped++;
    } else {
      cleaned++;
    }
  }
  console.log(`\n✅ Cleaned: ${cleaned}, Skipped (trigger block): ${skipped}`);
}

main().catch(console.error);
