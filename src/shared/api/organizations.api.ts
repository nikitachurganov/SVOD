import api from '../lib/api';
import type {
  InvitationResponse,
  MemberResponse,
  MyInvitationResponse,
  OrganizationResponse,
} from '../../types/organization';

export interface CreateOrganizationPayload {
  name: string;
  description?: string | null;
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

export const getMyOrganizations = async (): Promise<OrganizationResponse[]> => {
  const { data } = await api.get<OrganizationResponse[]>('/organizations/my');
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

export const deleteOrganization = async (orgId: string): Promise<void> => {
  await api.delete(`/organizations/${orgId}`);
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

export const inviteUser = async (
  orgId: string,
  email: string,
): Promise<InvitationResponse> => {
  const { data } = await api.post<InvitationResponse>(
    `/organizations/${orgId}/invitations`,
    { email },
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
