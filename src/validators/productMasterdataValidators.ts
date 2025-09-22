// src/validators/productMasterdataValidators.ts
import { Request } from 'express';
import { 
  ValidationResult,
  GetMasterDataRequest, 
  GetCategoriesRequest,
  GetIndustriesRequest,
  GetAllCategoriesRequest,
  GetIndustryCategoriesRequest,
  MasterDataErrorCodes 
} from '../types/productMasterdata';

/**
 * Product Master Data Validation Service
 * Handles all validation logic for product master data endpoints
 */
export class ProductMasterdataValidators {

  // =================================================================
  // EXISTING VALIDATION METHODS (Preserved for backward compatibility)
  // =================================================================

  /**
   * Validate category name format
   */
  static validateCategoryName(categoryName: string): ValidationResult {
    if (!categoryName) {
      return { 
        valid: false, 
        error: 'Category name is required' 
      };
    }

    if (typeof categoryName !== 'string') {
      return { 
        valid: false, 
        error: 'Category name must be a string' 
      };
    }

    if (categoryName.trim().length < 2) {
      return { 
        valid: false, 
        error: 'Category name must be at least 2 characters long' 
      };
    }

    if (categoryName.length > 100) {
      return { 
        valid: false, 
        error: 'Category name must be less than 100 characters' 
      };
    }

    // Check for valid characters (alphanumeric, underscore, hyphen)
    if (!/^[a-zA-Z0-9_-]+$/.test(categoryName)) {
      return { 
        valid: false, 
        error: 'Category name can only contain letters, numbers, underscores, and hyphens' 
      };
    }

    return { valid: true };
  }

  /**
   * Validate tenant ID format
   */
  static validateTenantId(tenantId: string): ValidationResult {
    if (!tenantId) {
      return { 
        valid: false, 
        error: 'Tenant ID is required' 
      };
    }

    if (typeof tenantId !== 'string') {
      return { 
        valid: false, 
        error: 'Tenant ID must be a string' 
      };
    }

    // Basic UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(tenantId)) {
      return { 
        valid: false, 
        error: 'Tenant ID must be a valid UUID format' 
      };
    }

    return { valid: true };
  }

  /**
   * Validate boolean parameter
   */
  static validateBooleanParam(value: any, paramName: string): ValidationResult {
    if (value === undefined || value === null) {
      return { valid: true }; // Optional parameter
    }

    if (typeof value === 'boolean') {
      return { valid: true };
    }

    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase();
      if (lowerValue === 'true' || lowerValue === 'false') {
        return { valid: true };
      }
    }

    return { 
      valid: false, 
      error: `${paramName} must be a boolean value (true/false)` 
    };
  }

  // =================================================================
  // NEW VALIDATION METHODS (Enhanced functionality)
  // =================================================================

  /**
   * Validate pagination parameters
   */
  static validatePaginationParams(page?: string | number, limit?: string | number): ValidationResult {
    // Convert to numbers
    const pageNum = typeof page === 'string' ? parseInt(page) : (page || 1);
    const limitNum = typeof limit === 'string' ? parseInt(limit) : (limit || 50);

    // Validate page
    if (isNaN(pageNum) || pageNum < 1) {
      return { 
        valid: false, 
        error: 'Page must be a positive integer starting from 1' 
      };
    }

    if (pageNum > 10000) {
      return { 
        valid: false, 
        error: 'Page number cannot exceed 10000' 
      };
    }

    // Validate limit
    if (isNaN(limitNum) || limitNum < 1) {
      return { 
        valid: false, 
        error: 'Limit must be a positive integer starting from 1' 
      };
    }

    if (limitNum > 100) {
      return { 
        valid: false, 
        error: 'Limit cannot exceed 100 records per page' 
      };
    }

    return { valid: true };
  }

  /**
   * Validate search parameters
   */
  static validateSearchParams(search?: string): ValidationResult {
    if (!search || search.trim() === '') {
      return { valid: true }; // Empty search is valid
    }

    if (typeof search !== 'string') {
      return { 
        valid: false, 
        error: 'Search parameter must be a string' 
      };
    }

    const trimmedSearch = search.trim();

    if (trimmedSearch.length > 0 && trimmedSearch.length < 3) {
      return { 
        valid: false, 
        error: 'Search term must be at least 3 characters long when provided' 
      };
    }

    if (trimmedSearch.length > 100) {
      return { 
        valid: false, 
        error: 'Search term cannot exceed 100 characters' 
      };
    }

    // Check for potentially harmful characters
    const dangerousChars = /[<>'"&;]/;
    if (dangerousChars.test(trimmedSearch)) {
      return { 
        valid: false, 
        error: 'Search term contains invalid characters' 
      };
    }

    return { valid: true };
  }

  /**
   * Validate industry ID format
   */
  static validateIndustryId(industryId?: string): ValidationResult {
    if (!industryId) {
      return { 
        valid: false, 
        error: 'Industry ID is required' 
      };
    }

    if (typeof industryId !== 'string') {
      return { 
        valid: false, 
        error: 'Industry ID must be a string' 
      };
    }

    if (industryId.trim().length === 0) {
      return { 
        valid: false, 
        error: 'Industry ID cannot be empty' 
      };
    }

    // Basic UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(industryId.trim())) {
      return { 
        valid: false, 
        error: 'Industry ID must be a valid UUID format' 
      };
    }

    return { valid: true };
  }

  /**
   * Validate is_primary parameter
   */
  static validateIsPrimaryParam(isPrimary?: string | boolean): ValidationResult {
    if (isPrimary === undefined || isPrimary === null) {
      return { valid: true }; // Optional parameter
    }

    if (typeof isPrimary === 'boolean') {
      return { valid: true };
    }

    if (typeof isPrimary === 'string') {
      const lowerValue = isPrimary.toLowerCase();
      if (lowerValue === 'true' || lowerValue === 'false') {
        return { valid: true };
      }
    }

    return { 
      valid: false, 
      error: 'is_primary must be a boolean value (true/false)' 
    };
  }

  // =================================================================
  // REQUEST VALIDATION METHODS (Complete request validation)
  // =================================================================

  /**
   * Validate global master data request
   */
  static validateGlobalMasterDataRequest(req: Request): ValidationResult {
    const { category_name, is_active } = req.query;

    // Validate category name (required)
    if (!category_name) {
      return { 
        valid: false, 
        error: 'category_name query parameter is required' 
      };
    }

    const categoryValidation = this.validateCategoryName(category_name as string);
    if (!categoryValidation.valid) {
      return categoryValidation;
    }

    // Validate is_active (optional)
    const isActiveValidation = this.validateBooleanParam(is_active, 'is_active');
    if (!isActiveValidation.valid) {
      return isActiveValidation;
    }

    return { valid: true };
  }

  /**
   * Validate tenant master data request
   */
  static validateTenantMasterDataRequest(req: Request): ValidationResult {
    const { category_name, is_active } = req.query;
    const tenantId = req.headers['x-tenant-id'] as string;

    // Validate tenant ID (required in header)
    if (!tenantId) {
      return { 
        valid: false, 
        error: 'x-tenant-id header is required for tenant master data' 
      };
    }

    const tenantValidation = this.validateTenantId(tenantId);
    if (!tenantValidation.valid) {
      return tenantValidation;
    }

    // Validate category name (required)
    if (!category_name) {
      return { 
        valid: false, 
        error: 'category_name query parameter is required' 
      };
    }

    const categoryValidation = this.validateCategoryName(category_name as string);
    if (!categoryValidation.valid) {
      return categoryValidation;
    }

    // Validate is_active (optional)
    const isActiveValidation = this.validateBooleanParam(is_active, 'is_active');
    if (!isActiveValidation.valid) {
      return isActiveValidation;
    }

    return { valid: true };
  }

  /**
   * Validate industries request
   */
  static validateIndustriesRequest(req: Request): ValidationResult {
    const { page, limit, search, is_active } = req.query;

    // Validate pagination parameters
    const paginationValidation = this.validatePaginationParams(
      page as string, 
      limit as string
    );
    if (!paginationValidation.valid) {
      return paginationValidation;
    }

    // Validate search parameter
    const searchValidation = this.validateSearchParams(search as string);
    if (!searchValidation.valid) {
      return searchValidation;
    }

    // Validate is_active parameter
    const isActiveValidation = this.validateBooleanParam(is_active, 'is_active');
    if (!isActiveValidation.valid) {
      return isActiveValidation;
    }

    return { valid: true };
  }

  /**
   * Validate all categories request
   */
  static validateAllCategoriesRequest(req: Request): ValidationResult {
    const { page, limit, search, is_active } = req.query;

    // Validate pagination parameters
    const paginationValidation = this.validatePaginationParams(
      page as string, 
      limit as string
    );
    if (!paginationValidation.valid) {
      return paginationValidation;
    }

    // Validate search parameter
    const searchValidation = this.validateSearchParams(search as string);
    if (!searchValidation.valid) {
      return searchValidation;
    }

    // Validate is_active parameter
    const isActiveValidation = this.validateBooleanParam(is_active, 'is_active');
    if (!isActiveValidation.valid) {
      return isActiveValidation;
    }

    return { valid: true };
  }

  /**
   * Validate industry categories request
   */
  static validateIndustryCategoriesRequest(req: Request): ValidationResult {
    const { industry_id, is_primary, page, limit, search, is_active } = req.query;

    // Validate industry ID (required)
    if (!industry_id) {
      return { 
        valid: false, 
        error: 'industry_id query parameter is required' 
      };
    }

    const industryValidation = this.validateIndustryId(industry_id as string);
    if (!industryValidation.valid) {
      return industryValidation;
    }

    // Validate is_primary parameter
    const isPrimaryValidation = this.validateIsPrimaryParam(is_primary as string);
    if (!isPrimaryValidation.valid) {
      return isPrimaryValidation;
    }

    // Validate pagination parameters
    const paginationValidation = this.validatePaginationParams(
      page as string, 
      limit as string
    );
    if (!paginationValidation.valid) {
      return paginationValidation;
    }

    // Validate search parameter
    const searchValidation = this.validateSearchParams(search as string);
    if (!searchValidation.valid) {
      return searchValidation;
    }

    // Validate is_active parameter
    const isActiveValidation = this.validateBooleanParam(is_active, 'is_active');
    if (!isActiveValidation.valid) {
      return isActiveValidation;
    }

    return { valid: true };
  }

  /**
   * Validate categories list request (existing endpoints)
   */
  static validateCategoriesListRequest(req: Request): ValidationResult {
    const { is_active } = req.query;

    // Validate is_active parameter
    const isActiveValidation = this.validateBooleanParam(is_active, 'is_active');
    if (!isActiveValidation.valid) {
      return isActiveValidation;
    }

    return { valid: true };
  }

  /**
   * Validate tenant categories list request (existing endpoints)
   */
  static validateTenantCategoriesListRequest(req: Request): ValidationResult {
    const { is_active } = req.query;
    const tenantId = req.headers['x-tenant-id'] as string;

    // Validate tenant ID (required in header)
    if (!tenantId) {
      return { 
        valid: false, 
        error: 'x-tenant-id header is required for tenant categories' 
      };
    }

    const tenantValidation = this.validateTenantId(tenantId);
    if (!tenantValidation.valid) {
      return tenantValidation;
    }

    // Validate is_active parameter
    const isActiveValidation = this.validateBooleanParam(is_active, 'is_active');
    if (!isActiveValidation.valid) {
      return isActiveValidation;
    }

    return { valid: true };
  }

  // =================================================================
  // UTILITY METHODS
  // =================================================================

  /**
   * Sanitize search input
   */
  static sanitizeSearchInput(search?: string): string {
    if (!search || typeof search !== 'string') {
      return '';
    }

    return search
      .trim()
      .replace(/[<>'"&;]/g, '') // Remove potentially harmful characters
      .substring(0, 100); // Limit length
  }

  /**
   * Parse and validate pagination values
   */
  static parsePaginationParams(page?: string, limit?: string): { page: number; limit: number } {
    const pageNum = parseInt(page || '1');
    const limitNum = parseInt(limit || '50');

    return {
      page: isNaN(pageNum) || pageNum < 1 ? 1 : Math.min(pageNum, 10000),
      limit: isNaN(limitNum) || limitNum < 1 ? 50 : Math.min(limitNum, 100)
    };
  }

  /**
   * Parse boolean parameter safely
   */
  static parseBooleanParam(value?: string | boolean, defaultValue: boolean = true): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase();
      if (lowerValue === 'false' || lowerValue === '0') {
        return false;
      }
      if (lowerValue === 'true' || lowerValue === '1') {
        return true;
      }
    }

    return defaultValue;
  }

  /**
   * Create validation error response
   */
  static createValidationErrorResponse(error: string, code: string = MasterDataErrorCodes.INVALID_CATEGORY_NAME) {
    return {
      success: false,
      error: error,
      code: code,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create validation success response with parsed parameters
   */
  static createValidationSuccessResponse(parsedParams: any) {
    return {
      success: true,
      parsed_params: parsedParams,
      timestamp: new Date().toISOString()
    };
  }
}

export default ProductMasterdataValidators;