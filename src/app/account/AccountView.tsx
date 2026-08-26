'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import Pips from '@/components/Pips';
import { art } from '@/lib/art';
import { loadLeaders, type Leaders } from '@/lib/shards';
import { accountsEnabled, authRedirectTo, emailAuthEnabled, supabase } from '@/lib/supabase';
import { deleteDeck, listDecks, useAccount, type SavedDeck } from '@/lib/useAccount';

/**
 * Signing in, and what you have once you are.
 *
 * Three ways in, and they are not equivalent. Discord and Google send no mail at
 * all — the provider vouches for the person. Email and password does, for
 * confirmation and for reset, and is hidden until SMTP is configured because an
 * account whose password cannot be reset is a trap.
 */

const PROVIDERS = [
  { id: 'discord', label: 'Continue with Discord' },
  { id: 'google', label: 'Continue with Google' },
] as const;

export default function AccountView() {
  const { session, profile, checked, signedIn, signOut } = useAccount();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
          <h2 className="display" style={{ margin: '0.3rem 0 0', fontSize: '1.3rem' }}>
            {name}
          </h2>
          <p className="muted" style={{ fontSize: '0.8rem', marginTop: '0.4rem' }}>
            {profile?.role === 'organizer' ? (
              <>
                Organizer — you can <Link href="/submit">submit tournament results</Link> for
                review.
              </>
            ) : (
              'Player account. Submitting tournaments needs the organizer role, which is granted by hand.'
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
