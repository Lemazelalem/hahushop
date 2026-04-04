const { createClient } = require('@supabase/supabase-js');
const db = createClient(
  'https://nixefnraeldbkqolymwt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5peGVmbnJhZWxkYmtxb2x5bXd0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODY4MTMzMCwiZXhwIjoyMDg0MjU3MzMwfQ.kt6y4Dc11DaGXeLWIKPiKxMhXiMCiyKC4BQkrh5ugmM'
);

(async () => {
  // 1. Show all seller-related profiles
  const { data: sellers } = await db
    .from('profiles')
    .select('id, display_name, role, seller_status, is_verified_seller')
    .or('role.eq.seller,role.eq.admin,seller_status.neq.null');

  console.log('=== All seller/admin profiles ===');
  sellers.forEach(p => {
    console.log(`  ${p.id.slice(0,8)} | ${p.display_name || '(null)'} | role: ${p.role} | ss: ${p.seller_status} | verified: ${p.is_verified_seller}`);
  });

  // 2. Check seller_applications
  const { data: apps } = await db
    .from('seller_applications')
    .select('id, user_id, business_name, status');
  console.log('\n=== Seller applications ===');
  apps.forEach(a => {
    console.log(`  ${a.user_id.slice(0,8)} | ${a.business_name} | status: ${a.status}`);
  });

  // 3. Fix b95993cc: role=seller but seller_status=rejected -> set role=customer
  const target = sellers.find(p => p.id.startsWith('b95993cc'));
  if (target && target.role === 'seller' && target.seller_status === 'rejected') {
    const { error } = await db.from('profiles').update({ role: 'customer' }).eq('id', target.id);
    console.log('\n>>> Fixed b95993cc role: seller -> customer:', error ? error.message : 'OK');
  }

  // 4. Check for admin IDs in seller_applications  
  const adminIds = sellers.filter(p => p.role === 'admin').map(p => p.id);
  const adminApps = apps.filter(a => adminIds.includes(a.user_id));
  if (adminApps.length > 0) {
    console.log('\n!!! WARNING: Admin accounts have seller applications:');
    adminApps.forEach(a => console.log(`  ${a.user_id.slice(0,8)} | ${a.business_name} | ${a.status}`));
  }
})();
