'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const accountsEnabled = Boolean(URL_BASE && ANON_KEY);

export const emailAuthEnabled = process.env.NEXT_PUBLIC_AUTH_EMAIL === '1';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!accountsEnabled) return null;
  client ??= createClient(URL_BASE as string, ANON_KEY as string, {
    auth: {
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return client;
}

export const authRedirectTo = () =>
  `${globalThis.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/account/`;
