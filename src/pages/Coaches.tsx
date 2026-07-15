import { Fragment, useCallback, useEffect, useState } from 'react';
import { supabase, adminOp } from '../supabase';
import { useToast } from '../App';
import { CoachLink, Profile, displayName } from '../types';
import { AddUserForm } from './Members';
import { Upload } from '../components/Upload';

export function Coaches() {
  const toast = useToast();
  const [coaches, setCoaches] = useState<Profile[]>([]);
  const [links, setLinks] = useState<CoachLink[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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
          <span className="muted">{coaches.length} total · assign them to members from the Members tab</span>
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
              <Fragment key={c.id}>
                <tr>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {c.avatar_url ? (
                        <img src={c.avatar_url} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--blue-tint)', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>
                          {c.first_name[0]?.toUpperCase()}
                        </div>
                      )}
                      <strong>{displayName(c)}</strong>
                    </div>
                  </td>
                  <td>{c.phone ?? <span className="muted">—</span>}</td>
                  <td><span className="badge dim">{clientCount(c.id)}</span></td>
                  <td className="muted">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn ghost small" onClick={() => setEditingId((v) => (v === c.id ? null : c.id))}>
                      {editingId === c.id ? 'Close' : 'Edit profile'}
                    </button>{' '}
                    <button className="btn danger small" onClick={() => removeCoach(c)}>Remove</button>
                  </td>
                </tr>
                {editingId === c.id && (
                  <tr key={`${c.id}-edit`}>
                    <td colSpan={5} style={{ background: '#fafbfe' }}>
                      <CoachProfileEditor coach={c} onSaved={load} />
                    </td>
                  </tr>
                )}
              </Fragment>
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

// Photo (uploaded to the public 'content' bucket, folder coaches/) + a short
// intro shown to the coach's assigned clients in the app.
function CoachProfileEditor({ coach, onSaved }: { coach: Profile; onSaved: () => void }) {
  const toast = useToast();
  const [avatarUrl, setAvatarUrl] = useState(coach.avatar_url ?? '');
  const [bio, setBio] = useState(coach.bio ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl || null, bio: bio.trim() || null })
      .eq('id', coach.id);
    setSaving(false);
    if (error) return toast(error.message, 'error');
    toast('Coach profile updated');
    onSaved();
  }

  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', padding: '6px 2px', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        {avatarUrl ? (
          <img src={avatarUrl} alt="" style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--hairline)' }} />
        ) : (
          <div style={{ width: 88, height: 88, borderRadius: '50%', background: 'var(--blue-tint)', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 30 }}>
            {coach.first_name[0]?.toUpperCase()}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <Upload folder="coaches" accept="image/*" label="⤒ Photo" onUploaded={setAvatarUrl} />
          {avatarUrl && (
            <button type="button" className="btn ghost small" onClick={() => setAvatarUrl('')}>Clear</button>
          )}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 260 }}>
        <label className="field">
          Intro / bio (shown to their clients)
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            maxLength={600}
            placeholder="e.g. NASM-certified strength coach, 8 years turning beginners into confident lifters. Specialises in fat loss and injury-safe programming."
          />
        </label>
        <div className="row" style={{ marginTop: 8 }}>
          <span className="muted">{bio.length}/600</span>
          <div className="spacer" />
          <button className="btn" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save profile'}</button>
        </div>
      </div>
    </div>
  );
}
