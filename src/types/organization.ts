import type { AuthorPreview } from './author';

export interface OrganizationResponse {
  id: string;
  name: string;
  description: string | null;
  owner_user_id: string;
  owner: AuthorPreview | null;
  members_count: number;
  created_at: string;
  updated_at: string;
}

export interface MemberResponse {
  id: string;
  user: AuthorPreview;
  role_tag: 'owner' | 'member';
  joined_at: string;
  job_title?: string | null;
  specialization?: string | null;
}

export interface InvitationResponse {
  id: string;
  organization_id: string;
  email: string;
  invited_by: AuthorPreview | null;
  role_tag: string;
  status: string;
  invite_code: string;
  expires_at: string | null;
  created_at: string;
  /** existing_user — in-app invitation; new_account — invitee activates a pre-created account */
  kind?: 'existing_user' | 'new_account';
  invited_user?: AuthorPreview | null;
  job_title?: string | null;
  specialization?: string | null;
  /** Only for new-account invitations: link the owner can pass on manually */
  activation_url?: string | null;
  /** Only in create/resend responses: whether the email actually went out */
  email_sent?: boolean | null;
}

export interface CreateInvitationPayload {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  middle_name?: string | null;
  phone_number?: string | null;
  job_title?: string | null;
  specialization?: string | null;
}

export type ContractorContactKind = 'phone' | 'email' | 'telegram' | 'whatsapp' | 'other';

export interface ExternalContractor {
  id: string;
  full_name: string;
  organization: string | null;
  specialization: string | null;
  position: string | null;
  geography: string | null;
  contact_kind: ContractorContactKind | string | null;
  contact_value: string | null;
  rating: number | null;
}

export type ExternalContractorPayload = Partial<Omit<ExternalContractor, 'id' | 'rating'>> & {
  full_name: string;
};

export interface MyInvitationResponse extends InvitationResponse {
  organization_name: string;
}

export interface JoinLinkResponse {
  enabled: boolean;
  token: string | null;
  url: string | null;
}

export interface JoinPageInfo {
  organization_id: string;
  organization_name: string;
  organization_description: string | null;
  members_count: number;
}

export type JoinRequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface JoinRequestResponse {
  id: string;
  organization_id: string;
  organization_name: string;
  user: AuthorPreview | null;
  phone_number: string | null;
  status: JoinRequestStatus;
  job_title: string | null;
  specialization: string | null;
  message: string | null;
  reject_reason: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface JoinProfilePayload {
  job_title?: string | null;
  specialization?: string | null;
  message?: string | null;
}

export interface InviteeLookupResponse {
  exists: boolean;
  full_name: string | null;
  is_member: boolean;
  has_pending_invitation: boolean;
}
