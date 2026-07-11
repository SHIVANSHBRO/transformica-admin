import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in admin/.env');
}

export const supabase = createClient(url, anonKey);

/** Calls the admin-ops edge function with the signed-in admin's JWT. */
export async function adminOp(body: Record<string, unknown>): Promise<{ error?: string; [k: string]: unknown }> {
  const { data, error } = await supabase.functions.invoke('admin-ops', { body });
  if (error) {
    // supabase-js wraps non-2xx responses; surface the function's message.
    try {
      const ctx = await (error as { context?: Response }).context?.json();
      return { error: (ctx as { error?: string })?.error ?? error.message };
    } catch {
      return { error: error.message };
    }
  }
  return data ?? {};
}
