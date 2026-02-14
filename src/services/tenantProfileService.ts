// backend/src/services/tenantProfileService.ts
// UPDATED: Logo upload now uses Firebase Storage directly (same pattern as storageService.ts)
// UPDATED: Added idempotency key support for create/update operations
import axios from 'axios';
import { initializeApp, FirebaseApp } from 'firebase/app';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  FirebaseStorage
} from 'firebase/storage';
import { getAuth, signInAnonymously, Auth, User, onAuthStateChanged } from 'firebase/auth';
import { v4 as uuidv4 } from 'uuid';
import { captureException } from '../utils/sentry';
import { SUPABASE_URL } from '../utils/supabaseConfig';

// ============================================================================
// IDEMPOTENCY KEY CACHE
// ============================================================================
interface IdempotencyEntry {
  result: any;
  expiry: number;
  status: 'pending' | 'completed' | 'error';
}

// In-memory cache for idempotency keys (5 minute TTL)
const idempotencyCache = new Map<string, IdempotencyEntry>();
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Cleanup expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of idempotencyCache.entries()) {
    if (now > entry.expiry) {
      idempotencyCache.delete(key);
    }
  }
}, 60000); // Clean every minute

/**
 * Check if an idempotency key has a cached result
 */
function getIdempotencyResult(key: string | undefined): IdempotencyEntry | null {
  if (!key) return null;
  const entry = idempotencyCache.get(key);
  if (entry && Date.now() < entry.expiry) {
    console.log(`Idempotency cache HIT for key: ${key.substring(0, 8)}...`);
    return entry;
  }
  if (entry) {
    idempotencyCache.delete(key);
  }
  return null;
}

/**
 * Store result for an idempotency key
 */
function setIdempotencyResult(key: string | undefined, result: any, status: 'completed' | 'error'): void {
  if (!key) return;
  idempotencyCache.set(key, {
    result,
    expiry: Date.now() + IDEMPOTENCY_TTL_MS,
    status
  });
  console.log(`Idempotency cache SET for key: ${key.substring(0, 8)}... (status: ${status})`);
}

/**
 * Mark an idempotency key as pending (to handle concurrent requests)
 */
function setIdempotencyPending(key: string | undefined): boolean {
  if (!key) return false;
  const existing = idempotencyCache.get(key);
  if (existing && Date.now() < existing.expiry) {
    // Already processing or completed
    return false;
  }
  idempotencyCache.set(key, {
    result: null,
    expiry: Date.now() + IDEMPOTENCY_TTL_MS,
    status: 'pending'
  });
  return true;
}

export interface TenantProfile {
  id: string;
  tenant_id: string;
  business_type_id: string;
  industry_id: string;
  business_name: string;
  logo_url: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state_code: string | null;
  country_code: string | null;
  postal_code: string | null;
  business_phone_country_code: string | null;
  business_phone: string | null;
  business_email: string | null;
  website_url: string | null;
  // WhatsApp fields for BBB integration
  business_whatsapp_country_code: string | null;
  business_whatsapp: string | null;
  // Contact person and booking fields
  booking_url: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenantProfileCreate extends Omit<TenantProfile, 'id' | 'created_at' | 'updated_at'> {}

// Served Industries response types (matching edge function responses)
export interface ServedIndustriesEdgeResponse {
  success: boolean;
  data: any[];
  added_count?: number;
  removed_industry_id?: string;
}

export interface UnlockPreviewEdgeResponse {
  success: boolean;
  data: {
    total_templates: number;
    by_industry: any[];
    by_resource_type: any[];
  };
}

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

// Firebase instances (shared with storageService pattern)
let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let firebaseStorage: FirebaseStorage | null = null;
let authInitializationPromise: Promise<User> | null = null;

// Initialize Firebase with better error handling (same pattern as storageService.ts)
const initializeFirebase = async (): Promise<{ app: FirebaseApp; auth: Auth; storage: FirebaseStorage; user: User }> => {
  if (authInitializationPromise && firebaseApp && firebaseAuth && firebaseStorage) {
    const user = await authInitializationPromise;
    return { app: firebaseApp, auth: firebaseAuth, storage: firebaseStorage, user };
  }

  try {
    if (!firebaseApp) {
      firebaseApp = initializeApp(firebaseConfig, 'tenant-profile-service');
      console.log("✓ Firebase app initialized for tenant-profile");
    }

    if (!firebaseAuth) {
      firebaseAuth = getAuth(firebaseApp);
      console.log("✓ Firebase Auth initialized");
    }

    if (!firebaseStorage) {
      firebaseStorage = getStorage(firebaseApp);
      console.log("✓ Firebase Storage initialized");
    }

    if (!authInitializationPromise) {
      authInitializationPromise = new Promise<User>(async (resolve, reject) => {
        try {
          const unsubscribe = onAuthStateChanged(firebaseAuth!, (user) => {
            if (user) {
              unsubscribe();
              resolve(user);
            }
          });

          await signInAnonymously(firebaseAuth!);
          console.log("✓ Firebase authenticated");

        } catch (authError: any) {
          console.error("Firebase authentication error:", authError);
          reject(authError);
        }
      });
    }

    const user = await authInitializationPromise;
    return { app: firebaseApp, auth: firebaseAuth, storage: firebaseStorage, user };
  } catch (error: any) {
    console.error('Firebase initialization failed:', error);
    authInitializationPromise = null;
    throw error;
  }
};

// Service implementation
export const tenantProfileService = {
  /**
   * Get tenant profile for a specific tenant
   */
  async getTenantProfile(authToken: string, tenantId: string): Promise<TenantProfile | null> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.get(
        `${SUPABASE_URL}/functions/v1/tenant-profile`,
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error in getTenantProfile service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_tenant_profile', action: 'getTenantProfile' },
        tenantId
      });
      throw error;
    }
  },

  /**
   * Create a new tenant profile (with idempotency support)
   * @param idempotencyKey - Optional key to prevent duplicate requests
   */
  async createTenantProfile(
    authToken: string,
    tenantId: string,
    profileData: TenantProfileCreate,
    idempotencyKey?: string
  ): Promise<TenantProfile> {
    // Check idempotency cache first
    const cached = getIdempotencyResult(idempotencyKey);
    if (cached) {
      if (cached.status === 'completed') {
        console.log('Returning cached result for createTenantProfile');
        return cached.result;
      }
      if (cached.status === 'pending') {
        throw new Error('Request is already being processed');
      }
      if (cached.status === 'error') {
        throw cached.result;
      }
    }

    // Mark as pending to prevent concurrent duplicate requests
    if (idempotencyKey && !setIdempotencyPending(idempotencyKey)) {
      throw new Error('Duplicate request detected - already processing');
    }

    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      // Basic validation of inputs
      if (!profileData.business_name) {
        throw new Error('business_name is required');
      }

      const response = await axios.post(
        `${SUPABASE_URL}/functions/v1/tenant-profile`,
        profileData,
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          }
        }
      );

      // Cache successful result
      setIdempotencyResult(idempotencyKey, response.data, 'completed');
      return response.data;
    } catch (error) {
      console.error('Error in createTenantProfile service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_tenant_profile', action: 'createTenantProfile' },
        tenantId
      });
      // Cache error result
      setIdempotencyResult(idempotencyKey, error, 'error');
      throw error;
    }
  },

  /**
   * Update an existing tenant profile (with idempotency support)
   * @param idempotencyKey - Optional key to prevent duplicate requests
   */
  async updateTenantProfile(
    authToken: string,
    tenantId: string,
    profileData: Partial<TenantProfileCreate> & { tenant_id: string; updated_at?: string },
    idempotencyKey?: string
  ): Promise<TenantProfile> {
    // Check idempotency cache first
    const cached = getIdempotencyResult(idempotencyKey);
    if (cached) {
      if (cached.status === 'completed') {
        console.log('Returning cached result for updateTenantProfile');
        return cached.result;
      }
      if (cached.status === 'pending') {
        throw new Error('Request is already being processed');
      }
      if (cached.status === 'error') {
        throw cached.result;
      }
    }

    // Mark as pending to prevent concurrent duplicate requests
    if (idempotencyKey && !setIdempotencyPending(idempotencyKey)) {
      throw new Error('Duplicate request detected - already processing');
    }

    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      if (!profileData.business_name) {
        throw new Error('business_name is required');
      }

      const response = await axios.put(
        `${SUPABASE_URL}/functions/v1/tenant-profile`,
        profileData,
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          }
        }
      );

      // Cache successful result
      setIdempotencyResult(idempotencyKey, response.data, 'completed');
      return response.data;
    } catch (error: any) {
      console.error('Error in updateTenantProfile service:', error);

      // Handle optimistic lock conflict (409) - don't cache as error
      if (error.response?.status === 409) {
        const conflictError = new Error('Profile was modified by another session');
        (conflictError as any).status = 409;
        (conflictError as any).response = error.response;
        throw conflictError;
      }

      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_tenant_profile', action: 'updateTenantProfile' },
        tenantId
      });
      // Cache error result (except for conflicts)
      setIdempotencyResult(idempotencyKey, error, 'error');
      throw error;
    }
  },

  /**
   * Upload a logo for the tenant profile
   * ✅ FIXED: Now uploads directly to Firebase Storage (same pattern as storageService.ts)
   */
  async uploadLogo(authToken: string, tenantId: string, file: Express.Multer.File): Promise<string> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      // Validate file
      if (!file || !file.buffer) {
        throw new Error('No file provided');
      }

      // Validate file type
      const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
      if (!allowedTypes.includes(file.mimetype)) {
        throw new Error('Invalid file type. Allowed: PNG, JPG, SVG');
      }

      // Validate file size (5MB max)
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        throw new Error('File size exceeds 5MB limit');
      }

      console.log(`Uploading logo for tenant ${tenantId}, file: ${file.originalname}, size: ${file.size}`);

      // ✅ Initialize Firebase and upload directly
      const { storage } = await initializeFirebase();

      // Generate unique file path
      const fileId = uuidv4();
      const fileExtension = file.originalname.split('.').pop() || 'png';
      const sanitizedFileName = `logo_${fileId}.${fileExtension}`;
      const filePath = `tenant_logos/${tenantId}/${sanitizedFileName}`;

      console.log(`Firebase storage path: ${filePath}`);

      // Create storage reference and upload
      const storageRef = ref(storage, filePath);
      await uploadBytes(storageRef, file.buffer, {
        contentType: file.mimetype,
        customMetadata: {
          tenantId,
          originalName: file.originalname,
          uploadedAt: new Date().toISOString()
        }
      });

      // Get the download URL
      const downloadURL = await getDownloadURL(storageRef);
      console.log(`Logo uploaded successfully: ${downloadURL}`);

      // ✅ Update the profile with the new logo URL via Edge function
      await axios.post(
        `${SUPABASE_URL}/functions/v1/tenant-profile/logo`,
        { logo_url: downloadURL },
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          }
        }
      );

      return downloadURL;
    } catch (error) {
      console.error('Error in uploadLogo service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_tenant_profile', action: 'uploadLogo' },
        tenantId
      });
      throw error;
    }
  },

  // =========================================================================
  // SERVED INDUSTRIES METHODS
  // =========================================================================

  /**
   * Get all industries this tenant serves
   */
  async getServedIndustries(authToken: string, tenantId: string): Promise<ServedIndustriesEdgeResponse> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.get(
        `${SUPABASE_URL}/functions/v1/tenant-profile/served-industries`,
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error in getServedIndustries service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_tenant_profile', action: 'getServedIndustries' },
        tenantId
      });
      throw error;
    }
  },

  /**
   * Add one or more served industries for this tenant
   */
  async addServedIndustries(
    authToken: string,
    tenantId: string,
    industryIds: string[]
  ): Promise<ServedIndustriesEdgeResponse> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.post(
        `${SUPABASE_URL}/functions/v1/tenant-profile/served-industries`,
        { industry_ids: industryIds },
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error in addServedIndustries service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_tenant_profile', action: 'addServedIndustries' },
        tenantId
      });
      throw error;
    }
  },

  /**
   * Remove a served industry for this tenant
   */
  async removeServedIndustry(
    authToken: string,
    tenantId: string,
    industryId: string
  ): Promise<ServedIndustriesEdgeResponse> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.delete(
        `${SUPABASE_URL}/functions/v1/tenant-profile/served-industries?industry_id=${encodeURIComponent(industryId)}`,
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error in removeServedIndustry service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_tenant_profile', action: 'removeServedIndustry' },
        tenantId
      });
      throw error;
    }
  },

  /**
   * Get unlock preview - template counts by served industries
   */
  async getUnlockPreview(authToken: string, tenantId: string): Promise<UnlockPreviewEdgeResponse> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.get(
        `${SUPABASE_URL}/functions/v1/tenant-profile/served-industries/unlock-preview`,
        {
          headers: {
            Authorization: authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error in getUnlockPreview service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_tenant_profile', action: 'getUnlockPreview' },
        tenantId
      });
      throw error;
    }
  }
};
