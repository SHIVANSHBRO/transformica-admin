import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useToast } from '../App';
import { MemberPicker } from '../components/MemberPicker';
import { Exercise, Profile, WorkoutPlan, WorkoutTemplate, WorkoutTemplateExercise, displayName } from '../types';

type DraftExercise = {
  exercise_id: string;
  sets: string;
  reps: string;
  weight: string;
  perSet: boolean; // true → one weight per set (setWeights), false → uniform `weight`
  setWeights: string[];
  tut: string;
  rest: string;
};

const emptyRow = (): DraftExercise => ({ exercise_id: '', sets: '3', reps: '8-12', weight: '', perSet: false, setWeights: [], tut: '40', rest: '90' });

// Keep the per-set weights array the same length as the sets count, seeding
// new slots from the uniform weight so toggling feels continuous.
function sizedWeights(r: DraftExercise, sets: number): string[] {
  return Array.from({ length: Math.max(1, sets) }, (_, i) => r.setWeights[i] ?? r.weight ?? '');
}

// "8-12" -> 12; matches the app's progressive-overload seeding.
function parseRepTarget(reps: string): number | null {
  const m = reps.match(/\d+/g);
  return m ? Math.max(...m.map(Number)) : null;
}

export function WorkoutPlans() {
  const toast = useToast();
  const [clients, setClients] = useState<Profile[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [templates, setTemplates] = useState<(WorkoutTemplate & { exercise_count: number })[]>([]);

  // Template builder
  const [showBuilder, setShowBuilder] = useState(false);
  const [title, setTitle] = useState('');
  const [rows, setRows] = useState<DraftExercise[]>([emptyRow()]);
  const [savingTpl, setSavingTpl] = useState(false);

  // Assignment
  const [tplId, setTplId] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);

  // Expandable template preview
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; muscle_group: string; sets: number; reps: string; weight: string | null }[]>([]);

  async function togglePreview(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    const { data } = await supabase
      .from('workout_plan_template_exercises')
      .select('sets, reps, target_weight_kg, set_weights_kg, exercise:exercises(name, muscle_group)')
      .eq('template_id', id)
      .order('order_index');
    setPreview(
      ((data as unknown as { sets: number; reps: string; target_weight_kg: number | null; set_weights_kg: (number | null)[] | null; exercise: { name: string; muscle_group: string } }[]) ?? []).map((r) => ({
        name: r.exercise?.name ?? '?',
        muscle_group: r.exercise?.muscle_group ?? '',
        sets: r.sets,
        reps: r.reps,
        weight: r.set_weights_kg?.length
          ? r.set_weights_kg.map((w) => (w == null ? '—' : String(w))).join('/')
          : r.target_weight_kg != null
            ? String(r.target_weight_kg)
            : null,
      }))
    );
    setExpandedId(id);
  }

  // Per-member management
  const [memberId, setMemberId] = useState('');
  const [memberPlans, setMemberPlans] = useState<WorkoutPlan[]>([]);

  const loadTemplates = useCallback(async () => {
    const { data: tpls } = await supabase.from('workout_plan_templates').select('*').order('created_at', { ascending: false });
    const list = (tpls as WorkoutTemplate[]) ?? [];
    const counts = await Promise.all(
      list.map((t) => supabase.from('workout_plan_template_exercises').select('id', { count: 'exact', head: true }).eq('template_id', t.id))
    );
    setTemplates(list.map((t, i) => ({ ...t, exercise_count: counts[i].count ?? 0 })));
  }, []);

  useEffect(() => {
    supabase.from('profiles').select('*').eq('role', 'client').order('first_name')
      .then(({ data }) => setClients((data as Profile[]) ?? []));
    supabase.from('exercises').select('id, name, muscle_group, is_compound').order('muscle_group').order('name')
      .then(({ data }) => setExercises((data as Exercise[]) ?? []));
    loadTemplates();
  }, [loadTemplates]);

  const loadMemberPlans = useCallback(async () => {
    if (!memberId) {
      setMemberPlans([]);
      return;
    }
    const { data } = await supabase.from('workout_plans').select('*').eq('client_id', memberId).order('created_at', { ascending: false });
    setMemberPlans((data as WorkoutPlan[]) ?? []);
  }, [memberId]);

  useEffect(() => {
    loadMemberPlans();
  }, [loadMemberPlans]);

  async function saveTemplate() {
    const chosen = rows.filter((r) => r.exercise_id);
    if (!title.trim() || chosen.length === 0) {
      toast('Give the template a title and at least one exercise', 'error');
      return;
    }
    setSavingTpl(true);
    const { data: tpl, error } = await supabase.from('workout_plan_templates').insert({ title: title.trim() }).select('id').single();
    if (error || !tpl) {
      setSavingTpl(false);
      toast(error?.message ?? 'Could not save template', 'error');
      return;
    }
    const { error: exErr } = await supabase.from('workout_plan_template_exercises').insert(
      chosen.map((r, i) => {
        const sets = parseInt(r.sets, 10) || 3;
        // Per-set mode → jsonb array (null for blank sets); uniform target
        // stays filled with the first weight so progressive overload and older
        // app builds keep something sensible to work from.
        const perSetWeights = r.perSet ? sizedWeights(r, sets).map((w) => (w.trim() ? parseFloat(w) : null)) : null;
        const hasPerSet = perSetWeights != null && perSetWeights.some((w) => w != null);
        return {
          template_id: tpl.id,
          exercise_id: r.exercise_id,
          sets,
          reps: r.reps || '8-12',
          target_weight_kg: hasPerSet ? perSetWeights!.find((w) => w != null) ?? null : r.weight ? parseFloat(r.weight) : null,
          set_weights_kg: hasPerSet ? perSetWeights : null,
          time_under_tension_sec: parseInt(r.tut, 10) || 40,
          rest_seconds: parseInt(r.rest, 10) || null,
          order_index: i,
        };
      })
    );
    setSavingTpl(false);
    if (exErr) return toast(exErr.message, 'error');
    toast('Template saved to your library');
    setTitle('');
    setRows([emptyRow()]);
    setShowBuilder(false);
    await loadTemplates();
  }

  async function removeTemplate(t: WorkoutTemplate) {
    if (!window.confirm(`Delete template "${t.title}"? Plans already assigned to members are kept.`)) return;
    const { error } = await supabase.from('workout_plan_templates').delete().eq('id', t.id);
    if (error) return toast(error.message, 'error');
    toast('Template deleted');
    await loadTemplates();
  }

  async function assign() {
    if (!tplId || checked.size === 0) {
      toast('Pick a template and at least one member', 'error');
      return;
    }
    setAssigning(true);

    const tpl = templates.find((t) => t.id === tplId)!;
    const { data: tplExercises, error: tplErr } = await supabase
      .from('workout_plan_template_exercises')
      .select('*')
      .eq('template_id', tplId)
      .order('order_index');
    if (tplErr || !tplExercises?.length) {
      setAssigning(false);
      toast(tplErr?.message ?? 'This template has no exercises', 'error');
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const { data: plans, error: planErr } = await supabase
      .from('workout_plans')
      .insert(Array.from(checked).map((clientId) => ({ client_id: clientId, coach_id: null, title: tpl.title, starts_on: today })))
      .select('id');
    if (planErr || !plans) {
      setAssigning(false);
      toast(planErr?.message ?? 'Could not create plans', 'error');
      return;
    }

    const dayOfWeek = new Date().getDay();
    const { error: exErr } = await supabase.from('workout_plan_exercises').insert(
      plans.flatMap((p) =>
        (tplExercises as (WorkoutTemplateExercise & { set_weights_kg: (number | null)[] | null })[]).map((e) => ({
          plan_id: p.id,
          exercise_id: e.exercise_id,
          day_of_week: dayOfWeek,
          sets: e.sets,
          reps: e.reps,
          rep_target: parseRepTarget(e.reps),
          target_weight_kg: e.target_weight_kg,
          set_weights_kg: e.set_weights_kg ?? null,
          time_under_tension_sec: e.time_under_tension_sec ?? 40,
          rest_seconds: e.rest_seconds,
          order_index: e.order_index,
        }))
      )
    );
    setAssigning(false);
    if (exErr) return toast(exErr.message, 'error');
    toast(`"${tpl.title}" assigned to ${checked.size} member${checked.size === 1 ? '' : 's'} 🎉`);
    setChecked(new Set());
    await loadMemberPlans();
  }

  async function removePlan(p: WorkoutPlan) {
    if (!window.confirm(`Delete plan "${p.title}" for this member?`)) return;
    const { error } = await supabase.from('workout_plans').delete().eq('id', p.id);
    if (error) return toast(error.message, 'error');
    toast('Plan deleted');
    await loadMemberPlans();
  }

  return (
    <>
      {/* Template library */}
      <div className="card">
        <div className="row">
          <h2 style={{ margin: 0 }}>Workout plan library</h2>
          <span className="muted">create once, assign to many · visible to admins only</span>
          <div className="spacer" />
          <button className="btn" onClick={() => setShowBuilder((v) => !v)}>{showBuilder ? 'Close' : '+ New template'}</button>
        </div>

        {showBuilder && (
          <div style={{ marginTop: 14 }}>
            <label className="field" style={{ maxWidth: 420 }}>
              Template title
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Push/Pull/Legs — Phase 1" />
            </label>
            <div style={{ marginTop: 12 }}>
              {rows.map((r, i) => (
                <React.Fragment key={i}>
                <div className="row" style={{ marginBottom: 8 }}>
                  <select
                    className="grow"
                    value={r.exercise_id}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, exercise_id: e.target.value } : x)))}
                  >
                    <option value="">— exercise —</option>
                    {exercises.map((ex) => (
                      <option key={ex.id} value={ex.id}>{ex.muscle_group} · {ex.name}</option>
                    ))}
                  </select>
                  <input className="inline" style={{ width: 70 }} placeholder="sets" value={r.sets}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, sets: e.target.value, setWeights: x.perSet ? sizedWeights({ ...x, sets: e.target.value }, parseInt(e.target.value, 10) || 3) : x.setWeights } : x)))} />
                  <input className="inline" style={{ width: 90 }} placeholder="reps (8-12)" value={r.reps}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, reps: e.target.value } : x)))} />
                  {!r.perSet && (
                    <input className="inline" style={{ width: 90 }} placeholder="kg (opt.)" value={r.weight}
                      onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)))} />
                  )}
                  <button
                    className={`btn ghost small${r.perSet ? ' active' : ''}`}
                    title={r.perSet ? 'Back to one weight for every set' : 'Set a different weight for each set (e.g. 40/50/60)'}
                    onClick={() =>
                      setRows(rows.map((x, j) =>
                        j === i ? { ...x, perSet: !x.perSet, setWeights: !x.perSet ? sizedWeights(x, parseInt(x.sets, 10) || 3) : x.setWeights } : x
                      ))
                    }
                  >
                    {r.perSet ? 'same kg' : 'kg / set'}
                  </button>
                  <input className="inline" style={{ width: 78 }} placeholder="TUT s" title="Time under tension (seconds)" value={r.tut}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, tut: e.target.value } : x)))} />
                  <input className="inline" style={{ width: 78 }} placeholder="rest s" title="Rest between sets (seconds)" value={r.rest}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, rest: e.target.value } : x)))} />
                  <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => setRows(rows.filter((_, j) => j !== i))} title="Remove row">✕</button>
                </div>
                {r.perSet && (
                  <div className="row" style={{ marginBottom: 8, marginTop: -2, paddingLeft: 12, flexWrap: 'wrap' }}>
                    <span className="muted" style={{ fontSize: 12 }}>weight per set (kg):</span>
                    {sizedWeights(r, parseInt(r.sets, 10) || 3).map((w, k) => (
                      <input
                        key={k}
                        className="inline"
                        style={{ width: 64 }}
                        placeholder={`set ${k + 1}`}
                        value={w}
                        onChange={(e) =>
                          setRows(rows.map((x, j) => {
                            if (j !== i) return x;
                            const next = sizedWeights(x, parseInt(x.sets, 10) || 3);
                            next[k] = e.target.value;
                            return { ...x, setWeights: next };
                          }))
                        }
                      />
                    ))}
                  </div>
                )}
                </React.Fragment>
              ))}
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn ghost small" onClick={() => setRows([...rows, emptyRow()])}>+ Add exercise</button>
                <div className="spacer" />
                <button className="btn" disabled={savingTpl} onClick={saveTemplate}>{savingTpl ? 'Saving…' : 'Save template'}</button>
              </div>
            </div>
          </div>
        )}

        <table style={{ marginTop: showBuilder ? 16 : 12 }}>
          <tbody>
            {templates.map((t) => (
              <React.Fragment key={t.id}>
                <tr>
                  <td>
                    <button className="linklike" onClick={() => togglePreview(t.id)}>
                      {expandedId === t.id ? '▾ ' : '▸ '}{t.title}
                    </button>
                  </td>
                  <td className="muted">{t.exercise_count} exercise{t.exercise_count === 1 ? '' : 's'}</td>
                  <td className="muted">{new Date(t.created_at).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn danger small" onClick={() => removeTemplate(t)}>Delete</button>
                  </td>
                </tr>
                {expandedId === t.id && (
                  <tr>
                    <td colSpan={4} style={{ background: '#fafbfe' }}>
                      {preview.map((e, i) => (
                        <div key={i} className="row" style={{ padding: '4px 0' }}>
                          <span className="badge dim">{e.muscle_group}</span>
                          <strong>{e.name}</strong>
                          <span className="muted">{e.sets} × {e.reps}{e.weight != null ? ` @ ${e.weight} kg` : ''}</span>
                        </div>
                      ))}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {templates.length === 0 && (
              <tr><td className="muted">No templates yet — create your first with “+ New template”.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Bulk assign */}
      <div className="card">
        <h2>Assign to members</h2>
        <label className="field" style={{ maxWidth: 420 }}>
          Template
          <select value={tplId} onChange={(e) => setTplId(e.target.value)}>
            <option value="">— choose a template —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.title} ({t.exercise_count} exercises)</option>
            ))}
          </select>
        </label>
        <div style={{ marginTop: 12 }}>
          <MemberPicker clients={clients} checked={checked} onChange={setChecked} />
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="spacer" />
          <button className="btn" disabled={assigning || !tplId || checked.size === 0} onClick={assign}>
            {assigning ? 'Assigning…' : `Assign to ${checked.size || '…'} member${checked.size === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>

      {/* Per-member management */}
      <div className="card">
        <h2>Manage a member's plans</h2>
        <label className="field" style={{ maxWidth: 320 }}>
          Member
          <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">— choose a member —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{displayName(c)}</option>
            ))}
          </select>
        </label>
        {memberId && (
          <table style={{ marginTop: 12 }}>
            <tbody>
              {memberPlans.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.title}</strong></td>
                  <td className="muted">starts {p.starts_on}</td>
                  <td>{p.coach_id ? <span className="badge dim">by coach</span> : <span className="badge ok">by admin</span>}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn danger small" onClick={() => removePlan(p)}>Delete</button>
                  </td>
                </tr>
              ))}
              {memberPlans.length === 0 && <tr><td className="muted">No plans for this member yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
