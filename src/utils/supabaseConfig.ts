// src/utils/supabaseConfig.ts
import dotenv from 'dotenv';
import { captureException } from './sentry';

// Ensure environment variables are loaded
dotenv.config();

// Get Supabase URL and API key
export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Helper function to validate Supabase configuration
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