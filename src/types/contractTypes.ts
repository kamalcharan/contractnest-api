// ============================================================================
// Contract DTOs - Request/Response Type Definitions
// ============================================================================
// Purpose: Define API contracts for contract & RFQ endpoints
// Pattern: API layer defines WHAT can be done (not HOW)
// ============================================================================

// ============================================================================
// ENUMS / CONSTANTS
// ============================================================================

export const CONTRACT_RECORD_TYPES = {
  CONTRACT: 'contract',
  RFQ: 'rfq'
} as const;

export const CONTRACT_STATUSES = {
  // Contract statuses
  DRAFT: 'draft',
  PENDING_REVIEW: 'pending_review',
  PENDING_ACCEPTANCE: 'pending_acceptance',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  // RFQ statuses
  SENT: 'sent',
  QUOTES_RECEIVED: 'quotes_received',
  AWARDED: 'awarded',
  CONVERTED_TO_CONTRACT: 'converted_to_contract'
} as const;

export const CONTRACT_TYPES = {
  FIXED_PRICE: 'fixed_price',
  TIME_AND_MATERIALS: 'time_and_materials',
  RETAINER: 'retainer',
  MILESTONE: 'milestone',
  SUBSCRIPTION: 'subscription'
} as const;

export const ACCEPTANCE_METHODS = {
  MANUAL: 'manual',
  AUTO: 'auto',
  DIGITAL_SIGNATURE: 'digital_signature'
} as const;

export type RecordType = typeof CONTRACT_RECORD_TYPES[keyof typeof CONTRACT_RECORD_TYPES];
export type ContractStatus = typeof CONTRACT_STATUSES[keyof typeof CONTRACT_STATUSES];
export type ContractType = typeof CONTRACT_TYPES[keyof typeof CONTRACT_TYPES];
export type AcceptanceMethod = typeof ACCEPTANCE_METHODS[keyof typeof ACCEPTANCE_METHODS];

// ============================================================================
// EQUIPMENT / ENTITY DETAIL (denormalized on t_contracts.equipment_details)
// ============================================================================

/** Single equipment or entity entry in t_contracts.equipment_details JSONB */
export interface ContractEquipmentDetail {
  id: string;
  asset_registry_id?: string | null;
  added_by_tenant_id?: string;
  added_by_role?: 'seller' | 'buyer';
  resource_type: 'equipment' | 'entity';
  category_id?: string | null;
  category_name: string;
  item_name: string;
  quantity: number;
  make?: string | null;
  model?: string | null;
  serial_number?: string | null;
  condition?: 'good' | 'fair' | 'poor' | 'critical' | null;
  criticality?: 'low' | 'medium' | 'high' | 'critical' | null;
  location?: string | null;
  purchase_date?: string | null;
  warranty_expiry?: string | null;
  area_sqft?: number | null;
  dimensions?: { length?: number; width?: number; height?: number; unit?: string } | null;
  capacity?: number | null;
  specifications?: Record<string, any>;
  notes?: string | null;
}

// ============================================================================
// REQUEST DTOs
// ============================================================================

/**
 * Create contract/RFQ request body
 * POST /api/contracts
 */
export interface CreateContractRequest {
  record_type: RecordType;
  contract_type?: ContractType;
  title: string;
  description?: string;
  acceptance_method?: AcceptanceMethod;
  start_date?: string;
  end_date?: string;
  total_value?: number;
  currency?: string;
  payment_terms?: string;
  renewal_terms?: string;
  termination_clause?: string;
  notes?: string;
  nomenclature_id?: string;
  metadata?: Record<string, any>;
  blocks?: ContractBlockInput[];
  vendors?: ContractVendorInput[];
  equipment_details?: ContractEquipmentDetail[];
}

/**
 * Update contract request body
 * PUT /api/contracts/:id
 */
export interface UpdateContractRequest {
  version: number;                    // Required for optimistic concurrency
  title?: string;
  description?: string;
  contract_type?: ContractType;
  acceptance_method?: AcceptanceMethod;
  start_date?: string;
  end_date?: string;
  total_value?: number;
  currency?: string;
  payment_terms?: string;
  renewal_terms?: string;
  termination_clause?: string;
  notes?: string;
  metadata?: Record<string, any>;
  blocks?: ContractBlockInput[];
  vendors?: ContractVendorInput[];
  equipment_details?: ContractEquipmentDetail[];
}

/**
 * Update contract status request body
 * PATCH /api/contracts/:id/status
 */
export interface UpdateContractStatusRequest {
  status: ContractStatus;
  version?: number;
  note?: string;
}

/**
 * Delete contract request body
 * DELETE /api/contracts/:id
 */
export interface DeleteContractRequest {
  version?: number;
  note?: string;
}

/**
 * Contract block input (for create/update)
 */
export interface ContractBlockInput {
  block_id: string;                   // UUID of the block template
  sort_order?: number;
  content_snapshot?: Record<string, any>;
}

/**
 * Contract vendor input (for create/update)
 */
export interface ContractVendorInput {
  contact_id: string;                 // UUID of the contact
  role?: string;
  is_primary?: boolean;
}

/**
 * List contracts query filters
 * GET /api/contracts
 */
export interface ListContractsQuery {
  record_type?: RecordType;
  contract_type?: ContractType;
  status?: ContractStatus;
  search?: string;
  page?: number;
  per_page?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

// ============================================================================
// RESPONSE DTOs
// ============================================================================

/**
 * Standard Edge function response wrapper
 */
export interface ContractEdgeResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  pagination?: ContractPagination;
}

/**
 * Pagination metadata
 */
export interface ContractPagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

/**
 * Contract list item (summary returned by get_contracts_list RPC)
 */
export interface ContractListItem {
  id: string;
  tenant_id: string;
  record_type: RecordType;
  contract_type: ContractType;
  contract_number: string;
  title: string;
  status: ContractStatus;
  total_value: number | null;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  vendor_count: number;
  block_count: number;
  nomenclature_id: string | null;
  nomenclature_code: string | null;
  nomenclature_name: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

/**
 * Contract detail (full record returned by get_contract_by_id RPC)
 */
export interface ContractDetail extends ContractListItem {
  description: string | null;
  acceptance_method: AcceptanceMethod;
  payment_terms: string | null;
  renewal_terms: string | null;
  termination_clause: string | null;
  notes: string | null;
  metadata: Record<string, any> | null;
  created_by: string;
  blocks: ContractBlockDetail[];
  vendors: ContractVendorDetail[];
  attachments: ContractAttachmentDetail[];
  history: ContractHistoryEntry[];
  equipment_details: ContractEquipmentDetail[];
}

/**
 * Contract block detail
 */
export interface ContractBlockDetail {
  id: string;
  block_id: string;
  sort_order: number;
  content_snapshot: Record<string, any> | null;
}

/**
 * Contract vendor detail
 */
export interface ContractVendorDetail {
  id: string;
  contact_id: string;
  contact_name?: string;
  role: string | null;
  is_primary: boolean;
}

/**
 * Contract attachment detail
 */
export interface ContractAttachmentDetail {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  uploaded_at: string;
}

/**
 * Contract history entry
 */
export interface ContractHistoryEntry {
  id: string;
  action: string;
  performed_by: string;
  details: Record<string, any> | null;
  created_at: string;
}

/**
 * Contract stats response (from get_contract_stats RPC)
 */
export interface ContractStatsData {
  by_status: Record<string, number>;
  by_record_type: Record<string, number>;
  by_contract_type: Record<string, number>;
  financial: {
    total_value: number;
    active_value: number;
    currency: string;
  };
  total_count: number;
}

// ============================================================================
// ERROR CODES
// ============================================================================

export type ContractErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'INVALID_TRANSITION'
  | 'DELETE_NOT_ALLOWED'
  | 'DUPLICATE_FOUND'
  | 'MISSING_TENANT_ID'
  | 'INTERNAL_ERROR'
  | 'EDGE_FUNCTION_ERROR'
  | 'NETWORK_ERROR';
