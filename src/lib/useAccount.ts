'use client';

import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { accountsEnabled, authRedirectTo, supabase } from './supabase';

export type Role = 'user' | 'organizer' | 'admin';
export type Profile = { display_name: string | null; role: Role };

export function useAccount() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [checked, setChecked] = useState(!accountsEnabled);

  useEffect(() => {
    const client = supabase();
    if (!client) return;

    client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecked(true);
    });

    const { data: sub } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setChecked(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const client = supabase();
    if (!client || !session) {
      setProfile(null);
      return;
    }
    setProfile(undefined);
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

  const rename = useCallback(
    async (displayName: string) => {
      const client = supabase();
      if (!client || !session) return;
      const name = displayName.trim().slice(0, 60);
      const { error } = await client
        .from('profiles')
        .update({ display_name: name || null })
        .eq('id', session.user.id);
      if (error) throw new Error(error.message);
      setProfile((held) => (held ? { ...held, display_name: name || null } : held));
    },
    [session]
  );

  const linkProvider = useCallback(async (provider: 'discord' | 'google') => {
    const client = supabase();
    if (!client) return;
    const { error } = await client.auth.linkIdentity({
      provider,
      options: { redirectTo: authRedirectTo() },
    });
    if (error) throw new Error(error.message);
  }, []);

  const unlinkProvider = useCallback(
    async (provider: string) => {
      const client = supabase();
      if (!client || !session) return;
      const identity = session.user.identities?.find((i) => i.provider === provider);
      if (!identity) return;
      const { error } = await client.auth.unlinkIdentity(identity);
      if (error) throw new Error(error.message);
      const { data } = await client.auth.getSession();
      setSession(data.session);
    },
    [session]
  );

  return {
    session,
    profile,
    checked,
    roleKnown: !session || profile !== undefined,
    signedIn: Boolean(session),
    isOrganizer: profile?.role === 'organizer' || profile?.role === 'admin',
    isAdmin: profile?.role === 'admin',
    userId: session?.user.id ?? null,
    providers: (session?.user.identities ?? []).map((i) => i.provider),
    signOut,
    rename,
    linkProvider,
    unlinkProvider,
  };
}

export type SavedDeck = {
  id: string;
  name: string;
  leader_id: string;
  cards: { id: string; count: number }[];
  format: 'Standard' | 'Extra';
  updated_at: string;
};

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

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export type Submission = {
  id: string;
  event_name: string;
  event_date: string;
  venue: string | null;
  tier: string;
  region: 'EN' | 'JP';
  sampling: 'field' | 'winners';
  players: number | null;
  status: SubmissionStatus;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  submission_decks: { count: number }[];
};

export type SubmittedDeck = {
  id: string;
  player: string | null;
  place: number | null;
  wins: number;
  losses: number;
  ties: number;
  leader_id: string;
  cards: { id: string; count: number }[];
};

const SUBMISSION_COLUMNS =
  'id, event_name, event_date, venue, tier, region, sampling, players, status, ' +
  'review_note, reviewed_at, created_at, submission_decks(count)';

export async function listSubmissions(): Promise<Submission[]> {
  const client = supabase();
  if (!client) return [];
  const { data, error } = await client
    .from('submissions')
    .select(SUBMISSION_COLUMNS)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Submission[];
}

export async function withdrawSubmission(id: string) {
  const client = supabase();
  if (!client) return;
  const { error } = await client.from('submissions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export type OrganizerRequest = {
  id: string;
  user_id: string;
  organizer_name: string;
  events: string;
  link: string | null;
  status: SubmissionStatus;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

const REQUEST_COLUMNS =
  'id, user_id, organizer_name, events, link, status, review_note, reviewed_at, created_at';

export async function requestOrganizer(request: {
  userId: string;
  organizerName: string;
  events: string;
  link: string;
}) {
  const client = supabase();
  if (!client) throw new Error('Accounts are not configured.');
  const { error } = await client.from('organizer_requests').insert({
    user_id: request.userId,
    organizer_name: request.organizerName.trim().slice(0, 120),
    events: request.events.trim().slice(0, 600),
    link: request.link.trim().slice(0, 300) || null,
  });
  if (error) {
    throw new Error(
      error.code === '23505' ? 'You already have a request waiting.' : error.message
    );
  }
}

export async function myOrganizerRequest(): Promise<OrganizerRequest | null> {
  const client = supabase();
  if (!client) return null;
  const { data, error } = await client
    .from('organizer_requests')
    .select(REQUEST_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as OrganizerRequest) ?? null;
}

export async function listOrganizerRequests(
  status: SubmissionStatus | 'all' = 'pending'
): Promise<OrganizerRequest[]> {
  const client = supabase();
  if (!client) return [];
  let query = client.from('organizer_requests').select(REQUEST_COLUMNS);
  if (status !== 'all') query = query.eq('status', status);
  const { data, error } = await query.order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as OrganizerRequest[];
}

export async function decideOrganizerRequest(
  request: OrganizerRequest,
  status: Exclude<SubmissionStatus, 'pending'>,
  note: string
) {
  const client = supabase();
  if (!client) throw new Error('Accounts are not configured.');

  if (status === 'approved') {
    const { data, error } = await client
      .from('profiles')
      .update({ role: 'organizer' })
      .eq('id', request.user_id)
      .select('id, role');
    if (error) throw new Error(`Could not grant the role: ${error.message}`);
    if (!data || data.length === 0) {
      throw new Error(
        'The role was not granted — the database refused the change. Check that ' +
          'supabase/migrations/0002-organizer-requests.sql has been run.'
      );
    }
  }

  const { data, error } = await client
    .from('organizer_requests')
    .update({
      status,
      review_note: note.trim() || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', request.id)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('The request was not updated.');
}

export async function listForReview(status: SubmissionStatus | 'all' = 'pending') {
  const client = supabase();
  if (!client) return [];
  let query = client.from('submissions').select(SUBMISSION_COLUMNS);
  if (status !== 'all') query = query.eq('status', status);
  const { data, error } = await query.order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Submission[];
}

export async function submittedDecks(submissionId: string): Promise<SubmittedDeck[]> {
  const client = supabase();
  if (!client) return [];
  const { data, error } = await client
    .from('submission_decks')
    .select('id, player, place, wins, losses, ties, leader_id, cards')
    .eq('submission_id', submissionId)
    .order('place', { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SubmittedDeck[];
}

export async function reviewSubmission(
  id: string,
  status: Exclude<SubmissionStatus, 'pending'>,
  note: string
) {
  const client = supabase();
  if (!client) throw new Error('Accounts are not configured.');
  const { data, error } = await client
    .from('submissions')
    .update({
      status,
      review_note: note.trim() || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error(
      'Nothing was updated — the database refused the change. Check that ' +
        'supabase/migrations/0001-review.sql has been run.'
    );
  }
}

export async function reopenSubmission(id: string) {
  const client = supabase();
  if (!client) throw new Error('Accounts are not configured.');
  const { data, error } = await client
    .from('submissions')
    .update({ status: 'pending', review_note: null, reviewed_at: null })
    .eq('id', id)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error(
      'Nothing was updated — the database refused the change. Check that ' +
        'supabase/migrations/0001-review.sql has been run.'
    );
  }
}
