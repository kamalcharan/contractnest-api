// src/types/onboardingTypes.ts
// TypeScript interfaces for Onboarding functionality

/**
 * Onboarding entity - tenant onboarding configuration
 */
export interface TenantOnboarding {
  id: string;
  tenant_id: string;
  onboarding_type: 'business' | 'user';
  current_step: number;
  total_steps: number;
  completed_steps: string[];
  skipped_steps: string[];
  step_data: Record<string, any>;
  started_at: string;
  completed_at: string | null;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Onboarding step status entity
 */
export interface OnboardingStepStatus {
  id: string;
  tenant_id: string;
  step_id: string;
  step_sequence: number;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  started_at: string | null;
  completed_at: string | null;
  attempts: number;
  error_log: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

/**
 * Onboarding status response
 */
export interface OnboardingStatusResponse {
  needs_onboarding: boolean;
  onboarding: TenantOnboarding | null;
  steps: OnboardingStepStatus[];
  current_step: number;
  total_steps: number;
  completed_steps: string[];
  skipped_steps: string[];
}

/**
 * Initialize onboarding response
 */
export interface InitializeOnboardingResponse {
  id: string;
  message: string;
  is_completed?: boolean;
}

/**
 * Complete step request
 */
export interface CompleteStepRequest {
  stepId: string;
  data?: Record<string, any>;
}

/**
 * Complete step response
 */
export interface CompleteStepResponse {
  success: boolean;
  message: string;
  current_step: number;
  completed_steps: string[];
}

/**
 * Skip step request
 */
export interface SkipStepRequest {
  stepId: string;
}

/**
 * Skip step response
 */
export interface SkipStepResponse {
  success: boolean;
  message: string;
  current_step: number;
  skipped_steps: string[];
}

/**
 * Update progress request
 */
export interface UpdateProgressRequest {
  current_step?: number;
  step_data?: Record<string, any>;
}

/**
 * Generic onboarding operation result
 */
export interface OnboardingOperationResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

/**
 * Onboarding step definition
 */
export interface OnboardingStep {
  id: string;
  sequence: number;
  title: string;
  description: string;
  isRequired: boolean;
  estimatedTime?: string;
  icon?: string;
}

/**
 * Onboarding validation result
 */
export interface OnboardingValidation {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Audit metadata for onboarding operations
 */
export interface OnboardingAuditMetadata {
  operation: string;
  entity_type: 'onboarding' | 'step';
  entity_id?: string;
  step_id?: string;
  changes?: Record<string, any>;
  tenant_id: string;
  user_id?: string;
}

/**
 * Define step types
 */
export type OnboardingStepId = 'user-profile' | 'business-profile' | 'data-setup' | 'storage' | 'team' | 'tour';
export type RequiredStepId = 'user-profile' | 'business-profile';

/**
 * Constants for onboarding functionality
 */
export const ONBOARDING_CONSTANTS = {
  TYPES: {
    BUSINESS: 'business' as const,
    USER: 'user' as const,
  },
  STATUS: {
    PENDING: 'pending' as const,
    IN_PROGRESS: 'in_progress' as const,
    COMPLETED: 'completed' as const,
    SKIPPED: 'skipped' as const,
  },
  STEPS: {
    USER_PROFILE: 'user-profile' as OnboardingStepId,
    BUSINESS_PROFILE: 'business-profile' as OnboardingStepId,
    DATA_SETUP: 'data-setup' as OnboardingStepId,
    STORAGE: 'storage' as OnboardingStepId,
    TEAM: 'team' as OnboardingStepId,
    TOUR: 'tour' as OnboardingStepId,
  },
  REQUIRED_STEPS: ['user-profile', 'business-profile'] as RequiredStepId[],
  TOTAL_STEPS: 6,
} as const;

/**
 * Onboarding error codes for consistent error handling
 */
export enum OnboardingErrorCode {
  // Validation errors
  INVALID_STEP_ID = 'INVALID_STEP_ID',
  STEP_NOT_FOUND = 'STEP_NOT_FOUND',
  REQUIRED_STEP_CANNOT_SKIP = 'REQUIRED_STEP_CANNOT_SKIP',
  INVALID_STEP_DATA = 'INVALID_STEP_DATA',
  
  // Business rule errors
  ONBOARDING_ALREADY_COMPLETED = 'ONBOARDING_ALREADY_COMPLETED',
  ONBOARDING_NOT_INITIALIZED = 'ONBOARDING_NOT_INITIALIZED',
  STEP_ALREADY_COMPLETED = 'STEP_ALREADY_COMPLETED',
  PREVIOUS_STEP_NOT_COMPLETED = 'PREVIOUS_STEP_NOT_COMPLETED',
  
  // System errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * Onboarding error messages for user display
 */
export const ONBOARDING_ERROR_MESSAGES: Record<OnboardingErrorCode, string> = {
  [OnboardingErrorCode.INVALID_STEP_ID]: 'Invalid step identifier',
  [OnboardingErrorCode.STEP_NOT_FOUND]: 'Onboarding step not found',
  [OnboardingErrorCode.REQUIRED_STEP_CANNOT_SKIP]: 'Cannot skip required step',
  [OnboardingErrorCode.INVALID_STEP_DATA]: 'Invalid step data provided',
  [OnboardingErrorCode.ONBOARDING_ALREADY_COMPLETED]: 'Onboarding has already been completed',
  [OnboardingErrorCode.ONBOARDING_NOT_INITIALIZED]: 'Onboarding has not been initialized',
  [OnboardingErrorCode.STEP_ALREADY_COMPLETED]: 'This step has already been completed',
  [OnboardingErrorCode.PREVIOUS_STEP_NOT_COMPLETED]: 'Please complete the previous step first',
  [OnboardingErrorCode.DATABASE_ERROR]: 'Database operation failed',
  [OnboardingErrorCode.NETWORK_ERROR]: 'Network connection error',
  [OnboardingErrorCode.UNAUTHORIZED]: 'Authentication required',
  [OnboardingErrorCode.FORBIDDEN]: 'Insufficient permissions',
  [OnboardingErrorCode.INTERNAL_ERROR]: 'Internal server error',
};

/**
 * Type guards for runtime type checking
 */
export const OnboardingTypeGuards = {
  isValidStepId: (stepId: any): stepId is OnboardingStepId => {
    return typeof stepId === 'string' && 
           (Object.values(ONBOARDING_CONSTANTS.STEPS) as string[]).includes(stepId);
  },
  
  isRequiredStep: (stepId: string): stepId is RequiredStepId => {
    return (ONBOARDING_CONSTANTS.REQUIRED_STEPS as readonly string[]).includes(stepId);
  },
  
  isValidStatus: (status: any): status is typeof ONBOARDING_CONSTANTS.STATUS[keyof typeof ONBOARDING_CONSTANTS.STATUS] => {
    return Object.values(ONBOARDING_CONSTANTS.STATUS).includes(status);
  },
  
  isValidOnboardingType: (type: any): type is 'business' | 'user' => {
    return type === 'business' || type === 'user';
  },
};

/**
 * Utility functions for onboarding operations
 */
export const OnboardingUtils = {
  /**
   * Get step definition by ID
   */
  getStepDefinition: (stepId: string): OnboardingStep | null => {
    const steps: OnboardingStep[] = [
      {
        id: 'user-profile',
        sequence: 1,
        title: 'Your Profile',
        description: 'Set up your personal information',
        isRequired: true,
        estimatedTime: '2 min',
        icon: 'User'
      },
      {
        id: 'business-profile',
        sequence: 2,
        title: 'Business Profile',
        description: 'Tell us about your business',
        isRequired: true,
        estimatedTime: '3 min',
        icon: 'Building'
      },
      {
        id: 'data-setup',
        sequence: 3,
        title: 'Data Setup',
        description: 'Import or set up your data',
        isRequired: false,
        estimatedTime: '5 min',
        icon: 'Database'
      },
      {
        id: 'storage',
        sequence: 4,
        title: 'Storage Setup',
        description: 'Configure your file storage',
        isRequired: false,
        estimatedTime: '1 min',
        icon: 'HardDrive'
      },
      {
        id: 'team',
        sequence: 5,
        title: 'Invite Team',
        description: 'Add your team members',
        isRequired: false,
        estimatedTime: '2 min',
        icon: 'Users'
      },
      {
        id: 'tour',
        sequence: 6,
        title: 'Product Tour',
        description: 'Learn the basics',
        isRequired: false,
        estimatedTime: '3 min',
        icon: 'Map'
      }
    ];
    
    return steps.find(step => step.id === stepId) || null;
  },
  
  /**
   * Validate step completion request
   */
  validateCompleteStep: (data: CompleteStepRequest): OnboardingValidation => {
    const errors: string[] = [];
    
    if (!data.stepId) {
      errors.push(ONBOARDING_ERROR_MESSAGES[OnboardingErrorCode.INVALID_STEP_ID]);
    } else if (!OnboardingTypeGuards.isValidStepId(data.stepId)) {
      errors.push(ONBOARDING_ERROR_MESSAGES[OnboardingErrorCode.STEP_NOT_FOUND]);
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    };
  },
  
  /**
   * Validate skip step request
   */
  validateSkipStep: (data: SkipStepRequest): OnboardingValidation => {
    const errors: string[] = [];
    
    if (!data.stepId) {
      errors.push(ONBOARDING_ERROR_MESSAGES[OnboardingErrorCode.INVALID_STEP_ID]);
    } else if (!OnboardingTypeGuards.isValidStepId(data.stepId)) {
      errors.push(ONBOARDING_ERROR_MESSAGES[OnboardingErrorCode.STEP_NOT_FOUND]);
    } else if (OnboardingTypeGuards.isRequiredStep(data.stepId)) {
      errors.push(ONBOARDING_ERROR_MESSAGES[OnboardingErrorCode.REQUIRED_STEP_CANNOT_SKIP]);
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    };
  },
  
  /**
   * Calculate progress percentage
   */
  calculateProgress: (completedSteps: string[], totalSteps: number): number => {
    if (totalSteps === 0) return 0;
    return Math.round((completedSteps.length / totalSteps) * 100);
  },
  
  /**
   * Get next step ID
   */
  getNextStep: (currentStep: number): string | null => {
    const stepOrder: OnboardingStepId[] = [
      'user-profile',
      'business-profile',
      'data-setup',
      'storage',
      'team',
      'tour'
    ];
    
    if (currentStep >= 1 && currentStep < stepOrder.length) {
      return stepOrder[currentStep]; // currentStep is 1-indexed, array is 0-indexed
    }
    
    return null;
  },
  
  /**
   * Create audit metadata
   */
  createAuditMetadata: (
    operation: string,
    entityType: 'onboarding' | 'step',
    tenantId: string,
    entityId?: string,
    stepId?: string,
    changes?: Record<string, any>
  ): OnboardingAuditMetadata => {
    return {
      operation,
      entity_type: entityType,
      entity_id: entityId,
      step_id: stepId,
      changes,
      tenant_id: tenantId,
    };
  },
};