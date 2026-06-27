import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// --- SUPABASE CREDENTIALS CONFIGURATION ---
// Replace the values below with your own Supabase credentials from Settings > API.
// Note: It is safe to use the public 'anon' key on the client side since our database
// uses Row Level Security (RLS) policies to protect data access.

export const supabaseUrl = 'YOUR_SUPABASE_URL';
export const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
