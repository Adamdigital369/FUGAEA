import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// --- SUPABASE CREDENTIALS CONFIGURATION ---
// Configured with your active project URL and public Anon key.

export const supabaseUrl = 'https://lyluikviusjfkowmftot.supabase.co';
export const supabaseAnonKey = 'sb_publishable_-lkJx1EsgfRFuGYYMteNjQ_glUVsK3B';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
