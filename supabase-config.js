import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// --- SUPABASE CREDENTIALS CONFIGURATION ---
// Configured with your active project URL and public Anon key.

export const supabaseUrl = 'https://htlyvnqqbygiexmglphw.supabase.co';
export const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0bHl2bnFxYnlnaWV4bWdscGh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NDAwMTUsImV4cCI6MjA5ODExNjAxNX0.GMHHq407TJ3Xt4V-L-SjpOywtflmIE6YwQsPpxBfcQs';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
