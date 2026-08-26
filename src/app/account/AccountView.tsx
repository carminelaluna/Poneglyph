'use client';

import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { accountsEnabled, authRedirectTo, emailAuthEnabled, supabase } from '@/lib/supabase';

/**
 * Signing in, and what you see once you are.
 *
 * Three ways in, and they are not equivalent. Discord and Google send no mail at
 * all — the provider vouches for the person and nothing has to reach an inbox. Email
 * and password does, for confirmation and for reset, and is hidden until SMTP is
 * configured because an account whose password cannot be reset is a trap.
 *
 * All of it runs in the browser against Supabase. There is no server here to hold a
 * session, which is why the token arrives in the URL fragment.
 */

type Profile = { display_name: string | null; role: 'user' | 'organizer' };

const PROVIDERS = [
  { id: 'discord', label: 'Continue with Discord' },
  { id: 'google', label: 'Continue with Google' },
] as const;

export default function AccountView() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checked, setChecked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');

  useEffect(() => {
    const client = supabase();
    if (!client) {
      setChecked(true);
      return;
    }

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

  /* The profile row is created by a trigger on sign-up, so it is read, never written. */
  useEffect(() => {
    const client = supabase();
    if (!client || !session) {
      setProfile(null);
      return;
    }
    client
      .from('profiles')
      .select('display_name, role')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setProfile((data as Profile) ?? null));
  }, [session]);

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

  const signOut = useCallback(async () => {
    await supabase()?.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

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

  if (session) {
    const name =
      profile?.display_name ||
      (session.user.user_metadata?.full_name as string) ||
      session.user.email ||
      'Signed in';

    return (
      <div className="account slab slab-pad">
        <p className="eyebrow">Signed in</p>
        <h2 className="display" style={{ margin: '0.3rem 0 0', fontSize: '1.3rem' }}>
          {name}
        </h2>
        <p className="muted" style={{ fontSize: '0.8rem', marginTop: '0.4rem' }}>
          {profile?.role === 'organizer'
            ? 'Organizer — you can submit tournament results for review.'
            : 'Player account. Saving decks is coming; submitting tournaments needs the organizer role, which is granted by hand.'}
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
