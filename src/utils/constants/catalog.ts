// API Layer: src/utils/constants/catalog.ts
// Only the constants needed by the API layer

export const CATALOG_ITEM_TYPES = {
  SERVICE: 'service',
  EQUIPMENT: 'equipment', 
  SPARE_PART: 'spare_part',
  ASSET: 'asset'
} as const;

export const PRICING_TYPES = {
  FIXED: 'fixed',
  UNIT_PRICE: 'unit_price',
  HOURLY: 'hourly',
  DAILY: 'daily'
} as const;

export const BILLING_MODES = {
  MANUAL: 'manual',
  AUTOMATIC: 'automatic'
} as const;

export const CATALOG_ITEM_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  DRAFT: 'draft'
} as const;

export const SUPPORTED_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED'] as const;