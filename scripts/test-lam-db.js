const { createClient } = require('@supabase/supabase-js')

const lamSupabaseUrl = 'https://ykrjmctfmywhymgpkqlu.supabase.co'
const lamServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrcmptY3RmbXl3aHltZ3BrcWx1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjE5NTgwMSwiZXhwIjoyMTAxNzcxODAxfQ.bnLY6rt5lQEfxYeCXcFIBZyccwaoWKvsqiYPxZJJN_k'

const lamSupabase = createClient(lamSupabaseUrl, lamServiceKey)

async function run() {
  console.log('--- Testing LAM Supabase Connection ---')

  const { data: companies, error: compErr } = await lamSupabase.from('companies').select('*').limit(5)
  console.log('LAM Companies:', compErr ? compErr.message : companies)

  const { data: entitlements, error: entErr } = await lamSupabase.from('company_entitlements').select('*').limit(5)
  console.log('LAM Company Entitlements:', entErr ? entErr.message : entitlements)

  const { data: userEntitlements, error: uEntErr } = await lamSupabase.from('user_product_access').select('*').limit(5)
  console.log('LAM User Product Access:', uEntErr ? uEntErr.message : userEntitlements)

  const { data: users, error: uErr } = await lamSupabase.from('customers').select('*').limit(5)
  console.log('LAM Customers:', uErr ? uErr.message : users)
}

run()
