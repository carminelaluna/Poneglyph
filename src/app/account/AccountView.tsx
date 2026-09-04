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
/**
 * The two provider marks, inline.
 *
 * Inline rather than fetched, for the reason every other image on this site is
 * mirrored: hotlinking somebody's CDN is their bandwidth and their uptime, and
 * these are 1 KB of path data that would otherwise be two requests on the one
 * page a reader is waiting on. It also means they work in the static export with
 * nothing behind it.
 *
 * They are each provider's own mark, drawn in each provider's own colours,
 * because that is what both of them ask for on a button that signs you into them
 * — a wrong-coloured Google G is a worse answer than none. `aria-hidden` because
 * the button says which service it is in words already.
 */
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

/**
 * The name, and a menu behind it.
 *
 * This was a bordered card holding a name and a Sign out button, which is a lot of
 * furniture for two facts. The name is the only thing worth seeing at rest; what
 * you can *do* with the account belongs behind it, which is also where it can grow
 * without the page growing with it.
 *
 * Everything a menu has to do and a `<div>` does not: it closes on Escape and on a
 * click anywhere else, it says `aria-expanded` and `aria-haspopup` so a screen
 * reader announces it as a menu rather than a button that did nothing, and closing
 * puts focus back on the trigger so the keyboard does not lose its place.
 */
function AccountMenu({
  name,
  onRename,
  onSignOut,
}: {
  name: string;
  onRename: () => void;
  onSignOut: () => void;
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

    /* Pointer down rather than click: a menu that waits for mouseup feels stuck. */
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

  const choose = (act: () => void) => () => {
    setOpen(false);
    act();
  };

  return (
    <div className="who" ref={box}>
      <button
        type="button"
        ref={trigger}
        /* A chip, because that is what a small control looks like on this site. */
        className="chip who-name"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {name}
        <svg className="who-caret" viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      {open ? (
        <div className="who-menu" role="menu">
          <button type="button" role="menuitem" className="who-item" onClick={choose(onRename)}>
            Change name
          </button>
          <button type="button" role="menuitem" className="who-item" onClick={choose(onSignOut)}>
            Sign out
          </button>
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
        <button type="button" className="chip" onClick={() => setOpen(true)}>
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
        <button type="submit" className="chip" disabled={busy}>
          {busy ? 'Sending…' : 'Ask for the role'}
        </button>
        {close}
      </div>
    </form>
  );
}

export default function AccountView() {
  const { session, profile, checked, signedIn, signOut, rename } =
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
        {/*
          Who you are sits beside the heading rather than under it, which is why
          this is a sibling of the stack and not a member of it: `.account-page`
          is a grid, and only a direct child can be placed in its second column.
          It is one name and a way out — a row of its own made that look like the
          point of a page whose point is the decks below.
        */}
        <div className="account-who">
          {renaming ? (
            <DisplayName
              current={profile?.display_name ?? ''}
              onDone={() => setRenaming(false)}
              onSave={rename}
            />
          ) : (
            <AccountMenu name={name} onRename={() => setRenaming(true)} onSignOut={signOut} />
          )}
        </div>

        {/*
          A stack, because each of these is a bordered slab and nothing between
          them set a margin — they met edge to edge and read as one panel with
          rules drawn across it, measured at 0px, twice over.
        */}
        <div className="account-stack">
          {/*
            Only for a plain account. An organizer has the role and an admin grants
            it; offering either of them a form to ask for what they already have, or
            hand out themselves, would be a page not paying attention.
          */}
          {profile && profile.role === 'user' ? (
            <OrganizerRequest userId={session.user.id} />
          ) : null}

          <SavedDecks />
        </div>
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
            className="chip account-provider"
            disabled={busy}
            onClick={() => withProvider(p.id)}
          >
            <ProviderMark id={p.id} />
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
            <button type="submit" className="chip" disabled={busy}>
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
