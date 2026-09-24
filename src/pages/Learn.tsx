import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useToast } from '../App';

/**
 * Learn (0085+): edit the self-study content members read in the app — modules,
 * articles and the quiz bank — without a migration or a release build.
 *
 * Article bodies are a JSON list of typed blocks. The rules below MUST match
 * supabase/seed/learn/blocks.js and the member app's ArticleBlocks renderer
 * (this repo can't import either). An unknown block type or widget key is
 * rejected here because the app would silently render it as nothing.
 */

type Module = { id: string; slug: string; title: string; subtitle: string | null; accent: string; order_index: number; published: boolean };
type ArticleMeta = { id: string; module_id: string; slug: string; title: string; summary: string | null; read_minutes: number; order_index: number; published: boolean };
type Question = {
  id: string;
  module_id: string;
  article_id: string | null;
  slug: string;
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string;
  in_final: boolean;
  order_index: number;
  published: boolean;
};

const BLOCK_TYPES = ['p', 'h', 'list', 'callout', 'stat', 'table', 'compare', 'check', 'widget', 'cta', 'bottomline'];
const TONES = ['tip', 'myth', 'science', 'warn'];
const WIDGETS = ['motor-units', 'force-velocity', 'volume-curve', 'rir-trainer', 'deload-check', 'split-picker', 'rm-converter'];

const BLOCK_HELP = `Block types (one object per block, in reading order):
{"t":"p","text":"Paragraph. **bold** works."}
{"t":"h","text":"Subheading"}
{"t":"list","items":["one","two"],"ordered":false}
{"t":"callout","tone":"tip|myth|science|warn","title":"optional","text":"..."}
{"t":"stat","value":"10–20","label":"what the number means"}
{"t":"table","head":["A","B"],"rows":[["1","2"]],"caption":"optional"}
{"t":"compare","left":{"title":"..","items":[".."]},"right":{"title":"..","items":[".."]}}
{"t":"check","q":"Question?","options":["a","b","c"],"answer":1,"why":"Explanation"}
{"t":"widget","key":"${WIDGETS.join('|')}"}
{"t":"cta","label":"Button text","to":"workouts|final|article:<slug>"}
{"t":"bottomline","text":"The one-line takeaway (end every article on one)"}`;

/** Returns a list of problems; empty means the body is safe to publish. */
function validateBody(raw: string, slugs: Set<string>): { blocks: unknown[] | null; problems: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { blocks: null, problems: [`Not valid JSON: ${(e as Error).message}`] };
  }
  if (!Array.isArray(parsed)) return { blocks: null, problems: ['The body must be a JSON list: [ … ]'] };
  const problems: string[] = [];
  parsed.forEach((b: any, i) => {
    const at = `Block ${i + 1}`;
    if (!b || typeof b !== 'object') return problems.push(`${at}: not an object`);
    if (!BLOCK_TYPES.includes(b.t)) return problems.push(`${at}: unknown type "${b.t}"`);
    const needText = ['p', 'h', 'bottomline', 'callout'];
    if (needText.includes(b.t) && typeof b.text !== 'string') problems.push(`${at}: needs "text"`);
    if (b.t === 'callout' && !TONES.includes(b.tone)) problems.push(`${at}: tone must be ${TONES.join(', ')}`);
    if (b.t === 'list' && !Array.isArray(b.items)) problems.push(`${at}: needs "items"`);
    if (b.t === 'table') {
      if (!Array.isArray(b.head) || !Array.isArray(b.rows)) problems.push(`${at}: needs "head" and "rows"`);
      else b.rows.forEach((r: unknown[], k: number) => Array.isArray(r) && r.length !== b.head.length && problems.push(`${at}: row ${k + 1} has ${r.length} cells, header has ${b.head.length}`));
    }
    if (b.t === 'check') {
      if (!Array.isArray(b.options) || b.options.length < 2) problems.push(`${at}: needs 2+ options`);
      else if (!(Number.isInteger(b.answer) && b.answer >= 0 && b.answer < b.options.length)) problems.push(`${at}: "answer" must be an option index (0-based)`);
      if (!b.why) problems.push(`${at}: needs "why"`);
    }
    if (b.t === 'widget' && !WIDGETS.includes(b.key)) problems.push(`${at}: unknown widget "${b.key}"`);
    if (b.t === 'cta') {
      const to = String(b.to ?? '');
      const ok = to === 'workouts' || to === 'final' || (to.startsWith('article:') && slugs.has(to.slice(8)));
      if (!ok) problems.push(`${at}: link "${to}" does not resolve`);
    }
  });
  return { blocks: parsed, problems };
}

async function me(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export function Learn() {
  const toast = useToast();
  const [modules, setModules] = useState<Module[]>([]);
  const [articles, setArticles] = useState<ArticleMeta[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [stats, setStats] = useState<{ reads: number; sittings: number; finals: number; finalPasses: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [m, a, q, reads, sittings, finals] = await Promise.all([
      supabase.from('learn_modules').select('*').order('order_index'),
      supabase.from('learn_articles').select('id, module_id, slug, title, summary, read_minutes, order_index, published').order('order_index'),
      supabase.from('learn_questions').select('*').order('order_index'),
      supabase.from('learn_progress').select('article_id', { count: 'exact', head: true }),
      supabase.from('learn_quiz_attempts').select('id', { count: 'exact', head: true }),
      supabase.from('learn_quiz_attempts').select('score, total').eq('scope', 'final'),
    ]);
    const err = m.error ?? a.error ?? q.error;
    // The usual cause is 0085 not having been pasted yet.
    setLoadError(err ? err.message : null);
    setModules((m.data as Module[]) ?? []);
    setArticles((a.data as ArticleMeta[]) ?? []);
    setQuestions((q.data as Question[]) ?? []);
    const f = (finals.data as { score: number; total: number }[]) ?? [];
    setStats({ reads: reads.count ?? 0, sittings: sittings.count ?? 0, finals: f.length, finalPasses: f.filter((x) => x.total > 0 && x.score / x.total >= 0.7).length });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const slugs = useMemo(() => new Set(articles.map((a) => a.slug)), [articles]);

  if (loadError) {
    return (
      <div className="card">
        <h2>Learn</h2>
        <div className="error-box">Couldn't load Learn: {loadError}. If this says a relation does not exist, paste 0085–0087 in the SQL editor first.</div>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <div className="row">
          <h2 style={{ margin: 0 }}>Learn</h2>
          <span className="muted">
            {modules.length} modules · {articles.length} articles · {questions.length} quiz questions
          </span>
        </div>
        {stats && (
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <span className="badge dim">{stats.reads} articles read by members</span>
            <span className="badge dim">{stats.sittings} quiz sittings</span>
            <span className="badge dim">
              {stats.finals} finals taken{stats.finals ? ` · ${Math.round((stats.finalPasses / stats.finals) * 100)}% passed` : ''}
            </span>
          </div>
        )}
      </div>

      {modules.map((m) => (
        <ModuleCard
          key={m.id}
          module={m}
          articles={articles.filter((a) => a.module_id === m.id)}
          questions={questions.filter((q) => q.module_id === m.id)}
          slugs={slugs}
          onChanged={load}
          toast={toast}
        />
      ))}
    </>
  );
}

function ModuleCard(props: {
  module: Module;
  articles: ArticleMeta[];
  questions: Question[];
  slugs: Set<string>;
  onChanged: () => Promise<void>;
  toast: (m: string, k?: 'ok' | 'error') => void;
}) {
  const { module: m, articles, questions, toast } = props;
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [showQuiz, setShowQuiz] = useState(false);

  async function togglePublished() {
    const { error } = await supabase.from('learn_modules').update({ published: !m.published, updated_at: new Date().toISOString(), updated_by: await me() }).eq('id', m.id);
    if (error) return toast(error.message, 'error');
    toast(m.published ? `"${m.title}" hidden from members` : `"${m.title}" is live`);
    await props.onChanged();
  }

  return (
    <div className="card">
      <div className="row">
        <h2 style={{ margin: 0 }}>{m.order_index + 1}. {m.title}</h2>
        {!m.published && <span className="badge warn">hidden</span>}
        <span className="muted">{articles.length} articles · {questions.length} questions</span>
        <div className="spacer" />
        <button className="btn ghost small" onClick={togglePublished}>{m.published ? 'Hide module' : 'Publish module'}</button>
        <button className="btn ghost small" onClick={() => setShowQuiz((s) => !s)}>{showQuiz ? 'Close quiz bank' : 'Quiz bank'}</button>
        <button className="btn small" onClick={() => setEditing(editing === 'new' ? null : 'new')}>+ Article</button>
      </div>

      {editing === 'new' && (
        <ArticleEditor moduleId={m.id} nextIndex={articles.length} slugs={props.slugs} onClose={() => setEditing(null)} onSaved={props.onChanged} toast={toast} />
      )}

      <table style={{ marginTop: 10 }}>
        <tbody>
          {articles.map((a) => (
            <React.Fragment key={a.id}>
              <tr>
                <td style={{ width: 28 }} className="muted">{a.order_index + 1}</td>
                <td>
                  <strong>{a.title}</strong>
                  <div className="muted">{a.slug} · {a.read_minutes} min</div>
                </td>
                <td>{a.published ? <span className="badge ok">live</span> : <span className="badge warn">draft</span>}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn ghost small" onClick={() => setEditing(editing === a.id ? null : a.id)}>{editing === a.id ? 'Close' : 'Edit'}</button>
                </td>
              </tr>
              {editing === a.id && (
                <tr>
                  <td colSpan={4} style={{ background: '#fafbfe' }}>
                    <ArticleEditor moduleId={m.id} articleId={a.id} nextIndex={a.order_index} slugs={props.slugs} onClose={() => setEditing(null)} onSaved={props.onChanged} toast={toast} />
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>

      {showQuiz && <QuizBank module={m} articles={articles} questions={questions} onChanged={props.onChanged} toast={toast} />}
    </div>
  );
}

function ArticleEditor(props: {
  moduleId: string;
  articleId?: string;
  nextIndex: number;
  slugs: Set<string>;
  onClose: () => void;
  onSaved: () => Promise<void>;
  toast: (m: string, k?: 'ok' | 'error') => void;
}) {
  const { toast } = props;
  const isNew = !props.articleId;
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [minutes, setMinutes] = useState('3');
  const [published, setPublished] = useState(!isNew ? true : false);
  const [body, setBody] = useState(isNew ? JSON.stringify([{ t: 'p', text: '' }, { t: 'bottomline', text: '' }], null, 2) : '');
  const [loaded, setLoaded] = useState(isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) return;
    supabase
      .from('learn_articles')
      .select('*')
      .eq('id', props.articleId!)
      .single()
      .then(({ data, error }) => {
        if (error || !data) return toast(error?.message ?? 'Article not found', 'error');
        setSlug(data.slug);
        setTitle(data.title);
        setSummary(data.summary ?? '');
        setMinutes(String(data.read_minutes));
        setPublished(data.published);
        setBody(JSON.stringify(data.body, null, 2));
        setLoaded(true);
      });
  }, [isNew, props.articleId, toast]);

  const check = useMemo(() => validateBody(body, props.slugs), [body, props.slugs]);
  const blocks = (check.blocks ?? []) as { t: string }[];
  const summaryLine = `${blocks.length} blocks · ${blocks.filter((b) => b.t === 'check').length} quick checks · ${blocks.filter((b) => b.t === 'widget').length} widgets`;

  async function save() {
    if (!title.trim()) return toast('Article needs a title', 'error');
    if (isNew && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return toast('Slug: lowercase words joined by hyphens, e.g. rest-periods', 'error');
    if (isNew && props.slugs.has(slug)) return toast('That slug is already taken', 'error');
    if (check.problems.length) return toast(`Fix the body first: ${check.problems[0]}`, 'error');
    const mins = Number(minutes);
    if (!Number.isInteger(mins) || mins < 1 || mins > 30) return toast('Read time: whole minutes, 1–30', 'error');
    setSaving(true);
    const row = {
      title: title.trim(),
      summary: summary.trim() || null,
      read_minutes: mins,
      published,
      body: check.blocks,
      updated_at: new Date().toISOString(),
      updated_by: await me(),
    };
    const { error } = isNew
      ? await supabase.from('learn_articles').insert({ ...row, slug, module_id: props.moduleId, order_index: props.nextIndex })
      : await supabase.from('learn_articles').update(row).eq('id', props.articleId!);
    setSaving(false);
    if (error) return toast(error.message, 'error');
    toast(isNew ? 'Article added' : 'Article saved — live in the app on next open');
    await props.onSaved();
    props.onClose();
  }

  if (!loaded) return <div className="muted" style={{ padding: 10 }}>Loading…</div>;

  return (
    <div style={{ marginTop: 10, marginBottom: 6 }}>
      <div className="row">
        {isNew && (
          <label className="field">Slug<input className="inline" style={{ width: 200 }} value={slug} onChange={(e) => setSlug(e.target.value.trim())} placeholder="rest-periods" /></label>
        )}
        <label className="field grow">Title<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="field">Minutes<input className="inline" style={{ width: 80 }} type="number" min={1} max={30} value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label>
        <label className="field" style={{ alignSelf: 'flex-end', paddingBottom: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> Live
        </label>
      </div>
      <label className="field" style={{ marginTop: 10 }}>Summary (one line, shown in lists)<input value={summary} onChange={(e) => setSummary(e.target.value)} /></label>
      <label className="field" style={{ marginTop: 10 }}>
        Body (JSON blocks)
        <textarea rows={18} value={body} onChange={(e) => setBody(e.target.value)} spellCheck={false} style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 12.5, lineHeight: 1.5 }} />
      </label>
      {check.problems.length ? (
        <div className="error-box" style={{ marginTop: 8 }}>
          {check.problems.slice(0, 6).map((p) => <div key={p}>{p}</div>)}
          {check.problems.length > 6 && <div>…and {check.problems.length - 6} more</div>}
        </div>
      ) : (
        <div className="ok-box" style={{ marginTop: 8 }}>✓ Valid · {summaryLine}</div>
      )}
      <details style={{ marginTop: 8 }}>
        <summary className="muted" style={{ cursor: 'pointer' }}>Block reference</summary>
        <pre style={{ fontSize: 11.5, whiteSpace: 'pre-wrap', background: '#fafbfe', border: '1px solid var(--hairline)', borderRadius: 10, padding: 10 }}>{BLOCK_HELP}</pre>
      </details>
      <div className="row" style={{ marginTop: 10 }}>
        <div className="spacer" />
        <button className="btn ghost" onClick={props.onClose}>Cancel</button>
        <button className="btn" disabled={saving || check.problems.length > 0} onClick={save}>{saving ? 'Saving…' : isNew ? 'Add article' : 'Save article'}</button>
      </div>
    </div>
  );
}

const emptyQ = { prompt: '', options: ['', '', '', ''], correct: 0, explanation: '', articleId: '', inFinal: true, published: true };

function QuizBank(props: {
  module: Module;
  articles: ArticleMeta[];
  questions: Question[];
  onChanged: () => Promise<void>;
  toast: (m: string, k?: 'ok' | 'error') => void;
}) {
  const { module: m, articles, questions, toast } = props;
  const [editing, setEditing] = useState<Question | 'new' | null>(null);
  const [form, setForm] = useState(emptyQ);

  function open(q: Question | 'new') {
    setEditing(q);
    if (q === 'new') setForm(emptyQ);
    else {
      const opts = [...q.options];
      while (opts.length < 4) opts.push('');
      setForm({ prompt: q.prompt, options: opts, correct: q.correct_index, explanation: q.explanation, articleId: q.article_id ?? '', inFinal: q.in_final, published: q.published });
    }
  }

  async function save() {
    // Blank option boxes are dropped; the correct index is remapped to match.
    const kept = form.options.map((o, i) => ({ o: o.trim(), i })).filter((x) => x.o);
    const correct = kept.findIndex((x) => x.i === form.correct);
    if (!form.prompt.trim()) return toast('Question needs a prompt', 'error');
    if (kept.length < 2) return toast('At least two options', 'error');
    if (correct < 0) return toast('The option marked correct is empty', 'error');
    if (!form.explanation.trim()) return toast('Add an explanation — members see it after answering', 'error');
    const row = {
      prompt: form.prompt.trim(),
      options: kept.map((x) => x.o),
      correct_index: correct,
      explanation: form.explanation.trim(),
      article_id: form.articleId || null,
      in_final: form.inFinal,
      published: form.published,
      updated_by: await me(),
    };
    const { error } =
      editing === 'new'
        ? await supabase.from('learn_questions').insert({ ...row, module_id: m.id, slug: `${m.slug}-${Date.now().toString(36)}`, order_index: questions.length })
        : await supabase.from('learn_questions').update(row).eq('id', (editing as Question).id);
    if (error) return toast(error.message, 'error');
    toast(editing === 'new' ? 'Question added' : 'Question saved');
    setEditing(null);
    await props.onChanged();
  }

  async function remove(q: Question) {
    if (!window.confirm('Delete this question?')) return;
    const { error } = await supabase.from('learn_questions').delete().eq('id', q.id);
    if (error) return toast(error.message, 'error');
    toast('Question deleted');
    await props.onChanged();
  }

  return (
    <div className="meal-block" style={{ marginTop: 14 }}>
      <div className="row">
        <strong>Quiz bank</strong>
        <span className="muted">{questions.filter((q) => q.published).length} live · the module quiz uses all of them, the final draws from those marked "in final"</span>
        <div className="spacer" />
        <button className="btn small" onClick={() => open('new')}>+ Question</button>
      </div>

      {editing && (
        <div style={{ marginTop: 10 }}>
          <label className="field">Question<input value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} /></label>
          <div style={{ marginTop: 8 }}>
            {form.options.map((o, i) => (
              <div key={i} className="row" style={{ marginTop: 6 }}>
                <input type="radio" name="correct" checked={form.correct === i} onChange={() => setForm({ ...form, correct: i })} title="Correct answer" />
                <input className="grow" value={o} placeholder={`Option ${String.fromCharCode(65 + i)}${i >= 2 ? ' (optional)' : ''}`} onChange={(e) => setForm({ ...form, options: form.options.map((x, k) => (k === i ? e.target.value : x)) })} />
              </div>
            ))}
            <div className="muted" style={{ marginTop: 4 }}>Select the radio next to the correct answer. Options are shuffled for members.</div>
          </div>
          <label className="field" style={{ marginTop: 8 }}>Explanation (shown after answering)<textarea rows={2} value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} /></label>
          <div className="row" style={{ marginTop: 8 }}>
            <label className="field">
              Teaches it (re-read link)
              <select value={form.articleId} onChange={(e) => setForm({ ...form, articleId: e.target.value })}>
                <option value="">— none —</option>
                {articles.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </label>
            <label className="field" style={{ alignSelf: 'flex-end', paddingBottom: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.inFinal} onChange={(e) => setForm({ ...form, inFinal: e.target.checked })} /> In final
            </label>
            <label className="field" style={{ alignSelf: 'flex-end', paddingBottom: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} /> Live
            </label>
            <div className="spacer" />
            <button className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn" onClick={save}>{editing === 'new' ? 'Add question' : 'Save question'}</button>
          </div>
        </div>
      )}

      <table style={{ marginTop: 10 }}>
        <tbody>
          {questions.map((q) => (
            <tr key={q.id}>
              <td>
                <strong>{q.prompt}</strong>
                <div className="muted">✓ {q.options[q.correct_index]}{q.in_final ? '' : ' · not in final'}{q.published ? '' : ' · hidden'}</div>
              </td>
              <td className="row" style={{ justifyContent: 'flex-end' }}>
                <button className="btn ghost small" onClick={() => open(q)}>Edit</button>
                <button className="btn danger small" onClick={() => remove(q)}>Delete</button>
              </td>
            </tr>
          ))}
          {questions.length === 0 && <tr><td className="muted">No questions yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
