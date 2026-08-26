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

export type Role = 'user' | 'organizer' | 'admin';
export type Profile = { display_name: string | null; role: Role };

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

  /**
   * The one field of a profile its owner may change.
   *
   * `role` is deliberately not in the payload. The update policy re-reads the
   * stored role in its `with check`, so sending a different one is refused by the
   * database rather than by this function — but not sending it at all is what makes
   * the common case obviously correct.
   */
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

  return {
    session,
    profile,
    checked,
    signedIn: Boolean(session),
    /*
     * Exactly what the insert policy on `submissions` checks, and not a superset:
     * an admin is not implicitly an organizer there, so offering them the form
     * would be the page promising something the database then refuses.
     */
    isOrganizer: profile?.role === 'organizer',
    isAdmin: profile?.role === 'admin',
    userId: session?.user.id ?? null,
    signOut,
    rename,
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

/* ---------------------------------------------------------- submissions */

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
  /* PostgREST returns an aggregate as a one-element array of counts. */
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

/**
 * What an organizer has sent, and what happened to it.
 *
 * The form used to be write-only: you submitted a tournament and the site never
 * mentioned it again, so "was it approved, rejected, or did I misclick" had no
 * answer anywhere. The policy to read your own submissions existed from the first
 * schema; nothing had ever called it.
 *
 * No `organizer_id` filter, for the same reason `listDecks` has no `user_id` one —
 * the row-level policy is the boundary, and writing the filter here would suggest
 * the boundary is in the browser.
 */
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

/** Taking one back. Only possible while it is pending — the policy says so too. */
export async function withdrawSubmission(id: string) {
  const client = supabase();
  if (!client) return;
  const { error } = await client.from('submissions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------- becoming an organizer */

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

/**
 * Asking for the organizer role.
 *
 * The site used to answer "how do I submit results" with an email address on the
 * legal page — off the record, easy to lose, and visible to nobody but whoever
 * received it. This is the same question as a row.
 *
 * Asking is not being granted: nothing here touches a role. A unique index allows
 * one open request per account, so a second attempt while one is pending comes back
 * as a duplicate rather than as a queue.
 *
 * And once it is sent it stands: there is no update and no delete for the person who
 * sent it. A request that could be rewritten — or taken back and replaced — after a
 * reviewer had read it is a request nobody can rely on having read. The way out of a
 * mistaken one is a refusal, which carries a note and allows another.
 */
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

/** The most recent one this account sent, or null. */
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

/** Everything waiting, for whoever holds the admin role — same query, more rows. */
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

/**
 * Answering one, which for an approval means actually granting the role.
 *
 * The role moves **first**. If that write is refused — a policy changed, the
 * account is gone — the request stays pending and can be tried again; the other
 * order would leave a request marked approved next to an account that never got
 * anything, which is the failure nobody would notice.
 *
 * The policy behind that update allows `user` and `organizer` and no third value,
 * so this cannot produce an admin however it is called.
 */
export async function decideOrganizerRequest(
  request: OrganizerRequest,
  status: Exclude<SubmissionStatus, 'pending'>,
  note: string
) {
  const client = supabase();
  if (!client) throw new Error('Accounts are not configured.');

  if (status === 'approved') {
    /*
     * Read back, and check. A row that row-level security filters out is not an
     * error in PostgREST — the update affects nothing and returns cleanly — so
     * without this a missing policy would report the role as granted while the
     * account stayed exactly where it was, and nobody would find out until the
     * person tried to submit something.
     */
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

/* --------------------------------------------------------------- review */

/**
 * Everything waiting, for whoever holds the admin role.
 *
 * This is the same table and the same query as `listSubmissions`; what differs is
 * which rows come back, and that is decided by the policies rather than by an
 * argument passed from the browser. A reader without the role gets their own rows
 * and nothing else, which is why this cannot be used to look at other people's
 * submissions by calling it from the console.
 */
export async function listForReview(status: SubmissionStatus | 'all' = 'pending') {
  const client = supabase();
  if (!client) return [];
  let query = client.from('submissions').select(SUBMISSION_COLUMNS);
  if (status !== 'all') query = query.eq('status', status);
  const { data, error } = await query.order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Submission[];
}

/** The decks inside one submission, for reading before saying yes to them. */
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

/**
 * Approving or rejecting one submission.
 *
 * Approving does not publish anything. `ingest-submissions.mjs` reads rows in this
 * state on its next scheduled run and `build-indexes.mjs` folds them in, so the
 * gap between saying yes here and seeing it on the site is one ingest cycle —
 * which is the same gap every other source has.
 */
export async function reviewSubmission(
  id: string,
  status: Exclude<SubmissionStatus, 'pending'>,
  note: string
) {
  const client = supabase();
  if (!client) throw new Error('Accounts are not configured.');
  /* Read back for the same reason as above: RLS filtering is not an error. */
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
