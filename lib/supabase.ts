// Environment variables for Supabase
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY

// Note: Supabase client should be created in API routes using the service role key
// See lib/supabase-client.ts for server-side client
