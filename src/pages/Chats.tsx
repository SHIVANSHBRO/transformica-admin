import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { Profile, displayName } from '../types';

// Read-only oversight of every coach↔client conversation. Admin read access
// comes from the coach_messages_select_admin RLS policy (migration 0040) —
// no service key involved, the panel reads with the admin's own session.

type ChatMessage = {
  id: string;
  coach_id: string;
  client_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

type Thread = {
  key: string; // `${coach_id}:${client_id}`
  coachId: string;
  clientId: string;
  lastMessage: ChatMessage;
  count: number;
};

// Grouping window — enough to surface every active thread without paging.
const SCAN_LIMIT = 2000;
const THREAD_LIMIT = 500;

export function Chats() {
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [openThread, setOpenThread] = useState<Thread | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [profileRes, messageRes] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase
        .from('coach_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(SCAN_LIMIT),
    ]);
    if (profileRes.error || messageRes.error) {
      setError((profileRes.error ?? messageRes.error)!.message);
      setLoading(false);
      return;
    }
    setProfiles(new Map(((profileRes.data as Profile[]) ?? []).map((p) => [p.id, p])));

    const grouped = new Map<string, Thread>();
    for (const m of (messageRes.data as ChatMessage[]) ?? []) {
      const key = `${m.coach_id}:${m.client_id}`;
      const t = grouped.get(key);
      if (t) t.count += 1; // rows arrive newest-first, so the first one seen is lastMessage
      else grouped.set(key, { key, coachId: m.coach_id, clientId: m.client_id, lastMessage: m, count: 1 });
    }
    setThreads([...grouped.values()]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const nameOf = useCallback(
    (id: string) => {
      const p = profiles.get(id);
      return p ? displayName(p) : 'Deleted user';
    },
    [profiles]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter(
      (t) =>
        nameOf(t.coachId).toLowerCase().includes(q) ||
        nameOf(t.clientId).toLowerCase().includes(q) ||
        t.lastMessage.body.toLowerCase().includes(q)
    );
  }, [threads, query, nameOf]);

  return (
    <>
      <div className="card">
        <div className="row">
          <h2 style={{ margin: 0 }}>Coach ↔ client chats</h2>
          <span className="muted">{threads.length} conversation{threads.length === 1 ? '' : 's'}</span>
          <div className="spacer" />
          <input
            className="inline"
            placeholder="Search by name or message…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ minWidth: 240 }}
          />
          <button className="btn ghost small" onClick={load}>Refresh</button>
        </div>
        <p className="muted" style={{ margin: '8px 0 0' }}>
          Read-only oversight of all coaching conversations, for quality and safety review.
        </p>
      </div>

      {error && <div className="card"><div className="error-box">{error}</div></div>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Coach</th>
              <th>Client</th>
              <th>Last message</th>
              <th>When</th>
              <th>Msgs</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="muted">Loading conversations…</td></tr>
            )}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  {threads.length === 0
                    ? 'No messages yet — threads appear here as soon as a coach and client start chatting.'
                    : 'No conversations match your search.'}
                </td>
              </tr>
            )}
            {!loading &&
              visible.map((t) => (
                <tr key={t.key}>
                  <td><strong>{nameOf(t.coachId)}</strong></td>
                  <td>{nameOf(t.clientId)}</td>
                  <td className="chat-preview">
                    <span className="muted">
                      {t.lastMessage.sender_id === t.coachId ? 'Coach: ' : 'Client: '}
                    </span>
                    {t.lastMessage.body}
                  </td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{timeAgo(t.lastMessage.created_at)}</td>
                  <td><span className="badge dim">{t.count >= SCAN_LIMIT ? `${SCAN_LIMIT}+` : t.count}</span></td>
                  <td><button className="btn small" onClick={() => setOpenThread(t)}>View</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {openThread && (
        <ThreadModal
          thread={openThread}
          coachName={nameOf(openThread.coachId)}
          clientName={nameOf(openThread.clientId)}
          onClose={() => setOpenThread(null)}
        />
      )}
    </>
  );
}

function ThreadModal({
  thread,
  coachName,
  clientName,
  onClose,
}: {
  thread: Thread;
  coachName: string;
  clientName: string;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase
      .from('coach_messages')
      .select('*')
      .eq('coach_id', thread.coachId)
      .eq('client_id', thread.clientId)
      .order('created_at', { ascending: false })
      .limit(THREAD_LIMIT)
      .then(
        ({ data, error: err }) => {
          if (err) setError(err.message);
          else setMessages(((data as ChatMessage[]) ?? []).slice().reverse());
        },
        (e: unknown) => setError(e instanceof Error ? e.message : String(e))
      );
  }, [thread]);

  useEffect(() => {
    // Open at the latest message, like a chat app.
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal chat-modal" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 style={{ margin: 0 }}>
            {coachName} <span className="muted">↔</span> {clientName}
          </h2>
          <div className="spacer" />
          <button className="btn ghost small" onClick={onClose}>Close</button>
        </div>
        <p className="muted" style={{ margin: '4px 0 10px' }}>
          Read-only · showing the latest {THREAD_LIMIT} messages
        </p>

        {error && <div className="error-box">{error}</div>}
        {!error && messages === null && <div className="muted">Loading thread…</div>}

        {messages && (
          <div className="chat-scroll" ref={scrollRef}>
            {messages.map((m) => {
              const fromCoach = m.sender_id === thread.coachId;
              return (
                <div key={m.id} className={`chat-bubble-row${fromCoach ? ' coach' : ''}`}>
                  <div className={`chat-bubble${fromCoach ? ' coach' : ''}`}>
                    <div className="chat-meta">
                      {fromCoach ? coachName : clientName} · {new Date(m.created_at).toLocaleString()}
                      {m.read_at ? ' · read' : ''}
                    </div>
                    {m.body}
                  </div>
                </div>
              );
            })}
            {messages.length === 0 && <div className="muted">No messages in this thread.</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
