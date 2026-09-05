'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The Supabase client, for the browser.
 *
 * Imported only by the pages under /account. That matters: the library is around
 * 100 KB and the rest of this site is measured in tens — code splitting keeps it off
 * the card search and the metagame page, and importing it from a shared component or
 * the layout would put it on every page instead.
 *
 * The anon key ships in the bundle, which is how it is designed to work. It grants
 * nothing on its own; the row-level policies in supabase/schema.sql are the security
 * boundary. The **service role key** is the one that bypasses them, and it never
 * comes near here — see scripts/ingest-submissions.mjs.
 */

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Whether accounts are set up at all.
 *
 * The site was live and useful before any of this existed and has to stay that way
 * on a checkout with no Supabase project: pages ask this and say so, rather than
 * throwing on a missing URL.
 */
export const accountsEnabled = Boolean(URL_BASE && ANON_KEY);

/**
 * Email and password are off unless SMTP is configured.
 *
 * Supabase's built-in mail sends **two messages an hour**, to pre-authorized
 * addresses only, and is documented as non-production. Sign-up can be made to work
 * without it by turning confirmations off — but password reset cannot, and an
 * account whose password cannot be reset is a trap rather than a feature.
 *
 * So the flag goes on once a custom SMTP provider is set (Resend's free tier is
 * 3,000 a month, 100 a day, which is far more than this needs).
 *
 * What the flag no longer decides is whether the form is *drawn*. It is, always —
 * with every field disabled and a line saying why, which is both the notice a
 * reader needs and the reminder that this is unfinished. Hiding it made the gap
 * invisible to everyone including whoever has to close it; leaving it working
 * would hand somebody an account they could never recover.
 */
export const emailAuthEnabled = process.env.NEXT_PUBLIC_AUTH_EMAIL === '1';

let client: SupabaseClient | null = null;

/** The shared client, made once. Null when accounts are not configured. */
export function supabase(): SupabaseClient | null {
  if (!accountsEnabled) return null;
  client ??= createClient(URL_BASE as string, ANON_KEY as string, {
    auth: {
      /*
       * The session comes back in the URL fragment, which browsers never send to a
       * server — which is exactly why this works on a static host with nothing
       * running behind it.
       */
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return client;
}

/**
 * Where a provider sends the reader back to.
 *
 * Built from the live location rather than a constant, so it is right on the
 * project page, on a custom domain and on localhost without three settings. Every
 * value it can produce has to be listed in Supabase's redirect allowlist, or the
 * provider returns to a URL Supabase refuses to complete.
 */
export const authRedirectTo = () =>
  `${globalThis.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/account/`;
