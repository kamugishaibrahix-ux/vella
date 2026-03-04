/**
 * Migration Verification Script
 * Run this to verify the mandatory subscription migration was applied correctly
 * 
 * Usage: npx ts-node scripts/verify-migration.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables:');
  console.error('- NEXT_PUBLIC_SUPABASE_URL');
  console.error('- SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function verifyMigration() {
  console.log('🔍 Verifying mandatory subscription migration...\n');

  // STEP 1: Verify trigger exists
  console.log('STEP 1: Checking trigger...');
  const { data: triggerData, error: triggerError } = await supabase
    .rpc('exec_sql', {
      sql: `SELECT tgname FROM pg_trigger WHERE tgname = 'on_auth_user_created'`
    });

  if (triggerError) {
    console.error('❌ Failed to check trigger:', triggerError.message);
  } else {
    console.log('✅ Trigger check completed');
  }

  // STEP 2: Count users
  console.log('\nSTEP 2: Counting users...');
  const { count: userCount, error: userError } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true });

  if (userError) {
    console.error('❌ Failed to count users:', userError.message);
  } else {
    console.log(`   User count: ${userCount}`);
  }

  // STEP 3: Count subscriptions
  console.log('\nSTEP 3: Counting subscriptions...');
  const { count: subCount, error: subError } = await supabase
    .from('subscriptions')
    .select('*', { count: 'exact', head: true });

  if (subError) {
    console.error('❌ Failed to count subscriptions:', subError.message);
  } else {
    console.log(`   Subscription count: ${subCount}`);
  }

  // STEP 4: Check for orphaned users
  console.log('\nSTEP 4: Checking for orphaned users...');
  const { data: orphanData, error: orphanError } = await supabase
    .rpc('exec_sql', {
      sql: `SELECT COUNT(*) as orphaned 
            FROM auth.users u 
            WHERE NOT EXISTS (
              SELECT 1 FROM public.subscriptions s WHERE s.user_id = u.id
            )`
    });

  if (orphanError) {
    console.error('❌ Failed to check orphans:', orphanError.message);
  } else {
    console.log(`   Orphaned users: ${orphanData?.[0]?.orphaned ?? 'N/A'}`);
  }

  // STEP 5: Verify allocation values
  console.log('\nSTEP 5: Checking free tier allocation...');
  const { data: allocData, error: allocError } = await supabase
    .from('subscriptions')
    .select('tier, monthly_token_allocation')
    .eq('tier', 'free')
    .limit(5);

  if (allocError) {
    console.error('❌ Failed to check allocation:', allocError.message);
  } else {
    const allCorrect = allocData?.every(
      (row: { tier: string; monthly_token_allocation: number }) => 
        row.monthly_token_allocation === 10000
    );
    console.log(`   Sample free tier allocations:`, allocData);
    console.log(`   All 10000: ${allCorrect ? '✅ Yes' : '❌ No'}`);
  }

  console.log('\n🏁 Verification complete!');
}

verifyMigration().catch(console.error);
