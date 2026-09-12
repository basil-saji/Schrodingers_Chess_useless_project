import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !key) throw new Error('Supabase environment variables are missing. Copy .env.example to .env.local.');

export const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
