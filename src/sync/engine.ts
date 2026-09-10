import { supabase } from '../lib/supabase';
import { useSyncStatus } from '../store/syncStatusStore';
import { useTodoStore } from '../store/todoStore';
import { createSupabaseRemote } from './supabaseRemote';
import { createSyncEngine } from './syncEngine';

export const syncEngine = createSyncEngine(createSupabaseRemote(supabase), useTodoStore, useSyncStatus);
