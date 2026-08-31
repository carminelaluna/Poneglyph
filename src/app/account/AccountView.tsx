'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import Pips from '@/components/Pips';
import { art } from '@/lib/art';
import { loadLeaders, type Leaders } from '@/lib/shards';
import { accountsEnabled, authRedirectTo, emailAuthEnabled, supabase } from '@/lib/supabase';
import {
  deleteDeck,
  listDecks,
  myOrganizerRequest,
  requestOrganizer,
  useAccount,
  type OrganizerRequest as OrganizerRequestRow,
  type SavedDeck,
} from '@/lib/useAccount';

/**
 * Signing in, and what you have once you are.
 *
 * Three ways in, and they are not equivalent. Discord and Google send no mail at
 * all — the provider vouches for the person. Email and password does, for
 * confirmation and for reset, and is hidden until SMTP is configured because an
 * account whose password cannot be reset is a trap.
 */

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const PROVIDERS = [
  { id: 'discord', name: 'Discord', label: 'Continue with Discord' },
  { id: 'google', name: 'Google', label: 'Continue with Google' },
] as const;

/**
 * The display name, which until now could be set but never changed.
 *
 * `rename self only` has been in the schema from the first version — it is the
 * policy written specifically to allow this one field and refuse the role next to
 * it — and nothing had ever called it. An OAuth sign-in fills the name in from the
 * provider, which is a reasonable default and a poor permanent answer.
 */
function DisplayName({
  current,
  onSave,
  onDone,
}: {
  current: string;
  onSave: (name: string) => Promise<void>;
  onDone: () => void;
}) {
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFailed(null);
    try {
      await onSave(value);
      onDone();
    } catch (err) {
      setFailed(err instanceof Error ? err.message : 'Could not save that.');
      setSaving(false);
    }
  };

  return (
    <form className="account-rename" onSubmit={save}>
      <input
        className="control"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={60}
        placeholder="How you want to be listed"
        aria-label="Display name"
        autoFocus
      />
      <button type="submit" className="chip chip-link" disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button type="button" className="account-link" onClick={onDone}>
        Cancel
      </button>
      {failed ? <p className="build-error">{failed}</p> : null}
    </form>
  );
}

/**
 * Asking for the organizer role.
 *
 * The site's answer to "how do I get my events in here" was an email address on the
 * legal page: off the record, easy to lose, and visible to nobody but whoever
 * received it. Three fields and a row are better on all three counts.
 *
 * Collapsed to one line until it is wanted. Asking is something you do once and
 * never again, so a form sitting open under the account block is three fields of
 * furniture for everyone who has already asked and for everyone who never will.
 * The line carries the answer instead — what the button says *is* the status — so
 * the common case is reading one sentence and moving on.
 *
 * What it asks for is what a reviewer actually needs to decide: a name, what they
 * run, and somewhere it can be checked. Deliberately not a form that could be
 * filled in convincingly by someone who runs nothing.
 *
 * Nothing here changes a role. It records a question; `/review` records the answer.
 */
function OrganizerRequest({ userId }: { userId: string }) {
  const [request, setRequest] = useState<OrganizerRequestRow | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [organizerName, setOrganizerName] = useState('');
  const [events, setEvents] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(() => {
    myOrganizerRequest()
      .then((row) => setRequest(row))
      .catch((err) => {
        setRequest(null);
        setFailed(err instanceof Error ? err.message : 'Could not read your request.');
      });
  }, []);

  useEffect(load, [load]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFailed(null);
    try {
      await requestOrganizer({ userId, organizerName, events, link });
      /* Left open: the panel turning into "waiting for review" is the confirmation,
         and a form that simply vanished would leave you wondering. */
      load();
    } catch (err) {
      setFailed(err instanceof Error ? err.message : 'Could not send that.');
    } finally {
      setBusy(false);
    }
  };

  /* undefined is "not looked yet" and null is "nothing sent" — see useAccount. */
  if (request === undefined) return null;

  const status = request?.status;

  if (!open) {
    return (
      <p className="account-ask-line">
        <button type="button" className="chip chip-link" onClick={() => setOpen(true)}>
          {status === 'pending'
            ? 'Organizer role — waiting for review'
            : status === 'rejected'
              ? 'Organizer role — not granted'
              : 'Ask for the organizer role'}
        </button>
      </p>
    );
  }

  const close = (
    <button type="button" className="account-link" onClick={() => setOpen(false)}>
      Close
    </button>
  );

  if (request && status === 'pending') {
    return (
      <div className="slab slab-pad account-ask">
        <p className="eyebrow">Organizer role</p>
        <p style={{ margin: '0.4rem 0 0' }}>Waiting for review.</p>

        {/*
          What was sent, and nothing that could change it. A request that could be
          rewritten — or taken back and replaced — after a reviewer had read it is a
          request nobody can rely on having read, so once it is in it stands until it
          is answered. The database says the same: no update policy for the person
          who sent it, and no delete either.
        */}
        <dl className="account-sent">
          <div>
            <dt>Sent as</dt>
            <dd>{request.organizer_name}</dd>
          </div>
          <div>
            <dt>What you run</dt>
            <dd>{request.events}</dd>
          </div>
          {request.link ? (
            <div>
              <dt>Link</dt>
              <dd className="account-sent-link">{request.link}</dd>
            </div>
          ) : null}
          <div>
            <dt>Asked</dt>
            <dd>{day(request.created_at)}</dd>
          </div>
        </dl>

        <p className="muted account-ask-note">
          Nothing else is needed from you. If something in it is wrong, say so when it
          is answered — a refusal carries a note and you can ask again.
        </p>
        {failed ? <p className="build-error">{failed}</p> : null}
        <p className="account-actions">{close}</p>
      </div>
    );
  }

  if (request && status === 'rejected') {
    return (
      <div className="slab slab-pad account-ask">
        <p className="eyebrow">Organizer role</p>
        <p style={{ margin: '0.4rem 0 0' }}>Not granted.</p>
        {/* .account-notice, not the review page's .sub-note: that stylesheet is not
            loaded here, and a class resolving to nothing renders as an unstyled
            paragraph rather than as anything anyone would notice. */}
        {request.review_note ? <p className="account-notice">{request.review_note}</p> : null}
        <p className="muted account-ask-note">
          You can ask again — say what changed, and it will be read again.
        </p>
        <p className="account-actions">
          <button type="button" className="account-link" onClick={() => setRequest(null)}>
            Ask again
          </button>
          {close}
        </p>
      </div>
    );
  }

  return (
    <form className="slab slab-pad account-ask" onSubmit={send}>
      <p className="eyebrow">Organizer role</p>
      <p style={{ margin: '0.4rem 0 0' }}>Run events? Ask for the role.</p>
      <p className="muted account-ask-note">
        It lets you submit a tournament and its decklists, which after review join the
        metagame figures alongside Limitless and One Piece Top Decks. Every number on this
        site is derived from recorded results, so the role is granted by a person reading
        this — not automatically.
      </p>

      <label>
        <span className="eyebrow">Store, league or team</span>
        <input
          className="control"
          value={organizerName}
          onChange={(e) => setOrganizerName(e.target.value)}
          placeholder="Rialto Games, Venice"
          maxLength={120}
          required
        />
      </label>
      <label>
        <span className="eyebrow">What you run</span>
        <textarea
          className="control"
          rows={3}
          value={events}
          onChange={(e) => setEvents(e.target.value)}
          placeholder="Weekly locals, 16-24 players, and a monthly Treasure Cup since March."
          maxLength={600}
          required
        />
      </label>
      <label>
        <span className="eyebrow">Somewhere it can be checked</span>
        <input
          className="control"
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://… a shop page, a Discord invite, a Limitless organizer"
          maxLength={300}
        />
      </label>

      {failed ? <p className="build-error">{failed}</p> : null}

      <div className="account-actions">
        <button type="submit" className="chip chip-link" disabled={busy}>
          {busy ? 'Sending…' : 'Ask for the role'}
        </button>
        {close}
      </div>
    </form>
  );
}

/**
 * Which providers open this account.
 *
 * Signing in with Discord and then with Google gives you two accounts, not one,
 * and that is Supabase behaving correctly rather than a bug: merging two sign-ins
 * because they carry the same address is an account takeover waiting for a provider
 * that does not verify addresses. So linking is something you ask for, from inside
 * the account you want to keep.
 *
 * It adds a provider to *this* account. It cannot merge two that already exist —
 * the second one comes back as "already linked to another user", and the way out of
 * that is to delete the one you do not want, from Supabase.
 */
function SignInMethods({
  providers,
  onLink,
  onUnlink,
}: {
  providers: string[];
  onLink: (provider: 'discord' | 'google') => Promise<void>;
  onUnlink: (provider: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const act = async (provider: string, run: () => Promise<void>) => {
    setBusy(provider);
    setFailed(null);
    try {
      await run();
    } catch (err) {
      setFailed(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="slab slab-pad account-ask">
      <p className="eyebrow">Ways in</p>
      <p className="muted account-ask-note">
        Each one opens this same account, with the same decks. Adding a second is worth
        doing before you need it: it is what stops a lost Discord login from being a lost
        account.
      </p>

      <ul className="account-providers-list">
        {PROVIDERS.map((p) => {
          const linked = providers.includes(p.id);
          /* Never offer to remove the last one — that locks the account. */
          const removable = linked && providers.length > 1;

          return (
            <li key={p.id}>
              <span>
                <b>{p.name}</b>
                <span className="muted"> {linked ? 'connected' : 'not connected'}</span>
              </span>
              {linked ? (
                removable ? (
                  <button
                    type="button"
                    className="account-link"
                    disabled={busy === p.id}
                    onClick={() => act(p.id, () => onUnlink(p.id))}
                  >
                    {busy === p.id ? 'Removing…' : 'Remove'}
                  </button>
                ) : (
                  <span className="muted" style={{ fontSize: '0.74rem' }}>
                    your only way in
                  </span>
                )
              ) : (
                <button
                  type="button"
                  className="chip chip-link"
                  disabled={busy === p.id}
                  onClick={() => act(p.id, () => onLink(p.id))}
                >
                  {busy === p.id ? 'Opening…' : `Connect ${p.name}`}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {failed ? <p className="build-error">{failed}</p> : null}
    </div>
  );
}

export default function AccountView() {
  const { session, profile, checked, signedIn, signOut, rename, providers, linkProvider, unlinkProvider } =
    useAccount();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');

  const withProvider = useCallback(async (provider: 'discord' | 'google') => {
    const client = supabase();
    if (!client) return;
    setBusy(true);
    const { error } = await client.auth.signInWithOAuth({
      provider,
      options: { redirectTo: authRedirectTo() },
    });
    if (error) {
      setNotice(error.message);
      setBusy(false);
    }
    /* On success the page navigates away, so there is nothing to reset. */
  }, []);

  const withEmail = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const client = supabase();
      if (!client) return;
      setBusy(true);
      setNotice(null);

      const { error } =
        mode === 'up'
          ? await client.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: authRedirectTo() },
            })
          : await client.auth.signInWithPassword({ email, password });

      if (error) setNotice(error.message);
      else if (mode === 'up') setNotice('Check your email to confirm the address.');
      setBusy(false);
    },
    [mode, email, password]
  );

  const resetPassword = useCallback(async () => {
    const client = supabase();
    if (!client || !email) {
      setNotice('Enter your email address first.');
      return;
    }
    setBusy(true);
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: authRedirectTo(),
    });
    setNotice(error ? error.message : 'If that address has an account, a reset link is on its way.');
    setBusy(false);
  }, [email]);

  if (!accountsEnabled) {
    return (
      <p className="empty">
        Accounts are not set up on this deployment. Everything else on the site works
        without one.
      </p>
    );
  }

  if (!checked) return <p className="muted">Checking…</p>;

  /* ------------------------------------------------------------- signed in */

  if (signedIn && session) {
    const name =
      profile?.display_name ||
      (session.user.user_metadata?.full_name as string) ||
      session.user.email ||
      'Signed in';

    return (
      <>
        <div className="account slab slab-pad" style={{ maxWidth: 'none' }}>
          <p className="eyebrow">Signed in</p>
          {renaming ? (
            <DisplayName
              current={profile?.display_name ?? ''}
              onDone={() => setRenaming(false)}
              onSave={rename}
            />
          ) : (
            <h2 className="display" style={{ margin: '0.3rem 0 0', fontSize: '1.3rem' }}>
              {name}{' '}
              <button
                type="button"
                className="account-link"
                style={{ verticalAlign: 'middle' }}
                onClick={() => setRenaming(true)}
              >
                Change
              </button>
            </h2>
          )}
          <p className="muted" style={{ fontSize: '0.8rem', marginTop: '0.4rem' }}>
            {profile?.role === 'organizer' ? (
              <>
                Organizer — you can{' '}
                <Link href="/submit" className="inline-link">
                  submit tournament results
                </Link>{' '}
                for review.
              </>
            ) : profile?.role === 'admin' ? (
              <>
                Reviewer —{' '}
                <Link href="/review" className="inline-link">
                  submissions waiting for review
                </Link>
                .
              </>
            ) : (
              'Player account. Submitting tournament results needs the organizer role.'
            )}
          </p>
          <button
            type="button"
            className="chip chip-link"
            style={{ marginTop: '1.2rem', padding: '0.5rem 0.9rem' }}
            onClick={signOut}
          >
            Sign out
          </button>
        </div>

        {/*
          Only for a plain account. An organizer has the role and an admin grants
          it; offering either of them a form to ask for what they already have, or
          hand out themselves, would be a page not paying attention.
        */}
        <SignInMethods providers={providers} onLink={linkProvider} onUnlink={unlinkProvider} />

        {profile && profile.role === 'user' ? <OrganizerRequest userId={session.user.id} /> : null}

        <SavedDecks />
      </>
    );
  }

  /* ------------------------------------------------------------ signed out */

  return (
    <div className="account">
      <div className="account-providers">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="chip chip-link account-provider"
            disabled={busy}
            onClick={() => withProvider(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {emailAuthEnabled ? (
        <form className="account-email slab slab-pad" onSubmit={withEmail}>
          <label className="eyebrow" htmlFor="account-email">
            Or use an email address
          </label>
          <input
            id="account-email"
            className="control"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="control"
            type="password"
            autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          <div className="account-actions">
            <button type="submit" className="chip chip-link" disabled={busy}>
              {mode === 'up' ? 'Create account' : 'Sign in'}
            </button>
            <button
              type="button"
              className="account-link"
              onClick={() => setMode(mode === 'up' ? 'in' : 'up')}
            >
              {mode === 'up' ? 'I already have one' : 'Create an account'}
            </button>
            {mode === 'in' ? (
              <button type="button" className="account-link" onClick={resetPassword}>
                Forgot password
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {notice ? <p className="account-notice">{notice}</p> : null}
    </div>
  );
}

/* --------------------------------------------------------------- decks */

/**
 * The decks on this account.
 *
 * Opening one is a link to the builder with its id, rather than a copy of the deck
 * in the address bar. The builder reads it back from the account, so the link is
 * short, and it stays correct after the deck is edited.
 */
function SavedDecks() {
  const [decks, setDecks] = useState<SavedDeck[] | null>(null);
  const [leaders, setLeaders] = useState<Leaders>({});
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([listDecks(), loadLeaders()])
      .then(([rows, table]) => {
        setDecks(rows);
        setLeaders(table);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  const remove = useCallback(
    async (id: string, name: string) => {
      /* Deleting is the one action here that cannot be undone, so it asks. */
      if (!globalThis.confirm(`Delete “${name}”? This cannot be undone.`)) return;
      setRemoving(id);
      try {
        await deleteDeck(id);
        setDecks((prev) => prev?.filter((d) => d.id !== id) ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not delete.');
      } finally {
        setRemoving(null);
      }
    },
    []
  );

  if (error) return <p className="account-notice">{error}</p>;
  if (!decks) return <p className="muted" style={{ marginTop: '1.5rem' }}>Loading your decks…</p>;

  return (
    <section className="section" style={{ paddingBottom: 0 }}>
      <div className="section-head">
        <h2 className="display">Your decks</h2>
        <span className="muted" style={{ fontSize: '0.78rem' }}>
          {decks.length === 0 ? 'None yet' : `${decks.length} saved`}
        </span>
      </div>

      {decks.length === 0 ? (
        <p className="empty">
          Nothing saved yet. Build one in the <Link href="/deckbuilder">deck builder</Link> and
          press Save.
        </p>
      ) : (
        <ul className="saved-decks">
          {decks.map((deck) => {
            const leader = leaders[deck.leader_id];
            const cards = deck.cards.reduce((n, c) => n + c.count, 0);
            return (
              <li key={deck.id} className="saved-deck">
                <Link href={`/deckbuilder?deck=${deck.id}`} className="saved-deck-open">
                  <img src={art(deck.leader_id, 96)} alt="" loading="lazy" />
                  <span style={{ minWidth: 0 }}>
                    <b>{deck.name}</b>
                    <span className="saved-deck-meta">
                      <Pips colors={leader?.c ?? []} />
                      {leader?.n ?? deck.leader_id}
                      <span className="dot">·</span>
                      {/* 50 plus the Leader, so an incomplete deck reads as incomplete. */}
                      <span className={cards === 50 ? undefined : 'muted'}>{cards}/50</span>
                      <span className="dot">·</span>
                      {deck.format}
                    </span>
                  </span>
                </Link>
                <button
                  type="button"
                  className="account-link"
                  disabled={removing === deck.id}
                  onClick={() => remove(deck.id, deck.name)}
                >
                  {removing === deck.id ? 'Deleting…' : 'Delete'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
