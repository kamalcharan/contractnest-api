

      if (!this.isValidUUID(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid contact ID format',
          code: 'INVALID_ID'
        });
      }

      if (!status || !Object.values(CONTACT_STATUS).includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status. Must be one of: ${Object.values(CONTACT_STATUS).join(', ')}`,
          code: 'INVALID_STATUS'
        });
      }

      const result = await this.contactService.updateContactStatus(id, status, req.jwt!, req.user!.tenantId);
      this.handleResponse(res, result);
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
      const auth = this.validateAuth(req);
      if (!auth.valid) return res.status(401).json(auth.error);

      const { id } = req.params;
      const { force = false } = req.body;

      if (!this.isValidUUID(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid contact ID format',
          code: 'INVALID_ID'
        });
      }

      const result = await this.contactService.deleteContact(id, force, req.jwt!, req.user!.tenantId);
      this.handleResponse(res, result);
    } catch (error) {
      console.error('Error in deleteContact:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete contact',
        code: 'INTERNAL_ERROR'
      });
    }
  };

  // ==========================================================
  // ADDITIONAL ENDPOINTS
  // ==========================================================

  /**
   * POST /api/contacts/search
   * Advanced contact search
   */
  searchContacts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const auth = this.validateAuth(req);
      if (!auth.valid) return res.status(401).json(auth.error);

      const { query, filters = {} } = req.body;

      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Search query is required',
          code: 'MISSING_QUERY'
        });
      }

      const sanitizedQuery = query.trim().substring(0, 100);
      const result = await this.contactService.searchContacts(sanitizedQuery, filters, req.jwt!, req.user!.tenantId);
      this.handleResponse(res, result);
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
      const auth = this.validateAuth(req);
      if (!auth.valid) return res.status(401).json(auth.error);

      const { id } = req.params;

      if (!this.isValidUUID(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid contact ID format',
          code: 'INVALID_ID'
        });
      }

      const result = await this.contactService.sendInvitation(id, req.jwt!, req.user!.tenantId);
      this.handleResponse(res, result);
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
      const auth = this.validateAuth(req);
      if (!auth.valid) return res.status(401).json(auth.error);

      const contactData = req.body;

      if (!contactData.contact_channels || !Array.isArray(contactData.contact_channels)) {
        return res.status(400).json({
          success: false,
          error: 'Contact channels are required for duplicate checking',
          code: 'MISSING_CONTACT_CHANNELS'
        });
      }

      const result = await this.contactService.checkDuplicates(contactData, req.jwt!, req.user!.tenantId);
      this.handleResponse(res, result);
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
   * Get contact statistics
   */
  getContactStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const auth = this.validateAuth(req);
      if (!auth.valid) return res.status(401).json(auth.error);

      const filters = this.parseListFilters(req.query);
      
      // Get stats from multiple status queries in parallel
      const [active, inactive, archived] = await Promise.all([
        this.contactService.listContacts({ ...filters, status: 'active', limit: 1 }, req.jwt!, req.user!.tenantId),
        this.contactService.listContacts({ ...filters, status: 'inactive', limit: 1 }, req.jwt!, req.user!.tenantId),
        this.contactService.listContacts({ ...filters, status: 'archived', limit: 1 }, req.jwt!, req.user!.tenantId)
      ]);

      const stats = {
        total: (active.pagination?.total || 0) + (inactive.pagination?.total || 0) + (archived.pagination?.total || 0),
        active: active.pagination?.total || 0,
        inactive: inactive.pagination?.total || 0,
        archived: archived.pagination?.total || 0
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

  // ==========================================================
  // HELPER METHODS
  // ==========================================================

  private parseListFilters(query: any) {
    return {
      status: query.status as string,
      type: query.type as string,
      search: query.search as string,
      classifications: query.classifications ? (query.classifications as string).split(',') : undefined,
      page: query.page ? parseInt(query.page as string, 10) : 1,
      limit: query.limit ? Math.min(parseInt(query.limit as string, 10), 100) : 20,
      includeInactive: query.includeInactive === 'true',
      includeArchived: query.includeArchived === 'true',
      user_status: query.user_status as string,
      show_duplicates: query.show_duplicates === 'true',
      sort_by: query.sort_by as string,
      sort_order: query.sort_order as string
    };
  }

  private validateContactData(data: any): { valid: boolean; error?: any } {
    // Type validation
    if (!data.type || !Object.values(CONTACT_FORM_TYPES).includes(data.type)) {
      return {
        valid: false,
        error: {
          success: false,
          error: `Invalid contact type. Must be one of: ${Object.values(CONTACT_FORM_TYPES).join(', ')}`,
          code: 'INVALID_TYPE'
        }
      };
    }

    // Classifications validation
    if (!data.classifications || !Array.isArray(data.classifications) || data.classifications.length === 0) {
      return {
        valid: false,
        error: {
          success: false,
          error: 'At least one classification is required',
          code: 'MISSING_CLASSIFICATIONS'
        }
      };
    }

    const classValidation = this.validateClassifications(data.classifications);
    if (!classValidation.valid) return classValidation;

    // Channels validation
    if (!data.contact_channels || !Array.isArray(data.contact_channels) || data.contact_channels.length === 0) {
      return {
        valid: false,
        error: {
          success: false,
          error: 'At least one contact channel is required',
          code: 'MISSING_CONTACT_CHANNELS'
        }
      };
    }

    return { valid: true };
  }

  private validateClassifications(classifications: any[]): { valid: boolean; error?: any } {
    // Normalize classifications to strings
    const normalized = classifications.map(c => 
      typeof c === 'string' ? c : c?.classification_value || c?.value
    ).filter(Boolean);

    const invalidClassifications = normalized.filter(
      c => !Object.values(CONTACT_CLASSIFICATIONS).includes(c as any)
    );

    if (invalidClassifications.length > 0) {
      return {
        valid: false,
        error: {
          success: false,
          error: `Invalid classifications: ${invalidClassifications.join(', ')}`,
          code: 'INVALID_CLASSIFICATIONS'
        }
      };
    }

    return { valid: true };
  }

  private isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }
}

export default ContactController;