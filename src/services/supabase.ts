import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Faltan las variables de entorno de Supabase.');
}

const configuredSupabaseUrl = supabaseUrl;

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

function getSupabaseHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

export function getSupabaseClientDiagnostics() {
  const host = getSupabaseHost(configuredSupabaseUrl);
  return {
    host: host ?? 'invalid-url',
    projectRef: host?.split('.')[0] ?? 'unknown',
    hasPublishableKey: String(Boolean(supabasePublishableKey)),
    storage: 'AsyncStorage',
    persistSession: 'true',
    autoRefreshToken: 'true',
  };
}

let clientDiagnosticsLogged = false;

export function logSupabaseClientConfig() {
  if (clientDiagnosticsLogged || process.env.NODE_ENV === 'production') return;
  clientDiagnosticsLogged = true;
  console.info('[Supabase] client.config', getSupabaseClientDiagnostics());
}
