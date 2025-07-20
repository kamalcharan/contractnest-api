// src/types/invitation.ts
export interface InvitationBase {
  email?: string;
  mobile_number?: string;
  invitation_method: 'email' | 'sms' | 'whatsapp';
  role_id?: string;
  custom_message?: string;
}

export interface InvitationCreate extends InvitationBase {
  tenant_id: string;
  invited_by: string;
}

export interface InvitationResponse extends InvitationBase {
  id: string;
  tenant_id: string;
  user_code: string;
  secret_code: string;
  status: 'pending' | 'sent' | 'resent' | 'accepted' | 'expired' | 'cancelled';
  invited_by: string;
  created_at: string;
  expires_at: string;
  invitation_link?: string;
}

export interface InvitationValidation {
  user_code: string;
  secret_code: string;
}

export interface InvitationAcceptance extends InvitationValidation {
  user_id: string;
}

export interface InvitationListResponse {
  data: InvitationResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}