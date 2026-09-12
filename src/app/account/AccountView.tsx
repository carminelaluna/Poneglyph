'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
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

function ProviderMark({ id }: { id: 'discord' | 'google' }) {
  if (id === 'discord') {
    return (
      <svg className="provider-mark" viewBox="0 0 127.14 96.36" aria-hidden="true">
        <path
          fill="#5865f2"
          d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z"
        />
      </svg>
    );
  }

  return (
    <svg className="provider-mark" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285f4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17Z"
      />
      <path
        fill="#34a853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46Z"
      />
      <path
        fill="#fbbc05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7Z"
      />
      <path
        fill="#ea4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07Z"
      />
    </svg>
  );
}

type MenuItem = {
  label: string;
  href?: string;
  onSelect?: () => void;
};

function AccountMenu({
  name,
  items,
  loading = false,
}: {
  name: string | null;
  items: MenuItem[];
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const close = () => {
      setOpen(false);
      trigger.current?.focus();
    };

    const away = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  return (
    <div className="who" ref={box}>
      <button
        type="button"
        ref={trigger}
        className="chip who-name"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={loading}
        disabled={loading}
        onClick={() => setOpen(!open)}
      >
        {loading ? <span className="who-waiting" aria-label="Loading your account" /> : name}
        <svg className="who-caret" viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      {open ? (
        <div className="who-menu" role="menu">
          {items.map((item) =>
            item.href ? (
              <Link
                key={item.label}
                href={item.href}
                role="menuitem"
                className="who-item"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className="who-item"
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
              >
                {item.label}
              </button>
            )
          )}
        </div>
      ) : null}
    </div>
  );
}

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
      <button type="submit" className="chip" disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button type="button" className="account-link" onClick={onDone}>
        Cancel
      </button>
      {failed ? <p className="build-error">{failed}</p> : null}
    </form>
  );
}

function OrganizerRequest({
  userId,
  open,
  onClose,
}: {
  userId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [request, setRequest] = useState<OrganizerRequestRow | null | undefined>(undefined);
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
      load();
    } catch (err) {
      setFailed(err instanceof Error ? err.message : 'Could not send that.');
    } finally {
      setBusy(false);
    }
  };

  if (request === undefined) return null;

  const status = request?.status;

  if (!open) return null;

  const close = (
    <button type="button" className="account-link" onClick={onClose}>
      Close
    </button>
  );

  if (request && status === 'pending') {
    return (
      <div className="slab slab-pad account-ask">
        <p className="eyebrow">Organizer role</p>
        <p style={{ margin: '0.4rem 0 0' }}>Waiting for review.</p>

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
        <button type="submit" className="chip" disabled={busy}>
          {busy ? 'Sending…' : 'Ask for the role'}
        </button>
        {close}
      </div>
    </form>
  );
}

export default function AccountView() {
  const { session, profile, checked, roleKnown, signedIn, signOut, rename } =
    useAccount();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [asking, setAsking] = useState(false);

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
      else if (mode === 'up')
        setNotice(
          'Check your email to confirm the address. If nothing arrives, you may already ' +
            'have an account from Discord or Google on that address — sign in with it instead.'
        );
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

  if (signedIn && session) {
    const name = roleKnown
      ? profile?.display_name ||
        (session.user.user_metadata?.full_name as string) ||
        session.user.email ||
        'Signed in'
      : null;

    return (
      <>
        <div className="account-who">
          {renaming ? (
            <DisplayName
              current={profile?.display_name ?? ''}
              onDone={() => setRenaming(false)}
              onSave={rename}
            />
          ) : (
            <AccountMenu
              name={name}
              loading={!roleKnown}
              items={[
                { label: 'Change name', onSelect: () => setRenaming(true) },
                ...(profile?.role === 'user'
                  ? [{ label: 'Organizer role', onSelect: () => setAsking(true) }]
                  : []),
                ...(profile?.role === 'organizer' || profile?.role === 'admin'
                  ? [{ label: 'Submit a tournament', href: '/submit' }]
                  : []),
                ...(profile?.role === 'admin'
                  ? [{ label: 'Review submissions', href: '/review' }]
                  : []),
                { label: 'Sign out', onSelect: signOut },
              ]}
            />
          )}
        </div>

        <div className="account-stack">
          {profile && profile.role === 'user' ? (
            <OrganizerRequest
              userId={session.user.id}
              open={asking}
              onClose={() => setAsking(false)}
            />
          ) : null}

          <SavedDecks />
        </div>
      </>
    );
  }

  return (
    <div className="account">
      <div className="account-providers">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="chip account-provider"
            disabled={busy}
            onClick={() => withProvider(p.id)}
          >
            <ProviderMark id={p.id} />
            {p.label}
          </button>
        ))}
      </div>

      <form className="account-email slab slab-pad" onSubmit={withEmail}>
        <fieldset className="account-email-fields" disabled={!emailAuthEnabled || busy}>
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
            <button type="submit" className="chip">
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
        </fieldset>

        {emailAuthEnabled ? null : (
          <p className="account-todo">
            <b>Not finished.</b> Confirmation and password-reset mail needs an SMTP
            provider, and there is none configured — so an account made here could not
            be recovered. Sign in with Discord or Google instead; either can have an
            email address added to it later.
            <span className="account-todo-note">
              To finish: set a custom SMTP provider on the Supabase project, then set{' '}
              <code className="mono">NEXT_PUBLIC_AUTH_EMAIL=1</code>. The form and the
              reset flow are already written.
            </span>
          </p>
        )}
      </form>

      {notice ? <p className="account-notice">{notice}</p> : null}
    </div>
  );
}

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
