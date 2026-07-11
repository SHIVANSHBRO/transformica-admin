import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useToast } from '../App';
import { MemberPicker } from '../components/MemberPicker';
import { DietMeal, DietPlan, DietTemplate, Profile, displayName } from '../types';

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
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [meals, setMeals] = useState<DietMeal[]>(structuredClone(DEFAULT_MEALS));
  const [notes, setNotes] = useState('');
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
      daily_kcal: kcal ? parseInt(kcal, 10) : null,
      daily_protein_g: protein ? parseInt(protein, 10) : null,
      daily_carbs_g: carbs ? parseInt(carbs, 10) : null,
      daily_fat_g: fat ? parseInt(fat, 10) : null,
      meals: cleanedMeals,
      notes: notes.trim() || null,
    });
    setSavingTpl(false);
    if (error) return toast(error.message, 'error');
    toast('Template saved to your library');
    setTitle(''); setKcal(''); setProtein(''); setCarbs(''); setFat(''); setNotes('');
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

            <div className="row" style={{ marginTop: 12 }}>
              <div className="spacer" />
              <button className="btn" disabled={savingTpl} onClick={saveTemplate}>{savingTpl ? 'Saving…' : 'Save template'}</button>
            </div>
          </div>
        )}

        <table style={{ marginTop: showBuilder ? 16 : 12 }}>
          <tbody>
            {templates.map((t) => (
              <React.Fragment key={t.id}>
                <tr>
                  <td>
                    <button className="linklike" onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}>
                      {expandedId === t.id ? '▾ ' : '▸ '}{t.title}
                    </button>
                  </td>
                  <td className="muted">{t.daily_kcal ? `${t.daily_kcal} kcal` : '—'}</td>
                  <td className="muted">{t.meals.length} meal{t.meals.length === 1 ? '' : 's'}</td>
                  <td className="muted">{new Date(t.created_at).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn danger small" onClick={() => removeTemplate(t)}>Delete</button>
                  </td>
                </tr>
                {expandedId === t.id && (
                  <tr>
                    <td colSpan={5} style={{ background: '#fafbfe' }}>
                      {t.meals.map((m, i) => (
                        <div key={i} style={{ padding: '4px 0' }}>
                          <strong>{m.meal}:</strong>{' '}
                          <span className="muted">
                            {m.items.map((it) => `${it.name}${it.qty ? ` (${it.qty})` : ''}${it.kcal ? ` · ${it.kcal} kcal` : ''}`).join(' · ')}
                          </span>
                        </div>
                      ))}
                      {t.notes && <div className="muted" style={{ marginTop: 4 }}>Notes: {t.notes}</div>}
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
              <option key={t.id} value={t.id}>{t.title}{t.daily_kcal ? ` (${t.daily_kcal} kcal)` : ''}</option>
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
