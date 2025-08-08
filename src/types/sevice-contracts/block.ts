// src/types/service-contracts/block.ts

// Base block interfaces matching database schema
export interface BlockCategory {
  id: string;
  created_at: string;
  parent_id: string | null;
  version: number;
  name: string | null;
  description: string | null;
  icon: string | null;
  sort_order: number | null;
  active: boolean | null;
}

export interface BlockMaster {
  id: string;
  created_at: string;
  parent_id: string | null;
  version: number;
  category_id: string;
  name: string | null;
  description: string | null;
  icon: string | null;
  node_type: string | null;
  config: Record<string, any> | null;
  theme_styles: Record<string, any> | null;
  can_rotate: boolean | null;
  can_resize: boolean | null;
  is_bidirectional: boolean | null;
  icon_names: string[] | null;
  hex_color: string | null;
  border_style: string | null;
  active: boolean | null;
  // Joined data
  category?: BlockCategory;
}

export interface BlockVariant {
  id: string;
  created_at: string;
  parent_id: string | null;
  version: number;
  block_id: string;
  name: string | null;
  description: string | null;
  node_type: string | null;
  default_config: Record<string, any> | null;
  active: boolean | null;
  // Joined data
  master?: BlockMaster;
}

// Hierarchy structure
export interface BlockHierarchy extends BlockCategory {
  masters: (BlockMaster & { variants: BlockVariant[] })[];
}

// Template builder enhanced interfaces
export interface TemplateBuilderBlock extends BlockVariant {
  isAvailable: boolean;
  maxInstances: number | null; // null means unlimited
  dependencies: string[]; // Array of required block node_types
  category: string;
  masterName: string;
  displayName: string;
  searchTerms: string[];
}

export interface TemplateBuilderCategory extends BlockCategory {
  masters: (BlockMaster & { 
    variants: TemplateBuilderBlock[] 
  })[];
}

// Block instance for contract templates
export interface BlockInstance {
  id: string; // Unique instance ID
  blockType: string; // node_type from variant
  variantId: string; // Reference to block variant
  position: number; // Order in template
  isRequired: boolean;
  configuration: Record<string, any>;
  isValid: boolean;
  validationErrors: ValidationError[];
  dependencies: string[]; // Other block instance IDs
}

// Validation interfaces
export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
  code: string;
}

export interface ValidationRule {
  field: string;
  type: 'required' | 'format' | 'range' | 'dependency' | 'custom';
  message: string;
  params?: Record<string, any>;
}

export interface BlockValidationResult {
  blockId: string;
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  dependencies: {
    blockId: string;
    satisfied: boolean;
    reason?: string;
  }[];
}

// Template interfaces
export interface Template {
  id: string;
  name: string;
  description?: string;
  industry: string;
  contractType: 'service' | 'partnership';
  tenantId: string;
  globalTemplate: boolean;
  globalTemplateId?: string;
  parentId?: string;
  version: number;
  isActive: boolean;
  blocks: BlockInstance[];
  complexity: 'simple' | 'medium' | 'complex';
  estimatedTime: number; // minutes
  tags: string[];
  usageCount: number;
  rating: number;
  isPopular: boolean;
  successRate: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastModifiedBy?: string;
}

// Block configuration interfaces for specific block types

// Core Blocks
export interface ContactBlockConfig {
  selectedContactId?: string;
  contactRole: 'buyer' | 'seller' | 'partner';
  primaryContact: boolean;
  communicationPreferences: {
    email: boolean;
    sms: boolean;
    phone: boolean;
  };
  billingAddress?: Address;
  serviceAddress?: Address;
}

export interface BaseDetailsBlockConfig {
  contractTitle: string;
  description?: string;
  startDate: string;
  endDate: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  tags: string[];
  referenceNumber?: string;
  currency: string;
  estimatedValue?: number;
}

export interface EquipmentBlockConfig {
  selectedEquipmentIds: string[];
  equipmentDetails: {
    equipmentId: string;
    specifications: Record<string, any>;
    location: string;
    warrantyExpiry?: string;
    lastMaintenanceDate?: string;
    calibrationParameters?: CalibrationParameter[];
  }[];
  requiresCalibration: boolean;
  maintenanceSchedule?: string;
}

export interface AcceptanceCriteriaBlockConfig {
  acceptanceMethod: 'payment' | 'signoff' | 'creation';
  paymentTerms?: {
    depositPercentage: number;
    paymentDueDate: string;
    lateFeePercentage?: number;
  };
  signoffRequirements?: {
    requiredSigners: string[];
    documentReviewPeriod: number;
    reminderSchedule: number[];
  };
  autoActivation?: {
    activationDate: string;
    conditions: string[];
  };
}

// Event Blocks
export interface ServiceCommitmentBlockConfig {
  serviceType: string;
  serviceName: string;
  quantity: number;
  cycle: number; // days between occurrences
  isUnlimited: boolean;
  equipmentDependency?: string;
  pricingModel: {
    pricePerEvent: number;
    currency: string;
    discountRules?: DiscountRule[];
  };
  slaRequirements?: {
    responseTime: number; // hours
    completionTime: number; // hours
    qualityMetrics: QualityMetric[];
  };
}

export interface MilestoneBlockConfig {
  milestoneName: string;
  description: string;
  dueDate: {
    type: 'absolute' | 'relative';
    date?: string;
    daysFromStart?: number;
    dependsOn?: string; // Another milestone ID
  };
  deliverables: {
    name: string;
    description: string;
    acceptanceCriteria: string;
    isRequired: boolean;
  }[];
  paymentTrigger?: {
    percentage: number;
    invoiceGeneration: 'automatic' | 'manual';
  };
}

// Content Blocks
export interface LegalClausesBlockConfig {
  clauseType: 'terms' | 'conditions' | 'liability' | 'confidentiality' | 'termination' | 'custom';
  content: {
    type: 'template' | 'custom';
    templateId?: string;
    customText?: string;
  };
  clauseTitle: string;
  isRequired: boolean;
  applicableJurisdiction?: string;
  modifications?: string;
}

export interface MediaUploadBlockConfig {
  files: {
    id: string;
    filename: string;
    url: string;
    title?: string;
    description?: string;
    category: 'reference' | 'equipment' | 'location' | 'documentation' | 'training' | 'process';
    fileType: string;
    fileSize: number;
    uploadedAt: string;
  }[];
  displayOptions: {
    layout: 'grid' | 'list' | 'carousel';
    showTitles: boolean;
    allowDownload: boolean;
  };
}

// Commercial Blocks
export interface BillingRulesBlockConfig {
  billingFrequency: 'monthly' | 'quarterly' | 'annually' | 'milestone' | 'on_completion' | 'prepaid';
  billingRules: {
    id: string;
    name: string;
    type: 'milestone' | 'recurring' | 'usage' | 'fixed';
    amount: number;
    percentage?: number;
    triggerCondition: string;
    dueDate?: {
      type: 'absolute' | 'relative';
      date?: string;
      daysFromTrigger?: number;
    };
  }[];
  paymentTerms: {
    daysNet: number;
    discountPercent?: number;
    discountDays?: number;
    lateFeePercent?: number;
    currency: string;
  };
  invoiceOptions: {
    autoGenerate: boolean;
    sendToContact: boolean;
    includeLineItems: boolean;
    taxConfiguration?: TaxConfiguration;
  };
}

export interface RevenueSharingBlockConfig {
  sharingModel: 'percentage' | 'tiered' | 'fixed' | 'hybrid';
  basePercentage?: number;
  tieredStructure?: {
    tier: number;
    threshold: number;
    percentage: number;
    description: string;
  }[];
  fixedAmount?: {
    amount: number;
    frequency: 'monthly' | 'quarterly' | 'annually';
  };
  performanceMetrics?: {
    metricName: string;
    target: number;
    bonus: number;
    penalty?: number;
  }[];
  paymentSchedule: {
    frequency: 'monthly' | 'quarterly' | 'annually';
    paymentDate: number;
    minimumThreshold?: number;
  };
}

// Supporting interfaces
export interface Address {
  type: string;
  label?: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state_code?: string;
  country_code: string;
  postal_code?: string;
  google_pin?: string;
  is_primary: boolean;
  notes?: string;
}

export interface CalibrationParameter {
  name: string;
  value: number;
  unit: string;
  tolerance: number;
  lastCalibrated?: string;
}

export interface DiscountRule {
  type: 'volume' | 'loyalty' | 'early_payment';
  threshold: number;
  discountPercentage: number;
  description: string;
}

export interface QualityMetric {
  name: string;
  target: number;
  unit: string;
  measurement: 'automatic' | 'manual';
}

export interface TaxConfiguration {
  enabled: boolean;
  taxRate: number;
  taxType: string;
  jurisdiction: string;
}

// API response interfaces
export interface BlockApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  message?: string;
  count?: number;
  summary?: {
    categories: number;
    masters: number;
    variants: number;
  };
  filters?: Record<string, any>;
  masterId?: string;
  timestamp?: string;
}

export interface BlockSearchResult {
  id: string;
  name: string;
  description?: string;
  displayPath: string;
  category: {
    id: string;
    name: string;
    icon?: string;
  };
  master: {
    id: string;
    name: string;
    icon?: string;
    node_type?: string;
  };
  node_type?: string;
  default_config?: Record<string, any>;
}

export interface BlockStats {
  total: {
    categories: number;
    masters: number;
    variants: number;
  };
  byCategory: {
    id: string;
    name: string;
    masters: number;
    variants: number;
  }[];
  byNodeType: Record<string, number>;
  health: {
    activeCategories: number;
    averageVariantsPerMaster: number;
  };
}

// Constants for block types and categories
export const BLOCK_CATEGORIES = {
  CORE: 'core',
  EVENT: 'event',
  CONTENT: 'content',
  COMMERCIAL: 'commercial'
} as const;

export const CORE_BLOCK_TYPES = {
  CONTACT: 'contact-block',
  BASE_DETAILS: 'base-details-block',
  EQUIPMENT: 'equipment-block',
  ACCEPTANCE: 'acceptance-block'
} as const;

export const EVENT_BLOCK_TYPES = {
  SERVICE_COMMITMENT: 'service-commitment-block',
  MILESTONE: 'milestone-block'
} as const;

export const CONTENT_BLOCK_TYPES = {
  LEGAL_CLAUSES: 'legal-clauses-block',
  IMAGE_UPLOAD: 'image-upload-block',
  VIDEO_UPLOAD: 'video-upload-block',
  DOCUMENT_UPLOAD: 'document-upload-block'
} as const;

export const COMMERCIAL_BLOCK_TYPES = {
  BILLING_RULES: 'billing-rules-block',
  REVENUE_SHARING: 'revenue-sharing-block'
} as const;

export type BlockCategoryType = typeof BLOCK_CATEGORIES[keyof typeof BLOCK_CATEGORIES];
export type CoreBlockType = typeof CORE_BLOCK_TYPES[keyof typeof CORE_BLOCK_TYPES];
export type EventBlockType = typeof EVENT_BLOCK_TYPES[keyof typeof EVENT_BLOCK_TYPES];
export type ContentBlockType = typeof CONTENT_BLOCK_TYPES[keyof typeof CONTENT_BLOCK_TYPES];
export type CommercialBlockType = typeof COMMERCIAL_BLOCK_TYPES[keyof typeof COMMERCIAL_BLOCK_TYPES];

export type BlockType = CoreBlockType | EventBlockType | ContentBlockType | CommercialBlockType;