// src/services/storageService.ts
// Updated storage service - API layer handles Firebase directly
// Edge Functions handle only database operations

import axios from 'axios';
import { initializeApp, FirebaseApp } from 'firebase/app';
import { 
  getStorage, 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  listAll, 
  deleteObject,
  StorageReference,
  FirebaseStorage
} from 'firebase/storage';
import { getAuth, signInAnonymously, Auth, User, onAuthStateChanged } from 'firebase/auth';
import { v4 as uuidv4 } from 'uuid';
import { captureException } from '../utils/sentry';

// Import storage types
import { 
  StorageCategory, 
  StorageStats, 
  CategoryStats, 
  StorageFile,
  PaginatedFilesResponse 
} from '../types/storage';

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

// Log configuration status at startup
console.log("=== Storage Service Configuration ===");
console.log("Firebase configured:", !!firebaseConfig.apiKey && !!firebaseConfig.projectId);
console.log("Environment:", process.env.NODE_ENV);

// Default storage quota in MB
const DEFAULT_STORAGE_QUOTA = 40;

// Default storage categories
const STORAGE_CATEGORIES: StorageCategory[] = [
  {
    id: 'contact_photos',
    name: 'Contact Photos',
    description: 'Profile pictures and images of contacts',
    icon: 'UserCircle',
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif'],
    path: 'contacts/photos'
  },
  {
    id: 'contract_media',
    name: 'Contract Media',
    description: 'Media files related to contracts',
    icon: 'FileContract',
    allowedTypes: [
      'image/jpeg', 
      'image/png', 
      'application/pdf', 
      'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    path: 'contracts/media'
  },
  {
    id: 'service_images',
    name: 'Service Images',
    description: 'Images for services and products',
    icon: 'Image',
    allowedTypes: ['image/jpeg', 'image/png', 'image/svg+xml'],
    path: 'services/images'
  },
  {
    id: 'documents',
    name: 'Documents',
    description: 'General document storage',
    icon: 'File',
    allowedTypes: [
      'application/pdf', 
      'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
      'text/plain'
    ],
    path: 'documents'
  }
];

// Firebase instances
let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let firebaseStorage: FirebaseStorage | null = null;
let authInitializationPromise: Promise<User> | null = null;

// Initialize Firebase with better error handling
const initializeFirebase = async (): Promise<{ app: FirebaseApp; auth: Auth; storage: FirebaseStorage; user: User }> => {
  if (authInitializationPromise && firebaseApp && firebaseAuth && firebaseStorage) {
    const user = await authInitializationPromise;
    return { app: firebaseApp, auth: firebaseAuth, storage: firebaseStorage, user };
  }

  try {
    if (!firebaseApp) {
      firebaseApp = initializeApp(firebaseConfig);
      console.log("✓ Firebase app initialized");
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
          
          const userCredential = await signInAnonymously(firebaseAuth!);
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

// Helper: Get Supabase API URL
const getSupabaseApiUrl = () => {
  return process.env.SUPABASE_URL || '';
};

// Service implementation
export const storageService = {
  /**
   * Get storage categories
   */
  getStorageCategories(): StorageCategory[] {
    return STORAGE_CATEGORIES;
  },

  /**
   * Check if file type is allowed for category
   */
  isFileTypeAllowed(fileType: string, categoryId: string): boolean {
    const category = STORAGE_CATEGORIES.find(cat => cat.id === categoryId);
    return category ? category.allowedTypes.includes(fileType) : false;
  },

  /**
   * Get storage statistics - Uses Edge Function for DB operations
   */
  async getStorageStats(authToken: string, tenantId: string): Promise<StorageStats> {
    try {
      const response = await axios.get(
        `${getSupabaseApiUrl()}/functions/v1/tenant-storage/stats`,
        {
          headers: {
            'Authorization': authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return response.data;
    } catch (error: any) {
      console.error('Error in getStorageStats:', error);
      
      if (error.response?.data?.storageSetupComplete === false) {
        return {
          storageSetupComplete: false,
          quota: 0,
          used: 0,
          available: 0,
          usagePercentage: 0,
          totalFiles: 0,
          categories: []
        };
      }
      
      captureException(error, {
        tags: { source: 'storage_service', action: 'getStorageStats' },
        tenantId
      });
      
      throw error;
    }
  },

  /**
   * Check if storage is set up for a tenant
   */
  async isStorageSetupComplete(authToken: string, tenantId: string): Promise<boolean> {
    try {
      const stats = await this.getStorageStats(authToken, tenantId);
      return stats.storageSetupComplete === true;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return false;
      }
      console.error('Error checking storage setup status:', error);
      return false;
    }
  },

  /**
   * Setup storage for a tenant - Handles Firebase directly
   */
  async setupStorage(authToken: string, tenantId: string): Promise<StorageStats> {
    try {
      // Check if already setup using edge function
      const existingStats = await this.getStorageStats(authToken, tenantId);
      if (existingStats.storageSetupComplete) {
        return existingStats;
      }
      
      // Initialize Firebase
      const { storage } = await initializeFirebase();
      const storagePath = `tenant_${tenantId.substring(0, 8)}_${Date.now()}`;
      
      console.log("Setting up storage with path:", storagePath);
      
      // Create folder structure in Firebase
      const placeholderContent = new Uint8Array([1]);
      
      // Create root folder
      const rootRef = ref(storage, `${storagePath}/.placeholder`);
      await uploadBytes(rootRef, placeholderContent, { contentType: 'text/plain' });
      console.log('✓ Root folder created');
      
      // Create category folders
      for (const category of STORAGE_CATEGORIES) {
        const categoryPath = `${storagePath}/${category.id}/.placeholder`;
        const categoryRef = ref(storage, categoryPath);
        await uploadBytes(categoryRef, placeholderContent, { contentType: 'text/plain' });
        console.log(`✓ Category folder created: ${category.id}`);
      }
      
      // Call Edge Function to update database
      const edgeResponse = await axios.post(
        `${getSupabaseApiUrl()}/functions/v1/tenant-storage/setup-complete`,
        { storagePath },
        {
          headers: {
            'Authorization': authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!edgeResponse.data.success) {
        throw new Error('Failed to complete storage setup');
      }
      
      // Return fresh stats
      return await this.getStorageStats(authToken, tenantId);
    } catch (error: any) {
      console.error('Error in setupStorage:', error);
      
      captureException(error, {
        tags: { source: 'storage_service', action: 'setupStorage' },
        tenantId
      });
      
      throw error;
    }
  },

  /**
   * List files for a tenant - Uses Edge Function for DB operations
   */
  async listFiles(
    authToken: string, 
    tenantId: string, 
    category?: string,
    page: number = 1,
    pageSize: number = 50
  ): Promise<StorageFile[] | PaginatedFilesResponse> {
    try {
      const params = new URLSearchParams();
      if (category) params.append('category', category);
      params.append('page', page.toString());
      params.append('pageSize', pageSize.toString());

      const response = await axios.get(
        `${getSupabaseApiUrl()}/functions/v1/tenant-storage/files?${params}`,
        {
          headers: {
            'Authorization': authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Error in listFiles:', error);
      
      // Return empty array for storage not setup
      if (error.response?.status === 400 && 
          error.response?.data?.error?.code === 'STORAGE_NOT_SETUP') {
        return [];
      }
      
      return [];
    }
  },

  /**
   * Upload a file - Handles Firebase directly, then updates DB via Edge Function
   */
  async uploadFile(
    authToken: string,
    tenantId: string,
    fileBuffer: Buffer,
    fileName: string,
    fileSize: number,
    fileType: string,
    category: string,
    metadata?: any
  ): Promise<StorageFile> {
    try {
      // Get tenant storage path first
      const stats = await this.getStorageStats(authToken, tenantId);
      if (!stats.storageSetupComplete) {
        throw new Error('Storage not setup for this tenant');
      }
      
      // Get storage path from tenant data
      const tenantResponse = await axios.get(
        `${getSupabaseApiUrl()}/rest/v1/t_tenants?id=eq.${tenantId}&select=storage_path`,
        {
          headers: {
            'Authorization': authToken,
            'apikey': process.env.SUPABASE_KEY as string,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const storagePath = tenantResponse.data[0]?.storage_path;
      if (!storagePath) {
        throw new Error('Storage path not found for tenant');
      }
      
      // Initialize Firebase and upload file
      const { storage } = await initializeFirebase();
      const fileId = uuidv4();
      const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `${storagePath}/${category}/${fileId}_${sanitizedFileName}`;
      
      const storageRef = ref(storage, filePath);
      await uploadBytes(storageRef, fileBuffer, { 
        contentType: fileType,
        customMetadata: metadata 
      });
      
      const downloadURL = await getDownloadURL(storageRef);
      
      // Call Edge Function to save file record
      const response = await axios.post(
        `${getSupabaseApiUrl()}/functions/v1/tenant-storage/files`,
        {
          file_name: fileName,
          file_path: filePath,
          file_size: fileSize,
          file_type: fileType.split('/')[1] || 'unknown',
          file_category: category,
          mime_type: fileType,
          download_url: downloadURL,
          metadata: metadata
        },
        {
          headers: {
            'Authorization': authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Error in uploadFile:', error);
      
      captureException(error, {
        tags: { source: 'storage_service', action: 'uploadFile' },
        tenantId,
        fileName,
        fileSize
      });
      
      throw error;
    }
  },

  /**
   * Upload multiple files
   */
  async uploadMultipleFiles(
    authToken: string,
    tenantId: string,
    files: Array<{
      buffer: Buffer;
      fileName: string;
      fileSize: number;
      fileType: string;
      category: string;
      metadata?: any;
    }>,
    onProgress?: (completed: number, total: number) => void
  ): Promise<Array<{ file?: StorageFile; error?: string; fileName: string }>> {
    const results: Array<{ file?: StorageFile; error?: string; fileName: string }> = [];
    
    for (let i = 0; i < files.length; i++) {
      const fileData = files[i];
      
      try {
        const uploadedFile = await this.uploadFile(
          authToken,
          tenantId,
          fileData.buffer,
          fileData.fileName,
          fileData.fileSize,
          fileData.fileType,
          fileData.category,
          fileData.metadata
        );
        
        results.push({ file: uploadedFile, fileName: fileData.fileName });
      } catch (error: any) {
        results.push({ 
          error: error.response?.data?.error?.message || error.message || 'Upload failed',
          fileName: fileData.fileName 
        });
      }
      
      if (onProgress) {
        onProgress(i + 1, files.length);
      }
    }
    
    return results;
  },

  /**
   * Delete a file - Handles Firebase directly, then updates DB via Edge Function
   */
  async deleteFile(
    authToken: string,
    tenantId: string,
    fileId: string
  ): Promise<{ success: boolean, message: string }> {
    try {
      // Get file details first
      const result = await this.listFiles(authToken, tenantId);
      
      let files: StorageFile[];
      if (Array.isArray(result)) {
        files = result;
      } else {
        files = result.files;
      }
      
      const file = files.find(f => f.id === fileId);
      
      if (!file) {
        throw new Error('File not found');
      }
      
      // Delete from Firebase
      const { storage } = await initializeFirebase();
      const storageRef = ref(storage, file.file_path);
      await deleteObject(storageRef);
      
      // Delete from database via Edge Function
      const response = await axios.delete(
        `${getSupabaseApiUrl()}/functions/v1/tenant-storage/files/${fileId}`,
        {
          headers: {
            'Authorization': authToken,
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('Error in deleteFile:', error);
      
      captureException(error, {
        tags: { source: 'storage_service', action: 'deleteFile' },
        tenantId,
        fileId
      });
      
      throw error;
    }
  },

  /**
   * Delete multiple files
   */
  async deleteMultipleFiles(
    authToken: string,
    tenantId: string,
    fileIds: string[]
  ): Promise<Array<{ success: boolean; fileId: string; error?: string }>> {
    const results: Array<{ success: boolean; fileId: string; error?: string }> = [];
    
    for (const fileId of fileIds) {
      try {
        await this.deleteFile(authToken, tenantId, fileId);
        results.push({ success: true, fileId });
      } catch (error: any) {
        results.push({ 
          success: false, 
          fileId,
          error: error.response?.data?.error?.message || error.message || 'Delete failed'
        });
      }
    }
    
    return results;
  },

  /**
   * Verify file ownership
   */
  async verifyFileOwnership(
    authToken: string,
    tenantId: string,
    fileId: string
  ): Promise<boolean> {
    try {
      const result = await this.listFiles(authToken, tenantId);
      
      let files: StorageFile[];
      if (Array.isArray(result)) {
        files = result;
      } else {
        files = result.files;
      }
      
      return files.some(file => file.id === fileId);
    } catch (error) {
      console.error('Error in verifyFileOwnership:', error);
      return false;
    }
  },

  // Diagnostic methods remain the same as they already handle Firebase directly
  async getTenantStorageStructure(
    authToken: string,
    tenantId: string
  ): Promise<any> {
    try {
      // Get tenant information
      const tenantResponse = await axios.get(
        `${getSupabaseApiUrl()}/rest/v1/t_tenants?id=eq.${tenantId}&select=id,name,storage_path,storage_quota,storage_consumed,storage_setup_complete`,
        {
          headers: {
            'Authorization': authToken,
            'apikey': process.env.SUPABASE_KEY as string,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!tenantResponse.data || tenantResponse.data.length === 0) {
        throw new Error('Tenant not found');
      }

      const tenant = tenantResponse.data[0];
      
      // Get files by category
      const filesResponse = await axios.get(
        `${getSupabaseApiUrl()}/rest/v1/t_tenant_files?tenant_id=eq.${tenantId}&select=*`,
        {
          headers: {
            'Authorization': authToken,
            'apikey': process.env.SUPABASE_KEY as string,
            'Content-Type': 'application/json'
          }
        }
      );

      const files = filesResponse.data || [];
      
      // Group files by category
      const filesByCategory: Record<string, any[]> = {};
      files.forEach((file: any) => {
        if (!filesByCategory[file.file_category]) {
          filesByCategory[file.file_category] = [];
        }
        filesByCategory[file.file_category].push(file);
      });
      
      // Format categories
      const categories = Object.keys(filesByCategory).map(categoryId => {
        const categoryFiles = filesByCategory[categoryId];
        const totalSize = categoryFiles.reduce((sum, file) => sum + file.file_size, 0);
        
        return {
          id: categoryId,
          name: STORAGE_CATEGORIES.find(cat => cat.id === categoryId)?.name || categoryId,
          filesCount: categoryFiles.length,
          totalSize: totalSize,
          files: categoryFiles
        };
      });
      
      return {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          storagePath: tenant.storage_path,
          storageQuota: tenant.storage_quota,
          storageConsumed: tenant.storage_consumed,
          storageSetupComplete: tenant.storage_setup_complete
        },
        categories,
        totalFiles: files.length,
        totalSize: files.reduce((sum: number, file: any) => sum + file.file_size, 0)
      };
    } catch (error) {
      console.error('Error in getTenantStorageStructure:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'storage_service', action: 'getTenantStorageStructure' },
        tenantId
      });
      throw error;
    }
  },

  async listDiagnosticFiles(
    authToken: string,
    tenantId: string,
    path?: string
  ): Promise<any[]> {
    try {
      // Initialize Firebase
      const { storage } = await initializeFirebase();

      // Get tenant storage path
      const tenantResponse = await axios.get(
        `${getSupabaseApiUrl()}/rest/v1/t_tenants?id=eq.${tenantId}&select=storage_path`,
        {
          headers: {
            'Authorization': authToken,
            'apikey': process.env.SUPABASE_KEY as string,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!tenantResponse.data || tenantResponse.data.length === 0 || !tenantResponse.data[0].storage_path) {
        throw new Error('Tenant not found or storage not set up');
      }

      const storagePath = tenantResponse.data[0].storage_path;
      
      // Define the reference path
      const refPath = path ? `${storagePath}/${path}` : storagePath;
      const storageRef = ref(storage, refPath);
      
      // List all objects in the reference
      const listResult = await listAll(storageRef);
      
      // Format the results
      const items = await Promise.all([
        // Process files
        ...listResult.items.map(async (item) => {
          const url = await getDownloadURL(item);
          return {
            name: item.name,
            fullPath: item.fullPath,
            type: 'file',
            downloadUrl: url
          };
        }),
        
        // Process directories
        ...listResult.prefixes.map(async (prefix) => {
          return {
            name: prefix.name,
            fullPath: prefix.fullPath,
            type: 'directory'
          };
        })
      ]);
      
      return items;
    } catch (error) {
      console.error('Error in listDiagnosticFiles:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'storage_service', action: 'listDiagnosticFiles' },
        tenantId
      });
      throw error;
    }
  },

  async uploadDiagnosticFile(
    authToken: string,
    tenantId: string,
    fileBuffer: Buffer,
    fileName: string,
    fileSize: number,
    fileType: string,
    path: string
  ): Promise<any> {
    try {
      // Initialize Firebase
      const { storage } = await initializeFirebase();
      
      // Get tenant storage path
      const tenantResponse = await axios.get(
        `${getSupabaseApiUrl()}/rest/v1/t_tenants?id=eq.${tenantId}&select=storage_path`,
        {
          headers: {
            'Authorization': authToken,
            'apikey': process.env.SUPABASE_KEY as string,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!tenantResponse.data || tenantResponse.data.length === 0 || !tenantResponse.data[0].storage_path) {
        throw new Error('Tenant not found or storage not set up');
      }

      const storagePath = tenantResponse.data[0].storage_path;
      
      // Create a reference to the file in Firebase Storage
      const filePath = `${storagePath}/${path}/${fileName}`;
      const storageRef = ref(storage, filePath);
      
      // Upload file
      await uploadBytes(storageRef, fileBuffer, { contentType: fileType });
      
      // Get download URL
      const downloadURL = await getDownloadURL(storageRef);
      
      return {
        success: true,
        fileName,
        filePath,
        fileSize,
        fileType,
        downloadUrl: downloadURL
      };
    } catch (error) {
      console.error('Error in uploadDiagnosticFile:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'storage_service', action: 'uploadDiagnosticFile' },
        tenantId
      });
      throw error;
    }
  },

  async deleteDiagnosticFile(
    authToken: string,
    tenantId: string,
    filePath: string
  ): Promise<any> {
    try {
      // Initialize Firebase
      const { storage } = await initializeFirebase();
      
      // Create a reference to the file in Firebase Storage
      const storageRef = ref(storage, filePath);
      
      // Delete file
      await deleteObject(storageRef);
      
      return {
        success: true,
        message: 'File deleted successfully',
        filePath
      };
    } catch (error) {
      console.error('Error in deleteDiagnosticFile:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'storage_service', action: 'deleteDiagnosticFile' },
        tenantId
      });
      throw error;
    }
  }
};

export default storageService;