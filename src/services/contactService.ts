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

  async listContacts(filters: any, userJWT: string, tenantId: string): Promise<EdgeFunctionResponse> {
    const queryParams = new URLSearchParams();
    
    // Build query parameters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          queryParams.append(key, value.join(','));
        } else {
          queryParams.append(key, String(value));
        }
      }
    });

    const url = `${this.edgeFunctionUrl}?${queryParams.toString()}`;
    return await this.makeRequest('GET', url, null, userJWT, tenantId);
  }

  async getContactById(contactId: string, userJWT: string, tenantId: string): Promise<EdgeFunctionResponse> {
    const url = `${this.edgeFunctionUrl}/${contactId}`;
    return await this.makeRequest('GET', url, null, userJWT, tenantId);
  }

  async createContact(contactData: any, userJWT: string, tenantId: string, userId: string): Promise<EdgeFunctionResponse> {
    const requestPayload = {
      ...contactData,
      tenant_id: tenantId,
      created_by: userId,
      t_userprofile_id: userId
    };

    return await this.makeRequest('POST', this.edgeFunctionUrl, requestPayload, userJWT, tenantId);
  }

  async updateContact(contactId: string, updateData: any, userJWT: string, tenantId: string, userId: string): Promise<EdgeFunctionResponse> {
    const requestPayload = {
      ...updateData,
      updated_by: userId
    };

    const url = `${this.edgeFunctionUrl}/${contactId}`;
    return await this.makeRequest('PUT', url, requestPayload, userJWT, tenantId);
  }

  async updateContactStatus(contactId: string, status: string, userJWT: string, tenantId: string): Promise<EdgeFunctionResponse> {
    const url = `${this.edgeFunctionUrl}/${contactId}`;
    return await this.makeRequest('PATCH', url, { status }, userJWT, tenantId);
  }

  async deleteContact(contactId: string, force: boolean, userJWT: string, tenantId: string): Promise<EdgeFunctionResponse> {
    const url = `${this.edgeFunctionUrl}/${contactId}`;
    return await this.makeRequest('DELETE', url, { force }, userJWT, tenantId);
  }

  async searchContacts(searchQuery: string, filters: any, userJWT: string, tenantId: string): Promise<EdgeFunctionResponse> {
    return await this.listContacts({ ...filters, search: searchQuery }, userJWT, tenantId);
  }

  async sendInvitation(contactId: string, userJWT: string, tenantId: string): Promise<EdgeFunctionResponse> {
    const url = `${this.edgeFunctionUrl}/${contactId}/invite`;
    return await this.makeRequest('POST', url, {}, userJWT, tenantId);
  }

  async checkDuplicates(contactData: any, userJWT: string, tenantId: string): Promise<EdgeFunctionResponse> {
    const url = `${this.edgeFunctionUrl}/duplicates`;
    return await this.makeRequest('POST', url, contactData, userJWT, tenantId);
  }

  // ==========================================================
  // HTTP REQUEST HANDLER
  // ==========================================================

  private async makeRequest(
    method: string,
    url: string,
    body: any,
    userJWT: string,
    tenantId: string
  ): Promise<EdgeFunctionResponse> {
    try {
      const requestBody = body ? JSON.stringify(body) : '';
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userJWT}`,
        'x-tenant-id': tenantId
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
        validation_errors: edgeResponse.validation_errors
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