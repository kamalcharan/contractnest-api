// src/controllers/contactController.ts
import { Request, Response } from 'express';
import ContactService from '../services/contactService';
import { CONTACT_STATUS, CONTACT_FORM_TYPES, CONTACT_CLASSIFICATIONS } from '../utils/constants/contacts';

// Extend Express Request to include user data from auth middleware
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    tenantId: string;
    email: string;
    role: string;
  };
  jwt?: string; // JWT token from Authorization header
}

class ContactController {
  private contactService: ContactService;

  constructor() {
    this.contactService = new ContactService();
  }

  /**
   * GET /api/contacts
   * List contacts with filtering and pagination
   */
  listContacts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { user, jwt } = req;
      if (!user || !jwt) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'UNAUTHORIZED'
        });
        return;
      }

      // Extract query parameters
      const {
        status = 'active', // Default to active contacts only (requirement #5)
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
        limit: Math.min(parseInt(limit as string, 10), 100), // Max 100 items per page
        includeInactive: includeInactive === 'true',
        includeArchived: includeArchived === 'true'
      };

      // Validate filters
      if (filters.status && !Object.values(CONTACT_STATUS).includes(filters.status as any)) {
        res.status(400).json({
          success: false,
          error: `Invalid status. Must be one of: ${Object.values(CONTACT_STATUS).join(', ')}`,
          code: 'INVALID_STATUS'
        });
        return;
      }

      if (filters.type && !Object.values(CONTACT_FORM_TYPES).includes(filters.type as any)) {
        res.status(400).json({
          success: false,
          error: `Invalid type. Must be one of: ${Object.values(CONTACT_FORM_TYPES).join(', ')}`,
          code: 'INVALID_TYPE'
        });
        return;
      }

      // Call service
      const result = await this.contactService.listContacts(filters, jwt, user.tenantId);
      const transformedResult = this.contactService.transformForFrontend(result);

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
   * GET /api/contacts/:id
   * Get single contact by ID
   */
  getContact = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { user, jwt } = req;
      const { id } = req.params;

      if (!user || !jwt) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'UNAUTHORIZED'
        });
        return;
      }

      if (!id || id.length !== 36) { // UUID validation
        res.status(400).json({
          success: false,
          error: 'Invalid contact ID format',
          code: 'INVALID_ID'
        });
        return;
      }

      const result = await this.contactService.getContactById(id, jwt, user.tenantId);
      const transformedResult = this.contactService.transformForFrontend(result);

      if (!result.success) {
        const statusCode = result.code === 'CONTACT_NOT_FOUND' ? 404 : 500;
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
  createContact = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { user, jwt } = req;
      if (!user || !jwt) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'UNAUTHORIZED'
        });
        return;
      }

      const contactData = req.body;

      // Basic validation (detailed validation happens in Edge Function)
      if (!contactData.type || !Object.values(CONTACT_FORM_TYPES).includes(contactData.type)) {
        res.status(400).json({
          success: false,
          error: `Invalid contact type. Must be one of: ${Object.values(CONTACT_FORM_TYPES).join(', ')}`,
          code: 'INVALID_TYPE'
        });
        return;
      }

      if (!contactData.classifications || !Array.isArray(contactData.classifications) || contactData.classifications.length === 0) {
        res.status(400).json({
          success: false,
          error: 'At least one classification is required',
          code: 'MISSING_CLASSIFICATIONS'
        });
        return;
      }

      // Validate classifications
      const invalidClassifications = contactData.classifications.filter(
        (c: string) => !Object.values(CONTACT_CLASSIFICATIONS).includes(c as any)
      );
      if (invalidClassifications.length > 0) {
        res.status(400).json({
          success: false,
          error: `Invalid classifications: ${invalidClassifications.join(', ')}`,
          code: 'INVALID_CLASSIFICATIONS'
        });
        return;
      }

      if (!contactData.contact_channels || !Array.isArray(contactData.contact_channels) || contactData.contact_channels.length === 0) {
        res.status(400).json({
          success: false,
          error: 'At least one contact channel is required',
          code: 'MISSING_CONTACT_CHANNELS'
        });
        return;
      }

      // Call service
      const result = await this.contactService.createContact(contactData, jwt, user.tenantId, user.id);
      const transformedResult = this.contactService.transformForFrontend(result);

      if (!result.success) {
        const statusCode = result.code === 'VALIDATION_ERROR' ? 400 : 
                          result.code === 'DUPLICATE_CONTACTS_FOUND' ? 409 : 500;
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
  updateContact = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { user, jwt } = req;
      const { id } = req.params;

      if (!user || !jwt) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'UNAUTHORIZED'
        });
        return;
      }

      if (!id || id.length !== 36) {
        res.status(400).json({
          success: false,
          error: 'Invalid contact ID format',
          code: 'INVALID_ID'
        });
        return;
      }

      const updateData = req.body;

      // Validate classifications if provided
      if (updateData.classifications && Array.isArray(updateData.classifications)) {
        const invalidClassifications = updateData.classifications.filter(
          (c: string) => !Object.values(CONTACT_CLASSIFICATIONS).includes(c as any)
        );
        if (invalidClassifications.length > 0) {
          res.status(400).json({
            success: false,
            error: `Invalid classifications: ${invalidClassifications.join(', ')}`,
            code: 'INVALID_CLASSIFICATIONS'
          });
          return;
        }
      }

      // Call service
      const result = await this.contactService.updateContact(id, updateData, jwt, user.tenantId, user.id);
      const transformedResult = this.contactService.transformForFrontend(result);

      if (!result.success) {
        const statusCode = result.code === 'CONTACT_NOT_FOUND' ? 404 :
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
  updateContactStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { user, jwt } = req;
      const { id } = req.params;
      const { status } = req.body;

      if (!user || !jwt) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'UNAUTHORIZED'
        });
        return;
      }

      if (!id || id.length !== 36) {
        res.status(400).json({
          success: false,
          error: 'Invalid contact ID format',
          code: 'INVALID_ID'
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

      // Call service
      const result = await this.contactService.updateContactStatus(id, status, jwt, user.tenantId);
      const transformedResult = this.contactService.transformForFrontend(result);

      if (!result.success) {
        const statusCode = result.code === 'CONTACT_NOT_FOUND' ? 404 : 500;
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
  deleteContact = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { user, jwt } = req;
      const { id } = req.params;
      const { force = false } = req.body;

      if (!user || !jwt) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'UNAUTHORIZED'
        });
        return;
      }

      if (!id || id.length !== 36) {
        res.status(400).json({
          success: false,
          error: 'Invalid contact ID format',
          code: 'INVALID_ID'
        });
        return;
      }

      // Call service
      const result = await this.contactService.deleteContact(id, force, jwt, user.tenantId);
      const transformedResult = this.contactService.transformForFrontend(result);

      if (!result.success) {
        const statusCode = result.code === 'CONTACT_NOT_FOUND' ? 404 : 400;
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
  searchContacts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { user, jwt } = req;
      if (!user || !jwt) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'UNAUTHORIZED'
        });
        return;
      }

      const { query, filters = {} } = req.body;

      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: 'Search query is required',
          code: 'MISSING_QUERY'
        });
        return;
      }

      // Sanitize query
      const sanitizedQuery = query.trim().substring(0, 100); // Limit query length

      // Call service
      const result = await this.contactService.searchContacts(sanitizedQuery, filters, jwt, user.tenantId);
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
   * POST /api/contacts/:id/invite
   * Send user invitation to contact
   */
  sendInvitation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { user, jwt } = req;
      const { id } = req.params;

      if (!user || !jwt) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'UNAUTHORIZED'
        });
        return;
      }

      if (!id || id.length !== 36) {
        res.status(400).json({
          success: false,
          error: 'Invalid contact ID format',
          code: 'INVALID_ID'
        });
        return;
      }

      // Call service (this will integrate with your existing user invite functionality)
      const result = await this.contactService.sendInvitation(id, jwt, user.tenantId);
      const transformedResult = this.contactService.transformForFrontend(result);

      if (!result.success) {
        const statusCode = result.code === 'CONTACT_NOT_FOUND' ? 404 : 500;
        res.status(statusCode).json(transformedResult);
        return;
      }

      res.status(200).json(transformedResult);
    } catch (error) {
      console.error('Error in sendInvitation:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send invitation',
        code: 'INTERNAL_ERROR'
      });
    }
  };

  /**
   * POST /api/contacts/duplicates
   * Check for duplicate contacts
   */
  checkDuplicates = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { user, jwt } = req;
      if (!user || !jwt) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'UNAUTHORIZED'
        });
        return;
      }

      const contactData = req.body;

      if (!contactData.contact_channels || !Array.isArray(contactData.contact_channels)) {
        res.status(400).json({
          success: false,
          error: 'Contact channels are required for duplicate checking',
          code: 'MISSING_CONTACT_CHANNELS'
        });
        return;
      }

      // Call service
      const result = await this.contactService.checkDuplicates(contactData, jwt, user.tenantId);
      const transformedResult = this.contactService.transformForFrontend(result);

      res.status(200).json(transformedResult);
    } catch (error) {
      console.error('Error in checkDuplicates:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check for duplicates',
        code: 'INTERNAL_ERROR'
      });
    }
  };

  /**
   * GET /api/contacts/stats
   * Get contact statistics for dashboard
   */
  getContactStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { user, jwt } = req;
      if (!user || !jwt) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'UNAUTHORIZED'
        });
        return;
      }

      // Get counts for different statuses and types
      const [activeContacts, inactiveContacts, archivedContacts] = await Promise.all([
        this.contactService.listContacts({ status: 'active', limit: 1 }, jwt, user.tenantId),
        this.contactService.listContacts({ status: 'inactive', limit: 1 }, jwt, user.tenantId),
        this.contactService.listContacts({ status: 'archived', limit: 1 }, jwt, user.tenantId)
      ]);

      const stats = {
        total: (activeContacts.pagination?.total || 0) + 
               (inactiveContacts.pagination?.total || 0) + 
               (archivedContacts.pagination?.total || 0),
        active: activeContacts.pagination?.total || 0,
        inactive: inactiveContacts.pagination?.total || 0,
        archived: archivedContacts.pagination?.total || 0
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
}

export default ContactController;