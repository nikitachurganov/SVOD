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
}

export interface MyInvitationResponse extends InvitationResponse {
  organization_name: string;
}
