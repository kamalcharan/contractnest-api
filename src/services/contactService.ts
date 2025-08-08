// src/services/contactService.ts
import crypto from 'crypto';
import { ContactType, ContactStatus, ContactClassification } from '../types/contactTypes';

interface CreateContactRequest {
 type: ContactType;
 status?: ContactStatus;
 name?: string;
 company_name?: string;
 registration_number?: string;
 salutation?: string;
 classifications: ContactClassification[];
 contact_channels: ContactChannel[];
 addresses?: ContactAddress[];
 tags?: ContactTag[];
 compliance_numbers?: ComplianceNumber[];
 notes?: string;
 send_invitation?: boolean;
}

interface UpdateContactRequest {
 name?: string;
 company_name?: string;
 registration_number?: string;
 salutation?: string;
 classifications?: ContactClassification[];
 tags?: ContactTag[];
 compliance_numbers?: ComplianceNumber[];
 notes?: string;
}

interface ContactChannel {
 channel_type: string;
 value: string;
 country_code?: string;
 is_primary: boolean;
 is_verified?: boolean;
 notes?: string;
}

interface ContactAddress {
 type: string;
 label?: string;
 address_line1: string;
 address_line2?: string;
 city: string;
 state_code?: string;
 country_code: string;
 postal_code?: string;
 google_pin?: string;
 is_primary: boolean;
 notes?: string;
}

interface ContactTag {
 tag_value: string;
 tag_label: string;
 tag_color?: string;
}

interface ComplianceNumber {
 type_value: string;
 type_label: string;
 number: string;
 issuing_authority?: string;
 valid_from?: string;
 valid_to?: string;
 is_verified: boolean;
 notes?: string;
}

interface ListContactsFilters {
 status?: string;
 type?: string;
 search?: string;
 classifications?: string[];
 page?: number;
 limit?: number;
 includeInactive?: boolean;
 includeArchived?: boolean;
}

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
     console.warn('⚠️ INTERNAL_SIGNING_SECRET environment variable is not set. HMAC signature will be empty.');
     // Don't throw error, allow service to work without signature for development
   }

   this.edgeFunctionUrl = supabaseUrl + '/functions/v1/contacts';
   this.internalSigningSecret = internalSigningSecret || '';
 }
 
 /**
  * List contacts with filters
  */
 async listContacts(
   filters: ListContactsFilters,
   userJWT: string,
   tenantId: string
 ): Promise<EdgeFunctionResponse> {
   try {
     const queryParams = new URLSearchParams();
     
     // Build query parameters
     if (filters.status) queryParams.append('status', filters.status);
     if (filters.type) queryParams.append('type', filters.type);
     if (filters.search) queryParams.append('search', filters.search);
     if (filters.classifications) {
       queryParams.append('classifications', filters.classifications.join(','));
     }
     if (filters.page) queryParams.append('page', filters.page.toString());
     if (filters.limit) queryParams.append('limit', filters.limit.toString());
     if (filters.includeInactive) queryParams.append('includeInactive', 'true');
     if (filters.includeArchived) queryParams.append('includeArchived', 'true');

     const url = `${this.edgeFunctionUrl}?${queryParams.toString()}`;

     return await this.makeRequest('GET', url, null, userJWT, tenantId);
   } catch (error) {
     console.error('Error in listContacts:', error);
     throw new Error('Failed to list contacts');
   }
 }

 /**
  * Get contact by ID
  */
 async getContactById(
   contactId: string,
   userJWT: string,
   tenantId: string
 ): Promise<EdgeFunctionResponse> {
   try {
     const url = `${this.edgeFunctionUrl}/${contactId}`;
     return await this.makeRequest('GET', url, null, userJWT, tenantId);
   } catch (error) {
     console.error('Error in getContactById:', error);
     throw new Error('Failed to get contact');
   }
 }

 /**
  * Create new contact
  */
 async createContact(
   contactData: CreateContactRequest,
   userJWT: string,
   tenantId: string,
   userId: string
 ): Promise<EdgeFunctionResponse> {
   try {
     // Add metadata to request
     const requestPayload = {
       ...contactData,
       tenant_id: tenantId,
       created_by: userId,
       t_userprofile_id: userId // Assuming same as user ID, adjust if needed
     };

     return await this.makeRequest('POST', this.edgeFunctionUrl, requestPayload, userJWT, tenantId);
   } catch (error) {
     console.error('Error in createContact:', error);
     throw new Error('Failed to create contact');
   }
 }

 /**
  * Update existing contact
  */
 async updateContact(
   contactId: string,
   updateData: UpdateContactRequest,
   userJWT: string,
   tenantId: string,
   userId: string
 ): Promise<EdgeFunctionResponse> {
   try {
     // Add metadata to request
     const requestPayload = {
       ...updateData,
       updated_by: userId
     };

     const url = `${this.edgeFunctionUrl}/${contactId}`;
     return await this.makeRequest('PUT', url, requestPayload, userJWT, tenantId);
   } catch (error) {
     console.error('Error in updateContact:', error);
     throw new Error('Failed to update contact');
   }
 }

 /**
  * Update contact status (active/inactive/archived)
  */
 async updateContactStatus(
   contactId: string,
   status: ContactStatus,
   userJWT: string,
   tenantId: string
 ): Promise<EdgeFunctionResponse> {
   try {
     const url = `${this.edgeFunctionUrl}/${contactId}`;
     const requestPayload = { status };

     return await this.makeRequest('PATCH', url, requestPayload, userJWT, tenantId);
   } catch (error) {
     console.error('Error in updateContactStatus:', error);
     throw new Error('Failed to update contact status');
   }
 }

 /**
  * Delete (archive) contact
  */
 async deleteContact(
   contactId: string,
   force: boolean = false,
   userJWT: string,
   tenantId: string
 ): Promise<EdgeFunctionResponse> {
   try {
     const url = `${this.edgeFunctionUrl}/${contactId}`;
     const requestPayload = { force };

     return await this.makeRequest('DELETE', url, requestPayload, userJWT, tenantId);
   } catch (error) {
     console.error('Error in deleteContact:', error);
     throw new Error('Failed to delete contact');
   }
 }

 /**
  * Search contacts (advanced search)
  */
 async searchContacts(
   searchQuery: string,
   filters: ListContactsFilters,
   userJWT: string,
   tenantId: string
 ): Promise<EdgeFunctionResponse> {
   try {
     // Use the list endpoint with search parameter
     return await this.listContacts(
       { ...filters, search: searchQuery },
       userJWT,
       tenantId
     );
   } catch (error) {
     console.error('Error in searchContacts:', error);
     throw new Error('Failed to search contacts');
   }
 }

 /**
  * Send user invitation to contact
  */
 async sendInvitation(
   contactId: string,
   userJWT: string,
   tenantId: string
 ): Promise<EdgeFunctionResponse> {
   try {
     // This would integrate with your existing user invite functionality
     // For now, return a placeholder response
     const url = `${this.edgeFunctionUrl}/${contactId}/invite`;
     const requestPayload = {};

     return await this.makeRequest('POST', url, requestPayload, userJWT, tenantId);
   } catch (error) {
     console.error('Error in sendInvitation:', error);
     throw new Error('Failed to send invitation');
   }
 }

 /**
  * Check for duplicate contacts
  */
 async checkDuplicates(
   contactData: Partial<CreateContactRequest>,
   userJWT: string,
   tenantId: string
 ): Promise<EdgeFunctionResponse> {
   try {
     const url = `${this.edgeFunctionUrl}/duplicates`;
     return await this.makeRequest('POST', url, contactData, userJWT, tenantId);
   } catch (error) {
     console.error('Error in checkDuplicates:', error);
     throw new Error('Failed to check for duplicates');
   }
 }

 /**
  * Private method to make HMAC-signed requests to Edge Functions
  */
 private async makeRequest(
   method: string,
   url: string,
   body: any,
   userJWT: string,
   tenantId: string
 ): Promise<EdgeFunctionResponse> {
   try {
     const requestBody = body ? JSON.stringify(body) : '';
     
     // Generate HMAC signature for internal API authentication
     const signature = this.generateHMACSignature(requestBody);

     const headers: Record<string, string> = {
       'Content-Type': 'application/json',
       'Authorization': `Bearer ${userJWT}`, // Forward user JWT
       'x-tenant-id': tenantId              // Tenant context
     };

     // Only add signature header if we have a signing secret
     if (this.internalSigningSecret) {
       headers['x-internal-signature'] = signature;
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

 /**
  * Generate HMAC signature for internal API authentication
  */
 private generateHMACSignature(payload: string): string {
   if (!this.internalSigningSecret) {
     console.warn('⚠️ Cannot generate HMAC signature: INTERNAL_SIGNING_SECRET not set');
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

 /**
  * Transform Edge Function response for frontend consumption
  */
 transformForFrontend(edgeResponse: EdgeFunctionResponse): any {
   if (!edgeResponse.success) {
     return {
       success: false,
       error: edgeResponse.error,
       code: edgeResponse.code,
       validation_errors: edgeResponse.validation_errors
     };
   }

   // Transform contact data for frontend
   if (edgeResponse.data) {
     return {
       success: true,
       data: this.transformContactData(edgeResponse.data),
       pagination: edgeResponse.pagination,
       message: edgeResponse.message
     };
   }

   return edgeResponse;
 }

 /**
  * Transform contact data structure for frontend
  */
 private transformContactData(data: any): any {
   if (Array.isArray(data)) {
     return data.map(contact => this.transformSingleContact(contact));
   }
   return this.transformSingleContact(data);
 }

 /**
  * Transform single contact for frontend consumption
  */
 private transformSingleContact(contact: any): any {
   return {
     id: contact.id,
     type: contact.type,
     status: contact.status,
     
     // Individual fields
     name: contact.name,
     salutation: contact.salutation,
     
     // Corporate fields
     company_name: contact.company_name,
     registration_number: contact.registration_number,
     
     // Common fields
     classifications: contact.classifications || [],
     tags: contact.tags || [],
     compliance_numbers: contact.compliance_numbers || [],
     notes: contact.notes,
     
     // Related data
     contact_channels: contact.contact_channels || [],
     contact_addresses: contact.contact_addresses || [],
     contact_persons: contact.contact_persons || [],
     
     // Metadata
     potential_duplicate: contact.potential_duplicate,
     duplicate_reasons: contact.duplicate_reasons || [],
     
     // Timestamps
     created_at: contact.created_at,
     updated_at: contact.updated_at
   };
 }
}

export default ContactService;