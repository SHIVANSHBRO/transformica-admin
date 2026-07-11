import { useCallback, useEffect, useState } from 'react';
import { supabase, adminOp } from '../supabase';
import { useToast } from '../App';
import { CoachLink, Profile, displayName } from '../types';
import { AddUserForm } from './Members';

export function Coaches() {
  const toast = useToast();
  const [coaches, setCoaches] = useState<Profile[]>([]);
  const [links, setLinks] = useState<CoachLink[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    const [{ data: coachRows }, { data: linkRows }] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'coach').order('first_name'),
      supabase.from('coach_clients').select('*'),
    ]);
    setCoaches((coachRows as Profile[]) ?? []);
    setLinks((linkRows as CoachLink[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function clientCount(coachId: string) {
    return links.filter((l) => l.coach_id === coachId).length;
  }

  async function removeCoach(c: Profile) {
    const n = clientCount(c.id);
    const warning = n > 0 ? ` Their ${n} client assignment${n === 1 ? '' : 's'} will be cleared (clients themselves are kept).` : '';
    if (!window.confirm(`Delete coach ${displayName(c)}?${warning}`)) return;
    const res = await adminOp({ action: 'delete_user', user_id: c.id });
    if (res.error) return toast(res.error, 'error');
    toast('Coach removed');
    await load();
  }

  return (
    <>
      <div className="card">
        <div className="row">
          <h2 style={{ margin: 0 }}>Coaches</h2>
          <span className="muted">{coaches.length} total</span>
          <div className="spacer" />
          <button className="btn" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? 'Close' : '+ Add coach'}
          </button>
        </div>
        {showAdd && (
          <AddUserForm
            role="coach"
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
              <th>Coach</th>
              <th>Phone</th>
              <th>Clients</th>
              <th>Since</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {coaches.map((c) => (
              <tr key={c.id}>
                <td><strong>{displayName(c)}</strong></td>
                <td>{c.phone ?? <span className="muted">—</span>}</td>
                <td><span className="badge dim">{clientCount(c.id)}</span></td>
                <td className="muted">{new Date(c.created_at).toLocaleDateString()}</td>
                <td><button className="btn danger small" onClick={() => removeCoach(c)}>Remove</button></td>
              </tr>
            ))}
            {coaches.length === 0 && (
              <tr><td colSpan={5} className="muted">No coaches yet — add your first one above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
