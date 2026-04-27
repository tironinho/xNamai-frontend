// src/utils/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const url = process.env.REACT_APP_SUPABASE_URL;
const key = process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  // ajuda no diagnóstico em runtime
  // eslint-disable-next-line no-console
  console.error(
    '[supabase] Variáveis ausentes. Verifique .env: REACT_APP_SUPABASE_URL e REACT_APP_SUPABASE_PUBLISHABLE_KEY'
  );
}

const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export default supabase;
