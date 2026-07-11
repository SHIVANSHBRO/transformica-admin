import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { CoachLink, PLAN_LABELS, Profile, daysUntil, displayName } from '../types';
import { ExpiryBadge } from './Members';

type Order = { id: string; user_id: string; total_inr: number; status: string; created_at: string };

export function Overview() {
  const [members, setMembers] = useState<Profile[]>([]);
  const [coaches, setCoaches] = useState<Profile[]>([]);
  const [links, setLinks] = useState<CoachLink[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    supabase.from('profiles').select('*').eq('role', 'client').then(({ data }) => setMembers((data as Profile[]) ?? []));
    supabase.from('profiles').select('*').eq('role', 'coach').then(({ data }) => setCoaches((data as Profile[]) ?? []));
    supabase.from('coach_clients').select('*').then(({ data }) => setLinks((data as CoachLink[]) ?? []));
    supabase.from('supplement_orders').select('id, user_id, total_inr, status, created_at').order('created_at', { ascending: false }).limit(6)
      .then(({ data }) => setOrders((data as Order[]) ?? []));
  }, []);

  const nameById = new Map(members.map((m) => [m.id, displayName(m)]));
  const assigned = new Set(links.map((l) => l.client_id));

  const paying = members.filter((m) => m.plan !== 'free');
  const expired = members.filter((m) => (daysUntil(m.plan_expires_at) ?? 1) < 0);
  const expiringSoon = members
    .filter((m) => {
      const d = daysUntil(m.plan_expires_at);
      return d !== null && d >= 0 && d <= 7;
    })
    .sort((a, b) => (daysUntil(a.plan_expires_at) ?? 0) - (daysUntil(b.plan_expires_at) ?? 0));
  const unassigned = members.filter((m) => !assigned.has(m.id));
  const newThisWeek = members.filter((m) => Date.now() - new Date(m.created_at).getTime() < 7 * 86400000);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
        <Stat label="Members" value={members.length} sub={`+${newThisWeek.length} this week`} />
        <Stat label="Paying" value={paying.length} sub={`${members.length ? Math.round((paying.length / members.length) * 100) : 0}% of members`} />
        <Stat label="Coaches" value={coaches.length} sub={`${assigned.size} members assigned`} />
        <Stat label="Expiring ≤ 7d" value={expiringSoon.length} tone={expiringSoon.length ? 'warn' : undefined} sub="renewal window" />
        <Stat label="Expired" value={expired.length} tone={expired.length ? 'bad' : undefined} sub="need follow-up" />
        <Stat label="No coach" value={unassigned.length} tone={unassigned.length ? 'warn' : undefined} sub="unassigned members" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <h2>Renewals to chase</h2>
          {expiringSoon.length === 0 && expired.length === 0 && <p className="muted">Nothing expiring — all clear. 🎉</p>}
          <table>
            <tbody>
              {[...expired, ...expiringSoon].slice(0, 8).map((m) => (
                <tr key={m.id}>
                  <td><strong>{displayName(m)}</strong>{m.phone && <div className="muted">{m.phone}</div>}</td>
                  <td>{PLAN_LABELS[m.plan]}</td>
                  <td><ExpiryBadge date={m.plan_expires_at} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <h2>Members without a coach</h2>
          {unassigned.length === 0 && <p className="muted">Everyone's assigned. 🎉</p>}
          <table>
            <tbody>
              {unassigned.slice(0, 8).map((m) => (
                <tr key={m.id}>
                  <td><strong>{displayName(m)}</strong></td>
                  <td className="muted">{m.phone ?? '—'}</td>
                  <td className="muted">joined {new Date(m.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {unassigned.length > 8 && <p className="muted">…and {unassigned.length - 8} more in the Members tab.</p>}
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <h2>Recent supplement orders</h2>
          {orders.length === 0 && <p className="muted">No orders yet.</p>}
          <table>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td><strong>{nameById.get(o.user_id) ?? 'Member'}</strong></td>
                  <td>₹{o.total_inr.toLocaleString('en-IN')}</td>
                  <td><span className="badge dim">{o.status}</span></td>
                  <td className="muted">{new Date(o.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: 'warn' | 'bad' }) {
  const valueColor = tone === 'bad' ? 'var(--red)' : tone === 'warn' ? 'var(--amber)' : 'var(--ink)';
  return (
    <div className="card" style={{ marginBottom: 0, padding: 14 }}>
      <div className="muted" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: 'Montserrat', fontWeight: 700, fontSize: 26, marginTop: 4, color: valueColor }}>{value}</div>
      {sub && <div className="muted" style={{ marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
