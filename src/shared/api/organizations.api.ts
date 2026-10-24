import api from '../lib/api';
import type {
  CreateInvitationPayload,
  ExternalContractor,
  ExternalContractorPayload,
  InvitationResponse,
  InviteeLookupResponse,
  JoinLinkResponse,
  JoinPageInfo,
  JoinProfilePayload,
  JoinRequestResponse,
  MemberResponse,
  MyInvitationResponse,
  OrganizationResponse,
} from '../../types/organization';

export interface CreateOrganizationPayload {
  name: string;
  description?: string | null;
}

export interface UpdateOrganizationPayload {
  name?: string;
  description?: string | null;
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

export const getMyOrganizations = async (): Promise<OrganizationResponse[]> => {
  const { data } = await api.get<OrganizationResponse[]>('/organizations/my');
  return data;
};

/** The user's personal workspace; the server creates it on first call */
export const getPersonalOrganization = async (): Promise<OrganizationResponse> => {
  const { data } = await api.post<OrganizationResponse>('/organizations/personal');
  return data;
};

export const createOrganization = async (
  payload: CreateOrganizationPayload,
): Promise<OrganizationResponse> => {
  const { data } = await api.post<OrganizationResponse>('/organizations', {
    name: payload.name,
    description: payload.description ?? null,
  });
  return data;
};

export const getOrganization = async (id: string): Promise<OrganizationResponse> => {
  const { data } = await api.get<OrganizationResponse>(`/organizations/${id}`);
  return data;
};

export const updateOrganization = async (
  orgId: string,
  payload: UpdateOrganizationPayload,
): Promise<OrganizationResponse> => {
  const { data } = await api.patch<OrganizationResponse>(`/organizations/${orgId}`, payload);
  return data;
};

export const deleteOrganization = async (orgId: string): Promise<void> => {
  await api.delete(`/organizations/${orgId}`);
};

export const transferOrganizationOwnership = async (
  orgId: string,
  newOwnerUserId: string,
): Promise<OrganizationResponse> => {
  const { data } = await api.post<OrganizationResponse>(
    `/organizations/${orgId}/transfer-ownership`,
    { new_owner_user_id: newOwnerUserId },
  );
  return data;
};

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export const getMembers = async (orgId: string): Promise<MemberResponse[]> => {
  const { data } = await api.get<MemberResponse[]>(`/organizations/${orgId}/members`);
  return data;
};

export const removeMember = async (orgId: string, userId: string): Promise<void> => {
  await api.delete(`/organizations/${orgId}/members/${userId}`);
};

export const leaveOrganization = async (orgId: string): Promise<void> => {
  await api.post(`/organizations/${orgId}/leave`);
};

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

/**
 * Add a person by email: a registered user gets an in-app invitation,
 * an unknown email gets a new inactive account + activation link.
 */
export const inviteUser = async (
  orgId: string,
  payload: CreateInvitationPayload,
): Promise<InvitationResponse> => {
  const { data } = await api.post<InvitationResponse>(
    `/organizations/${orgId}/invitations`,
    payload,
  );
  return data;
};

/** New activation link (the old one stops working) and the email once more */
export const resendInvitation = async (invitationId: string): Promise<InvitationResponse> => {
  const { data } = await api.post<InvitationResponse>(
    `/organizations/invitations/${invitationId}/resend`,
  );
  return data;
};

export const getMyInvitations = async (): Promise<MyInvitationResponse[]> => {
  const { data } = await api.get<MyInvitationResponse[]>('/organizations/invitations/my');
  return data;
};

export const acceptInvitation = async (invitationId: string): Promise<MemberResponse> => {
  const { data } = await api.post<MemberResponse>(
    `/organizations/invitations/${invitationId}/accept`,
  );
  return data;
};

export const declineInvitation = async (invitationId: string): Promise<void> => {
  await api.post(`/organizations/invitations/${invitationId}/decline`);
};

export const revokeInvitation = async (
  invitationId: string,
): Promise<InvitationResponse> => {
  const { data } = await api.post<InvitationResponse>(
    `/organizations/invitations/${invitationId}/revoke`,
  );
  return data;
};

export const listOrgInvitations = async (orgId: string): Promise<InvitationResponse[]> => {
  const { data } = await api.get<InvitationResponse[]>(`/organizations/${orgId}/invitations`);
  return data;
};

/** Owner: is there already an account with this email (manual-add form hint) */
export const lookupInvitee = async (orgId: string, email: string): Promise<InviteeLookupResponse> => {
  const { data } = await api.get<InviteeLookupResponse>(`/organizations/${orgId}/invitations/lookup`, {
    params: { email },
  });
  return data;
};

// ---------------------------------------------------------------------------
// Join link + join requests (moderated by the owner)
// ---------------------------------------------------------------------------

export const getJoinLink = async (orgId: string): Promise<JoinLinkResponse> => {
  const { data } = await api.get<JoinLinkResponse>(`/organizations/${orgId}/join-link`);
  return data;
};

export const setJoinLinkEnabled = async (orgId: string, enabled: boolean): Promise<JoinLinkResponse> => {
  const { data } = await api.patch<JoinLinkResponse>(`/organizations/${orgId}/join-link`, { enabled });
  return data;
};

/** New link — the previous one stops working */
export const regenerateJoinLink = async (orgId: string): Promise<JoinLinkResponse> => {
  const { data } = await api.post<JoinLinkResponse>(`/organizations/${orgId}/join-link/regenerate`);
  return data;
};

export const listJoinRequests = async (orgId: string): Promise<JoinRequestResponse[]> => {
  const { data } = await api.get<JoinRequestResponse[]>(`/organizations/${orgId}/join-requests`);
  return data;
};

export const approveJoinRequest = async (
  requestId: string,
  payload: { job_title?: string | null; specialization?: string | null },
): Promise<MemberResponse> => {
  const { data } = await api.post<MemberResponse>(`/organizations/join-requests/${requestId}/approve`, payload);
  return data;
};

export const rejectJoinRequest = async (requestId: string, reason?: string): Promise<JoinRequestResponse> => {
  const { data } = await api.post<JoinRequestResponse>(`/organizations/join-requests/${requestId}/reject`, {
    reason: reason?.trim() || null,
  });
  return data;
};

/** Applicant: own requests (latest per organization) */
export const getMyJoinRequests = async (): Promise<JoinRequestResponse[]> => {
  const { data } = await api.get<JoinRequestResponse[]>('/organizations/join-requests/my');
  return data;
};

export const withdrawJoinRequest = async (requestId: string): Promise<JoinRequestResponse> => {
  const { data } = await api.post<JoinRequestResponse>(`/organizations/join-requests/${requestId}/withdraw`);
  return data;
};

/** Public: organization behind a join link */
export const getJoinPage = async (token: string): Promise<JoinPageInfo> => {
  const { data } = await api.get<JoinPageInfo>(`/join/${encodeURIComponent(token)}`);
  return data;
};

/** Signed-in user applies by the link */
export const applyToJoin = async (token: string, payload: JoinProfilePayload): Promise<JoinRequestResponse> => {
  const { data } = await api.post<JoinRequestResponse>(`/join/${encodeURIComponent(token)}/apply`, payload);
  return data;
};

export interface JoinRegisterPayload extends JoinProfilePayload {
  first_name: string;
  last_name: string;
  middle_name?: string | null;
  email: string;
  phone_number?: string;
  password: string;
}

/** Public: sign up and apply in one step; stores the access token */
export const registerAndApply = async (token: string, payload: JoinRegisterPayload): Promise<JoinRequestResponse> => {
  const { data } = await api.post<{ access_token: string; request: JoinRequestResponse }>(
    `/join/${encodeURIComponent(token)}/register`,
    payload,
  );
  localStorage.setItem('access_token', data.access_token);
  return data.request;
};

// ---------------------------------------------------------------------------
// External contractors (people outside the organization, without an account)
// ---------------------------------------------------------------------------

export const listExternalContractors = async (orgId: string): Promise<ExternalContractor[]> => {
  const { data } = await api.get<ExternalContractor[]>(
    `/organizations/${orgId}/external-contractors`,
  );
  return data;
};

export const createExternalContractor = async (
  orgId: string,
  payload: ExternalContractorPayload,
): Promise<ExternalContractor> => {
  const { data } = await api.post<ExternalContractor>(
    `/organizations/${orgId}/external-contractors`,
    payload,
  );
  return data;
};

export const updateExternalContractor = async (
  orgId: string,
  contractorId: string,
  payload: Partial<ExternalContractorPayload>,
): Promise<ExternalContractor> => {
  const { data } = await api.patch<ExternalContractor>(
    `/organizations/${orgId}/external-contractors/${contractorId}`,
    payload,
  );
  return data;
};

export const deleteExternalContractor = async (orgId: string, contractorId: string): Promise<void> => {
  await api.delete(`/organizations/${orgId}/external-contractors/${contractorId}`);
};

// ---------------------------------------------------------------------------
// Public request link
// ---------------------------------------------------------------------------

export interface PublicLinkResponse {
  id: string;
  organization_id: string;
  token: string;
  is_active: boolean;
  created_at: string;
}

export const getOrCreatePublicLink = async (
  orgId: string,
): Promise<PublicLinkResponse> => {
  const { data } = await api.post<PublicLinkResponse>(
    `/organizations/${orgId}/public-request-link`,
  );
  return data;
};
