import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useToast } from '../App';
import { Banner, Exercise, Recipe, Story, Video, youtubeIdFrom } from '../types';
import { Upload } from '../components/Upload';

// In-app destinations a banner can deep-link to (RootNavigator route names).
const SCREENS = [
  { value: 'Plans', label: 'Plans & pricing' },
  { value: 'Supplements', label: 'Supplements store' },
  { value: 'Videos', label: 'Videos library' },
  { value: 'LiveClasses', label: 'Live classes' },
  { value: 'Workouts', label: 'Workouts' },
  { value: 'ExerciseLibrary', label: 'Exercise library' },
  { value: 'RecipeLibrary', label: 'Recipe library' },
  { value: 'Goal', label: 'My goal' },
  { value: 'IntakeForm', label: 'Consultation form' },
  { value: 'AashaChat', label: 'Aasha AI chat' },
  { value: 'Nutrition', label: 'Nutrition' },
  { value: 'DietPlan', label: 'My diet plan' },
  { value: 'BodyMeasurements', label: 'Body measurements' },
];

const VIDEO_CATEGORIES = ['workout', 'diet', 'motivation'] as const;
const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'] as const;

export function Content() {
  return (
    <>
      <Banners />
      <Stories />
      <Recipes />
      <Videos />
      <Exercises />
    </>
  );
}

/* ---------------- Transformation stories ---------------- */

const emptyStory = { name: '', age: '', headline: '', quote: '', beforeUrl: '', afterUrl: '', weeks: '' };

function Stories() {
  const toast = useToast();
  const [stories, setStories] = useState<Story[]>([]);
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<Story | null>(null);
  const [form, setForm] = useState(emptyStory);

  const set = (key: keyof typeof emptyStory) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const load = useCallback(async () => {
    const { data } = await supabase.from('transformation_stories').select('*').order('sort_order').order('created_at');
    setStories((data as Story[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openNew() {
    setEditing(null);
    setForm(emptyStory);
    setShow(true);
  }

  function openEdit(s: Story) {
    setEditing(s);
    setForm({
      name: s.name,
      age: s.age != null ? String(s.age) : '',
      headline: s.headline,
      quote: s.quote ?? '',
      beforeUrl: s.before_url,
      afterUrl: s.after_url,
      weeks: s.duration_weeks != null ? String(s.duration_weeks) : '',
    });
    setShow(true);
  }

  async function save() {
    if (!form.name.trim()) return toast('Story needs the member’s first name', 'error');
    if (!form.headline.trim()) return toast('Headline is the hook — e.g. “Lost 18 kg in 6 months”', 'error');
    if (!form.beforeUrl.trim() || !form.afterUrl.trim()) return toast('Both before and after photos are required', 'error');
    const row = {
      name: form.name.trim(),
      age: form.age.trim() === '' ? null : Number(form.age),
      headline: form.headline.trim(),
      quote: form.quote.trim() || null,
      before_url: form.beforeUrl.trim(),
      after_url: form.afterUrl.trim(),
      duration_weeks: form.weeks.trim() === '' ? null : Number(form.weeks),
    };
    const { error } = editing
      ? await supabase.from('transformation_stories').update(row).eq('id', editing.id)
      : await supabase.from('transformation_stories').insert({ ...row, sort_order: stories.length });
    if (error) return toast(error.message, 'error');
    toast(editing ? 'Story updated' : 'Story published to the paywall');
    setForm(emptyStory);
    setEditing(null);
    setShow(false);
    await load();
  }

  async function toggleActive(s: Story) {
    const { error } = await supabase.from('transformation_stories').update({ active: !s.active }).eq('id', s.id);
    if (error) return toast(error.message, 'error');
    await load();
  }

  async function move(index: number, dir: -1 | 1) {
    const other = index + dir;
    if (other < 0 || other >= stories.length) return;
    const a = stories[index];
    const b = stories[other];
    await Promise.all([
      supabase.from('transformation_stories').update({ sort_order: other }).eq('id', a.id),
      supabase.from('transformation_stories').update({ sort_order: index }).eq('id', b.id),
    ]);
    await load();
  }

  async function remove(s: Story) {
    if (!window.confirm(`Delete ${s.name}'s story?`)) return;
    const { error } = await supabase.from('transformation_stories').delete().eq('id', s.id);
    if (error) return toast(error.message, 'error');
    toast('Story deleted');
    await load();
  }

  return (
    <div className="card">
      <div className="row">
        <h2 style={{ margin: 0 }}>Transformation stories</h2>
        <span className="muted">before/after social proof on the Plans screen — only members who consented in writing</span>
        <div className="spacer" />
        <button className="btn" onClick={() => (show ? setShow(false) : openNew())}>{show ? 'Close' : '+ New story'}</button>
      </div>

      {show && (
        <div style={{ marginTop: 14 }}>
          <div className="row">
            <label className="field">First name<input className="inline" style={{ width: 130 }} value={form.name} onChange={(e) => set('name')(e.target.value)} placeholder="Rohit" /></label>
            <label className="field">Age (optional)<input className="inline" style={{ width: 90 }} type="number" min={18} max={100} value={form.age} onChange={(e) => set('age')(e.target.value)} placeholder="34" /></label>
            <label className="field grow">Headline — the result<input value={form.headline} onChange={(e) => set('headline')(e.target.value)} placeholder="Lost 18 kg in 6 months" /></label>
            <label className="field">Weeks (optional)<input className="inline" style={{ width: 90 }} type="number" min={1} value={form.weeks} onChange={(e) => set('weeks')(e.target.value)} placeholder="24" /></label>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <label className="field grow">
              Before photo
              <div className="row" style={{ marginTop: 5 }}>
                <input className="grow" value={form.beforeUrl} onChange={(e) => set('beforeUrl')(e.target.value)} placeholder="upload →" />
                <Upload folder="stories" accept="image/*" onUploaded={set('beforeUrl')} />
              </div>
            </label>
            <label className="field grow">
              After photo
              <div className="row" style={{ marginTop: 5 }}>
                <input className="grow" value={form.afterUrl} onChange={(e) => set('afterUrl')(e.target.value)} placeholder="upload →" />
                <Upload folder="stories" accept="image/*" onUploaded={set('afterUrl')} />
              </div>
            </label>
          </div>
          {(form.beforeUrl || form.afterUrl) && (
            <div className="row" style={{ marginTop: 8 }}>
              {form.beforeUrl && <img src={form.beforeUrl} alt="before" style={{ height: 84, borderRadius: 9, border: '1px solid var(--hairline)' }} />}
              {form.afterUrl && <img src={form.afterUrl} alt="after" style={{ height: 84, borderRadius: 9, border: '1px solid var(--hairline)' }} />}
            </div>
          )}
          <label className="field" style={{ marginTop: 10 }}>
            Quote — in the member’s own words (optional)
            <textarea rows={2} value={form.quote} onChange={(e) => set('quote')(e.target.value)} placeholder="My coach checked in every single week. I never felt alone in this." />
          </label>
          <div className="row" style={{ marginTop: 10 }}>
            <div className="spacer" />
            <button className="btn" onClick={save}>{editing ? 'Save changes' : 'Publish story'}</button>
          </div>
        </div>
      )}

      <table style={{ marginTop: 12 }}>
        <tbody>
          {stories.map((s, i) => (
            <tr key={s.id}>
              <td>
                <img src={s.before_url} alt="" style={{ width: 34, height: 46, objectFit: 'cover', borderRadius: 7, verticalAlign: 'middle', marginRight: 4, border: '1px solid var(--hairline)' }} />
                <img src={s.after_url} alt="" style={{ width: 34, height: 46, objectFit: 'cover', borderRadius: 7, verticalAlign: 'middle', marginRight: 10, border: '1px solid var(--hairline)' }} />
                <strong>{s.name}</strong>{s.age != null ? <span className="muted">, {s.age}</span> : null}
                <div className="muted">{s.headline}{s.duration_weeks ? ` · ${s.duration_weeks} weeks` : ''}</div>
              </td>
              <td>{s.active ? <span className="badge ok">live</span> : <span className="badge dim">hidden</span>}</td>
              <td className="row" style={{ justifyContent: 'flex-end' }}>
                <button className="btn ghost small" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                <button className="btn ghost small" onClick={() => move(i, 1)} disabled={i === stories.length - 1}>↓</button>
                <button className="btn ghost small" onClick={() => toggleActive(s)}>{s.active ? 'Hide' : 'Show'}</button>
                <button className="btn ghost small" onClick={() => openEdit(s)}>Edit</button>
                <button className="btn danger small" onClick={() => remove(s)}>Delete</button>
              </td>
            </tr>
          ))}
          {stories.length === 0 && <tr><td className="muted">No stories yet — collect written consent, then publish your first transformation.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Recipes (Recipe of the week) ---------------- */

const emptyRecipe = { name: '', kcal: '', protein: '', carbs: '', fat: '', tag: '', instructions: '', imageUrl: '' };

function Recipes() {
  const toast = useToast();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [form, setForm] = useState(emptyRecipe);

  const set = (key: keyof typeof emptyRecipe) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('recipes')
      .select('*')
      .order('featured', { ascending: false })
      .order('name');
    setRecipes((data as Recipe[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openNew() {
    setEditing(null);
    setForm(emptyRecipe);
    setShow(true);
  }

  function openEdit(r: Recipe) {
    setEditing(r);
    setForm({
      name: r.name,
      kcal: String(r.kcal),
      protein: String(r.protein_g),
      carbs: r.carbs_g != null ? String(r.carbs_g) : '',
      fat: r.fat_g != null ? String(r.fat_g) : '',
      tag: r.tag ?? '',
      instructions: r.instructions ?? '',
      imageUrl: r.image_url ?? '',
    });
    setShow(true);
  }

  async function save() {
    const kcal = Number(form.kcal);
    const protein = Number(form.protein);
    if (!form.name.trim()) return toast('Recipe needs a name', 'error');
    if (!Number.isFinite(kcal) || kcal <= 0) return toast('Calories must be a positive number', 'error');
    if (!Number.isFinite(protein) || protein < 0) return toast('Protein must be a number (grams)', 'error');
    const row = {
      name: form.name.trim(),
      kcal,
      protein_g: protein,
      carbs_g: form.carbs.trim() === '' ? null : Number(form.carbs),
      fat_g: form.fat.trim() === '' ? null : Number(form.fat),
      tag: form.tag.trim() || null,
      instructions: form.instructions.trim() || null,
      image_url: form.imageUrl.trim() || null,
    };
    const { error } = editing
      ? await supabase.from('recipes').update(row).eq('id', editing.id)
      : await supabase.from('recipes').insert(row);
    if (error) return toast(error.message, 'error');
    toast(editing ? 'Recipe updated' : 'Recipe added');
    setForm(emptyRecipe);
    setEditing(null);
    setShow(false);
    await load();
  }

  async function toggleFeatured(r: Recipe) {
    const { error } = await supabase.from('recipes').update({ featured: !r.featured }).eq('id', r.id);
    if (error) return toast(error.message, 'error');
    toast(r.featured ? 'Removed from Recipe of the week' : 'Now showing in Recipe of the week');
    await load();
  }

  async function remove(r: Recipe) {
    if (!window.confirm(`Delete recipe "${r.name}"?`)) return;
    const { error } = await supabase.from('recipes').delete().eq('id', r.id);
    if (error) return toast(error.message, 'error');
    toast('Recipe deleted');
    await load();
  }

  const featuredCount = recipes.filter((r) => r.featured).length;

  return (
    <div className="card">
      <div className="row">
        <h2 style={{ margin: 0 }}>Recipe of the week</h2>
        <span className="muted">{featuredCount} featured — ★ recipes show on the member home screen</span>
        <div className="spacer" />
        <button className="btn" onClick={() => (show ? setShow(false) : openNew())}>{show ? 'Close' : '+ New recipe'}</button>
      </div>

      {show && (
        <div style={{ marginTop: 14 }}>
          <div className="row">
            <label className="field grow">Name<input value={form.name} onChange={(e) => set('name')(e.target.value)} placeholder="Paneer bhurji protein bowl" /></label>
            <label className="field">Tag (optional)<input className="inline" style={{ width: 130 }} value={form.tag} onChange={(e) => set('tag')(e.target.value)} placeholder="High protein" /></label>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <label className="field">Calories<input className="inline" style={{ width: 90 }} type="number" min={1} value={form.kcal} onChange={(e) => set('kcal')(e.target.value)} placeholder="420" /></label>
            <label className="field">Protein (g)<input className="inline" style={{ width: 90 }} type="number" min={0} value={form.protein} onChange={(e) => set('protein')(e.target.value)} placeholder="32" /></label>
            <label className="field">Carbs (g, optional)<input className="inline" style={{ width: 110 }} type="number" min={0} value={form.carbs} onChange={(e) => set('carbs')(e.target.value)} placeholder="28" /></label>
            <label className="field">Fat (g, optional)<input className="inline" style={{ width: 100 }} type="number" min={0} value={form.fat} onChange={(e) => set('fat')(e.target.value)} placeholder="18" /></label>
            <label className="field grow">
              Photo (optional)
              <div className="row" style={{ marginTop: 5 }}>
                <input className="grow" value={form.imageUrl} onChange={(e) => set('imageUrl')(e.target.value)} placeholder="https://…/dish.jpg or upload →" />
                <Upload folder="recipes" accept="image/*" onUploaded={set('imageUrl')} />
                {form.imageUrl && <button type="button" className="btn ghost small" onClick={() => set('imageUrl')('')}>Clear</button>}
              </div>
            </label>
          </div>
          {form.imageUrl && <img src={form.imageUrl} alt="" style={{ height: 64, borderRadius: 9, marginTop: 8, border: '1px solid var(--hairline)' }} />}
          <label className="field" style={{ marginTop: 10 }}>
            Recipe — one step per line
            <textarea rows={5} value={form.instructions} onChange={(e) => set('instructions')(e.target.value)} placeholder={'Crumble 150 g paneer…\nSauté onion, tomato & spices…\nServe with 2 phulkas.'} />
          </label>
          <div className="row" style={{ marginTop: 10 }}>
            <div className="spacer" />
            <button className="btn" onClick={save}>{editing ? 'Save changes' : 'Add recipe'}</button>
          </div>
        </div>
      )}

      <table style={{ marginTop: 12 }}>
        <tbody>
          {recipes.map((r) => (
            <tr key={r.id}>
              <td>
                {r.image_url
                  ? <img src={r.image_url} alt="" style={{ width: 42, height: 42, objectFit: 'cover', borderRadius: 9, verticalAlign: 'middle', marginRight: 10, border: '1px solid var(--hairline)' }} />
                  : <span style={{ display: 'inline-block', width: 42, height: 42, borderRadius: 9, verticalAlign: 'middle', marginRight: 10, background: 'linear-gradient(120deg, #17C07A, #4DD8A8)' }} />}
                <strong>{r.name}</strong>
                <div className="muted">{r.kcal} kcal · {r.protein_g} g protein{r.tag ? ` · ${r.tag}` : ''}</div>
              </td>
              <td>{r.featured ? <span className="badge ok">★ featured</span> : <span className="badge dim">library only</span>}</td>
              <td className="row" style={{ justifyContent: 'flex-end' }}>
                <button className="btn ghost small" onClick={() => toggleFeatured(r)}>{r.featured ? 'Unfeature' : '★ Feature'}</button>
                <button className="btn ghost small" onClick={() => openEdit(r)}>Edit</button>
                <button className="btn danger small" onClick={() => remove(r)}>Delete</button>
              </td>
            </tr>
          ))}
          {recipes.length === 0 && <tr><td className="muted">No recipes yet — add one above and ★ feature it.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Banners ---------------- */

function Banners() {
  const toast = useToast();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [show, setShow] = useState(false);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [colorStart, setColorStart] = useState('#2E5CF6');
  const [colorEnd, setColorEnd] = useState('#17C07A');
  const [linkType, setLinkType] = useState<Banner['link_type']>('none');
  const [linkValue, setLinkValue] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('banners').select('*').order('sort_order').order('created_at');
    const rows = (data as Banner[]) ?? [];
    // Legacy rows can share sort_order (older inserts all defaulted to 0),
    // which makes the ↑/↓ swap unstable. Normalise to a strict 0..n-1 sequence
    // once, so index-based swaps always produce distinct, correct positions.
    const needsNormalise = rows.some((b, i) => b.sort_order !== i);
    if (needsNormalise && rows.length > 0) {
      await Promise.all(
        rows.map((b, i) => (b.sort_order === i ? null : supabase.from('banners').update({ sort_order: i }).eq('id', b.id)))
      );
      setBanners(rows.map((b, i) => ({ ...b, sort_order: i })));
      return;
    }
    setBanners(rows);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    if (!title.trim()) return toast('Banner needs a title', 'error');
    if (linkType !== 'none' && !linkValue.trim()) return toast('Pick where the banner should link to', 'error');
    const { error } = await supabase.from('banners').insert({
      title: title.trim(),
      subtitle: subtitle.trim() || null,
      image_url: imageUrl.trim() || null,
      color_start: colorStart,
      color_end: colorEnd,
      link_type: linkType,
      link_value: linkType === 'none' ? null : linkValue.trim(),
      sort_order: banners.length,
    });
    if (error) return toast(error.message, 'error');
    toast('Banner is live on the home screen');
    setTitle(''); setSubtitle(''); setImageUrl(''); setLinkType('none'); setLinkValue('');
    setShow(false);
    await load();
  }

  async function toggleActive(b: Banner) {
    const { error } = await supabase.from('banners').update({ active: !b.active }).eq('id', b.id);
    if (error) return toast(error.message, 'error');
    await load();
  }

  async function move(index: number, dir: -1 | 1) {
    const other = index + dir;
    if (other < 0 || other >= banners.length) return;
    const a = banners[index];
    const b = banners[other];
    await Promise.all([
      supabase.from('banners').update({ sort_order: other }).eq('id', a.id),
      supabase.from('banners').update({ sort_order: index }).eq('id', b.id),
    ]);
    await load();
  }

  async function remove(b: Banner) {
    if (!window.confirm(`Delete banner "${b.title}"?`)) return;
    const { error } = await supabase.from('banners').delete().eq('id', b.id);
    if (error) return toast(error.message, 'error');
    toast('Banner deleted');
    await load();
  }

  return (
    <div className="card">
      <div className="row">
        <h2 style={{ margin: 0 }}>Home-screen banners</h2>
        <span className="muted">promos & motivation · auto-slide in the app</span>
        <div className="spacer" />
        <button className="btn" onClick={() => setShow((v) => !v)}>{show ? 'Close' : '+ New banner'}</button>
      </div>

      {show && (
        <div style={{ marginTop: 14 }}>
          <div className="row">
            <label className="field grow">Title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Diwali offer — 20% off Pro Max 🎉" /></label>
            <label className="field grow">Subtitle (optional)<input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Ends Sunday. Tap to upgrade." /></label>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <label className="field grow">
              Image (optional — otherwise gradient)
              <div className="row" style={{ marginTop: 5 }}>
                <input className="grow" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…/banner.jpg or upload →" />
                <Upload folder="banners" accept="image/*" onUploaded={setImageUrl} />
                {imageUrl && <button type="button" className="btn ghost small" onClick={() => setImageUrl('')}>Clear</button>}
              </div>
            </label>
            <label className="field">Gradient from<input type="color" className="inline" style={{ width: 52, height: 38, padding: 3 }} value={colorStart} onChange={(e) => setColorStart(e.target.value)} /></label>
            <label className="field">to<input type="color" className="inline" style={{ width: 52, height: 38, padding: 3 }} value={colorEnd} onChange={(e) => setColorEnd(e.target.value)} /></label>
          </div>
          {imageUrl && <img src={imageUrl} alt="" style={{ height: 54, borderRadius: 9, marginTop: 8, border: '1px solid var(--hairline)' }} />}
          <div className="row" style={{ marginTop: 10 }}>
            <label className="field">
              Tap action
              <select className="inline" value={linkType} onChange={(e) => { setLinkType(e.target.value as Banner['link_type']); setLinkValue(''); }}>
                <option value="none">Nothing (display only)</option>
                <option value="screen">Open an app screen</option>
                <option value="url">Open a web link</option>
              </select>
            </label>
            {linkType === 'screen' && (
              <label className="field grow">
                Screen
                <select value={linkValue} onChange={(e) => setLinkValue(e.target.value)}>
                  <option value="">— choose a screen —</option>
                  {SCREENS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
            )}
            {linkType === 'url' && (
              <label className="field grow">Web link<input value={linkValue} onChange={(e) => setLinkValue(e.target.value)} placeholder="https://wa.me/91XXXXXXXXXX" /></label>
            )}
            <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={add}>Publish banner</button>
          </div>
        </div>
      )}

      <table style={{ marginTop: 12 }}>
        <tbody>
          {banners.map((b, i) => (
            <tr key={b.id}>
              <td>
                <div style={{
                  display: 'inline-block', width: 46, height: 26, borderRadius: 7, verticalAlign: 'middle', marginRight: 10,
                  background: b.image_url ? `center/cover url(${b.image_url})` : `linear-gradient(120deg, ${b.color_start}, ${b.color_end})`,
                }} />
                <strong>{b.title}</strong>
                {b.subtitle && <div className="muted">{b.subtitle}</div>}
              </td>
              <td className="muted">
                {b.link_type === 'none' ? 'no link' : b.link_type === 'url' ? b.link_value : `→ ${SCREENS.find((s) => s.value === b.link_value)?.label ?? b.link_value}`}
              </td>
              <td>{b.active ? <span className="badge ok">live</span> : <span className="badge dim">hidden</span>}</td>
              <td className="row" style={{ justifyContent: 'flex-end' }}>
                <button className="btn ghost small" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                <button className="btn ghost small" onClick={() => move(i, 1)} disabled={i === banners.length - 1}>↓</button>
                <button className="btn ghost small" onClick={() => toggleActive(b)}>{b.active ? 'Hide' : 'Show'}</button>
                <button className="btn danger small" onClick={() => remove(b)}>Delete</button>
              </td>
            </tr>
          ))}
          {banners.length === 0 && <tr><td className="muted">No banners yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Videos ---------------- */

function Videos() {
  const toast = useToast();
  const [videos, setVideos] = useState<Video[]>([]);
  const [show, setShow] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState<Video['category']>('workout');
  const [description, setDescription] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('videos').select('*').order('created_at', { ascending: false });
    setVideos((data as Video[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    if (!title.trim()) return toast('Video needs a title', 'error');
    const id = youtubeIdFrom(url);
    if (!id) return toast('That does not look like a YouTube link', 'error');
    const { error } = await supabase.from('videos').insert({
      title: title.trim(),
      youtube_url: url.trim(),
      category,
      description: description.trim() || null,
    });
    if (error) return toast(error.message, 'error');
    toast('Video published to the app');
    setTitle(''); setUrl(''); setDescription('');
    setShow(false);
    await load();
  }

  async function togglePublished(v: Video) {
    const { error } = await supabase.from('videos').update({ published: !v.published }).eq('id', v.id);
    if (error) return toast(error.message, 'error');
    await load();
  }

  async function remove(v: Video) {
    if (!window.confirm(`Delete video "${v.title}"?`)) return;
    const { error } = await supabase.from('videos').delete().eq('id', v.id);
    if (error) return toast(error.message, 'error');
    toast('Video deleted');
    await load();
  }

  return (
    <div className="card">
      <div className="row">
        <h2 style={{ margin: 0 }}>Video library</h2>
        <span className="muted">unlisted YouTube links play inside the app</span>
        <div className="spacer" />
        <button className="btn" onClick={() => setShow((v) => !v)}>{show ? 'Close' : '+ New video'}</button>
      </div>

      {show && (
        <div style={{ marginTop: 14 }}>
          <div className="row">
            <label className="field grow">Title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Full-body dumbbell workout — 30 min" /></label>
            <label className="field">
              Category
              <select className="inline" value={category} onChange={(e) => setCategory(e.target.value as Video['category'])}>
                {VIDEO_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <label className="field grow">YouTube link (unlisted works)<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtu.be/…" /></label>
          </div>
          <label className="field" style={{ marginTop: 10 }}>Description (optional)<textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this video covers…" /></label>
          <div className="row" style={{ marginTop: 10 }}>
            <div className="spacer" />
            <button className="btn" onClick={add}>Publish video</button>
          </div>
        </div>
      )}

      <table style={{ marginTop: 12 }}>
        <tbody>
          {videos.map((v) => {
            const id = youtubeIdFrom(v.youtube_url);
            return (
              <tr key={v.id}>
                <td>
                  {id && <img src={`https://img.youtube.com/vi/${id}/default.jpg`} alt="" style={{ width: 64, borderRadius: 7, verticalAlign: 'middle', marginRight: 10 }} />}
                  <strong>{v.title}</strong>
                </td>
                <td><span className="badge dim">{v.category}</span></td>
                <td>{v.published ? <span className="badge ok">live</span> : <span className="badge dim">hidden</span>}</td>
                <td className="muted">{new Date(v.created_at).toLocaleDateString()}</td>
                <td className="row" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn ghost small" onClick={() => togglePublished(v)}>{v.published ? 'Hide' : 'Show'}</button>
                  <button className="btn danger small" onClick={() => remove(v)}>Delete</button>
                </td>
              </tr>
            );
          })}
          {videos.length === 0 && <tr><td className="muted">No videos yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Exercises ---------------- */

function Exercises() {
  const toast = useToast();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [show, setShow] = useState(false);

  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [equipment, setEquipment] = useState('');
  const [difficulty, setDifficulty] = useState<(typeof DIFFICULTIES)[number]>('Beginner');
  const [compound, setCompound] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [gifUrl, setGifUrl] = useState('');
  const [instructions, setInstructions] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('exercises')
      .select('id, name, muscle_group, is_compound, equipment, difficulty, video_url, gif_url')
      .order('muscle_group')
      .order('name');
    const list = (data as Exercise[]) ?? [];
    setExercises(list);
    setGroups(Array.from(new Set(list.map((e) => e.muscle_group))).sort());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    if (!name.trim() || !group.trim() || !equipment.trim()) {
      return toast('Need at least a name, muscle group and equipment', 'error');
    }
    if (videoUrl.trim() && !youtubeIdFrom(videoUrl)) {
      return toast('The video link does not look like a YouTube link', 'error');
    }
    const { error } = await supabase.from('exercises').insert({
      name: name.trim(),
      muscle_group: group.trim(),
      equipment: equipment.trim(),
      difficulty,
      is_compound: compound,
      video_url: videoUrl.trim() || null,
      gif_url: gifUrl.trim() || null,
      instructions: instructions.trim() || null,
    });
    if (error) return toast(error.message, 'error');
    toast('Exercise added to the library');
    setName(''); setEquipment(''); setVideoUrl(''); setGifUrl(''); setInstructions(''); setCompound(false);
    setShow(false);
    await load();
  }

  async function setVideo(ex: Exercise) {
    const url = window.prompt(`YouTube link for "${ex.name}" (leave empty to remove):`, ex.video_url ?? '');
    if (url === null) return;
    if (url.trim() && !youtubeIdFrom(url)) return toast('Not a valid YouTube link', 'error');
    const { error } = await supabase.from('exercises').update({ video_url: url.trim() || null }).eq('id', ex.id);
    if (error) return toast(error.message, 'error');
    toast(url.trim() ? 'Form video attached' : 'Video removed');
    await load();
  }

  async function saveGifUrl(ex: Exercise, url: string) {
    const { error } = await supabase.from('exercises').update({ gif_url: url || null }).eq('id', ex.id);
    if (error) return toast(error.message, 'error');
    toast(url ? 'Movement GIF attached' : 'GIF removed');
    await load();
  }

  const shown = exercises.filter((e) => {
    const q = search.trim().toLowerCase();
    return !q || e.name.toLowerCase().includes(q) || e.muscle_group.toLowerCase().includes(q);
  });

  return (
    <div className="card">
      <div className="row">
        <h2 style={{ margin: 0 }}>Exercise library</h2>
        <span className="muted">{exercises.length} exercises · videos show on the exercise page in the app</span>
        <div className="spacer" />
        <button className="btn" onClick={() => setShow((v) => !v)}>{show ? 'Close' : '+ New exercise'}</button>
      </div>

      {show && (
        <div style={{ marginTop: 14 }}>
          <div className="row">
            <label className="field grow">Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bulgarian split squat" /></label>
            <label className="field">
              Muscle group
              <input className="inline" style={{ width: 150 }} list="muscle-groups" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Quads" />
              <datalist id="muscle-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
            </label>
            <label className="field">Equipment<input className="inline" style={{ width: 140 }} value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="Dumbbell" /></label>
            <label className="field">
              Difficulty
              <select className="inline" value={difficulty} onChange={(e) => setDifficulty(e.target.value as (typeof DIFFICULTIES)[number])}>
                {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <label className="field grow">Form video — YouTube link (optional, shows at the bottom)<input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtu.be/…" /></label>
            <label className="field grow">
              Movement GIF (optional, shows at the top)
              <div className="row" style={{ marginTop: 5 }}>
                <input className="grow" value={gifUrl} onChange={(e) => setGifUrl(e.target.value)} placeholder="paste URL or upload →" />
                <Upload folder="exercise-gifs" accept="image/gif,image/*" onUploaded={setGifUrl} />
              </div>
            </label>
            <label className="row" style={{ gap: 6, cursor: 'pointer', alignSelf: 'flex-end', paddingBottom: 8 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={compound} onChange={(e) => setCompound(e.target.checked)} />
              Compound lift (+5 kg overload steps)
            </label>
          </div>
          <label className="field" style={{ marginTop: 10 }}>
            Instructions — one step per line
            <textarea rows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder={'Set up with…\nBrace your core…\nLower until…'} />
          </label>
          <div className="row" style={{ marginTop: 10 }}>
            <div className="spacer" />
            <button className="btn" onClick={add}>Add exercise</button>
          </div>
        </div>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <input className="grow" placeholder="Search exercises…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="muted">{shown.length} shown</span>
      </div>
      <table style={{ marginTop: 8 }}>
        <tbody>
          {shown.slice(0, 40).map((ex) => (
            <tr key={ex.id}>
              <td><strong>{ex.name}</strong></td>
              <td><span className="badge dim">{ex.muscle_group}</span></td>
              <td className="muted">{ex.equipment}</td>
              <td>
                {ex.gif_url ? <span className="badge ok">GIF</span> : <span className="badge dim">no GIF</span>}
                {' '}
                {ex.video_url ? <span className="badge ok">video</span> : <span className="badge warn">no video</span>}
              </td>
              <td style={{ textAlign: 'right' }}>
                <Upload folder="exercise-gifs" accept="image/gif,image/*" label={ex.gif_url ? 'Change GIF' : 'Upload GIF'} onUploaded={(url) => saveGifUrl(ex, url)} />{' '}
                {ex.gif_url && <button className="btn ghost small" onClick={() => saveGifUrl(ex, '')} title="Remove GIF">✕</button>}{' '}
                <button className="btn ghost small" onClick={() => setVideo(ex)}>{ex.video_url ? 'Change video' : 'Attach video'}</button>
              </td>
            </tr>
          ))}
          {shown.length > 40 && <tr><td colSpan={5} className="muted">…and {shown.length - 40} more — narrow the search.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
