import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useToast } from '../App';
import { Supplement } from '../types';
import { Upload } from '../components/Upload';

// Categories the member app already styles with gradients; free-typed values
// also work — they become a new filter chip in the app automatically.
const KNOWN_CATEGORIES = ['Protein', 'Performance', 'Wellness', 'Recovery'];

const emptyForm = {
  name: '',
  brand: '',
  origin: '',
  category: '',
  price: '',
  rating: '',
  description: '',
  imageUrl: '',
};

export function Store() {
  const toast = useToast();
  const [items, setItems] = useState<Supplement[]>([]);
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<Supplement | null>(null);
  const [form, setForm] = useState(emptyForm);

  const set = (key: keyof typeof emptyForm) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const load = useCallback(async () => {
    const { data } = await supabase.from('supplements').select('*').order('category').order('name');
    setItems((data as Supplement[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setShow(true);
  }

  function openEdit(s: Supplement) {
    setEditing(s);
    setForm({
      name: s.name,
      brand: s.brand,
      origin: s.origin ?? '',
      category: s.category,
      price: String(s.price_inr),
      rating: s.rating != null ? String(s.rating) : '',
      description: s.description ?? '',
      imageUrl: s.image_url ?? '',
    });
    setShow(true);
  }

  async function save() {
    const price = Number(form.price);
    const rating = form.rating.trim() === '' ? null : Number(form.rating);
    if (!form.name.trim() || !form.brand.trim() || !form.category.trim()) {
      return toast('Need at least a name, brand and category', 'error');
    }
    if (!Number.isFinite(price) || price <= 0) return toast('Price must be a positive number (₹)', 'error');
    if (rating != null && (!Number.isFinite(rating) || rating < 0 || rating > 5)) {
      return toast('Rating must be between 0 and 5', 'error');
    }
    const row = {
      name: form.name.trim(),
      brand: form.brand.trim(),
      origin: form.origin.trim() || null,
      category: form.category.trim(),
      price_inr: price,
      rating,
      description: form.description.trim() || null,
      image_url: form.imageUrl.trim() || null,
    };
    const { error } = editing
      ? await supabase.from('supplements').update(row).eq('id', editing.id)
      : await supabase.from('supplements').insert(row);
    if (error) return toast(error.message, 'error');
    toast(editing ? 'Product updated' : 'Product added to the store');
    setForm(emptyForm);
    setEditing(null);
    setShow(false);
    await load();
  }

  async function toggleStock(s: Supplement) {
    const { error } = await supabase.from('supplements').update({ in_stock: !s.in_stock }).eq('id', s.id);
    if (error) return toast(error.message, 'error');
    await load();
  }

  async function remove(s: Supplement) {
    if (!window.confirm(`Remove "${s.name}" from the store? Members will no longer see it.`)) return;
    const { error } = await supabase.from('supplements').delete().eq('id', s.id);
    if (error) return toast(error.message, 'error');
    toast('Product removed');
    await load();
  }

  return (
    <div className="card">
      <div className="row">
        <h2 style={{ margin: 0 }}>Supplement store</h2>
        <span className="muted">{items.length} products · what members see in the Supplements tab</span>
        <div className="spacer" />
        <button className="btn" onClick={() => (show ? setShow(false) : openNew())}>{show ? 'Close' : '+ New product'}</button>
      </div>

      {show && (
        <div style={{ marginTop: 14 }}>
          <div className="row">
            <label className="field grow">Name<input value={form.name} onChange={(e) => set('name')(e.target.value)} placeholder="Gold Standard 100% Whey — 2 lb" /></label>
            <label className="field">Brand<input className="inline" style={{ width: 150 }} value={form.brand} onChange={(e) => set('brand')(e.target.value)} placeholder="Optimum Nutrition" /></label>
            <label className="field">Origin (optional)<input className="inline" style={{ width: 120 }} value={form.origin} onChange={(e) => set('origin')(e.target.value)} placeholder="USA" /></label>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <label className="field">
              Category
              <input className="inline" style={{ width: 140 }} list="supp-categories" value={form.category} onChange={(e) => set('category')(e.target.value)} placeholder="Protein" />
              <datalist id="supp-categories">{KNOWN_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            <label className="field">Price (₹)<input className="inline" style={{ width: 110 }} type="number" min={1} value={form.price} onChange={(e) => set('price')(e.target.value)} placeholder="3999" /></label>
            <label className="field">Rating 0–5 (optional)<input className="inline" style={{ width: 110 }} type="number" min={0} max={5} step={0.1} value={form.rating} onChange={(e) => set('rating')(e.target.value)} placeholder="4.7" /></label>
            <label className="field grow">
              Product image (optional)
              <div className="row" style={{ marginTop: 5 }}>
                <input className="grow" value={form.imageUrl} onChange={(e) => set('imageUrl')(e.target.value)} placeholder="https://…/product.jpg or upload →" />
                <Upload folder="supplements" accept="image/*" onUploaded={set('imageUrl')} />
                {form.imageUrl && <button type="button" className="btn ghost small" onClick={() => set('imageUrl')('')}>Clear</button>}
              </div>
            </label>
          </div>
          {form.imageUrl && <img src={form.imageUrl} alt="" style={{ height: 64, borderRadius: 9, marginTop: 8, border: '1px solid var(--hairline)' }} />}
          <label className="field" style={{ marginTop: 10 }}>
            Description (optional — shows on the product page)
            <textarea rows={3} value={form.description} onChange={(e) => set('description')(e.target.value)} placeholder="24 g protein per scoop. Imported and batch-tested…" />
          </label>
          <div className="row" style={{ marginTop: 10 }}>
            <div className="spacer" />
            <button className="btn" onClick={save}>{editing ? 'Save changes' : 'Add product'}</button>
          </div>
        </div>
      )}

      <table style={{ marginTop: 12 }}>
        <tbody>
          {items.map((s) => (
            <tr key={s.id}>
              <td>
                {s.image_url
                  ? <img src={s.image_url} alt="" style={{ width: 42, height: 42, objectFit: 'cover', borderRadius: 9, verticalAlign: 'middle', marginRight: 10, border: '1px solid var(--hairline)' }} />
                  : <span style={{ display: 'inline-block', width: 42, height: 42, borderRadius: 9, verticalAlign: 'middle', marginRight: 10, background: 'linear-gradient(120deg, #2E5CF6, #17C07A)' }} />}
                <strong>{s.name}</strong>
                <div className="muted">{s.brand}{s.origin ? ` · ${s.origin}` : ''}{s.rating != null ? ` · ★ ${s.rating}` : ''}</div>
              </td>
              <td><span className="badge dim">{s.category}</span></td>
              <td><strong>₹{s.price_inr.toLocaleString('en-IN')}</strong></td>
              <td>{s.in_stock ? <span className="badge ok">in stock</span> : <span className="badge warn">out of stock</span>}</td>
              <td className="row" style={{ justifyContent: 'flex-end' }}>
                <button className="btn ghost small" onClick={() => toggleStock(s)}>{s.in_stock ? 'Mark out of stock' : 'Mark in stock'}</button>
                <button className="btn ghost small" onClick={() => openEdit(s)}>Edit</button>
                <button className="btn danger small" onClick={() => remove(s)}>Delete</button>
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td className="muted">No products yet — add your first supplement above.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
