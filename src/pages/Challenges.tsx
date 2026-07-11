import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useToast } from '../App';
import { Challenge, ChallengeSubmission, ChallengeTask, Profile, TaskField, TaskFieldType, displayName } from '../types';

const FIELD_TYPES: { value: TaskFieldType; label: string }[] = [
  { value: 'text', label: 'Text answer' },
  { value: 'number', label: 'Number' },
  { value: 'image', label: 'Image upload' },
];

function slugKey(label: string, i: number) {
  const s = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return s || `field_${i + 1}`;
}

export function Challenges() {
  const toast = useToast();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // new challenge form
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [goal, setGoal] = useState('');
  const [duration, setDuration] = useState('7');
  const [accent, setAccent] = useState('#2E5CF6');

  const load = useCallback(async () => {
    const { data } = await supabase.from('challenges').select('*').order('created_at', { ascending: false });
    setChallenges((data as Challenge[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addChallenge() {
    if (!title.trim() || !goal.trim()) return toast('Title and goal label are required', 'error');
    const { error } = await supabase.from('challenges').insert({
      title: title.trim(),
      subtitle: subtitle.trim() || null,
      goal_label: goal.trim(),
      duration_days: parseInt(duration, 10) || 7,
      accent,
    });
    if (error) return toast(error.message, 'error');
    toast('Challenge created');
    setTitle(''); setSubtitle(''); setGoal(''); setDuration('7');
    setShowAdd(false);
    await load();
  }

  async function removeChallenge(c: Challenge) {
    if (!window.confirm(`Delete "${c.title}"? Its tasks and all member submissions will be removed too.`)) return;
    const { error } = await supabase.from('challenges').delete().eq('id', c.id);
    if (error) return toast(error.message, 'error');
    toast('Challenge deleted');
    if (expanded === c.id) setExpanded(null);
    await load();
  }

  return (
    <>
      <div className="card">
        <div className="row">
          <h2 style={{ margin: 0 }}>Challenges</h2>
          <span className="muted">{challenges.length} total · add tasks & review submissions inside each</span>
          <div className="spacer" />
          <button className="btn" onClick={() => setShowAdd((v) => !v)}>{showAdd ? 'Close' : '+ New challenge'}</button>
        </div>

        {showAdd && (
          <div style={{ marginTop: 14 }}>
            <div className="row">
              <label className="field grow">Title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="July Step Challenge" /></label>
              <label className="field grow">Goal label<input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Walk 150 km" /></label>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <label className="field grow">Subtitle (optional)<input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Beat your June distance" /></label>
              <label className="field">Duration (days)<input className="inline" style={{ width: 90 }} value={duration} onChange={(e) => setDuration(e.target.value.replace(/[^0-9]/g, ''))} /></label>
              <label className="field">Accent<input type="color" className="inline" style={{ width: 52, height: 38, padding: 3 }} value={accent} onChange={(e) => setAccent(e.target.value)} /></label>
              <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={addChallenge}>Create</button>
            </div>
          </div>
        )}

        <table style={{ marginTop: 12 }}>
          <tbody>
            {challenges.map((c) => (
              <tr key={c.id}>
                <td>
                  <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 4, background: c.accent, marginRight: 8, verticalAlign: 'middle' }} />
                  <button className="linklike" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                    {expanded === c.id ? '▾ ' : '▸ '}{c.title}
                  </button>
                </td>
                <td className="muted">{c.goal_label}</td>
                <td className="muted">{c.duration_days}d</td>
                <td style={{ textAlign: 'right' }}><button className="btn danger small" onClick={() => removeChallenge(c)}>Delete</button></td>
              </tr>
            ))}
            {challenges.length === 0 && <tr><td className="muted">No challenges yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {expanded && <ChallengeTasks challengeId={expanded} />}
    </>
  );
}

function ChallengeTasks({ challengeId }: { challengeId: string }) {
  const toast = useToast();
  const [tasks, setTasks] = useState<ChallengeTask[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [reviewing, setReviewing] = useState<ChallengeTask | null>(null);

  // new task form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<TaskField[]>([{ key: '', label: '', type: 'text', required: true }]);

  const load = useCallback(async () => {
    const { data } = await supabase.from('challenge_tasks').select('*').eq('challenge_id', challengeId).order('order_index');
    setTasks((data as ChallengeTask[]) ?? []);
  }, [challengeId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addTask() {
    if (!title.trim()) return toast('Task needs a title', 'error');
    const cleaned = fields
      .filter((f) => f.label.trim())
      .map((f, i) => ({ key: slugKey(f.label, i), label: f.label.trim(), type: f.type, required: !!f.required }));
    if (cleaned.length === 0) return toast('Add at least one input field', 'error');
    // Dedupe keys so submissions.values never collide.
    const seen = new Set<string>();
    for (const f of cleaned) {
      let k = f.key;
      let n = 2;
      while (seen.has(k)) k = `${f.key}_${n++}`;
      f.key = k;
      seen.add(k);
    }
    const { error } = await supabase.from('challenge_tasks').insert({
      challenge_id: challengeId,
      title: title.trim(),
      description: description.trim() || null,
      order_index: tasks.length,
      fields: cleaned,
    });
    if (error) return toast(error.message, 'error');
    toast('Task added');
    setTitle(''); setDescription(''); setFields([{ key: '', label: '', type: 'text', required: true }]);
    setShowAdd(false);
    await load();
  }

  async function removeTask(t: ChallengeTask) {
    if (!window.confirm(`Delete task "${t.title}" and its submissions?`)) return;
    const { error } = await supabase.from('challenge_tasks').delete().eq('id', t.id);
    if (error) return toast(error.message, 'error');
    toast('Task deleted');
    await load();
  }

  return (
    <div className="card" style={{ borderColor: 'var(--blue)' }}>
      <div className="row">
        <h3 style={{ margin: 0 }}>Tasks in this challenge</h3>
        <div className="spacer" />
        <button className="btn ghost small" onClick={() => setShowAdd((v) => !v)}>{showAdd ? 'Close' : '+ New task'}</button>
      </div>

      {showAdd && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
          <label className="field grow">Task title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Log today's steps" /></label>
          <label className="field" style={{ marginTop: 10 }}>Instructions (optional)<textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Screenshot your step tracker and enter the number." /></label>

          <h3 style={{ marginTop: 14 }}>What should members submit?</h3>
          {fields.map((f, i) => (
            <div className="row" key={i} style={{ marginTop: 8 }}>
              <input className="grow" placeholder="Field label (e.g. Steps walked)" value={f.label}
                onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <select className="inline" value={f.type}
                onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, type: e.target.value as TaskFieldType } : x)))}>
                {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <label className="row" style={{ gap: 5, cursor: 'pointer' }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={!!f.required}
                  onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))} />
                required
              </label>
              <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => setFields(fields.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn ghost small" onClick={() => setFields([...fields, { key: '', label: '', type: 'text', required: false }])}>+ Add field</button>
            <div className="spacer" />
            <button className="btn" onClick={addTask}>Save task</button>
          </div>
        </div>
      )}

      <table style={{ marginTop: 12 }}>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td>
                <strong>{t.title}</strong>
                <div className="muted">{t.fields.map((f) => `${f.label} (${f.type})`).join(' · ')}</div>
              </td>
              <td className="row" style={{ justifyContent: 'flex-end' }}>
                <button className="btn ghost small" onClick={() => setReviewing(t)}>Submissions</button>
                <button className="btn danger small" onClick={() => removeTask(t)}>Delete</button>
              </td>
            </tr>
          ))}
          {tasks.length === 0 && <tr><td className="muted">No tasks yet — add one so members have something to submit.</td></tr>}
        </tbody>
      </table>

      {reviewing && <SubmissionsModal task={reviewing} onClose={() => setReviewing(null)} />}
    </div>
  );
}

function SubmissionsModal({ task, onClose }: { task: ChallengeTask; onClose: () => void }) {
  const [subs, setSubs] = useState<ChallengeSubmission[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [imgUrls, setImgUrls] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('challenge_submissions').select('*').eq('task_id', task.id).order('created_at', { ascending: false });
      const rows = (data as ChallengeSubmission[]) ?? [];
      setSubs(rows);

      const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
      if (userIds.length) {
        const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name').in('id', userIds);
        setNames(new Map(((profiles as Profile[]) ?? []).map((p) => [p.id, displayName(p)])));
      }

      // Sign every image path referenced by an image field.
      const imageKeys = task.fields.filter((f) => f.type === 'image').map((f) => f.key);
      const paths = rows.flatMap((r) => imageKeys.map((k) => r.values[k]).filter((v): v is string => typeof v === 'string' && !!v));
      if (paths.length) {
        const { data: signed } = await supabase.storage.from('submissions').createSignedUrls(paths, 3600);
        const pairs: [string, string][] = (signed ?? [])
          .filter((s): s is { path: string; signedUrl: string; error: null } => !!s.path && !!s.signedUrl)
          .map((s) => [s.path, s.signedUrl]);
        setImgUrls(new Map(pairs));
      }
    })();
  }, [task]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 style={{ margin: 0 }}>{task.title} — submissions</h2>
          <div className="spacer" />
          <button className="btn ghost small" onClick={onClose}>Close</button>
        </div>
        {subs.length === 0 && <p className="muted" style={{ marginTop: 12 }}>No submissions yet.</p>}
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {subs.map((s) => (
            <div key={s.id} className="meal-block">
              <div className="row">
                <strong>{names.get(s.user_id) ?? 'Member'}</strong>
                <div className="spacer" />
                <span className="muted">{new Date(s.created_at).toLocaleString()}</span>
              </div>
              <div className="detail-grid" style={{ marginTop: 8 }}>
                {task.fields.map((f) => {
                  const v = s.values[f.key];
                  if (f.type === 'image') {
                    const url = typeof v === 'string' ? imgUrls.get(v) : undefined;
                    return (
                      <div key={f.key}>
                        <div className="muted" style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}>{f.label}</div>
                        {url ? <img src={url} alt="" style={{ width: '100%', maxWidth: 160, borderRadius: 10, marginTop: 4 }} /> : <div className="muted">—</div>}
                      </div>
                    );
                  }
                  return (
                    <div key={f.key}>
                      <div className="muted" style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}>{f.label}</div>
                      <div style={{ fontWeight: 600, marginTop: 2 }}>{v != null && v !== '' ? String(v) : '—'}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
