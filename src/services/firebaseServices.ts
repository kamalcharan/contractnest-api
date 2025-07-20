import axios from 'axios';
import { captureException } from '../utils/sentry';
import { SUPABASE_URL } from '../utils/supabaseConfig';
import { API_ENDPOINTS } from './ServiceURLs';

// Define interfaces for diagnostic responses
export interface TestResult {
  name: string;
  success: boolean;
  message: string;
  timestamp: string;
}

export interface FirebaseDiagnosticResponse {
  status: string;
  message: string;
  data?: {
    timestamp: string;
    environment: Record<string, string>;
    firebase: {
      configured: boolean;
      missingConfig: string[] | null;
      storageBucket: string;
      storage?: Record<string, string>;
    };
    results: Array<TestResult>;
  };
  error?: string;
}

export interface FileItem {
  name: string;
  path: string;
  size?: number;
  contentType?: string;
  updated?: string;
}

export interface DirectoryListing {
  files: FileItem[];
  folders: string[];
  path: string;
}

export interface UploadResult {
  success: boolean;
  fileUrl?: string;
  filePath?: string;
  fileName?: string;
  size?: number;
  error?: string;
}

// Service implementation
export const firebaseService = {
  /**
   * Get Firebase diagnostic information
   * 
   * @param authToken - The auth token for the request
   * @param testType - The type of test to run (optional)
   */
  async getDiagnosticInfo(
    authToken: string, 
    testType: string = 'configuration'
  ): Promise<FirebaseDiagnosticResponse> {
    try {
      if (!SUPABASE_URL) {
        throw new Error('Missing SUPABASE_URL configuration');
      }

      const response = await axios.get(
        `${SUPABASE_URL}/functions/v1/firebase-diagnostic?test=${testType}`,
        {
          headers: {
            Authorization: authToken,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error in Firebase diagnostic service:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_firebase', action: 'getDiagnosticInfo' }
      });
      throw error;
    }
  },

  /**
   * Test Firebase Storage connectivity
   */
  async testFirebaseStorage(
    authToken: string,
    tenantId?: string
  ): Promise<FirebaseDiagnosticResponse> {
    try {
      const response = await axios.get(
        `${API_ENDPOINTS.ADMIN.STORAGE.DIAGNOSTIC}?test=storage${tenantId ? `&tenantId=${tenantId}` : ''}`,
        {
          headers: {
            Authorization: authToken
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error testing Firebase storage:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_firebase', action: 'testFirebaseStorage' }
      });
      throw error;
    }
  },

  /**
   * Test tenant folder structure
   */
  async testTenantFolderStructure(
    authToken: string,
    tenantId: string
  ): Promise<TestResult> {
    try {
      const response = await axios.get(
        `${API_ENDPOINTS.ADMIN.STORAGE.DIAGNOSTIC}/tenant-structure?tenantId=${tenantId}`,
        {
          headers: {
            Authorization: authToken
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error testing tenant folder structure:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_firebase', action: 'testTenantFolderStructure' }
      });
      throw error;
    }
  },

  /**
   * Setup tenant folder structure
   */
  async setupTenantFolderStructure(
    authToken: string,
    tenantId: string
  ): Promise<TestResult> {
    try {
      const response = await axios.post(
        `${API_ENDPOINTS.ADMIN.STORAGE.DIAGNOSTIC}/tenant-structure`,
        { tenantId },
        {
          headers: {
            Authorization: authToken,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error setting up tenant folder structure:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_firebase', action: 'setupTenantFolderStructure' }
      });
      throw error;
    }
  },

  /**
   * List directory contents
   */
  async listDirectory(
    authToken: string,
    path: string
  ): Promise<DirectoryListing> {
    try {
      const response = await axios.get(
        `${API_ENDPOINTS.ADMIN.STORAGE.DIAGNOSTIC}/list?path=${encodeURIComponent(path)}`,
        {
          headers: {
            Authorization: authToken
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error listing directory:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_firebase', action: 'listDirectory' }
      });
      throw error;
    }
  },

  /**
   * Upload file
   */
  async uploadFile(
    authToken: string,
    file: File,
    path?: string
  ): Promise<UploadResult> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      if (path) {
        formData.append('path', path);
      }

      const response = await axios.post(
        `${API_ENDPOINTS.ADMIN.STORAGE.DIAGNOSTIC}/upload`,
        formData,
        {
          headers: {
            Authorization: authToken,
            'Content-Type': 'multipart/form-data'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error uploading file:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_firebase', action: 'uploadFile' }
      });
      throw error;
    }
  },

  /**
   * Delete file
   */
  async deleteFile(
    authToken: string,
    path: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const response = await axios.delete(
        `${API_ENDPOINTS.ADMIN.STORAGE.DIAGNOSTIC}/file?path=${encodeURIComponent(path)}`,
        {
          headers: {
            Authorization: authToken
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error deleting file:', error);
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'service_firebase', action: 'deleteFile' }
      });
      throw error;
    }
  }
};

export default firebaseService;