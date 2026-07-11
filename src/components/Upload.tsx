import { useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useToast } from '../App';

/**
 * Uploads a file to the public "content" storage bucket and hands back its
 * public URL. Used to attach banner images and exercise GIFs without needing
 * external hosting. Admin-only writes are enforced by storage RLS.
 */
export function Upload({
  folder,
  accept,
  label = '⤒ Upload',
  onUploaded,
}: {
  folder: string;
  accept: string;
  label?: string;
  onUploaded: (url: string) => void;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // 15 MB guard: GIFs and banner art should be well under this; anything
    // bigger is almost certainly a mistake (an unoptimised video, etc.).
    if (file.size > 15 * 1024 * 1024) {
      toast('File is over 15 MB — please compress it first', 'error');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setBusy(true);
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('content').upload(path, file, {
      cacheControl: '3600',
      contentType: file.type || undefined,
      upsert: false,
    });
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
    if (error) {
      toast(error.message, 'error');
      return;
    }
    const { data } = supabase.storage.from('content').getPublicUrl(path);
    onUploaded(data.publicUrl);
    toast('Uploaded');
  }

  return (
    <>
      <button type="button" className="btn ghost small" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? 'Uploading…' : label}
      </button>
      <input ref={inputRef} type="file" accept={accept} style={{ display: 'none' }} onChange={handle} />
    </>
  );
}
