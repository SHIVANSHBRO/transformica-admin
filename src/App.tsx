import { createContext, useContext, useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { Overview } from './pages/Overview';
import { Members } from './pages/Members';
import { Coaches } from './pages/Coaches';
import { WorkoutPlans } from './pages/WorkoutPlans';
import { DietPlans } from './pages/DietPlans';
import { Content } from './pages/Content';
import { Challenges } from './pages/Challenges';
import { Chats } from './pages/Chats';
import { Store } from './pages/Store';
import { Feedback } from './pages/Feedback';

type ToastFn = (message: string, kind?: 'ok' | 'error') => void;
const ToastContext = createContext<ToastFn>(() => {});
export const useToast = () => useContext(ToastContext);

const TABS = ['Overview', 'Members', 'Coaches', 'Chats', 'Workout plans', 'Diet plans', 'Content', 'Store', 'Challenges', 'Feedback'] as const;
type Tab = (typeof TABS)[number];

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('Overview');
  const [toast, setToast] = useState<{ message: string; kind: 'ok' | 'error' } | null>(null);

  const showToast = useCallback<ToastFn>((message, kind = 'ok') => {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => {
    // Always resolve booting, even if auth init fails — otherwise the app is
    // stuck on a blank screen with no clue why.
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch((e: unknown) => setBootError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBooting(false));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setRole(null);
      return;
    }
    // A failed role lookup falls through to 'unknown' → the "not an admin"
    // screen, never a blank one.
    supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(
        ({ data }) => setRole(data?.role ?? 'unknown'),
        () => setRole('unknown')
      );
  }, [session]);

  if (bootError) return <Splash message={`Couldn't reach the server: ${bootError}`} retry />;
  if (booting) return <Splash message="Loading…" />;
  if (!session) return <Login />;
  if (role === null) return <Splash message="Checking access…" />;

  if (role !== 'admin') {
    return (
      <div className="login-wrap">
        <div className="login">
          <Brand />
          <div className="error-box">
            This account isn't an admin. Run migration 0017 (it promotes the owner account), or set{' '}
            <code>role = 'admin'</code> on your profile in Supabase, then sign in again.
          </div>
          <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <ToastContext.Provider value={showToast}>
      <div className="shell">
        <div className="topbar">
          <Brand />
          <div className="row">
            <span className="muted">{session.user.email}</span>
            <button className="btn ghost small" onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
        </div>

        <div className="tabs">
          {TABS.map((t) => (
            <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>

        {tab === 'Overview' && <Overview />}
        {tab === 'Members' && <Members />}
        {tab === 'Coaches' && <Coaches />}
        {tab === 'Chats' && <Chats />}
        {tab === 'Workout plans' && <WorkoutPlans />}
        {tab === 'Diet plans' && <DietPlans />}
        {tab === 'Content' && <Content />}
        {tab === 'Store' && <Store />}
        {tab === 'Feedback' && <Feedback />}
        {tab === 'Challenges' && <Challenges />}
      </div>
      {toast && <div className={`toast${toast.kind === 'error' ? ' error' : ''}`}>{toast.message}</div>}
    </ToastContext.Provider>
  );
}

// A visible booting/loading/error state so the panel never shows a bare white
// screen while auth resolves.
function Splash({ message, retry }: { message: string; retry?: boolean }) {
  return (
    <div className="login-wrap">
      <div className="login">
        <Brand />
        <div className={retry ? 'error-box' : 'muted'} style={{ textAlign: 'center' }}>{message}</div>
        {retry && (
          <button className="btn ghost" onClick={() => location.reload()}>
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark">T</div>
      <div>
        <h1>Transformica</h1>
        <span>Admin console</span>
      </div>
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message);
  }

  return (
    <div className="login-wrap">
      <form className="login" onSubmit={submit}>
        <Brand />
        <label className="field">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        <label className="field">
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="error-box">{error}</div>}
        <button className="btn" disabled={busy || !email || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
