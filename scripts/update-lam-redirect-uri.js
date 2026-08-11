const { createClient } = require('@supabase/supabase-js')

const lamSupabaseUrl = 'https://ykrjmctfmywhymgpkqlu.supabase.co'
const lamServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrcmptY3RmbXl3aHltZ3BrcWx1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjE5NTgwMSwiZXhwIjoyMTAxNzcxODAxfQ.bnLY6rt5lQEfxYeCXcFIBZyccwaoWKvsqiYPxZJJN_k'

const lamSupabase = createClient(lamSupabaseUrl, lamServiceKey)

async function run() {
  console.log('--- Registering localhost:3001 redirect URI in LAM sso_applications ---')

  const allowedUris = [
    'http://localhost:3001/api/auth/callback',
    'http://localhost:3000/api/auth/callback',
    'https://nexora.lam.com/api/auth/callback'
  ]

  const { data, error } = await lamSupabase
    .from('sso_applications')
    .upsert(
      {
        client_id: 'lam_app_nexora',
        client_name: 'Nexora SaaS App',
        product_slug: 'nexora',
        redirect_uris: allowedUris,
        client_secret_hash: 'hash_nexora_secret_2026',
        is_trusted: true
      },
      { onConflict: 'client_id' }
    )
    .select('*')
    .single()

  if (error) {
    console.error('Error updating sso_applications:', error)
  } else {
    console.log('Successfully updated sso_applications record:', data)
  }
}

run()
