// src/types/integrationTypes.ts

/**
 * Integration type (category) definition
 */
export interface IntegrationType {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  icon_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Config field definition for integration providers
 */
export interface ConfigField {
  name: string;
  type: 'text' | 'password' | 'email' | 'boolean' | 'select' | 'number';
  required: boolean;
  sensitive: boolean;
  description: string | null;
  display_name: string;
  default?: any;
  options?: Array<{ label: string; value: string | number | boolean }>;
}

/**
 * Integration provider definition
 */
export interface IntegrationProvider {
  id: string;
  type_id: string;
  name: string;
  display_name: string;
  description: string | null;
  logo_url: string | null;
  is_active: boolean;
  config_schema: {
    fields: ConfigField[];
  };
  metadata: {
    support_email?: string;
    documentation_url?: string;
    [key: string]: any;
  };
  created_at: string;
  updated_at: string;
}

/**
 * Tenant integration definition
 */
export interface TenantIntegration {
  id: string;
  tenant_id: string;
  master_integration_id: string;
  is_active: boolean;
  is_live: boolean;
  credentials: Record<string, any>;
  connection_status: ConnectionStatus;
  last_verified: string | null;
  created_at: string;
  updated_at: string;
  provider?: IntegrationProvider;
}

/**
 * Credentials for an integration
 */
export type IntegrationCredentials = Record<string, any>;

/**
 * Connection status enum
 */
export enum ConnectionStatus {
  NOT_CONFIGURED = 'Not Configured',
  CONNECTED = 'Connected',
  ERROR = 'Configuration Error',
  PENDING = 'Pending Verification'
}

/**
 * Connection test result
 */
export interface ConnectionTestResult {
  success: boolean;
  message: string;
}

/**
 * Request payloads
 */
export interface CreateIntegrationRequest {
  master_integration_id: string;
  credentials: IntegrationCredentials;
  is_live?: boolean;
}

export interface UpdateIntegrationRequest {
  id: string;
  credentials?: IntegrationCredentials;
  is_active?: boolean;
  is_live?: boolean;
}

export interface TestConnectionRequest {
  provider_id: string;
  credentials: IntegrationCredentials;
}

export interface ToggleStatusRequest {
  id: string;
  is_active: boolean;
}

/**
 * Response payloads
 */
export interface IntegrationResponse {
  types: IntegrationType[];
  providers: IntegrationProvider[];
}

export interface TenantIntegrationsResponse {
  integrations: TenantIntegration[];
}

export interface IntegrationDetailResponse {
  integration: TenantIntegration;
  provider: IntegrationProvider;
}

export interface ToggleStatusResponse {
  success: boolean;
  message: string;
  integration: TenantIntegration;
}

export interface DeleteIntegrationResponse {
  success: boolean;
  message: string;
}