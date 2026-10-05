import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useToast } from '../App';
import { MemberPicker } from '../components/MemberPicker';
import { DIET_GOAL_LABELS, DIET_TYPE_LABELS, DietGoal, DietMeal, DietMealItem, DietPlan, DietTemplate, DietType, Profile, displayName } from '../types';

const DEFAULT_MEALS: DietMeal[] = [
  { meal: 'Breakfast', items: [{ name: '', qty: '', kcal: '' }] },
  { meal: 'Lunch', items: [{ name: '', qty: '', kcal: '' }] },
  { meal: 'Dinner', items: [{ name: '', qty: '', kcal: '' }] },
];

export function DietPlans() {
  const toast = useToast();
  const [clients, setClients] = useState<Profile[]>([]);
  const [templates, setTemplates] = useState<DietTemplate[]>([]);

  // Template builder
  const [showBuilder, setShowBuilder] = useState(false);
  const [title, setTitle] = useState('');
  const [dietType, setDietType] = useState<DietType>('veg');
  const [dietGoal, setDietGoal] = useState<DietGoal | ''>('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [meals, setMeals] = useState<DietMeal[]>(structuredClone(DEFAULT_MEALS));
  const [notes, setNotes] = useState('');
  const [description, setDescription] = useState('');
  const [publish, setPublish] = useState(false);
  const [savingTpl, setSavingTpl] = useState(false);

  // Assignment
  const [tplId, setTplId] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [alsoSetTargets, setAlsoSetTargets] = useState(true);
  const [assigning, setAssigning] = useState(false);

  // Per-member management
  const [memberId, setMemberId] = useState('');
  const [memberPlans, setMemberPlans] = useState<DietPlan[]>([]);

  // Expandable template preview
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Library filters (130+ templates since 0099). They narrow the assign
  // dropdown too, so "2,800 kcal veg bulking" is two clicks away.
  const [q, setQ] = useState('');
  const [fGoal, setFGoal] = useState('');
  const [fType, setFType] = useState('');
  const [fBand, setFBand] = useState('');
  const [fVis, setFVis] = useState('');
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const band = (k: number | null) => {
      if (!fBand) return true;
      if (k == null) return fBand === 'none';
      const [lo, hi] = fBand.split('-').map(Number);
      return k >= lo && k < hi;
    };
    return templates
      .filter((t) => !needle || `${t.title} ${t.notes ?? ''}`.toLowerCase().includes(needle))
      .filter((t) => !fGoal || t.goal === fGoal)
      .filter((t) => !fType || t.diet_type === fType)
      .filter((t) => band(t.daily_kcal))
      .filter((t) => !fVis || (fVis === 'member' ? !!t.member_visible : !t.member_visible))
      .sort((a, b) => (a.goal ?? '').localeCompare(b.goal ?? '') || (a.daily_kcal ?? 0) - (b.daily_kcal ?? 0) || a.title.localeCompare(b.title));
  }, [templates, q, fGoal, fType, fBand, fVis]);

  const loadTemplates = useCallback(async () => {
    const { data } = await supabase.from('diet_plan_templates').select('*').order('created_at', { ascending: false });
    setTemplates((data as DietTemplate[]) ?? []);
  }, []);

  useEffect(() => {
    supabase.from('profiles').select('*').eq('role', 'client').order('first_name')
      .then(({ data }) => setClients((data as Profile[]) ?? []));
    loadTemplates();
  }, [loadTemplates]);

  const loadMemberPlans = useCallback(async () => {
    if (!memberId) {
      setMemberPlans([]);
      return;
    }
    const { data } = await supabase.from('diet_plans').select('*').eq('user_id', memberId).order('created_at', { ascending: false });
    setMemberPlans((data as DietPlan[]) ?? []);
  }, [memberId]);

  useEffect(() => {
    loadMemberPlans();
  }, [loadMemberPlans]);

  function setMeal(i: number, patch: Partial<DietMeal>) {
    setMeals(meals.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  }

  async function saveTemplate() {
    const cleanedMeals = meals
      .map((m) => ({ ...m, items: m.items.filter((it) => it.name.trim()) }))
      .filter((m) => m.meal.trim() && m.items.length > 0);
    if (!title.trim() || cleanedMeals.length === 0) {
      toast('Give the template a title and at least one meal item', 'error');
      return;
    }
    setSavingTpl(true);
    const { error } = await supabase.from('diet_plan_templates').insert({
      title: title.trim(),
      diet_type: dietType,
      goal: dietGoal || null,
      daily_kcal: kcal ? parseInt(kcal, 10) : null,
      daily_protein_g: protein ? parseInt(protein, 10) : null,
      daily_carbs_g: carbs ? parseInt(carbs, 10) : null,
      daily_fat_g: fat ? parseInt(fat, 10) : null,
      meals: cleanedMeals,
      notes: notes.trim() || null,
      // 0100 columns: only sent when used, so saving still works before the paste.
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(publish ? { member_visible: true } : {}),
    });
    setSavingTpl(false);
    if (error) return toast(error.message, 'error');
    toast('Template saved to your library');
    setTitle(''); setKcal(''); setProtein(''); setCarbs(''); setFat(''); setNotes(''); setDescription(''); setPublish(false);
    setDietType('veg'); setDietGoal('');
    setMeals(structuredClone(DEFAULT_MEALS));
    setShowBuilder(false);
    await loadTemplates();
  }

  async function removeTemplate(t: DietTemplate) {
    if (!window.confirm(`Delete template "${t.title}"? Plans already assigned to members are kept.`)) return;
    const { error } = await supabase.from('diet_plan_templates').delete().eq('id', t.id);
    if (error) return toast(error.message, 'error');
    toast('Template deleted');
    await loadTemplates();
  }

  // Publishes / unpublishes a template to the member app's Diet & recipes
  // (0100). Members read only member_visible rows, enforced by RLS, and can
  // follow one themselves only when no coach plan is active on them.
  async function toggleVisible(t: DietTemplate) {
    const { error } = await supabase
      .from('diet_plan_templates')
      .update({ member_visible: !t.member_visible })
      .eq('id', t.id);
    if (error) return toast(error.message.includes('member_visible') ? 'Paste migration 0100 first' : error.message, 'error');
    toast(t.member_visible ? `"${t.title}" hidden from members` : `"${t.title}" is now in the member app`);
    await loadTemplates();
  }

  async function assign() {
    if (!tplId || checked.size === 0) {
      toast('Pick a template and at least one member', 'error');
      return;
    }
    const tpl = templates.find((t) => t.id === tplId)!;
    setAssigning(true);

    const ids = Array.from(checked);
    const { data: session } = await supabase.auth.getSession();

    // One active diet plan per member: retire their current actives first.
    const { error: deacErr } = await supabase.from('diet_plans').update({ active: false }).in('user_id', ids).eq('active', true);
    if (deacErr) {
      setAssigning(false);
      return toast(deacErr.message, 'error');
    }

    const { error } = await supabase.from('diet_plans').insert(
      ids.map((userId) => ({
        user_id: userId,
        title: tpl.title,
        diet_type: tpl.diet_type,
        goal: tpl.goal,
        daily_kcal: tpl.daily_kcal,
        daily_protein_g: tpl.daily_protein_g,
        daily_carbs_g: tpl.daily_carbs_g,
        daily_fat_g: tpl.daily_fat_g,
        meals: tpl.meals,
        notes: tpl.notes,
        active: true,
        created_by: session.session?.user.id ?? null,
      }))
    );
    if (error) {
      setAssigning(false);
      return toast(error.message, 'error');
    }

    if (alsoSetTargets && (tpl.daily_kcal || tpl.daily_protein_g || tpl.daily_carbs_g || tpl.daily_fat_g)) {
      const patch = {
        ...(tpl.daily_kcal ? { daily_kcal_target: tpl.daily_kcal } : {}),
        ...(tpl.daily_protein_g ? { daily_protein_target: tpl.daily_protein_g } : {}),
        ...(tpl.daily_carbs_g ? { daily_carbs_target: tpl.daily_carbs_g } : {}),
        ...(tpl.daily_fat_g ? { daily_fat_target: tpl.daily_fat_g } : {}),
      };
      await supabase.from('profiles').update(patch).in('id', ids);
    }

    setAssigning(false);
    toast(`"${tpl.title}" assigned to ${ids.length} member${ids.length === 1 ? '' : 's'} 🎉`);
    setChecked(new Set());
    await loadMemberPlans();
  }

  async function toggleActive(p: DietPlan) {
    const { error } = await supabase.from('diet_plans').update({ active: !p.active }).eq('id', p.id);
    if (error) return toast(error.message, 'error');
    await loadMemberPlans();
    toast(p.active ? 'Plan deactivated' : 'Plan activated');
  }

  async function removePlan(p: DietPlan) {
    if (!window.confirm(`Delete diet plan "${p.title}" for this member?`)) return;
    const { error } = await supabase.from('diet_plans').delete().eq('id', p.id);
    if (error) return toast(error.message, 'error');
    toast('Plan deleted');
    await loadMemberPlans();
  }

  return (
    <>
      {/* Template library */}
      <div className="card">
        <div className="row">
          <h2 style={{ margin: 0 }}>Diet plan library</h2>
          <span className="muted">create once, assign to many · visible to admins only</span>
          <div className="spacer" />
          <button className="btn" onClick={() => setShowBuilder((v) => !v)}>{showBuilder ? 'Close' : '+ New template'}</button>
        </div>

        {showBuilder && (
          <div style={{ marginTop: 14 }}>
            <div className="row">
              <label className="field grow">
                Template title
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fat-loss — 1800 kcal veg" />
              </label>
              <label className="field">
                <span>Diet</span>
                <select className="inline" value={dietType} onChange={(e) => setDietType(e.target.value as DietType)}>
                  {(Object.keys(DIET_TYPE_LABELS) as DietType[]).map((k) => (
                    <option key={k} value={k}>{DIET_TYPE_LABELS[k]}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Goal</span>
                <select className="inline" value={dietGoal} onChange={(e) => setDietGoal(e.target.value as DietGoal | '')}>
                  <option value="">— none —</option>
                  {(Object.keys(DIET_GOAL_LABELS) as DietGoal[]).map((k) => (
                    <option key={k} value={k}>{DIET_GOAL_LABELS[k]}</option>
                  ))}
                </select>
              </label>
              <label className="field"><span>Kcal</span><input className="inline" style={{ width: 84 }} value={kcal} onChange={(e) => setKcal(e.target.value)} placeholder="1800" /></label>
              <label className="field"><span>Protein g</span><input className="inline" style={{ width: 84 }} value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="140" /></label>
              <label className="field"><span>Carbs g</span><input className="inline" style={{ width: 84 }} value={carbs} onChange={(e) => setCarbs(e.target.value)} placeholder="170" /></label>
              <label className="field"><span>Fat g</span><input className="inline" style={{ width: 84 }} value={fat} onChange={(e) => setFat(e.target.value)} placeholder="60" /></label>
            </div>

            <div style={{ marginTop: 14 }}>
              {meals.map((m, i) => (
                <div className="meal-block" key={i}>
                  <div className="row">
                    <input className="inline" style={{ width: 180, fontWeight: 700 }} value={m.meal}
                      onChange={(e) => setMeal(i, { meal: e.target.value })} placeholder="Meal name" />
                    <div className="spacer" />
                    <button className="btn danger small" onClick={() => setMeals(meals.filter((_, j) => j !== i))}>Remove meal</button>
                  </div>
                  {m.items.map((it, k) => (
                    <div className="item-row" key={k}>
                      <input placeholder="Food (e.g. Paneer bhurji)" value={it.name}
                        onChange={(e) => setMeal(i, { items: m.items.map((x, l) => (l === k ? { ...x, name: e.target.value } : x)) })} />
                      <input placeholder="Qty (150g)" value={it.qty}
                        onChange={(e) => setMeal(i, { items: m.items.map((x, l) => (l === k ? { ...x, qty: e.target.value } : x)) })} />
                      <input placeholder="kcal" value={it.kcal}
                        onChange={(e) => setMeal(i, { items: m.items.map((x, l) => (l === k ? { ...x, kcal: e.target.value } : x)) })} />
                      <button className="icon-btn" onClick={() => setMeal(i, { items: m.items.filter((_, l) => l !== k) })} title="Remove item">✕</button>
                    </div>
                  ))}
                  <button className="btn ghost small" style={{ marginTop: 8 }}
                    onClick={() => setMeal(i, { items: [...m.items, { name: '', qty: '', kcal: '' }] })}>
                    + Add item
                  </button>
                </div>
              ))}
              <button className="btn ghost small" onClick={() => setMeals([...meals, { meal: 'Snack', items: [{ name: '', qty: '', kcal: '' }] }])}>
                + Add meal
              </button>
            </div>

            <label className="field" style={{ marginTop: 14 }}>
              Notes for the member (optional)
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Drink 3L water. No sugar in tea." />
            </label>

            <label className="field" style={{ marginTop: 10 }}>
              Short description for the member app (optional, shown on the plan card)
              <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="An everyday vegetarian cut with about 105 g protein from paneer, dal and curd." />
            </label>
            <label className="muted" style={{ display: 'block', marginTop: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} /> Show in the member app as a sample plan members can follow
            </label>

            <div className="row" style={{ marginTop: 12 }}>
              <div className="spacer" />
              <button className="btn" disabled={savingTpl} onClick={saveTemplate}>{savingTpl ? 'Saving…' : 'Save template'}</button>
            </div>
          </div>
        )}

        <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
          <input className="inline" style={{ flex: 1, minWidth: 200 }} placeholder="Search (e.g. PCOS, keto, lean gain, Navratri)" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="inline" value={fGoal} onChange={(e) => setFGoal(e.target.value)}>
            <option value="">All goals</option>
            {(Object.keys(DIET_GOAL_LABELS) as DietGoal[]).map((k) => <option key={k} value={k}>{DIET_GOAL_LABELS[k]}</option>)}
          </select>
          <select className="inline" value={fType} onChange={(e) => setFType(e.target.value)}>
            <option value="">Veg, egg & non-veg</option>
            {(Object.keys(DIET_TYPE_LABELS) as DietType[]).map((k) => <option key={k} value={k}>{DIET_TYPE_LABELS[k]}</option>)}
          </select>
          <select className="inline" value={fBand} onChange={(e) => setFBand(e.target.value)}>
            <option value="">Any calories</option>
            <option value="0-1800">Under 1,800</option>
            <option value="1800-2400">1,800–2,399</option>
            <option value="2400-3000">2,400–2,999</option>
            <option value="3000-3600">3,000–3,599</option>
            <option value="3600-9999">3,600+</option>
            <option value="none">No calorie figure</option>
          </select>
          <select className="inline" value={fVis} onChange={(e) => setFVis(e.target.value)}>
            <option value="">Admin + member plans</option>
            <option value="member">In member app</option>
            <option value="admin">Admin only</option>
          </select>
          <span className="muted">{shown.length} of {templates.length}</span>
        </div>

        <table style={{ marginTop: showBuilder ? 16 : 12 }}>
          <tbody>
            {shown.map((t) => (
              <React.Fragment key={t.id}>
                <tr>
                  <td>
                    <button className="linklike" onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}>
                      {expandedId === t.id ? '▾ ' : '▸ '}{t.title}
                    </button>
                  </td>
                  <td className="muted">
                    {t.daily_kcal ? `${t.daily_kcal} kcal` : '—'}
                    {t.daily_protein_g ? <div style={{ fontSize: 11 }}>P {t.daily_protein_g} · C {t.daily_carbs_g ?? '—'} · F {t.daily_fat_g ?? '—'}</div> : null}
                  </td>
                  <td>
                    <span className="badge dim">{DIET_TYPE_LABELS[t.diet_type] ?? t.diet_type}</span>{' '}
                    {t.goal && <span className="badge dim">{DIET_GOAL_LABELS[t.goal] ?? t.goal}</span>}
                  </td>
                  <td className="muted">{t.meals.length} meal{t.meals.length === 1 ? '' : 's'}</td>
                  <td className="muted">{new Date(t.created_at).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <label className="muted" style={{ marginRight: 12, cursor: 'pointer' }} title="Show under Diet & recipes in the member app, where members can follow it">
                      <input type="checkbox" checked={!!t.member_visible} onChange={() => toggleVisible(t)} /> In member app
                    </label>
                    <button className="btn danger small" onClick={() => removeTemplate(t)}>Delete</button>
                  </td>
                </tr>
                {expandedId === t.id && (
                  <tr>
                    <td colSpan={6} style={{ background: '#fafbfe' }}>
                      {t.description ? <div style={{ padding: '2px 0 6px' }}>{t.description}</div> : null}
                      {t.tags?.length ? (
                        <div style={{ paddingBottom: 6 }}>{t.tags.map((tag) => <span key={tag} className="badge dim" style={{ marginRight: 4 }}>{tag}</span>)}</div>
                      ) : null}
                      {t.meals.map((m, i) => {
                        const line = (items: DietMealItem[]) =>
                          items.map((it) => `${it.name}${it.qty ? ` (${it.qty})` : ''}${it.kcal ? ` · ${it.kcal} kcal` : ''}`).join(' · ');
                        // A plan with swappable options (0081) must show all of
                        // them here — a trainer assigning it needs to see the
                        // whole menu they are handing over, not just option 1.
                        const options = m.options ?? [];
                        return (
                          <div key={i} style={{ padding: '4px 0' }}>
                            <strong>{m.meal}:</strong>{' '}
                            {m.kcal != null || m.protein_g != null ? (
                              <span className="badge dim" style={{ marginRight: 6 }}>
                                {[m.kcal != null ? `${m.kcal} kcal` : null, m.protein_g != null ? `P ${m.protein_g}` : null, m.carbs_g != null ? `C ${m.carbs_g}` : null, m.fat_g != null ? `F ${m.fat_g}` : null].filter(Boolean).join(' · ')}
                              </span>
                            ) : null}
                            {options.length > 1 ? (
                              <div style={{ paddingLeft: 12 }}>
                                {options.map((o, k) => (
                                  <div key={k} className="muted" style={{ padding: '2px 0' }}>
                                    <em>{o.label || `Option ${k + 1}`}</em> — {line(o.items)}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="muted">{line(m.items)}</span>
                            )}
                          </div>
                        );
                      })}
                      {t.notes && <div className="muted" style={{ marginTop: 4 }}>Notes: {t.notes}</div>}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {templates.length === 0 && (
              <tr><td className="muted">No templates yet — create your first with “+ New template”.</td></tr>
            )}
            {templates.length > 0 && shown.length === 0 && (
              <tr><td className="muted">No template matches these filters.</td></tr>
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
            <option value="">— choose a template{shown.length < templates.length ? ` (${shown.length} match the filters above)` : ''} —</option>
            {shown.map((t) => (
              <option key={t.id} value={t.id}>{t.title}{t.daily_kcal && !t.title.includes('kcal') ? ` (${t.daily_kcal} kcal)` : ''}</option>
            ))}
          </select>
        </label>
        <div style={{ marginTop: 12 }}>
          <MemberPicker clients={clients} checked={checked} onChange={setChecked} />
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <label className="row" style={{ gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={alsoSetTargets} onChange={(e) => setAlsoSetTargets(e.target.checked)} />
            Also set the template's kcal/macros as each member's daily targets
          </label>
          <div className="spacer" />
          <button className="btn" disabled={assigning || !tplId || checked.size === 0} onClick={assign}>
            {assigning ? 'Assigning…' : `Assign to ${checked.size || '…'} member${checked.size === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>

      {/* Per-member management */}
      <div className="card">
        <h2>Manage a member's diet plans</h2>
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
                  <td className="muted">{p.daily_kcal ? `${p.daily_kcal} kcal` : '—'}</td>
                  <td>{p.active ? <span className="badge ok">active</span> : <span className="badge dim">inactive</span>}</td>
                  <td className="muted">{new Date(p.created_at).toLocaleDateString()}</td>
                  <td className="row" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn ghost small" onClick={() => toggleActive(p)}>{p.active ? 'Deactivate' : 'Activate'}</button>
                    <button className="btn danger small" onClick={() => removePlan(p)}>Delete</button>
                  </td>
                </tr>
              ))}
              {memberPlans.length === 0 && <tr><td className="muted">No diet plans for this member yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
