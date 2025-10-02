import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

export interface PublishedPoem {
  id: string;
  created_at: string;
  name: string;
  title: string;
  poem: string;
}

export const publishPoem = async (name: string, title: string, poem: string) => {
  const { data, error } = await supabase
    .from('poems')
    .insert([{ name, title, poem }])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to publish poem: ${error.message}`);
  }

  return data as PublishedPoem;
};

export const fetchPublishedPoems = async (limit = 50): Promise<PublishedPoem[]> => {
  const { data, error } = await supabase
    .from('poems')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch poems: ${error.message}`);
  }

  return data || [];
};

