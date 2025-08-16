// src/utils/constants/contacts.ts - UPDATED with team_member classification
// Contact-specific constants for the first release

export const CONTACT_FORM_TYPES = {
  INDIVIDUAL: 'individual',
  CORPORATE: 'corporate'
} as const;

export const ADDRESS_TYPES = {
  HOME: 'home',
  OFFICE: 'office',
  BILLING: 'billing',
  SHIPPING: 'shipping',
  FACTORY: 'factory',
  WAREHOUSE: 'warehouse',
  OTHER: 'other'
} as const;

export const SALUTATIONS = [
  { value: 'mr', label: 'Mr.' },
  { value: 'mrs', label: 'Mrs.' },
  { value: 'ms', label: 'Ms.' },
  { value: 'dr', label: 'Dr.' },
  { value: 'prof', label: 'Prof.' }
] as const;

// Contact Status Management (requirement #4, #7)
export const CONTACT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ARCHIVED: 'archived'
} as const;

export const CONTACT_STATUS_LABELS = {
  [CONTACT_STATUS.ACTIVE]: 'Active',
  [CONTACT_STATUS.INACTIVE]: 'Inactive',
  [CONTACT_STATUS.ARCHIVED]: 'Archived'
} as const;

// UPDATED: Contact Classifications - Now 5 Types (added team_member)
export const CONTACT_CLASSIFICATIONS = {
  BUYER: 'buyer',
  SELLER: 'seller',
  VENDOR: 'vendor',
  PARTNER: 'partner',
  TEAM_MEMBER: 'team_member' // ADDED: New classification
} as const;

// UPDATED: Classification Configuration with team_member
export const CONTACT_CLASSIFICATION_CONFIG = [
  { 
    id: 'buyer', 
    label: 'Buyer', 
    description: 'Purchases services/products from us', 
    color: 'blue',
    icon: '🛒'
  },
  { 
    id: 'seller', 
    label: 'Seller', 
    description: 'Sells services/products to us', 
    color: 'green',
    icon: '💰'
  },
  { 
    id: 'vendor', 
    label: 'Vendor', 
    description: 'Supplies products/services to us', 
    color: 'purple',
    icon: '📦'
  },
  { 
    id: 'partner', 
    label: 'Partner', 
    description: 'Business collaboration partner', 
    color: 'orange',
    icon: '🤝'
  },
  { 
    id: 'team_member', 
    label: 'Team Member', 
    description: 'Internal team member or employee', 
    color: 'indigo',
    icon: '👥'
  } // ADDED: New classification config
] as const;

// Contact Channel Types
export const CONTACT_CHANNEL_TYPES = {
  MOBILE: 'mobile',
  EMAIL: 'email', 
  WHATSAPP: 'whatsapp',
  LINKEDIN: 'linkedin',
  WEBSITE: 'website',
  SKYPE: 'skype',
  TELEGRAM: 'telegram'
} as const;

// Default settings
export const DEFAULT_CONTACT_CHANNEL = CONTACT_CHANNEL_TYPES.MOBILE;
export const DEFAULT_COUNTRY_CODE = 'IN';
export const DEFAULT_PHONE_CODE = '+91';

// User Account Status (requirement #6)
export const USER_ACCOUNT_STATUS = {
  HAS_ACCOUNT: 'has_account',
  NO_ACCOUNT: 'no_account',
  INVITATION_SENT: 'invitation_sent',
  INVITATION_PENDING: 'invitation_pending'
} as const;

// User Status Messages
export const USER_STATUS_MESSAGES = {
  [USER_ACCOUNT_STATUS.HAS_ACCOUNT]: {
    icon: '👤',
    text: 'This contact has a user account - Ready to create contracts',
    action: 'Create Contract',
    actionType: 'primary' as const
  },
  [USER_ACCOUNT_STATUS.NO_ACCOUNT]: {
    icon: '📧', 
    text: 'No user account found - Send invitation to get started',
    action: 'Send Invite',
    actionType: 'secondary' as const
  },
  [USER_ACCOUNT_STATUS.INVITATION_SENT]: {
    icon: '⏳',
    text: 'Invitation sent - Waiting for user to accept',
    action: 'Resend Invite', 
    actionType: 'secondary' as const
  },
  [USER_ACCOUNT_STATUS.INVITATION_PENDING]: {
    icon: '📨',
    text: 'Invitation pending - User will receive access soon',
    action: 'Elevate Relationship',
    actionType: 'secondary' as const
  }
} as const;

// Enhanced Address Types with Labels
export const ADDRESS_TYPE_LABELS = {
  [ADDRESS_TYPES.HOME]: { label: 'Home', icon: '🏠', description: 'Residential address' },
  [ADDRESS_TYPES.OFFICE]: { label: 'Office', icon: '🏢', description: 'Business office' },
  [ADDRESS_TYPES.BILLING]: { label: 'Billing', icon: '💳', description: 'Billing address' },
  [ADDRESS_TYPES.SHIPPING]: { label: 'Shipping', icon: '📦', description: 'Delivery address' },
  [ADDRESS_TYPES.FACTORY]: { label: 'Factory', icon: '🏭', description: 'Manufacturing facility' },
  [ADDRESS_TYPES.WAREHOUSE]: { label: 'Warehouse', icon: '🏬', description: 'Storage facility' },
  [ADDRESS_TYPES.OTHER]: { label: 'Other', icon: '📍', description: 'Other address type' }
} as const;

// Contact Sources
export const CONTACT_SOURCES = {
  MANUAL: 'manual',
  IMPORT: 'import',
  API: 'api',
  WEBSITE: 'website',
  REFERRAL: 'referral',
  SOCIAL: 'social'
} as const;

// Bulk Actions
export const BULK_ACTIONS = {
  DELETE: 'delete',
  EXPORT: 'export',
  TAG: 'tag',
  CHANGE_STATUS: 'changeStatus',
  ACTIVATE: 'activate',
  DEACTIVATE: 'deactivate',
  ARCHIVE: 'archive'
} as const;

// Contact Sort Options
export const CONTACT_SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'created', label: 'Date Created' },
  { value: 'updated', label: 'Last Updated' },
  { value: 'type', label: 'Contact Type' },
  { value: 'status', label: 'Status' }
] as const;

// Contact View Modes
export const CONTACT_VIEW_MODES = {
  GRID: 'grid',
  LIST: 'list'
} as const;

// Import Settings
export const IMPORT_FILE_TYPES = {
  CSV: '.csv',
  EXCEL: '.xlsx,.xls',
  VCF: '.vcf'
} as const;

export const MAX_IMPORT_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_IMPORT_ROWS = 1000;

// Validation Rules
export const VALIDATION_RULES = {
  NAME_MIN_LENGTH: 2,
  NAME_MAX_LENGTH: 50,
  COMPANY_MAX_LENGTH: 100,
  PHONE_MIN_LENGTH: 10,
  PHONE_MAX_LENGTH: 15,
  NOTES_MAX_LENGTH: 500,
  ADDRESS_MAX_LENGTH: 200,
  POSTAL_CODE_MAX_LENGTH: 10,
  TAG_MAX_COUNT: 10,
  CLASSIFICATION_MIN_COUNT: 1
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  REQUIRED_FIELD: 'This field is required',
  INVALID_EMAIL: 'Please enter a valid email address',
  INVALID_PHONE: 'Please enter a valid phone number',
  INVALID_URL: 'Please enter a valid URL',
  MIN_LENGTH: (min: number) => `Must be at least ${min} characters`,
  MAX_LENGTH: (max: number) => `Must not exceed ${max} characters`,
  DUPLICATE_PRIMARY: 'Only one item can be marked as primary',
  NO_CHANNELS: 'At least one contact method is required',
  NO_PRIMARY_CHANNEL: 'Please mark one contact method as primary',
  NO_CLASSIFICATIONS: 'Please select at least one classification',
  COUNTRY_CODE_REQUIRED: 'Country code is required for phone numbers',
  CONTACT_ARCHIVED: 'Cannot perform operations on archived contacts',
  CONTACT_INACTIVE: 'This contact is inactive and may have limited functionality',
  DUPLICATE_CONTACT_WARNING: 'A contact with similar information already exists',
  MAX_TAGS_EXCEEDED: `Maximum ${VALIDATION_RULES.TAG_MAX_COUNT} tags allowed`
} as const;

// Success Messages
export const SUCCESS_MESSAGES = {
  CONTACT_CREATED: 'Contact created successfully',
  CONTACT_UPDATED: 'Contact updated successfully',
  CONTACT_DELETED: 'Contact deleted successfully',
  CONTACT_ACTIVATED: 'Contact activated successfully',
  CONTACT_DEACTIVATED: 'Contact deactivated successfully',
  CONTACT_ARCHIVED: 'Contact archived successfully',
  CONTACTS_IMPORTED: (count: number) => `${count} contacts imported successfully`,
  CONTACTS_EXPORTED: 'Contacts exported successfully',
  INVITATION_SENT: 'Invitation sent successfully',
  TAG_ADDED: 'Tag added successfully',
  TAG_REMOVED: 'Tag removed successfully'
} as const;

// Placeholder Texts
export const PLACEHOLDER_TEXTS = {
  SEARCH: 'Search by name, email, or phone...',
  FULL_NAME: 'John Doe',
  COMPANY_NAME: 'Acme Corporation',
  EMAIL: 'john.doe@example.com',
  PHONE: '9876543210',
  STREET: '123 Main Street',
  CITY: 'Mumbai',
  STATE: 'Maharashtra',
  POSTAL_CODE: '400001',
  NOTES: 'Add any additional notes here...',
  DESIGNATION: 'Manager',
  DEPARTMENT: 'Sales'
} as const;

// MasterData Query Names (requirement #3)
export const MASTERDATA_QUERIES = {
  CONTACT_TAGS: 'Contact Tags',
  COMPLIANCE_TYPES: 'Compliance Types',
  CONTACT_SOURCES: 'Contact Sources',
  INDUSTRIES: 'Industries'
} as const;

// Duplicate Detection Settings (requirement #10, #12)
export const DUPLICATE_DETECTION = {
  CHECK_CHANNELS: ['mobile', 'email'] as const,
  SIMILARITY_THRESHOLD: 0.8, // For fuzzy name matching
  AUTO_FLAG_DUPLICATES: true,
  REQUIRE_CONFIRMATION: true
} as const;

// Contact Form Validation Schema
export const FORM_VALIDATION_SCHEMA = {
  individual: {
    required: ['name', 'contact_channels', 'classifications'],
    optional: ['salutation', 'notes', 'tags', 'addresses']
  },
  corporate: {
    required: ['company_name', 'contact_channels', 'classifications'],
    optional: ['registration_number', 'notes', 'tags', 'addresses', 'compliance_numbers', 'contact_persons']
  }
} as const;

// Audit Event Types (requirement #8)
export const AUDIT_EVENTS = {
  CONTACT_CREATED: 'contact_created',
  CONTACT_UPDATED: 'contact_updated',
  CONTACT_DELETED: 'contact_deleted',
  CONTACT_ACTIVATED: 'contact_activated',
  CONTACT_DEACTIVATED: 'contact_deactivated',
  CONTACT_ARCHIVED: 'contact_archived',
  CHANNEL_ADDED: 'channel_added',
  CHANNEL_UPDATED: 'channel_updated',
  CHANNEL_REMOVED: 'channel_removed',
  ADDRESS_ADDED: 'address_added',
  ADDRESS_UPDATED: 'address_updated',
  ADDRESS_REMOVED: 'address_removed',
  TAG_ADDED: 'tag_added',
  TAG_REMOVED: 'tag_removed',
  CLASSIFICATION_ADDED: 'classification_added',
  CLASSIFICATION_REMOVED: 'classification_removed',
  INVITATION_SENT: 'invitation_sent',
  DUPLICATE_FLAGGED: 'duplicate_flagged',
  DUPLICATE_RESOLVED: 'duplicate_resolved'
} as const;

// UPDATED: Filter Options for Contact Lists with team_member
export const FILTER_OPTIONS = {
  status: [
    { value: 'active', label: 'Active', count: 0 },
    { value: 'inactive', label: 'Inactive', count: 0 },
    { value: 'archived', label: 'Archived', count: 0 }
  ],
  type: [
    { value: 'individual', label: 'Individual', count: 0 },
    { value: 'corporate', label: 'Corporate', count: 0 }
  ],
  classification: [
    { value: 'buyer', label: 'Buyer', count: 0 },
    { value: 'seller', label: 'Seller', count: 0 },
    { value: 'vendor', label: 'Vendor', count: 0 },
    { value: 'partner', label: 'Partner', count: 0 },
    { value: 'team_member', label: 'Team Member', count: 0 } // ADDED: New filter option
  ],
  duplicates: [
    { value: 'has_duplicates', label: 'Has Potential Duplicates', count: 0 },
    { value: 'no_duplicates', label: 'No Duplicates', count: 0 }
  ]
} as const;

// Business Rules (requirements #5, #7)
export const BUSINESS_RULES = {
  INACTIVE_CONTACT_RESTRICTIONS: [
    'No new contracts can be created',
    'No new invoices can be generated',
    'No new services can be started',
    'Existing services continue but no modifications'
  ],
  ARCHIVED_CONTACT_RESTRICTIONS: [
    'No user operations allowed',
    'Only system operations permitted',
    'Record is effectively frozen',
    'Cannot be reactivated by users'
  ],
  DUPLICATE_HANDLING: {
    SHOW_WARNING: true,
    ALLOW_SAVE_ANYWAY: true,
    MARK_AS_POTENTIAL_DUPLICATE: true,
    REQUIRE_USER_CONFIRMATION: true
  }
} as const;

// API Endpoints (for frontend integration)
export const API_ENDPOINTS = {
  CONTACTS: '/api/contacts',
  CONTACT_BY_ID: (id: string) => `/api/contacts/${id}`,
  CONTACT_CHANNELS: (id: string) => `/api/contacts/${id}/channels`,
  CONTACT_ADDRESSES: (id: string) => `/api/contacts/${id}/addresses`,
  CONTACT_TAGS: (id: string) => `/api/contacts/${id}/tags`,
  CONTACT_CLASSIFICATIONS: (id: string) => `/api/contacts/${id}/classifications`,
  CONTACT_SEARCH: '/api/contacts/search',
  CONTACT_DUPLICATES: '/api/contacts/duplicates',
  CONTACT_INVITE: (id: string) => `/api/contacts/${id}/invite`,
  CONTACT_BULK_ACTIONS: '/api/contacts/bulk',
  CONTACT_EXPORT: '/api/contacts/export',
  CONTACT_IMPORT: '/api/contacts/import'
} as const;

// UI Configuration
export const UI_CONFIG = {
  ITEMS_PER_PAGE: 12,
  ITEMS_PER_PAGE_OPTIONS: [12, 24, 48, 96],
  SEARCH_DEBOUNCE_MS: 300,
  AUTO_SAVE_DELAY_MS: 1000,
  TOAST_DURATION_MS: 5000,
  MODAL_ANIMATION_DURATION_MS: 200,
  CARD_HOVER_ELEVATION: 'hover:shadow-md',
  PRIMARY_COLOR: '#2563eb',
  SUCCESS_COLOR: '#059669',
  WARNING_COLOR: '#d97706',
  ERROR_COLOR: '#dc2626'
} as const;

// Utility Functions
export const getClassificationConfig = (id: string) => {
  return CONTACT_CLASSIFICATION_CONFIG.find(config => config.id === id);
};

export const getClassificationLabel = (id: string): string => {
  const config = getClassificationConfig(id);
  return config?.label || id;
};

export const getClassificationColor = (id: string): string => {
  const config = getClassificationConfig(id);
  return config?.color || 'gray';
};

export const getStatusColor = (status: string): string => {
  switch (status) {
    case CONTACT_STATUS.ACTIVE:
      return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800';
    case CONTACT_STATUS.INACTIVE:
      return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800';
    case CONTACT_STATUS.ARCHIVED:
      return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-400 dark:border-gray-800';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-400 dark:border-gray-800';
  }
};

export const isContactRestricted = (status: string): boolean => {
  return status === CONTACT_STATUS.INACTIVE || status === CONTACT_STATUS.ARCHIVED;
};

export const canPerformOperation = (status: string, operation: string): boolean => {
  if (status === CONTACT_STATUS.ARCHIVED) {
    return false; // No operations allowed on archived contacts
  }
  
  if (status === CONTACT_STATUS.INACTIVE) {
    // Limited operations on inactive contacts
    const allowedOperations = ['view', 'edit', 'activate'];
    return allowedOperations.includes(operation);
  }
  
  return true; // Active contacts allow all operations
};

export const formatContactDisplayName = (contact: any): string => {
  if (contact.type === CONTACT_FORM_TYPES.CORPORATE) {
    return contact.company_name || 'Unnamed Company';
  } else {
    const salutation = contact.salutation ? 
      SALUTATIONS.find(s => s.value === contact.salutation)?.label + ' ' : '';
    return `${salutation}${contact.name || ''}`.trim() || 'Unnamed Contact';
  }
};

export const getDuplicateWarningMessage = (duplicateReasons: string[]): string => {
  if (duplicateReasons.includes('mobile_match') && duplicateReasons.includes('email_match')) {
    return 'This contact has the same mobile number and email as another contact';
  } else if (duplicateReasons.includes('mobile_match')) {
    return 'This contact has the same mobile number as another contact';
  } else if (duplicateReasons.includes('email_match')) {
    return 'This contact has the same email address as another contact';
  }
  return 'This contact may be a duplicate';
};

// Type definitions for better TypeScript support
export type ContactFormType = typeof CONTACT_FORM_TYPES[keyof typeof CONTACT_FORM_TYPES];
export type ContactStatus = typeof CONTACT_STATUS[keyof typeof CONTACT_STATUS];
export type ContactClassification = typeof CONTACT_CLASSIFICATIONS[keyof typeof CONTACT_CLASSIFICATIONS];
export type AddressType = typeof ADDRESS_TYPES[keyof typeof ADDRESS_TYPES];
export type UserAccountStatus = typeof USER_ACCOUNT_STATUS[keyof typeof USER_ACCOUNT_STATUS];
export type ContactChannelType = typeof CONTACT_CHANNEL_TYPES[keyof typeof CONTACT_CHANNEL_TYPES];
export type ContactSource = typeof CONTACT_SOURCES[keyof typeof CONTACT_SOURCES];
export type BulkAction = typeof BULK_ACTIONS[keyof typeof BULK_ACTIONS];
export type ContactViewMode = typeof CONTACT_VIEW_MODES[keyof typeof CONTACT_VIEW_MODES];
export type AuditEvent = typeof AUDIT_EVENTS[keyof typeof AUDIT_EVENTS];

// Export all constants as a single object for easier importing
export const CONTACTS_CONSTANTS = {
  FORM_TYPES: CONTACT_FORM_TYPES,
  STATUS: CONTACT_STATUS,
  CLASSIFICATIONS: CONTACT_CLASSIFICATIONS,
  CLASSIFICATION_CONFIG: CONTACT_CLASSIFICATION_CONFIG,
  CHANNELS: CONTACT_CHANNEL_TYPES,
  ADDRESSES: ADDRESS_TYPES,
  ADDRESS_LABELS: ADDRESS_TYPE_LABELS,
  SALUTATIONS,
  USER_STATUS: USER_ACCOUNT_STATUS,
  USER_STATUS_MESSAGES,
  VALIDATION_RULES,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  PLACEHOLDER_TEXTS,
  MASTERDATA_QUERIES,
  DUPLICATE_DETECTION,
  BUSINESS_RULES,
  API_ENDPOINTS,
  UI_CONFIG,
  AUDIT_EVENTS
} as const;