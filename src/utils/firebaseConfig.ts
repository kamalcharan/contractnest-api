// src/utils/firebaseConfig.ts
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { captureException } from './sentry';

let firebaseApp: FirebaseApp | null = null;
let firebaseStorage: FirebaseStorage | null = null;

// Define firebaseConfig interface to fix typing issues
interface FirebaseConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  [key: string]: string | undefined; // Add index signature
}

/**
 * Initialize Firebase app and storage
 */
export const initializeFirebase = (): { app: FirebaseApp; storage: FirebaseStorage } => {
  if (firebaseApp && firebaseStorage) {
    return { app: firebaseApp, storage: firebaseStorage };
  }

  try {
    // Firebase configuration from environment variables
    const firebaseConfig: FirebaseConfig = {
      apiKey: process.env.VITE_FIREBASE_API_KEY,
      authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.VITE_FIREBASE_APP_ID
    };

    // Validate required configuration
    const requiredFields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'appId'];
    const missingFields = requiredFields.filter(field => !firebaseConfig[field]);

    if (missingFields.length > 0) {
      throw new Error(`Missing Firebase configuration: ${missingFields.join(', ')}`);
    }

    // Initialize Firebase
    firebaseApp = initializeApp(firebaseConfig);
    firebaseStorage = getStorage(firebaseApp);

    console.log('Firebase initialized successfully');
    return { app: firebaseApp, storage: firebaseStorage };
  } catch (error) {
    console.error('Error initializing Firebase:', error);
    captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'firebase_init', error_type: 'config_error' }
    });
    throw error;
  }
};

/**
 * Check Firebase connection status
 */
export const checkFirebaseStatus = async (): Promise<{ 
  status: 'connected' | 'error'; 
  message: string;
  details?: Record<string, any>;
}> => {
  try {
    const { app, storage } = initializeFirebase();
    
    return {
      status: 'connected',
      message: 'Firebase is properly configured and connected',
      details: {
        storageBucket: storage.app.options.storageBucket,
        projectId: app.options.projectId
      }
    };
  } catch (error) {
    console.error('Error checking Firebase status:', error);
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error connecting to Firebase',
      details: { error: String(error) }
    };
  }
};