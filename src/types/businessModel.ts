// src/types/businessModel.ts
// UPDATED: Added product_code to PricingPlan and CreatePlanRequest

export type PlanType = 'Per User' | 'Per Contract';

// Main types that were missing
export interface PricingPlan {
  plan_id: string;
  name: string;
  description?: string;
  plan_type: PlanType;
  trial_duration: number;
  is_visible: boolean;
  is_archived: boolean;
  default_currency_code: string;
  supported_currencies: string[];
  product_code?: string;  // NEW: Multi-product support
  product_name?: string;  // NEW: Product display name
  created_at: string;
  updated_at: string;
  activeVersion?: PlanVersion;
  version_count?: number;
  subscriber_count?: number;
}

export interface PlanVersion {
  version_id: string;
  plan_id: string;
  version_number: string;
  is_active: boolean;
  effective_date: string;
  changelog?: string;
  created_by: string;
  tiers: PricingTier[];
  features: FeatureConfig[];
  notifications: NotificationConfig[];
  created_at: string;
  updated_at: string;
  tenant_count?: number;
}

export interface PricingTier {
  tier_id: string;
  min_value: number;
  max_value: number | null;
  label: string;
  prices: Record<string, number>;
}

export interface FeatureConfig {
  feature_id: string;
  name: string;
  enabled: boolean;
  limit: number;
  trial_limit: number;
  trial_enabled: boolean;
  test_env_limit: number;
  is_special_feature: boolean;
  pricing_period?: 'monthly' | 'quarterly' | 'annually';
  prices?: Record<string, number>;
}

export interface NotificationConfig {
  notif_type: string;
  category: string;
  credits_per_unit: number;
  enabled: boolean;
  prices: Record<string, number>;
}

export interface CreatePlanRequest {
  name: string;
  description?: string;
  plan_type: PlanType;
  trial_duration?: number;
  is_visible?: boolean;
  default_currency_code: string;
  supported_currencies: string[];
  product_code?: string;  // NEW: Multi-product support
  initial_version?: {
    version_number?: string;
    effective_date?: string;
    changelog?: string;
    tiers: PricingTier[];
    features: FeatureConfig[];
    notifications: NotificationConfig[];
  };
}

export interface UpdatePlanRequest {
  name?: string;
  description?: string;
  trial_duration?: number;
  is_visible?: boolean;
  default_currency_code?: string;
  supported_currencies?: string[];
}

// Keep these for backward compatibility
export interface CreateVersionRequest {
  plan_id: string;
  version_number: string;
  effective_date: string;
  changelog?: string;
  tiers: PricingTier[];
  features: FeatureConfig[];
  notifications: NotificationConfig[];
  activate_immediately?: boolean;
}

export interface VersionComparisonResult {
  version1: {
    version_id: string;
    version_number: string;
    effective_date: string;
  };
  version2: {
    version_id: string;
    version_number: string;
    effective_date: string;
  };
  newer: 'version1' | 'version2';
  tiers: {
    added: PricingTier[];
    removed: PricingTier[];
    changed: Array<{
      previous: PricingTier;
      current: PricingTier;
      differences: string[];
    }>;
    unchanged: PricingTier[];
  };
  features: {
    added: FeatureConfig[];
    removed: FeatureConfig[];
    changed: Array<{
      previous: FeatureConfig;
      current: FeatureConfig;
      differences: string[];
    }>;
    unchanged: FeatureConfig[];
  };
  notifications: {
    added: NotificationConfig[];
    removed: NotificationConfig[];
    changed: Array<{
      previous: NotificationConfig;
      current: NotificationConfig;
      differences: string[];
    }>;
    unchanged: NotificationConfig[];
  };
  summary: string;
}

// Additional types for edit workflow
export interface EditPlanData {
  plan_id: string;
  name: string;
  description: string;
  plan_type: PlanType;
  trial_duration: number;
  is_visible: boolean;
  default_currency_code: string;
  supported_currencies: string[];
  current_version_id: string;
  current_version_number: string;
  next_version_number: string;
  effective_date: string;
  changelog: string;
  tiers: PricingTier[];
  features: FeatureConfig[];
  notifications: NotificationConfig[];
}

// Response types
export interface PlanListResponse {
  plans: PricingPlan[];
  total?: number;
  page?: number;
  limit?: number;
}

export interface PlanDetailResponse extends PricingPlan {
  activeVersion: PlanVersion;
}

export interface VersionListResponse {
  versions: PlanVersion[];
  total?: number;
}
