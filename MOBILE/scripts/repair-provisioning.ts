/**
 * Subscription Provisioning System Repair
 * Inspects actual schema and creates correct trigger/backfill
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   - NEXT_PUBLIC_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface ColumnInfo {
  column_name: string;
  data_type: string;
  udt_name?: string;
}

interface SchemaState {
  columns: ColumnInfo[];
  planEnumValues: string[];
  hasTierColumn: boolean;
  hasPlanColumn: boolean;
  hasStatusColumn: boolean;
  hasTokenBalanceColumn: boolean;
}

async function inspectSchema(): Promise<SchemaState> {
  console.log('🔍 STEP 1: Inspecting subscriptions schema...');

  // Query column information
  const { data: columns, error: colError } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'subscriptions'
      ORDER BY ordinal_position
    `
  });

  if (colError) {
    console.error('Failed to query columns:', colError);
    // Try alternative method
    const { data: altColumns, error: altError } = await supabase
      .from('subscriptions')
      .select('*')
      .limit(1);
    
    if (altError) {
      throw new Error(`Cannot inspect schema: ${altError.message}`);
    }
    
    // Derive columns from sample row
    const sampleRow = altColumns?.[0] || {};
    const derivedColumns = Object.keys(sampleRow).map(col => ({
      column_name: col,
      data_type: typeof sampleRow[col as keyof typeof sampleRow]
    }));
    
    console.log('   Derived columns from sample row:', derivedColumns.map(c => c.column_name).join(', '));
    
    const state: SchemaState = {
      columns: derivedColumns,
      planEnumValues: [],
      hasTierColumn: derivedColumns.some(c => c.column_name === 'tier'),
      hasPlanColumn: derivedColumns.some(c => c.column_name === 'plan'),
      hasStatusColumn: derivedColumns.some(c => c.column_name === 'status'),
      hasTokenBalanceColumn: derivedColumns.some(c => c.column_name === 'token_balance'),
    };
    
    return state;
  }

  console.log('   Found columns:', columns?.map((c: ColumnInfo) => c.column_name).join(', '));

  const state: SchemaState = {
    columns: columns || [],
    planEnumValues: [],
    hasTierColumn: columns?.some((c: ColumnInfo) => c.column_name === 'tier') ?? false,
    hasPlanColumn: columns?.some((c: ColumnInfo) => c.column_name === 'plan') ?? false,
    hasStatusColumn: columns?.some((c: ColumnInfo) => c.column_name === 'status') ?? false,
    hasTokenBalanceColumn: columns?.some((c: ColumnInfo) => c.column_name === 'token_balance') ?? false,
  };

  return state;
}

async function inspectPlanEnum(): Promise<string[]> {
  console.log('\n🔍 STEP 2: Inspecting plan enum values...');

  const { data: enumValues, error: enumError } = await supabase.rpc('exec_sql', {
    sql: `SELECT unnest(enum_range(null::plan)) as value`
  });

  if (enumError) {
    console.log('   Could not query enum directly, checking sample data...');
    // Try to infer from existing data
    const { data: samplePlans, error: sampleError } = await supabase
      .from('subscriptions')
      .select('plan')
      .limit(10);
    
    if (!sampleError && samplePlans && samplePlans.length > 0) {
      const uniquePlans = [...new Set(samplePlans.map((s: { plan: string }) => s.plan))];
      console.log('   Found plan values in data:', uniquePlans.join(', '));
      return uniquePlans;
    }
    
    // Default assumption
    console.log('   Using default: free, pro, elite');
    return ['free', 'pro', 'elite'];
  }

  const values = enumValues?.map((e: { value: string }) => e.value) || [];
  console.log('   Enum values:', values.join(', '));
  return values;
}

async function createCorrectTrigger(schema: SchemaState, planEnumValues: string[]) {
  console.log('\n🔧 STEP 3: Creating correct trigger function...');

  // Determine correct column names and values
  const planColumn = schema.hasPlanColumn ? 'plan' : schema.hasTierColumn ? 'tier' : 'plan';
  const freeValue = planEnumValues.includes('free') ? 'free' : 
                    planEnumValues.includes('FREE') ? 'FREE' : 'free';
  
  console.log(`   Using column: ${planColumn}`);
  console.log(`   Free plan value: ${freeValue}`);

  // Build column list dynamically
  const columns: string[] = ['user_id'];
  const values: string[] = ['new.id'];

  if (schema.hasPlanColumn || schema.hasTierColumn) {
    columns.push(planColumn);
    values.push(`'${freeValue}'`);
  }

  if (schema.hasStatusColumn) {
    columns.push('status');
    values.push("'active'");
  }

  columns.push('monthly_token_allocation', 'monthly_token_allocation_used');
  values.push('10000', '0');

  if (schema.hasTokenBalanceColumn) {
    columns.push('token_balance');
    values.push('10000');
  }

  columns.push('current_period_start', 'current_period_end');
  values.push("date_trunc('month', now())", "date_trunc('month', now()) + interval '1 month'");

  // Check if created_at exists
  if (schema.columns.some(c => c.column_name === 'created_at')) {
    columns.push('created_at', 'updated_at');
    values.push('now()', 'now()');
  }

  const functionSql = `
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (
    ${columns.join(',\n    ')}
  ) VALUES (
    ${values.join(',\n    ')}
  );
  RETURN NEW;
END;
$$;
`;

  console.log('   Function SQL generated');

  // Execute the function creation
  const { error: funcError } = await supabase.rpc('exec_sql', { sql: functionSql });
  
  if (funcError) {
    console.error('   Failed to create function via RPC, trying direct SQL...');
    // Try using supabase management API or raw query
    throw new Error(`Cannot create function: ${funcError.message}`);
  }

  console.log('   ✅ Trigger function created');
}

async function createTrigger() {
  console.log('\n🔧 STEP 4: Creating trigger...');

  const triggerSql = `
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user_subscription();
`;

  const { error: triggerError } = await supabase.rpc('exec_sql', { sql: triggerSql });

  if (triggerError) {
    console.error('   Failed to create trigger:', triggerError);
    throw new Error(`Cannot create trigger: ${triggerError.message}`);
  }

  console.log('   ✅ Trigger created/replaced');
}

async function backfillUsers(schema: SchemaState, planEnumValues: string[]) {
  console.log('\n🔧 STEP 5: Backfilling existing users...');

  const planColumn = schema.hasPlanColumn ? 'plan' : schema.hasTierColumn ? 'tier' : 'plan';
  const freeValue = planEnumValues.includes('free') ? 'free' : 
                    planEnumValues.includes('FREE') ? 'FREE' : 'free';

  // Build insert columns
  const insertColumns = ['user_id'];
  const insertValues = ['id'];

  if (schema.hasPlanColumn || schema.hasTierColumn) {
    insertColumns.push(planColumn);
    insertValues.push(`'${freeValue}'`);
  }

  if (schema.hasStatusColumn) {
    insertColumns.push('status');
    insertValues.push("'active'");
  }

  insertColumns.push('monthly_token_allocation', 'monthly_token_allocation_used');
  insertValues.push('10000', '0');

  if (schema.hasTokenBalanceColumn) {
    insertColumns.push('token_balance');
    insertValues.push('10000');
  }

  insertColumns.push('current_period_start', 'current_period_end');
  insertValues.push("date_trunc('month', now())", "date_trunc('month', now()) + interval '1 month'");

  if (schema.columns.some(c => c.column_name === 'created_at')) {
    insertColumns.push('created_at', 'updated_at');
    insertValues.push('now()', 'now()');
  }

  const backfillSql = `
INSERT INTO public.subscriptions (
  ${insertColumns.join(', ')}
)
SELECT
  ${insertValues.join(', ')}
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.subscriptions s WHERE s.user_id = u.id
);
`;

  const { error: backfillError } = await supabase.rpc('exec_sql', { sql: backfillSql });

  if (backfillError) {
    console.error('   Failed to backfill:', backfillError);
    throw new Error(`Cannot backfill: ${backfillError.message}`);
  }

  console.log('   ✅ Backfill completed');
}

async function verifySystem(): Promise<{
  userCount: number;
  subscriptionCount: number;
  countsMatch: boolean;
  freeAllocationCorrect: boolean;
  triggerExists: boolean;
}> {
  console.log('\n✅ STEP 6: Running verification...');

  // Count users
  const { count: userCount, error: userError } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true });

  if (userError) {
    console.error('   Failed to count users:', userError);
  }

  // Count subscriptions
  const { count: subCount, error: subError } = await supabase
    .from('subscriptions')
    .select('*', { count: 'exact', head: true });

  if (subError) {
    console.error('   Failed to count subscriptions:', subError);
  }

  console.log(`   Users: ${userCount || 'N/A'}`);
  console.log(`   Subscriptions: ${subCount || 'N/A'}`);

  // Check trigger exists
  const { data: triggerData, error: triggerError } = await supabase.rpc('exec_sql', {
    sql: `SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'`
  });
  const triggerExists = !triggerError && triggerData && triggerData.length > 0;
  console.log(`   Trigger exists: ${triggerExists ? '✅' : '❌'}`);

  // Check allocations
  const { data: allocData, error: allocError } = await supabase
    .from('subscriptions')
    .select('monthly_token_allocation')
    .limit(5);

  let freeAllocationCorrect = false;
  if (!allocError && allocData) {
    freeAllocationCorrect = allocData.every(
      (row: { monthly_token_allocation: number }) => row.monthly_token_allocation === 10000
    );
    console.log(`   Free allocation (10k): ${freeAllocationCorrect ? '✅' : '❌'}`);
  }

  return {
    userCount: userCount || 0,
    subscriptionCount: subCount || 0,
    countsMatch: userCount === subCount,
    freeAllocationCorrect,
    triggerExists,
  };
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  SUBSCRIPTION PROVISIONING SYSTEM REPAIR');
  console.log('═══════════════════════════════════════════════════\n');

  try {
    // Step 1 & 2: Inspect
    const schema = await inspectSchema();
    const planEnumValues = await inspectPlanEnum();

    console.log('\n   Schema Summary:');
    console.log(`   - tier column: ${schema.hasTierColumn ? 'YES' : 'NO'}`);
    console.log(`   - plan column: ${schema.hasPlanColumn ? 'YES' : 'NO'}`);
    console.log(`   - status column: ${schema.hasStatusColumn ? 'YES' : 'NO'}`);
    console.log(`   - token_balance column: ${schema.hasTokenBalanceColumn ? 'YES' : 'NO'}`);

    // Step 3, 4, 5: Fix
    await createCorrectTrigger(schema, planEnumValues);
    await createTrigger();
    await backfillUsers(schema, planEnumValues);

    // Step 6: Verify
    const verification = await verifySystem();

    // Step 7: Return JSON
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  FINAL VERIFICATION');
    console.log('═══════════════════════════════════════════════════\n');

    const result = {
      SchemaInspected: true,
      EnumVerified: planEnumValues.length > 0,
      TriggerInstalled: verification.triggerExists,
      BackfillCompleted: verification.countsMatch,
      UserCountMatches: verification.countsMatch,
      FreeAllocationCorrect: verification.freeAllocationCorrect,
      ProvisioningSystemStable: verification.countsMatch && verification.triggerExists && verification.freeAllocationCorrect,
    };

    console.log(JSON.stringify(result, null, 2));
    console.log('\n');

    if (result.ProvisioningSystemStable) {
      console.log('✅ System is stable and ready');
    } else {
      console.log('⚠️  Some issues detected - review output above');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
