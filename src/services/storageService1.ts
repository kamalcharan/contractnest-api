// src/services/storageService.ts
import axios from 'axios';
import { initializeApp } from 'firebase/app';
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
import { getAuth, signInAnonymously } from 'firebase/auth';
import { v4 as uuidv4 } from 'uuid';
import { captureException } from '../utils/sentry';

// Import storage types
import { 
  StorageCategory, 
  StorageStats, 
  CategoryStats, 
  StorageFile 
} from '../types/storage';

// Log Firebase configuration (omit sensitive values)
console.log("Firebase configuration check:");
console.log("API Key exists:", !!process.env.VITE_FIREBASE_API_KEY);
console.log("Auth Domain:", process.env.VITE_FIREBASE_AUTH_DOMAIN);
console.log("Project ID:", process.env.VITE_FIREBASE_PROJECT_ID);
console.log("Storage Bucket:", process.env.VITE_FIREBASE_STORAGE_BUCKET);
console.log("Messaging Sender ID exists:", !!process.env.VITE_FIREBASE_MESSAGING_SENDER_ID);
console.log("App ID exists:", !!process.env.VITE_FIREBASE_APP_ID);

// Get Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

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

// Initialize Firebase app
let firebaseApp;
let firebaseStorage: FirebaseStorage;

try {
  console.log("=== Firebase Configuration Debug ===");
  console.log("API Key exists:", !!process.env.VITE_FIREBASE_API_KEY);
  console.log("Auth Domain:", process.env.VITE_FIREBASE_AUTH_DOMAIN);
  console.log("Project ID:", process.env.VITE_FIREBASE_PROJECT_ID);
  console.log("Storage Bucket:", process.env.VITE_FIREBASE_STORAGE_BUCKET);
  console.log("App ID exists:", !!process.env.VITE_FIREBASE_APP_ID);

  firebaseApp = initializeApp(firebaseConfig);
  firebaseStorage = getStorage(firebaseApp);
  console.log('Firebase initialized successfully in storageService');
  
  // Initialize Firebase Authentication and sign in anonymously
  await const auth = getAuth(firebaseApp);
  signInAnonymously(auth)
    .then(() => {
      console.log('Firebase anonymous auth successful');
    })
    .catch((error) => {
      console.error('Firebase anonymous auth failed:', error);
    });
} catch (error) {
  console.error('Failed to initialize Firebase:', error);
  captureException(error instanceof Error ? error : new Error(String(error)), {
    tags: { source: 'storage_service', error_type: 'firebase_init_error' }
  });
}

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
 * Get storage statistics for a tenant
 */
async getStorageStats(authToken: string, tenantId: string): Promise<StorageStats> {
  try {
    // Get tenant information from Supabase
    const tenantResponse = await axios.get(
      `${getSupabaseApiUrl()}/rest/v1/t_tenants?id=eq.${tenantId}&select=storage_path,storage_quota,storage_consumed,storage_setup_complete`,
      {
        headers: {
          'Authorization': authToken,
          'apikey': process.env.SUPABASE_KEY as string,
          'Content-Type': 'application/json'
        }
      }
    );

    // Check if tenant exists and has storage setup
    if (!tenantResponse.data || tenantResponse.data.length === 0) {
      throw new Error('Tenant not found');
    }

    const tenant = tenantResponse.data[0];
    
    // If storage is not set up, return appropriate response
    if (!tenant.storage_setup_complete) {
      throw { status: 404, message: 'Storage not set up for this tenant' };
    }

    // Get files grouped by category
    const fileStatsResponse = await axios.get(
      `${getSupabaseApiUrl()}/rest/v1/t_tenant_files?tenant_id=eq.${tenantId}&select=file_category`,
      {
        headers: {
          'Authorization': authToken,
          'apikey': process.env.SUPABASE_KEY as string,
          'Content-Type': 'application/json'
        }
      }
    );

    const files = fileStatsResponse.data || [];
    
    // Count files by category manually instead of using PostgREST aggregation
    const categoryCountMap: Record<string, number> = {};
    files.forEach((file: any) => {
      if (file.file_category) {
        categoryCountMap[file.file_category] = (categoryCountMap[file.file_category] || 0) + 1;
      }
    });
    
    // Format file stats by category
    const fileCategories = STORAGE_CATEGORIES.map(category => {
      return {
        id: category.id,
        name: category.name,
        count: categoryCountMap[category.id] || 0
      };
    });

    // Total files is just the length of the files array
    const totalFiles = files.length;

    // Calculate storage metrics
    const quotaBytes = tenant.storage_quota * 1024 * 1024; // Convert MB to bytes
    const usedBytes = tenant.storage_consumed;
    const availableBytes = quotaBytes - usedBytes;
    const usagePercentage = Math.round((usedBytes / quotaBytes) * 100);

    return {
      storageSetupComplete: true,
      quota: quotaBytes,
      used: usedBytes,
      available: availableBytes,
      usagePercentage: usagePercentage,
      totalFiles: totalFiles,
      categories: fileCategories
    };
  } catch (error: any) {
    console.error('Error in getStorageStats:', error);
    
    // Handle "storage not set up" error specifically
    if (error.status === 404 && error.message === 'Storage not set up for this tenant') {
      throw error;
    }
    
    // Handle PostgREST syntax errors as if storage is not set up
    // This could happen if tables don't exist yet
    if (error.response?.status === 400 && error.response?.data?.code === 'PGRST100') {
      console.warn('PostgREST syntax error - likely storage tables not set up yet:', error.response.data);
      throw { status: 404, message: 'Storage not set up for this tenant' };
    }
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
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
      const response = await axios.get(
        `${getSupabaseApiUrl()}/rest/v1/t_tenants?id=eq.${tenantId}&select=storage_setup_complete`,
        {
          headers: {
            'Authorization': authToken,
            'apikey': process.env.SUPABASE_KEY as string,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.data || response.data.length === 0) {
        return false;
      }

      return response.data[0].storage_setup_complete === true;
    } catch (error) {
      console.error('Error checking storage setup status:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'storage_service', action: 'isStorageSetupComplete' },
        tenantId
      });
      
      // Do not throw error, just return false to indicate storage is not set up
      return false;
    }
  },

  /**
   * Setup storage for a tenant
   */
  async setupStorage(authToken: string, tenantId: string): Promise<StorageStats> {
    try {
      // Check if Firebase is initialized
      if (!firebaseStorage) {
        console.error("Firebase storage not initialized");
        throw new Error('Firebase storage not initialized');
      }

      console.log(`Setting up storage for tenant ${tenantId}`);

      // Get tenant information first
      const tenantResponse = await axios.get(
        `${getSupabaseApiUrl()}/rest/v1/t_tenants?id=eq.${tenantId}&select=storage_setup_complete`,
        {
          headers: {
            'Authorization': authToken,
            'apikey': process.env.SUPABASE_KEY as string,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!tenantResponse.data || tenantResponse.data.length === 0) {
        console.error("Tenant not found");
        throw new Error('Tenant not found');
      }

      const tenant = tenantResponse.data[0];
      
      // Check if storage is already set up
      if (tenant.storage_setup_complete) {
        console.log("Storage already set up for this tenant");
        throw new Error('Storage already set up for this tenant');
      }

      // Generate storage path
      const storagePath = `tenant_${tenantId.substring(0, 8)}_${Date.now()}`;
      console.log(`Generated storage path: ${storagePath}`);
      
      // Test Firebase connectivity by creating a test file with detailed error handling
      console.log("Creating test file in Firebase storage...");
      try {
        const testRef = ref(firebaseStorage, `${storagePath}/.test`);
        await uploadBytes(testRef, new Uint8Array([1, 2, 3]), { contentType: 'text/plain' });
        console.log("Test file created successfully");
      } catch (uploadError: unknown) {
        console.error("Failed to create test file:", uploadError);
        const errorMessage = uploadError instanceof Error 
          ? uploadError.message 
          : 'Unknown error during Firebase test';
        throw new Error(`Firebase storage test failed: ${errorMessage}. Please check your Firebase configuration and authentication.`);
      }
      
      // Update tenant record in Supabase
      console.log("Updating tenant record...");
      try {
        await axios.patch(
          `${getSupabaseApiUrl()}/rest/v1/t_tenants?id=eq.${tenantId}`,
          {
            storage_path: storagePath,
            storage_quota: DEFAULT_STORAGE_QUOTA,
            storage_consumed: 0,
            storage_provider: 'firebase',
            storage_setup_complete: true
          },
          {
            headers: {
              'Authorization': authToken,
              'apikey': process.env.SUPABASE_KEY as string,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            }
          }
        );
        console.log("Tenant record updated successfully");
      } catch (dbError: unknown) {
        console.error("Failed to update tenant record:", dbError);
        const errorMessage = dbError instanceof Error 
          ? dbError.message 
          : 'Unknown database error';
        throw new Error(`Database update failed: ${errorMessage}`);
      }

      console.log("Storage setup completed successfully");
      
      // Return stats format
      return {
        storageSetupComplete: true,
        quota: DEFAULT_STORAGE_QUOTA * 1024 * 1024, // Convert MB to bytes
        used: 0,
        available: DEFAULT_STORAGE_QUOTA * 1024 * 1024,
        usagePercentage: 0,
        totalFiles: 0,
        categories: STORAGE_CATEGORIES.map(category => ({
          id: category.id,
          name: category.name,
          count: 0
        }))
      };
    } catch (error) {
      console.error('Error in setupStorage:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'storage_service', action: 'setupStorage' },
        tenantId
      });
      throw error;
    }
  },

  /**
   * List files for a tenant
   */
  async listFiles(
    authToken: string, 
    tenantId: string, 
    category?: string
  ): Promise<StorageFile[]> {
    try {
      // Get tenant information to get storage path
      const tenantResponse = await axios.get(
        `${getSupabaseApiUrl()}/rest/v1/t_tenants?id=eq.${tenantId}&select=storage_path,storage_setup_complete`,
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
      
      // Check if storage is set up
      if (!tenant.storage_setup_complete) {
        return []; // Return empty array instead of error
      }

      // Build query for files in database
      let url = `${getSupabaseApiUrl()}/rest/v1/t_tenant_files?tenant_id=eq.${tenantId}`;
      
      // Add category filter if provided
      if (category) {
        url += `&file_category=eq.${category}`;
      }
      
      // Execute query
      const filesResponse = await axios.get(
        url,
        {
          headers: {
            'Authorization': authToken,
            'apikey': process.env.SUPABASE_KEY as string,
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Return the files (or empty array if no files found)
      return filesResponse.data || [];
    } catch (error) {
      console.error('Error in listFiles:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'storage_service', action: 'listFiles' },
        tenantId
      });
      
      // Return empty array for error cases to prevent UI breakage
      return [];
    }
  },

  /**
   * Upload a file
   */
  async uploadFile(
    authToken: string,
    tenantId: string,
    fileBuffer: Buffer,
    fileName: string,
    fileSize: number,
    fileType: string,
    category: string
  ): Promise<StorageFile> {
    try {
      // Check if Firebase is initialized
      if (!firebaseStorage) {
        throw new Error('Firebase storage not initialized');
      }

      // Validate file category
      const categoryConfig = STORAGE_CATEGORIES.find(c => c.id === category);
      if (!categoryConfig) {
        throw new Error(`Invalid category: ${category}`);
      }
      
      // Validate file type
      if (!categoryConfig.allowedTypes.includes(fileType)) {
        throw new Error(`File type ${fileType} is not allowed for this category`);
      }

      // Get tenant information for storage path
      const tenantResponse = await axios.get(
        `${getSupabaseApiUrl()}/rest/v1/t_tenants?id=eq.${tenantId}&select=storage_path,storage_quota,storage_consumed,storage_setup_complete`,
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
      
      // Check if storage is set up
      if (!tenant.storage_setup_complete) {
        throw new Error('Storage not set up for this tenant');
      }

      // Check if tenant has enough storage
      const availableStorage = tenant.storage_quota * 1024 * 1024 - tenant.storage_consumed;
      if (fileSize > availableStorage) {
        throw new Error('Not enough storage space available');
      }

      // Generate a unique identifier for the file
      const fileId = uuidv4();
      const fileExtension = fileName.split('.').pop() || '';
      const safeFileName = `${fileId}_${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      
      // Create storage path and reference
      const storagePath = tenant.storage_path;
      const filePath = `${storagePath}/${category}/${safeFileName}`;
      const storageRef = ref(firebaseStorage, filePath);
      
      // Upload file to Firebase Storage
      await uploadBytes(storageRef, fileBuffer, { contentType: fileType });
      
      // Get download URL
      const downloadURL = await getDownloadURL(storageRef);
      
      // Insert file record in database
      const newFile = {
        tenant_id: tenantId,
        file_name: fileName,
        file_path: filePath,
        file_size: fileSize,
        file_type: fileType.split('/')[1], // e.g., 'jpeg' from 'image/jpeg'
        file_category: category,
        mime_type: fileType,
        download_url: downloadURL
      };
      
      const fileResponse = await axios.post(
        `${getSupabaseApiUrl()}/rest/v1/t_tenant_files`,
        newFile,
        {
          headers: {
            'Authorization': authToken,
            'apikey': process.env.SUPABASE_KEY as string,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          }
        }
      );
      
      // Update tenant's consumed storage
      await axios.patch(
        `${getSupabaseApiUrl()}/rest/v1/t_tenants?id=eq.${tenantId}`,
        {
          storage_consumed: tenant.storage_consumed + fileSize
        },
        {
          headers: {
            'Authorization': authToken,
            'apikey': process.env.SUPABASE_KEY as string,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return fileResponse.data[0];
    } catch (error) {
      console.error('Error in uploadFile:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'storage_service', action: 'uploadFile' },
        tenantId
      });
      throw error;
    }
  },

  /**
   * Delete a file
   */
  async deleteFile(
    authToken: string,
    tenantId: string,
    fileId: string
  ): Promise<{ success: boolean, message: string }> {
    try {
      // Check if Firebase is initialized
      if (!firebaseStorage) {
        throw new Error('Firebase storage not initialized');
      }

      // Get file details from database
      const fileResponse = await axios.get(
        `${getSupabaseApiUrl()}/rest/v1/t_tenant_files?id=eq.${fileId}&tenant_id=eq.${tenantId}`,
        {
          headers: {
            'Authorization': authToken,
            'apikey': process.env.SUPABASE_KEY as string,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!fileResponse.data || fileResponse.data.length === 0) {
        throw new Error('File not found or you do not have permission to delete it');
      }

      const file = fileResponse.data[0];
      
      // Delete from Firebase Storage
      const storageRef = ref(firebaseStorage, file.file_path);
      await deleteObject(storageRef);
      
      // Delete from database
      await axios.delete(
        `${getSupabaseApiUrl()}/rest/v1/t_tenant_files?id=eq.${fileId}&tenant_id=eq.${tenantId}`,
        {
          headers: {
            'Authorization': authToken,
            'apikey': process.env.SUPABASE_KEY as string,
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Update tenant's consumed storage
      await axios.patch(
        `${getSupabaseApiUrl()}/rest/v1/t_tenants?id=eq.${tenantId}`,
        {
          storage_consumed: `storage_consumed - ${file.file_size}`
        },
        {
          headers: {
            'Authorization': authToken,
            'apikey': process.env.SUPABASE_KEY as string,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          }
        }
      );
      
      return { success: true, message: 'File deleted successfully' };
    } catch (error) {
      console.error('Error in deleteFile:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'storage_service', action: 'deleteFile' },
        tenantId
      });
      throw error;
    }
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
      const fileResponse = await axios.get(
        `${getSupabaseApiUrl()}/rest/v1/t_tenant_files?id=eq.${fileId}&tenant_id=eq.${tenantId}&select=id`,
        {
          headers: {
            'Authorization': authToken,
            'apikey': process.env.SUPABASE_KEY as string,
            'Content-Type': 'application/json'
          }
        }
      );

      return fileResponse.data && fileResponse.data.length > 0;
    } catch (error) {
      console.error('Error in verifyFileOwnership:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'storage_service', action: 'verifyFileOwnership' },
        tenantId
      });
      return false;
    }
  },

  /**
   * Get tenant storage structure for diagnostics
   */
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

  /**
   * List files for diagnostic purposes
   */
  async listDiagnosticFiles(
    authToken: string,
    tenantId: string,
    path?: string
  ): Promise<any[]> {
    try {
      // Check if Firebase is initialized
      if (!firebaseStorage) {
        throw new Error('Firebase storage not initialized');
      }

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
      const storageRef = ref(firebaseStorage, refPath);
      
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

  /**
   * Upload file for diagnostic purposes
   */
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
      // Check if Firebase is initialized
      if (!firebaseStorage) {
        throw new Error('Firebase storage not initialized');
      }
      
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
      const storageRef = ref(firebaseStorage, filePath);
      
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

  /**
   * Delete file for diagnostic purposes
   */
  async deleteDiagnosticFile(
    authToken: string,
    tenantId: string,
    filePath: string
  ): Promise<any> {
    try {
      // Check if Firebase is initialized
      if (!firebaseStorage) {
        throw new Error('Firebase storage not initialized');
      }
      
      // Create a reference to the file in Firebase Storage
      const storageRef = ref(firebaseStorage, filePath);
      
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