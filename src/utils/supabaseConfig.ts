// src/utils/supabaseConfig.ts
import * as dotenv from 'dotenv';  // ← Only change this line
import { captureException } from './sentry';

// Everything else stays EXACTLY the same
dotenv.config();  // ← This works with the * as import

export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_KEY = process.env.SUPABASE_KEY;

export const validateSupabaseConfig = (source: string, endpoint: string) => {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    captureException(new Error('Missing Supabase configuration'), {
      tags: { source },
      endpoint,
      missing: !SUPABASE_URL ? 'SUPABASE_URL' : 'SUPABASE_KEY'
    });
    return false;
  }
  return true;
};