// src/config/products.ts
// Product configuration for multi-product architecture

export interface ProductConfig {
  code: string;
  name: string;
  envPrefix: string;
  supabaseUrl: string | undefined;
  supabaseKey: string | undefined;
  isConfigured: boolean;
  features: {
    firebaseStorage: boolean;
    googleDrive: boolean;
  };
}

export interface ProductsRegistry {
  [key: string]: ProductConfig;
}

/**
 * Get product configuration from environment variables
 * Uses env_prefix from m_products table to map to env vars
 */
const getProductConfig = (code: string, envPrefix: string): ProductConfig => {
  const prefix = envPrefix || '';
  const supabaseUrl = process.env[`${prefix}SUPABASE_URL`];
  const supabaseKey = process.env[`${prefix}SUPABASE_KEY`];

  return {
    code,
    name: code,
    envPrefix: prefix,
    supabaseUrl,
    supabaseKey,
    isConfigured: !!(supabaseUrl && supabaseKey),
    features: {
      firebaseStorage: code === 'contractnest',
      googleDrive: code === 'familyknows',
    },
  };
};

/**
 * Products registry - maps product codes to their configurations
 * env_prefix values must match m_products table
 */
export const products: ProductsRegistry = {
  contractnest: getProductConfig('contractnest', ''),      // Uses SUPABASE_URL, SUPABASE_KEY
  familyknows: getProductConfig('familyknows', 'FK_'),     // Uses FK_SUPABASE_URL, FK_SUPABASE_KEY
};

/**
 * Default product when X-Product header is missing
 */
export const DEFAULT_PRODUCT = 'contractnest';

/**
 * Valid product codes
 */
export const VALID_PRODUCTS = Object.keys(products);

/**
 * Get product configuration by code
 */
export const getProduct = (code: string): ProductConfig | undefined => {
  return products[code.toLowerCase()];
};

/**
 * Check if a product code is valid
 */
export const isValidProduct = (code: string): boolean => {
  return VALID_PRODUCTS.includes(code.toLowerCase());
};

/**
 * Get default product configuration
 */
export const getDefaultProduct = (): ProductConfig => {
  return products[DEFAULT_PRODUCT];
};

/**
 * Log product configuration status (for startup)
 */
export const logProductStatus = (): void => {
  console.log('📦 Product Configuration Status:');
  console.log('─'.repeat(50));

  Object.entries(products).forEach(([code, config]) => {
    const status = config.isConfigured ? '✅' : '❌';
    const defaultTag = code === DEFAULT_PRODUCT ? ' (default)' : '';
    console.log(`  ${status} ${config.name}${defaultTag}`);
    console.log(`     ENV Prefix: ${config.envPrefix || '(none)'}`);
    console.log(`     Configured: ${config.isConfigured}`);
    if (!config.isConfigured) {
      console.log(`     Missing: ${config.envPrefix}SUPABASE_URL or ${config.envPrefix}SUPABASE_KEY`);
    }
  });

  console.log('─'.repeat(50));
};

export default products;
