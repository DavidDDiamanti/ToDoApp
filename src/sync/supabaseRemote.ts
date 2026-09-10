import type { SupabaseClient } from '@supabase/supabase-js';
import type { Todo } from '../types';
import type { TodoRemote } from './syncEngine';

export function createSupabaseRemote(client: SupabaseClient): TodoRemote {
  return {
    async upsert(rows) {
      const { error } = await client.from('todos').upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(error.message);
    },
    async fetchSince(sinceISO) {
      const { data, error } = await client.from('todos').select('*').gt('updated_at', sinceISO).order('updated_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as Todo[];
    },
    subscribe(userId, onRow, onStatus) {
      const channel = client
        .channel(`todos:${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'todos', filter: `user_id=eq.${userId}` }, (payload) => {
          const row = (payload.new ?? null) as Todo | null;
          if (row && typeof row.id === 'string') onRow(row);
        })
        .subscribe((status) => onStatus(status));
      return () => {
        void client.removeChannel(channel);
      };
    },
  };
}
