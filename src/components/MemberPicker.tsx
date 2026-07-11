import { useState } from 'react';
import { Profile, displayName } from '../types';

/** Search + checkbox multi-select of members, shared by both assign flows. */
export function MemberPicker({
  clients,
  checked,
  onChange,
}: {
  clients: Profile[];
  checked: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [query, setQuery] = useState('');
  const visible = clients.filter((c) => {
    const q = query.trim().toLowerCase();
    return !q || displayName(c).toLowerCase().includes(q) || (c.phone ?? '').includes(q);
  });

  function toggle(id: string) {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  return (
    <div>
      <div className="row">
        <input className="grow" placeholder="Search members…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="button" className="btn ghost small" onClick={() => onChange(new Set(visible.map((c) => c.id)))}>
          Select all{query ? ' shown' : ''}
        </button>
        <button type="button" className="btn ghost small" onClick={() => onChange(new Set())}>Clear</button>
        <span className="muted">{checked.size} selected</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6, marginTop: 10, maxHeight: 220, overflowY: 'auto' }}>
        {visible.map((c) => (
          <label
            key={c.id}
            className="row"
            style={{
              gap: 8, cursor: 'pointer', padding: '7px 10px', borderRadius: 9,
              border: '1px solid var(--hairline)',
              background: checked.has(c.id) ? 'var(--blue-tint)' : 'var(--white)',
            }}
          >
            <input type="checkbox" style={{ width: 'auto' }} checked={checked.has(c.id)} onChange={() => toggle(c.id)} />
            <span style={{ fontWeight: 600 }}>{displayName(c)}</span>
            {c.phone && <span className="muted">{c.phone.slice(-4)}</span>}
          </label>
        ))}
        {visible.length === 0 && <span className="muted">No members match.</span>}
      </div>
    </div>
  );
}
