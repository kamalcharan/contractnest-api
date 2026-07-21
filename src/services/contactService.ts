// ============================================================
// FILE 2: src/services/contactService.ts (Express API Layer) - OPTIMIZED VERSION
// ============================================================

import crypto from 'crypto';

interface EdgeFunctionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  message?: string;
  validation_errors?: string[];
  duplicates?: any[];
  warning?: boolean;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

class ContactService {
  private readonly edgeFunctionUrl: string;
  private readonly internalSigningSecret: string;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const internalSigningSecret = process.env.INTERNAL_SIGNING_SECRET;

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL environment variable is not set');
    }

    if (!internalSigningSecret) {
      console.warn('⚠️ INTERNAL_SIGNING_SECRET not set. HMAC signature will be empty.');
    }

    this.edgeFunctionUrl = supabaseUrl + '/functions/v1/contacts';
    this.internalSigningSecret = internalSigningSecret || '';
  }

  // ==========================================================
  // CORE API METHODS
  // ==========================================================

  async listContacts(filters: any, userJWT: string, tenantId: string, environment: string = 'live'): Promise<EdgeFunctionResponse> {
    const queryParams = new URLSearchParams();

    // Build query parameters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (key === 'classifications' && Array.isArray(value)) {
          // FIXED: Send as comma-separated string for classifications
          queryParams.append(key, value.join(','));
        } else if (Array.isArray(value)) {
          queryParams.append(key, value.join(','));
        } else {
          queryParams.append(key, String(value));
        }
      }
    });

    const url = `${this.edgeFunctionUrl}?${queryParams.toString()}`;
    return await this.makeRequest('GET', url, null, userJWT, tenantId, environment);
  }

  async getContactById(contactId: string, userJWT: string, tenantId: string, environment: string = 'live'): Promise<EdgeFunctionResponse> {
    const url = `${this.edgeFunctionUrl}/${contactId}`;
    return await this.makeRequest('GET', url, null, userJWT, tenantId, environment);
  }

  // Proxies the edge /stats route (get_contact_stats RPC): totals, by_type,
  // by_classification, by_tag — with optional search/type/classifications/tags filters
  async getContactStats(filters: any, userJWT: string, tenantId: string, environment: string = 'live'): Promise<EdgeFunctionResponse> {
    const queryParams = new URLSearchParams();

    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        if (Array.isArray(value)) {
          if (value.length > 0) queryParams.append(key, value.join(','));
        } else {
          queryParams.append(key, String(value));
        }
      }
    });

    const query = queryParams.toString();
    const url = `${this.edgeFunctionUrl}/stats${query ? `?${query}` : ''}`;
    return await this.makeRequest('GET', url, null, userJWT, tenantId, environment);
  }

  async createContact(contactData: any, userJWT: string, tenantId: string, userId: string, environment: string = 'live'): Promise<EdgeFunctionResponse> {
    const requestPayload = {
      ...contactData,
      tenant_id: tenantId,
      created_by: userId,
      t_userprofile_id: userId
    };

    return await this.makeRequest('POST', this.edgeFunctionUrl, requestPayload, userJWT, tenantId, environment);
  }

  /**
   * Bulk import: creates contacts sequentially (one edge call per row) and
   * returns a per-row report. skipDuplicates=true lets the edge duplicate
   * check reject matches (reported as 'duplicate'); false forces creation.
   */
  async importContacts(
    rows: any[],
    skipDuplicates: boolean,
    userJWT: string,
    tenantId: string,
    userId: string,
    environment: string = 'live'
  ): Promise<EdgeFunctionResponse> {
    const results: Array<{
      index: number;
      status: 'created' | 'duplicate' | 'failed';
      contact_id?: string;
      error?: string;
    }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = { ...rows[i], force_create: !skipDuplicates };
      try {
        const result = await this.createContact(row, userJWT, tenantId, userId, environment);
        if (result.success) {
          results.push({ index: i, status: 'created', contact_id: result.data?.id });
        } else if (result.code === 'DUPLICATE_CONTACTS_FOUND') {
          results.push({ index: i, status: 'duplicate' });
        } else {
          results.push({ index: i, status: 'failed', error: result.error || 'Unknown error' });
        }
      } catch (error: any) {
        results.push({ index: i, status: 'failed', error: error?.message || 'Unexpected error' });
      }
    }

    return {
      success: true,
      data: {
        results,
        summary: {
          total: rows.length,
          created: results.filter(r => r.status === 'created').length,
          duplicates: results.filter(r => r.status === 'duplicate').length,
          failed: results.filter(r => r.status === 'failed').length
        }
      }
    };
  }

  async updateContact(contactId: string, updateData: any, userJWT: string, tenantId: string, userId: string, environment: string = 'live'): Promise<EdgeFunctionResponse> {
    const requestPayload = {
      ...updateData,
      updated_by: userId
    };

    const url = `${this.edgeFunctionUrl}/${contactId}`;
    return await this.makeRequest('PUT', url, requestPayload, userJWT, tenantId, environment);
  }

  async updateContactStatus(contactId: string, status: string, userJWT: string, tenantId: string, userId: string, userName: string | null, environment: string = 'live'): Promise<EdgeFunctionResponse> {
    const url = `${this.edgeFunctionUrl}/${contactId}`;
    return await this.makeRequest('PATCH', url, { status, performed_by: userId, performed_by_name: userName }, userJWT, tenantId, environment);
  }

  async deleteContact(contactId: string, force: boolean, userJWT: string, tenantId: string, environment: string = 'live'): Promise<EdgeFunctionResponse> {
    const url = `${this.edgeFunctionUrl}/${contactId}`;
    return await this.makeRequest('DELETE', url, { force }, userJWT, tenantId, environment);
  }

  async searchContacts(searchQuery: string, filters: any, userJWT: string, tenantId: string, environment: string = 'live'): Promise<EdgeFunctionResponse> {
    return await this.listContacts({ ...filters, search: searchQuery }, userJWT, tenantId, environment);
  }

  async sendInvitation(contactId: string, userJWT: string, tenantId: string, environment: string = 'live'): Promise<EdgeFunctionResponse> {
    const url = `${this.edgeFunctionUrl}/${contactId}/invite`;
    return await this.makeRequest('POST', url, {}, userJWT, tenantId, environment);
  }

  async checkDuplicates(contactData: any, userJWT: string, tenantId: string, environment: string = 'live'): Promise<EdgeFunctionResponse> {
    const url = `${this.edgeFunctionUrl}/duplicates`;
    return await this.makeRequest('POST', url, contactData, userJWT, tenantId, environment);
  }

  // ==========================================================
  // HTTP REQUEST HANDLER
  // ==========================================================

  private async makeRequest(
    method: string,
    url: string,
    body: any,
    userJWT: string,
    tenantId: string,
    environment: string = 'live'
  ): Promise<EdgeFunctionResponse> {
    try {
      const requestBody = body ? JSON.stringify(body) : '';

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userJWT}`,
        'x-tenant-id': tenantId,
        'x-environment': environment
      };

      // Add HMAC signature if secret is available
      if (this.internalSigningSecret) {
        headers['x-internal-signature'] = this.generateHMACSignature(requestBody);
      }

      const requestOptions: RequestInit = {
        method,
        headers
      };

      if (body) {
        requestOptions.body = requestBody;
      }

      console.log(`Making ${method} request to: ${url}`);

      const response = await fetch(url, requestOptions);
      const responseData = await response.json();

      if (!response.ok) {
        console.error('Edge function error:', responseData);
        return {
          success: false,
          error: responseData.error || 'Edge function request failed',
          code: responseData.code || 'EDGE_FUNCTION_ERROR'
        };
      }

      return responseData;
    } catch (error) {
      console.error('Network error in makeRequest:', error);
      return {
        success: false,
        error: 'Network error occurred',
        code: 'NETWORK_ERROR'
      };
    }
  }

  private generateHMACSignature(payload: string): string {
    if (!this.internalSigningSecret) {
      return '';
    }

    try {
      return crypto
        .createHmac('sha256', this.internalSigningSecret)
        .update(payload)
        .digest('hex');
    } catch (error) {
      console.error('Error generating HMAC signature:', error);
      return '';
    }
  }

  // ==========================================================
  // DATA TRANSFORMATION
  // ==========================================================

  transformForFrontend(edgeResponse: EdgeFunctionResponse): any {
    if (!edgeResponse.success) {
      return {
        success: false,
        error: edgeResponse.error,
        code: edgeResponse.code,
        validation_errors: edgeResponse.validation_errors,
        dependencies: (edgeResponse as any).dependencies
      };
    }

    if (edgeResponse.data) {
      return {
        success: true,
        data: Array.isArray(edgeResponse.data) 
          ? edgeResponse.data.map(item => this.transformContact(item))
          : this.transformContact(edgeResponse.data),
        pagination: edgeResponse.pagination,
        message: edgeResponse.message
      };
    }

    return edgeResponse;
  }

  private transformContact(contact: any): any {
    if (!contact) return contact;
    
    return {
      ...contact,
      // Ensure consistent field names
      addresses: contact.contact_addresses || contact.addresses || [],
      classifications: Array.isArray(contact.classifications) ? contact.classifications : [],
      company_registration_number: contact.company_registration_number || contact.registration_number
    };
  }
}

export default ContactService;