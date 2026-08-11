import { createClient, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zfancncassjmghxzogbm.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmYW5jbmNhc3NqbWdoeHpvZ2JtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MzU0ODcsImV4cCI6MjEwMjAxMTQ4N30.0bmE1tVU4JO8OiqpMgtG3oMiE8UqatUyEAhvLS9NYzI'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmYW5jbmNhc3NqbWdoeHpvZ2JtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQzNTQ4NywiZXhwIjoyMTAyMDExNDg3fQ.1XvB6XXSPOC9CsjuCQ65arwh8wK4V5yy8bdBx3giCKI'

let adminClientInstance: SupabaseClient | null = null

/**
 * Returns a Supabase Admin client with service_role privileges
 * for NEXORA's independent database (zfancncassjmghxzogbm).
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!adminClientInstance) {
    adminClientInstance = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  }
  return adminClientInstance
}

/**
 * Returns a standard Supabase client for client-side queries.
 */
export function getSupabaseClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}
