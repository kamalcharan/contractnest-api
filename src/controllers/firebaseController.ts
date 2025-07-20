import { Request, Response } from 'express';
import axios from 'axios';
import { captureException } from '../utils/sentry';
import * as admin from 'firebase-admin';
import { SUPABASE_URL } from '../utils/config';

// Initialize Firebase Admin SDK - Do this only once in your application
try {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID || '',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') || ''
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || ''
  });
} catch (error) {
  console.error('Firebase admin initialization error:', error);
  // App might have been initialized already
}

// Extend Request type to include user property
interface AuthRequest extends Request {
  user?: any;
}

/**
 * Get Firebase diagnostic information
 */
export const getDiagnosticInfo = async (req: AuthRequest, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header is required' });
    }
    
    // Get test type from query parameters
    const testType = req.query.test as string || 'configuration';
    
    // Verify Firebase configuration in our backend
    const firebaseConfig = {
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_APP_ID
    };
    
    // Check for missing config
    const missingConfig = Object.entries(firebaseConfig)
      .filter(([_, value]) => !value)
      .map(([key]) => key);
    
    // Call the edge function for additional diagnostics
    let edgeResponse = null;
    try {
      if (SUPABASE_URL) {
        const response = await axios.get(
          `${SUPABASE_URL}/functions/v1/firebase-diagnostic?test=${testType}`,
          {
            headers: {
              Authorization: authHeader,
              'Content-Type': 'application/json'
            }
          }
        );
        edgeResponse = response.data;
      }
    } catch (edgeError: any) {
      console.error('Edge function error:', edgeError);
      // Continue execution even if edge function fails
    }
    
    // Return combined results
    return res.status(200).json({
      status: missingConfig.length === 0 ? 'success' : 'warning',
      message: missingConfig.length === 0 
        ? 'Firebase configuration complete' 
        : `Firebase configuration incomplete: missing ${missingConfig.join(', ')}`,
      data: {
        timestamp: new Date().toISOString(),
        environment: {
          nodeEnv: process.env.NODE_ENV || 'Not set',
          supabaseUrl: SUPABASE_URL ? 'Set' : 'Not set'
        },
        firebase: {
          configured: missingConfig.length === 0,
          missingConfig: missingConfig.length > 0 ? missingConfig : null,
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'Not set'
        },
        results: [
          {
            name: 'Firebase Configuration',
            success: missingConfig.length === 0,
            message: missingConfig.length === 0 
              ? 'All Firebase configuration variables are set' 
              : `Missing configuration: ${missingConfig.join(', ')}`,
            timestamp: new Date().toISOString()
          }
        ],
        edge: edgeResponse
      }
    });
  } catch (error: any) {
    console.error('Error in Firebase diagnostic controller:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_firebase', action: 'getDiagnosticInfo' }
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Test tenant folder structure in Firebase Storage
 */
export const testTenantStructure = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.query.tenantId as string;
    
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }
    
    // Get storage instance
    const storage = admin.storage().bucket();
    
    // Check if tenant folder exists
    try {
      const tenantPath = `tenant-${tenantId}`;
      const [files] = await storage.getFiles({ prefix: tenantPath, maxResults: 1 });
      
      if (files.length === 0) {
        return res.status(200).json({
          name: 'Tenant Folder Structure Test',
          success: false,
          message: `Tenant folder does not exist: ${tenantPath}`,
          timestamp: new Date().toISOString()
        });
      }
      
      // Check if the required subfolders exist
      const requiredFolders = ['contact_photos', 'contract_media', 'service_images', 'documents'];
      let missingFolders = [];
      
      for (const folder of requiredFolders) {
        const folderPath = `${tenantPath}/${folder}`;
        const [folderFiles] = await storage.getFiles({ prefix: folderPath, maxResults: 1 });
        
        if (folderFiles.length === 0) {
          missingFolders.push(folder);
        }
      }
      
      if (missingFolders.length === 0) {
        return res.status(200).json({
          name: 'Tenant Folder Structure Test',
          success: true,
          message: `Tenant folder structure is complete with all required subfolders`,
          timestamp: new Date().toISOString()
        });
      } else {
        return res.status(200).json({
          name: 'Tenant Folder Structure Test',
          success: false,
          message: `Tenant folder exists but missing some required subfolders: ${missingFolders.join(', ')}`,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error: any) {
      console.error('Error testing tenant folder structure:', error);
      
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'api_firebase', action: 'testTenantStructure' }
      });
      
      return res.status(200).json({
        name: 'Tenant Folder Structure Test',
        success: false,
        message: `Error testing tenant folder structure: ${error.message || 'Unknown error'}`,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error: any) {
    console.error('Error in tenant structure controller:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_firebase', action: 'testTenantStructure' }
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};

/**
 * Create tenant folder structure
 */
export const createTenantStructure = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.body.tenantId;
    
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }
    
    // Get storage instance
    const storage = admin.storage().bucket();
    
    // Create tenant folder and required subfolders
    try {
      const tenantPath = `tenant-${tenantId}`;
      const requiredFolders = ['contact_photos', 'contract_media', 'service_images', 'documents'];
      const createdFolders = [];
      
      // Create placeholder files to establish folder structure
      for (const folder of requiredFolders) {
        const placeholderPath = `${tenantPath}/${folder}/.placeholder`;
        const file = storage.file(placeholderPath);
        
        // Create empty file
        await file.save(Buffer.from(''), {
          contentType: 'text/plain',
          metadata: {
            contentDisposition: 'inline',
            cacheControl: 'public, max-age=3600'
          }
        });
        
        createdFolders.push(folder);
      }
      
      return res.status(200).json({
        name: 'Create Tenant Folder Structure',
        success: true,
        message: `Created tenant folder structure with folders: ${createdFolders.join(', ')}`,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error creating tenant folder structure:', error);
      
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: 'api_firebase', action: 'createTenantStructure' }
      });
      
      return res.status(200).json({
        name: 'Create Tenant Folder Structure',
        success: false,
        message: `Error creating tenant folder structure: ${error.message || 'Unknown error'}`,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error: any) {
    console.error('Error in create tenant structure controller:', error.message);
    
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'api_firebase', action: 'createTenantStructure' }
    });

    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    
    return res.status(status).json({ error: message });
  }
};