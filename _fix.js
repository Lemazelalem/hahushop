const { createClient } = require('@supabase/supabase-js');
const db = createClient(
  'https://nixefnraeldbkqolymwt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5peGVmbnJhZWxkYmtxb2x5bXd0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODY4MTMzMCwiZXhwIjoyMDg0MjU3MzMwfQ.kt6y4Dc11DaGXeLWIKPiKxMhXiMCiyKC4BQkrh5ugmM'
);

(async () => {
  // Check current admin and seller profiles
  const { data, error } = await db
    .from('profiles')
    .select('id, display_name, role, seller_status')
    .in('role', ['admin', 'seller']);

  if (error) {
    console.log('ERROR:', error.message);
    return;
  }

  console.log('Current admin/seller profiles:');
  data.forEach(p => {
    console.log(`  ${p.id.slice(0, 8)} | ${p.display_name} | role: ${p.role} | seller_status: ${p.seller_status}`);
  });

  // Find admins that got turned into sellers (known admin IDs from previous session)
  const knownAdminIds = ['958698dc', '14ce095e'];
  const brokenAdmins = data.filter(p => 
    p.role === 'seller' && knownAdminIds.some(ka => p.id.startsWith(ka))
  );

  if (brokenAdmins.length > 0) {
    console.log('\nFound admin(s) turned into seller:');
    brokenAdmins.forEach(p => console.log(`  ${p.id} (${p.display_name})`));

    for (const p of brokenAdmins) {
      const { error: fixErr } = await db
        .from('profiles')
        .update({ role: 'admin', seller_status: null, is_verified_seller: false })
        .eq('id', p.id);
      if (fixErr) console.log(`  FAILED to fix ${p.id}:`, fixErr.message);
      else console.log(`  FIXED ${p.id} => role: admin`);
    }
  } else {
    console.log('\nNo known admin IDs found with role=seller. Checking all sellers for anyone who might be admin...');
    // Also check if any profile with display_name containing admin keywords
    const allSellers = data.filter(p => p.role === 'seller');
    console.log('Current sellers:', allSellers.map(s => `${s.id.slice(0,8)} ${s.display_name}`));
  }
})();
