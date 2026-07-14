import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { displayName, FeedbackRow, Profile } from '../types';

type NameMap = Map<string, string>;

export function Feedback() {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [names, setNames] = useState<NameMap>(new Map());
  const [filter, setFilter] = useState<'all' | 'general' | 'weekly'>('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('feedback').select('*').order('created_at', { ascending: false }).limit(500);
    const list = (data as FeedbackRow[]) ?? [];
    setRows(list);
    const ids = [...new Set(list.map((r) => r.user_id))];
    if (ids.length) {
      const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name').in('id', ids);
      setNames(new Map(((profiles ?? []) as Pick<Profile, 'id' | 'first_name' | 'last_name'>[]).map((p) => [p.id, displayName(p)])));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = rows.filter((r) => filter === 'all' || r.kind === filter);

  return (
    <div className="card">
      <div className="row">
        <h2 style={{ margin: 0 }}>Member feedback</h2>
        <span className="muted">{rows.length} entries · free-text + weekly pulse answers</span>
        <div className="spacer" />
        {(['all', 'general', 'weekly'] as const).map((f) => (
          <button key={f} className={`btn small ${filter === f ? '' : 'ghost'}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f === 'general' ? 'Free-text' : 'Weekly pulse'}
          </button>
        ))}
      </div>

      <table style={{ marginTop: 12 }}>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id}>
              <td style={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                <strong>{names.get(r.user_id) ?? 'Member'}</strong>
                <div className="muted">{new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
              </td>
              <td style={{ verticalAlign: 'top' }}>
                {r.kind === 'weekly' ? <span className="badge dim">weekly</span> : <span className="badge ok">feedback</span>}
              </td>
              <td>
                {r.answers && (
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: r.message ? 6 : 0 }}>
                    {Object.entries(r.answers)
                      .filter(([k]) => k !== 'suggestion')
                      .map(([k, v]) => (
                        <span key={k} className="badge dim">{k}: {v}</span>
                      ))}
                  </div>
                )}
                {r.message && <div style={{ whiteSpace: 'pre-wrap' }}>{r.message}</div>}
              </td>
            </tr>
          ))}
          {!loading && shown.length === 0 && <tr><td className="muted">No feedback yet.</td></tr>}
          {loading && <tr><td className="muted">Loading…</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
