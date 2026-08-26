'use client';

import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { accountsEnabled, supabase } from './supabase';

/**
 * Who is signed in, for any page that needs to know.
 *
 * Extracted from the account page once the deck builder needed the same answer.
 * Both ask the same question and neither should be the place the other imports it
 * from.
 *
 * `checked` is separate from `session` on purpose: "nobody is signed in" and "we have
 * not looked yet" render differently, and conflating them makes a Save button flash
 * into existence a moment after the page settles.
 */

export type Profile = { display_name: string | null; role: 'user' | 'organizer' };

export function useAccount() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checked, setChecked] = useState(!accountsEnabled);

  useEffect(() => {
    const client = supabase();
    if (!client) return;

    client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecked(true);
    });

    /* Also fires when the token in the fragment is picked up after a redirect. */
    const { data: sub } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setChecked(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  /* The profile row is made by a trigger on sign-up, so it is read, never written. */
  useEffect(() => {
    const client = supabase();
    if (!client || !session) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    client
      .from('profiles')
      .select('display_name, role')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (!cancelled) setProfile((data as Profile) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const signOut = useCallback(async () => {
    await supabase()?.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  return {
    session,
    profile,
    checked,
    signedIn: Boolean(session),
    isOrganizer: profile?.role === 'organizer',
    userId: session?.user.id ?? null,
    signOut,
  };
}

/* ---------------------------------------------------------------- decks */

export type SavedDeck = {
  id: string;
  name: string;
  leader_id: string;
  cards: { id: string; count: number }[];
  format: 'Standard' | 'Extra';
  updated_at: string;
};

/**
 * Someone's saved decks.
 *
 * No user filter in the query, deliberately: the row-level policy already restricts
 * this to the signed-in account, and adding `.eq('user_id', …)` here would suggest
 * that the filtering happens in the browser — which would be the wrong thing to
 * believe about where the boundary is.
 */
export async function listDecks(): Promise<SavedDeck[]> {
  const client = supabase();
  if (!client) return [];
  const { data, error } = await client
    .from('decks')
    .select('id, name, leader_id, cards, format, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SavedDeck[];
}

export async function getDeck(id: string): Promise<SavedDeck | null> {
  const client = supabase();
  if (!client) return null;
  const { data, error } = await client
    .from('decks')
    .select('id, name, leader_id, cards, format, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SavedDeck) ?? null;
}

export async function saveDeck(deck: {
  id?: string | null;
  userId: string;
  name: string;
  leaderId: string;
  cards: { id: string; count: number }[];
  format: 'Standard' | 'Extra';
}): Promise<string> {
  const client = supabase();
  if (!client) throw new Error('Accounts are not configured.');

  const row = {
    user_id: deck.userId,
    name: deck.name.trim() || 'Untitled deck',
    leader_id: deck.leaderId,
    cards: deck.cards,
    format: deck.format,
    updated_at: new Date().toISOString(),
  };

  /* An id means this is the deck being edited; without one it is a new row. */
  const { data, error } = deck.id
    ? await client.from('decks').update(row).eq('id', deck.id).select('id').single()
    : await client.from('decks').insert(row).select('id').single();

  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function deleteDeck(id: string) {
  const client = supabase();
  if (!client) return;
  const { error } = await client.from('decks').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
