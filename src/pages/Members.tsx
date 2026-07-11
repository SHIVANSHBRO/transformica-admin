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

export function Members() {
  const toast = useToast();
  const [members, setMembers] = useState<Profile[]>([]);
  const [coaches, setCoaches] = useState<Profile[]>([]);
  const [links, setLinks] = useState<CoachLink[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [detail, setDetail] = useState<Profile | null>(null);

  const load = useCallback(async () => {
    const [{ data: clients }, { data: coachRows }, { data: linkRows }] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'client').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('role', 'coach').order('first_name'),
      supabase.from('coach_clients').select('*'),
    ]);
    setMembers((clients as Profile[]) ?? []);
    setCoaches((coachRows as Profile[]) ?? []);
    setLinks((linkRows as CoachLink[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const linkByClient = useMemo(() => new Map(links.map((l) => [l.client_id, l])), [links]);

  const filtered = members.filter((m) => {
    const q = search.trim().toLowerCase();
    if (q && !displayName(m).toLowerCase().includes(q) && !(m.phone ?? '').includes(q)) return false;
    const days = daysUntil(m.plan_expires_at);
    if (filter === 'expiring') return days !== null && days >= 0 && days <= 7;
    if (filter === 'expired') return days !== null && days < 0;
    if (filter === 'no_coach') return !linkByClient.has(m.id);
    return true;
  });

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

  return (
    <>
      <div className="card">
        <div className="row">
          <input
            className="grow"
            placeholder="Search by name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="muted">{filtered.length} member{filtered.length === 1 ? '' : 's'}</span>
          <button className="btn" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? 'Close' : '+ Add member'}
          </button>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
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
              return (
                <tr key={m.id}>
                  <td>
                    <button className="linklike" onClick={() => setDetail(m)} title="Open member profile">
                      {displayName(m)}
                    </button>
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
                    <select className="inline" value={link?.coach_id ?? ''} onChange={(e) => assignCoach(m.id, e.target.value)}>
                      <option value="">— none —</option>
                      {coaches.map((c) => (
                        <option key={c.id} value={c.id}>{displayName(c)}</option>
                      ))}
                    </select>
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
                  <td>
                    <button className="btn danger small" onClick={() => removeMember(m)}>Delete</button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="muted">No members match.</td></tr>
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName || !password || (!phone && !email)) {
      toast('Need a name, a password, and a phone or email', 'error');
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
    toast(`${role === 'coach' ? 'Coach' : 'Member'} created — share the password with them`);
    onDone();
  }

  return (
    <form className="row" style={{ marginTop: 14 }} onSubmit={submit}>
      <label className="field grow">
        First name
        <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Aarav" />
      </label>
      <label className="field grow">
        Phone (10-digit or +91…)
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" />
      </label>
      <label className="field grow">
        Email (optional)
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="them@example.com" />
      </label>
      <label className="field grow">
        Starter password
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 6 chars" />
      </label>
      <button className="btn" disabled={busy} style={{ alignSelf: 'flex-end' }}>
        {busy ? 'Creating…' : `Create ${role}`}
      </button>
    </form>
  );
}
