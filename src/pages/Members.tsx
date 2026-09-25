import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, adminOp } from '../supabase';
import { useToast } from '../App';
import { MemberDetail } from '../components/MemberDetail';
import { CoachLink, PLAN_LABELS, Profile, daysUntil, displayName } from '../types';

const STATUSES: CoachLink['status'][] = ['lead', 'active', 'paused', 'churned'];

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'expiring', label: 'Expiring ≤ 7d' },
  { key: 'expired', label: 'Expired' },
  { key: 'no_coach', label: 'No coach' },
] as const;
type FilterKey = (typeof FILTERS)[number]['key'];

// Which accounts to list. Defaults to members, but nobody is ever unreachable:
// the owner's own login is an ADMIN (0017) and used to appear on no tab.
const ROLES = [
  { key: 'client', label: 'Members' },
  { key: 'coach', label: 'Coaches' },
  { key: 'admin', label: 'Admins' },
  { key: 'all', label: 'Everyone' },
] as const;
type RoleKey = (typeof ROLES)[number]['key'];

// PostgREST returns at most 1,000 rows per request; page past it.
const PAGE = 1000;
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

type Directory = Map<string, { email: string | null; lastSignIn: string | null }>;

const digits = (s: string) => s.replace(/\D/g, '');

/** Every word typed must appear in the name, the email or the phone number. */
function matches(m: Profile, email: string | null, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = `${displayName(m)} ${email ?? ''}`.toLowerCase();
  const phone = digits(m.phone ?? '');
  return words.every((w) => {
    if (hay.includes(w)) return true;
    // Phone: compare digits only, so "98765 43210", "+91 9876543210" and
    // "919876543210" all find the same member.
    const d = digits(w);
    return d.length >= 3 && phone.includes(d.length > 10 ? d.slice(-10) : d);
  });
}

/** Name, or a clear stand-in: signup stores "there" when no name was given. */
function nameOf(m: Profile): string {
  const n = displayName(m).trim();
  return !n || n.toLowerCase() === 'there' ? 'No name' : n;
}

export function Members() {
  const toast = useToast();
  // Every account (all roles); `members` is just the ones the role filter shows.
  const [accounts, setAccounts] = useState<Profile[]>([]);
  const [links, setLinks] = useState<CoachLink[]>([]);
  const [directory, setDirectory] = useState<Directory>(new Map());
  const [directoryMissing, setDirectoryMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<RoleKey>('client');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [detail, setDetail] = useState<Profile | null>(null);
  const setMembers = setAccounts; // row edits patch the full account list

  const load = useCallback(async () => {
    try {
      const [profiles, linkRows] = await Promise.all([
        fetchAll<Profile>((a, b) => supabase.from('profiles').select('*').order('created_at', { ascending: false }).order('id').range(a, b)),
        fetchAll<CoachLink>((a, b) => supabase.from('coach_clients').select('*').order('id').range(a, b)),
      ]);
      setAccounts(profiles);
      setLinks(linkRows);
      setLoadError(null);
    } catch (e) {
      // Surface it — an empty table with no message looks like "no members".
      setLoadError(e instanceof Error ? e.message : String(e));
    }
    // Emails come from auth.users via 0093. Optional: without it the list
    // still works, only email search is off (and we say so).
    try {
      const rows = await fetchAll<{ id: string; email: string | null; last_sign_in_at: string | null }>((a, b) =>
        supabase.rpc('admin_account_directory').range(a, b)
      );
      setDirectory(new Map(rows.map((r) => [r.id, { email: r.email, lastSignIn: r.last_sign_in_at }])));
      setDirectoryMissing(false);
    } catch (e) {
      console.warn('admin_account_directory failed:', e);
      setDirectoryMissing(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const linkByClient = useMemo(() => new Map(links.map((l) => [l.client_id, l])), [links]);
  const coaches = useMemo(() => accounts.filter((a) => a.role === 'coach').sort((a, b) => displayName(a).localeCompare(displayName(b))), [accounts]);
  const members = useMemo(() => (role === 'all' ? accounts : accounts.filter((a) => a.role === role)), [accounts, role]);
  const roleCounts = useMemo(() => {
    const c: Record<RoleKey, number> = { client: 0, coach: 0, admin: 0, all: accounts.length };
    accounts.forEach((a) => (c[a.role] += 1));
    return c;
  }, [accounts]);

  const q = search.trim();
  const filtered = members.filter((m) => {
    if (!matches(m, directory.get(m.id)?.email ?? null, q)) return false;
    const days = daysUntil(m.plan_expires_at);
    if (filter === 'expiring') return days !== null && days >= 0 && days <= 7;
    if (filter === 'expired') return days !== null && days < 0;
    if (filter === 'no_coach') return !linkByClient.has(m.id);
    return true;
  });

  // A search that finds nothing here but DOES match another role — say so,
  // rather than let an admin/coach account look like it doesn't exist.
  const elsewhere =
    role === 'all' || !q ? 0 : accounts.filter((a) => a.role !== role && matches(a, directory.get(a.id)?.email ?? null, q)).length;

  async function updateProfile(id: string, patch: Partial<Profile>, okMessage: string) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', id);
    if (error) {
      toast(error.message, 'error');
      return;
    }
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    toast(okMessage);
  }

  async function assignCoach(clientId: string, coachId: string) {
    if (!coachId) {
      const { error } = await supabase.from('coach_clients').delete().eq('client_id', clientId);
      if (error) return toast(error.message, 'error');
      toast('Coach unassigned');
    } else {
      const existing = linkByClient.get(clientId);
      const { error } = existing
        ? await supabase.from('coach_clients').update({ coach_id: coachId }).eq('client_id', clientId)
        : await supabase.from('coach_clients').insert({ coach_id: coachId, client_id: clientId, status: 'active' });
      if (error) return toast(error.message, 'error');
      toast('Coach assigned');
    }
    await load();
  }

  async function setStatus(clientId: string, status: CoachLink['status']) {
    const { error } = await supabase.from('coach_clients').update({ status }).eq('client_id', clientId);
    if (error) return toast(error.message, 'error');
    setLinks((prev) => prev.map((l) => (l.client_id === clientId ? { ...l, status } : l)));
    toast('Status updated');
  }

  async function removeMember(m: Profile) {
    if (!window.confirm(`Permanently delete ${displayName(m)} and ALL their data? This cannot be undone.`)) return;
    const res = await adminOp({ action: 'delete_user', user_id: m.id });
    if (res.error) return toast(res.error, 'error');
    toast('Member deleted');
    await load();
  }

  // Emails a fresh sign-in code. Works for any email account, not just invited
  // ones — it's also the "they're locked out and forgot their password" fix.
  async function resendInvite(m: Profile) {
    const res = await adminOp({ action: 'resend_invite', user_id: m.id });
    if (res.error) return toast(res.error, 'error');
    toast(`Sign-in code sent to ${res.email ?? displayName(m)}`);
  }

  return (
    <>
      <div className="card">
        <div className="row">
          <input
            className="grow"
            placeholder={directoryMissing ? 'Search by name or phone…' : 'Search by name, email or phone…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="muted">{filtered.length} {role === 'client' ? 'member' : 'account'}{filtered.length === 1 ? '' : 's'}</span>
          <button className="btn" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? 'Close' : '+ Add member'}
          </button>
        </div>
        {loadError && (
          <div className="error-box" style={{ marginTop: 10 }}>
            Couldn't load accounts: {loadError} <button className="btn ghost small" onClick={load}>Retry</button>
          </div>
        )}
        {directoryMissing && !loadError && (
          <div className="muted" style={{ marginTop: 8 }}>
            Email search is off — paste migration <code>0093_admin_account_directory.sql</code> to turn it on.
          </div>
        )}
        <div className="row" style={{ marginTop: 10 }}>
          {ROLES.map((r) => (
            <button key={r.key} className={`chip${role === r.key ? ' active' : ''}`} onClick={() => setRole(r.key)}>
              {r.label} · {roleCounts[r.key]}
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          {FILTERS.map((f) => (
            <button key={f.key} className={`chip${filter === f.key ? ' active' : ''}`} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        {showAdd && (
          <AddUserForm
            role="client"
            onDone={() => {
              setShowAdd(false);
              load();
            }}
          />
        )}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Member</th>
              <th>Phone</th>
              <th>Plan</th>
              <th>Expires</th>
              <th></th>
              <th>Coach</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => {
              const link = linkByClient.get(m.id);
              const email = directory.get(m.id)?.email;
              const isClient = m.role === 'client';
              return (
                <tr key={m.id}>
                  <td>
                    <button className="linklike" onClick={() => setDetail(m)} title="Open member profile">
                      {nameOf(m)}
                    </button>
                    {!isClient && <span className={`badge ${m.role === 'admin' ? 'warn' : 'dim'}`} style={{ marginLeft: 6 }}>{m.role}</span>}
                    {email && <div className="muted">{email}</div>}
                    <div className="muted">joined {new Date(m.created_at).toLocaleDateString()}</div>
                  </td>
                  <td>{m.phone ?? <span className="muted">—</span>}</td>
                  <td>
                    <select
                      className="inline"
                      value={m.plan}
                      onChange={(e) => {
                        const plan = e.target.value as Profile['plan'];
                        // Upgrading past a stale expiry would auto-downgrade
                        // again on the user's next app open — clear it.
                        const expiryStale = plan !== 'free' && (daysUntil(m.plan_expires_at) ?? 0) < 0;
                        updateProfile(
                          m.id,
                          { plan, ...(expiryStale ? { plan_expires_at: null } : {}) },
                          expiryStale
                            ? `Plan → ${PLAN_LABELS[plan]} · stale expiry cleared — set a new date`
                            : `Plan → ${PLAN_LABELS[plan]}`
                        );
                      }}
                    >
                      {Object.entries(PLAN_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="date"
                      value={m.plan_expires_at ?? ''}
                      onChange={(e) => updateProfile(m.id, { plan_expires_at: e.target.value || null }, 'Expiry updated')}
                    />
                  </td>
                  <td><ExpiryBadge date={m.plan_expires_at} /></td>
                  <td>
                    {isClient ? (
                      <select className="inline" value={link?.coach_id ?? ''} onChange={(e) => assignCoach(m.id, e.target.value)}>
                        <option value="">— none —</option>
                        {coaches.map((c) => (
                          <option key={c.id} value={c.id}>{displayName(c)}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {link ? (
                      <select className="inline" value={link.status} onChange={(e) => setStatus(m.id, e.target.value as CoachLink['status'])}>
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn ghost small" onClick={() => resendInvite(m)} title="Email them a fresh sign-in code">
                      Resend invite
                    </button>
                    {/* Deleting an admin from a list row is one mis-click from
                        locking yourself out of this panel — do that in SQL. */}
                    {m.role !== 'admin' && <button className="btn danger small" onClick={() => removeMember(m)}>Delete</button>}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
                  {elsewhere > 0 ? (
                    <>
                      No {ROLES.find((r) => r.key === role)?.label.toLowerCase()} match — but {elsewhere} other account{elsewhere === 1 ? '' : 's'} do.{' '}
                      <button className="btn ghost small" onClick={() => setRole('all')}>Show everyone</button>
                    </>
                  ) : (
                    'No accounts match.'
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <MemberDetail
          member={detail}
          coachName={(() => {
            const link = linkByClient.get(detail.id);
            const coach = link ? coaches.find((c) => c.id === link.coach_id) : null;
            return coach ? displayName(coach) : null;
          })()}
          onClose={() => setDetail(null)}
          onPatch={(patch) => {
            setMembers((prev) => prev.map((m) => (m.id === detail.id ? { ...m, ...patch } : m)));
            setDetail((d) => (d ? { ...d, ...patch } : d));
          }}
        />
      )}
    </>
  );
}

export function ExpiryBadge({ date }: { date: string | null }) {
  const days = daysUntil(date);
  if (days === null) return <span className="badge dim">no expiry</span>;
  if (days < 0) return <span className="badge bad">expired {-days}d ago</span>;
  if (days === 0) return <span className="badge bad">expires today</span>;
  if (days <= 7) return <span className="badge warn">{days}d left</span>;
  return <span className="badge ok">{days}d left</span>;
}

export function AddUserForm({ role, onDone }: { role: 'client' | 'coach'; onDone: () => void }) {
  const toast = useToast();
  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  // 'invite' emails them a sign-in code and nobody ever handles a password;
  // 'password' is the original flow, kept for phone-only members who have no
  // email address to send a code to.
  const [method, setMethod] = useState<'invite' | 'password'>('invite');

  // The coach app signs in with EMAIL ONLY, so a coach created with just a
  // phone number can never log in — and nothing would tell you until they
  // tried. Members are the other way round: phone is their primary identity.
  const isCoach = role === 'coach';
  const isInvite = method === 'invite';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName) {
      toast('Need a first name', 'error');
      return;
    }

    if (isInvite) {
      // An invite IS an email — there is no code to send without one.
      if (!email.trim()) {
        toast('An invite is sent by email, so an email address is required', 'error');
        return;
      }
      setBusy(true);
      const res = await adminOp({ action: 'invite_user', first_name: firstName, role, email: email.trim() });
      setBusy(false);
      if (res.error) {
        toast(res.error, 'error');
        return;
      }
      // The function returns a warning (not an error) when the account was
      // created but the email bounced — surface it instead of claiming success.
      if (res.warning) toast(String(res.warning), 'error');
      else toast(`Invite sent to ${email.trim()} — they sign in with the emailed code`);
      setFirstName('');
      setPhone('');
      setEmail('');
      onDone();
      return;
    }

    if (!password) {
      toast('Need a password', 'error');
      return;
    }
    if (isCoach && !email.trim()) {
      toast('Coaches sign in with their email — an email address is required', 'error');
      return;
    }
    if (!isCoach && !phone && !email) {
      toast('Need a phone or email', 'error');
      return;
    }
    if (password.length < 6) {
      toast('Password must be at least 6 characters', 'error');
      return;
    }
    setBusy(true);
    const res = await adminOp({
      action: 'create_user',
      first_name: firstName,
      role,
      password,
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
    });
    setBusy(false);
    if (res.error) {
      toast(res.error, 'error');
      return;
    }
    toast(`${isCoach ? 'Coach' : 'Member'} created — share the email and password with them`);
    setFirstName('');
    setPhone('');
    setEmail('');
    setPassword('');
    onDone();
  }

  return (
    <>
      <div className="row" style={{ marginTop: 14, gap: 8 }}>
        <button
          type="button"
          className={isInvite ? 'btn' : 'btn ghost'}
          onClick={() => setMethod('invite')}
        >
          Send an invite
        </button>
        <button
          type="button"
          className={!isInvite ? 'btn' : 'btn ghost'}
          onClick={() => setMethod('password')}
        >
          Set a starter password
        </button>
      </div>

      <form className="row" style={{ marginTop: 10 }} onSubmit={submit}>
        <label className="field grow">
          First name
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder={isCoach ? 'Neha' : 'Aarav'} />
        </label>
        <label className="field grow">
          {isInvite ? 'Email (the invite goes here)' : isCoach ? 'Email (they sign in with this)' : 'Email (optional)'}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={isCoach ? 'neha@transformica.in' : 'them@example.com'}
            autoComplete="off"
          />
        </label>
        {!isInvite && (
          <label className="field grow">
            {isCoach ? 'Phone (optional)' : 'Phone (10-digit or +91…)'}
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" />
          </label>
        )}
        {!isInvite && (
          <label className="field grow">
            Starter password
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 6 chars" autoComplete="new-password" />
          </label>
        )}
        <button className="btn" disabled={busy} style={{ alignSelf: 'flex-end' }}>
          {busy ? (isInvite ? 'Sending…' : 'Creating…') : isInvite ? 'Send invite' : `Create ${role}`}
        </button>
      </form>

      {isInvite ? (
        <p className="muted" style={{ margin: '10px 0 0' }}>
          Creates the account and emails a sign-in code — no password is ever shared. They open the{' '}
          <strong>{isCoach ? 'Transformica Coach' : 'Transformica'}</strong> app, enter this email, and tap{' '}
          <strong>“Email me a code instead”</strong>. Codes expire, so if they take a while they can just tap that
          button again for a fresh one; you can also use <strong>Resend invite</strong> on their row.
        </p>
      ) : isCoach ? (
        <p className="muted" style={{ margin: '10px 0 0' }}>
          The coach signs in to the <strong>Transformica Coach</strong> app with this email and password. There is no
          sign-up in that app — every coach account is created here.
        </p>
      ) : (
        <p className="muted" style={{ margin: '10px 0 0' }}>
          Use this for members with no email address — phone plus a starter password you pass on yourself.
        </p>
      )}
    </>
  );
}
