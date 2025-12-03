// src/controllers/contactController.ts
import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import ContactService from '../services/contactService';
import { CONTACT_STATUS, CONTACT_FORM_TYPES, CONTACT_CLASSIFICATIONS } from '../utils/constants/contacts';

class ContactController {
  private contactService: ContactService;

  constructor() {
    this.contactService = new ContactService();
  }

  /**
   * GET /api/contacts
   * List contacts with filtering and pagination
   */
  listContacts = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = req.headers['x-environment'] as string || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: 'Tenant ID is required',
          code: 'MISSING_TENANT_ID'
        });
        return;
      }

      // Extract query parameters
      const {
        status = 'active',
        type,
        search,
        classifications,
        page = '1',
        limit = '20',
        includeInactive = 'false',
        includeArchived = 'false'
      } = req.query;

      // Build filters object
      const filters = {
        status: status as string,
        type: type as string,
        search: search as string,
        classifications: classifications ? (classifications as string).split(',') : undefined,
        page: parseInt(page as string, 10),
        limit: Math.min(parseInt(limit as string, 10), 100),
        includeInactive: includeInactive === 'true',
        includeArchived: includeArchived === 'true'
      };

      // Call service
      const result = await this.contactService.listContacts(filters, userJWT, tenantId, environment);
      const transformedResult = this.contactService.transformForFrontend(result);

      if (!result.success) {
        res.status(400).json(transformedResult);
        return;
      }

      res.status(200).json(transformedResult);
    } catch (error) {
      console.error('Error in listContacts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list contacts',
        code: 'INTERNAL_ERROR'
      });
    }
  };

  /**
   * GET /api/contacts/stats
   * Get contact statistics for dashboard
   */
  getContactStats = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = req.headers['x-environment'] as string || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: 'Tenant ID is required',
          code: 'MISSING_TENANT_ID'
        });
        return;
      }

      // Get counts for different statuses
      const [activeResult, inactiveResult, archivedResult] = await Promise.all([
        this.contactService.listContacts({ status: 'active', limit: 1 }, userJWT, tenantId, environment),
        this.contactService.listContacts({ status: 'inactive', limit: 1 }, userJWT, tenantId, environment),
        this.contactService.listContacts({ status: 'archived', limit: 1 }, userJWT, tenantId, environment)
      ]);

      const stats = {
        total: (activeResult.pagination?.total || 0) + 
               (inactiveResult.pagination?.total || 0) + 
               (archivedResult.pagination?.total || 0),
        active: activeResult.pagination?.total || 0,
        inactive: inactiveResult.pagination?.total || 0,
        archived: archivedResult.pagination?.total || 0,
        byType: {
          individual: 0,
          corporate: 0
        }
      };

      res.status(200).json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error in getContactStats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get contact statistics',
        code: 'INTERNAL_ERROR'
      });
    }
  };

  /**
   * GET /api/contacts/:id
   * Get single contact by ID
   */
  getContact = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = req.headers['x-environment'] as string || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: 'Tenant ID is required',
          code: 'MISSING_TENANT_ID'
        });
        return;
      }

      const result = await this.contactService.getContactById(id, userJWT, tenantId, environment);
      const transformedResult = this.contactService.transformForFrontend(result);

      if (!result.success) {
        const statusCode = result.code === 'NOT_FOUND' ? 404 : 400;
        res.status(statusCode).json(transformedResult);
        return;
      }

      res.status(200).json(transformedResult);
    } catch (error) {
      console.error('Error in getContact:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get contact',
        code: 'INTERNAL_ERROR'
      });
    }
  };

  /**
   * POST /api/contacts
   * Create new contact
   */
  createContact = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = req.headers['x-environment'] as string || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const userId = req.user?.id || '';

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: 'Tenant ID is required',
          code: 'MISSING_TENANT_ID'
        });
        return;
      }

      const result = await this.contactService.createContact(
        req.body,
        userJWT,
        tenantId,
        userId,
        environment
      );
      
      const transformedResult = this.contactService.transformForFrontend(result);

      if (!result.success) {
        const statusCode = result.code === 'VALIDATION_ERROR' ? 400 : 
                          result.code === 'DUPLICATE_FOUND' ? 409 : 500;
        res.status(statusCode).json(transformedResult);
        return;
      }

      res.status(201).json(transformedResult);
    } catch (error) {
      console.error('Error in createContact:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create contact',
        code: 'INTERNAL_ERROR'
      });
    }
  };

  /**
   * PUT /api/contacts/:id
   * Update existing contact
   */
  updateContact = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = req.headers['x-environment'] as string || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';
      const userId = req.user?.id || '';

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: 'Tenant ID is required',
          code: 'MISSING_TENANT_ID'
        });
        return;
      }

      const result = await this.contactService.updateContact(
        id,
        req.body,
        userJWT,
        tenantId,
        userId,
        environment
      );
      
      const transformedResult = this.contactService.transformForFrontend(result);

      if (!result.success) {
        const statusCode = result.code === 'NOT_FOUND' ? 404 : 
                          result.code === 'VALIDATION_ERROR' ? 400 : 500;
        res.status(statusCode).json(transformedResult);
        return;
      }

      res.status(200).json(transformedResult);
    } catch (error) {
      console.error('Error in updateContact:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update contact',
        code: 'INTERNAL_ERROR'
      });
    }
  };

  /**
   * PATCH /api/contacts/:id/status
   * Update contact status only
   */
  updateContactStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = req.headers['x-environment'] as string || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: 'Tenant ID is required',
          code: 'MISSING_TENANT_ID'
        });
        return;
      }

      if (!status || !Object.values(CONTACT_STATUS).includes(status)) {
        res.status(400).json({
          success: false,
          error: `Invalid status. Must be one of: ${Object.values(CONTACT_STATUS).join(', ')}`,
          code: 'INVALID_STATUS'
        });
        return;
      }

      const result = await this.contactService.updateContactStatus(
        id,
        status,
        userJWT,
        tenantId,
        environment
      );
      
      const transformedResult = this.contactService.transformForFrontend(result);

      if (!result.success) {
        const statusCode = result.code === 'NOT_FOUND' ? 404 : 400;
        res.status(statusCode).json(transformedResult);
        return;
      }

      res.status(200).json(transformedResult);
    } catch (error) {
      console.error('Error in updateContactStatus:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update contact status',
        code: 'INTERNAL_ERROR'
      });
    }
  };

  /**
   * DELETE /api/contacts/:id
   * Delete (archive) contact
   */
  deleteContact = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { force = false } = req.body;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = req.headers['x-environment'] as string || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: 'Tenant ID is required',
          code: 'MISSING_TENANT_ID'
        });
        return;
      }

      const result = await this.contactService.deleteContact(
        id,
        force,
        userJWT,
        tenantId,
        environment
      );
      
      const transformedResult = this.contactService.transformForFrontend(result);

      if (!result.success) {
        const statusCode = result.code === 'NOT_FOUND' ? 404 : 400;
        res.status(statusCode).json(transformedResult);
        return;
      }

      res.status(200).json(transformedResult);
    } catch (error) {
      console.error('Error in deleteContact:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete contact',
        code: 'INTERNAL_ERROR'
      });
    }
  };

  /**
   * POST /api/contacts/search
   * Advanced contact search
   */
  searchContacts = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { query, filters = {} } = req.body;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = req.headers['x-environment'] as string || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: 'Tenant ID is required',
          code: 'MISSING_TENANT_ID'
        });
        return;
      }

      const result = await this.contactService.searchContacts(
        query,
        filters,
        userJWT,
        tenantId,
        environment
      );
      
      const transformedResult = this.contactService.transformForFrontend(result);

      res.status(200).json(transformedResult);
    } catch (error) {
      console.error('Error in searchContacts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to search contacts',
        code: 'INTERNAL_ERROR'
      });
    }
  };

  /**
   * POST /api/contacts/duplicates
   * Check for potential duplicate contacts
   */
  checkDuplicates = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = req.headers['x-environment'] as string || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: 'Tenant ID is required',
          code: 'MISSING_TENANT_ID'
        });
        return;
      }

      const result = await this.contactService.checkDuplicates(
        req.body,
        userJWT,
        tenantId,
        environment
      );
      
      res.status(200).json(result);
    } catch (error) {
      console.error('Error in checkDuplicates:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check duplicates',
        code: 'INTERNAL_ERROR'
      });
    }
  };

  /**
   * POST /api/contacts/:id/invite
   * Send user invitation to contact
   */
  sendInvitation = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const tenantId = req.headers['x-tenant-id'] as string;
      const environment = req.headers['x-environment'] as string || 'live';
      const userJWT = req.headers.authorization?.replace('Bearer ', '') || '';

      if (!tenantId) {
        res.status(400).json({
          success: false,
          error: 'Tenant ID is required',
          code: 'MISSING_TENANT_ID'
        });
        return;
      }

      const result = await this.contactService.sendInvitation(
        id,
        userJWT,
        tenantId,
        environment
      );
      
      if (!result.success) {
        const statusCode = result.code === 'NOT_FOUND' ? 404 : 400;
        res.status(statusCode).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('Error in sendInvitation:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send invitation',
        code: 'INTERNAL_ERROR'
      });
    }
  };
}

export default ContactController;