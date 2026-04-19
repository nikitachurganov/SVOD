import uuid

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.external_contractor import (
    CreateExternalContractorPayload,
    ExternalContractorResponse,
)
from app.schemas.organization import (
    CreateInvitationRequest,
    CreateOrganizationRequest,
    InvitationResponse,
    InvitationWithOrgResponse,
    MemberResponse,
    OrganizationResponse,
    TransferOwnershipRequest,
    UpdateOrganizationRequest,
    UpdateRoleRequest,
)
from app.schemas.public_link import PublicLinkResponse
from app.services import organization_service, public_link_service

router = APIRouter()


# ---------------------------------------------------------------------------
# Organizations
# ---------------------------------------------------------------------------

@router.post("", response_model=OrganizationResponse, status_code=201)
async def create_organization(
    payload: CreateOrganizationRequest,
    session: DbSession,
    user: CurrentUser,
) -> OrganizationResponse:
    return await organization_service.create_organization(session, payload, user)


@router.get("/my", response_model=list[OrganizationResponse])
async def get_my_organizations(
    session: DbSession, user: CurrentUser
) -> list[OrganizationResponse]:
    return await organization_service.get_my_organizations(session, user)


@router.get("/{organization_id}", response_model=OrganizationResponse)
async def get_organization(
    organization_id: uuid.UUID,
    session: DbSession,
    user: CurrentUser,
) -> OrganizationResponse:
    return await organization_service.get_organization(session, organization_id, user)


@router.patch("/{organization_id}", response_model=OrganizationResponse)
async def update_organization(
    organization_id: uuid.UUID,
    payload: UpdateOrganizationRequest,
    session: DbSession,
    user: CurrentUser,
) -> OrganizationResponse:
    return await organization_service.update_organization(
        session, organization_id, payload, user
    )


@router.delete("/{organization_id}", status_code=204)
async def delete_organization(
    organization_id: uuid.UUID,
    session: DbSession,
    user: CurrentUser,
) -> None:
    await organization_service.delete_organization(session, organization_id, user)


@router.post(
    "/{organization_id}/transfer-ownership",
    response_model=OrganizationResponse,
)
async def transfer_organization_ownership(
    organization_id: uuid.UUID,
    payload: TransferOwnershipRequest,
    session: DbSession,
    user: CurrentUser,
) -> OrganizationResponse:
    return await organization_service.transfer_organization_ownership(
        session, organization_id, payload, user
    )


# ---------------------------------------------------------------------------
# Members
# ---------------------------------------------------------------------------

@router.get("/{organization_id}/members", response_model=list[MemberResponse])
async def list_members(
    organization_id: uuid.UUID,
    session: DbSession,
    user: CurrentUser,
) -> list[MemberResponse]:
    return await organization_service.list_members(session, organization_id, user)


@router.delete("/{organization_id}/members/{user_id}", status_code=204)
async def remove_member(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    session: DbSession,
    user: CurrentUser,
) -> None:
    await organization_service.remove_member(session, organization_id, user_id, user)


@router.patch(
    "/{organization_id}/members/{user_id}/role",
    response_model=MemberResponse,
)
async def update_member_role(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: UpdateRoleRequest,
    session: DbSession,
    user: CurrentUser,
) -> MemberResponse:
    return await organization_service.update_member_role(
        session, organization_id, user_id, payload, user
    )


@router.post(
    "/{organization_id}/external-contractors",
    response_model=ExternalContractorResponse,
    status_code=201,
)
async def create_external_contractor(
    organization_id: uuid.UUID,
    payload: CreateExternalContractorPayload,
    session: DbSession,
    user: CurrentUser,
) -> ExternalContractorResponse:
    return await organization_service.create_external_contractor(
        session, organization_id, payload, user
    )


@router.post("/{organization_id}/leave", status_code=204)
async def leave_organization(
    organization_id: uuid.UUID,
    session: DbSession,
    user: CurrentUser,
) -> None:
    await organization_service.leave_organization(session, organization_id, user)


# ---------------------------------------------------------------------------
# Invitations
# Note: static sub-paths (/my) must be declared before dynamic ones
# (/{organization_id}/...) at the same depth to avoid routing conflicts.
# ---------------------------------------------------------------------------

@router.get("/invitations/my", response_model=list[InvitationWithOrgResponse])
async def get_my_invitations(
    session: DbSession,
    user: CurrentUser,
) -> list[InvitationWithOrgResponse]:
    return await organization_service.get_my_invitations(session, user)


@router.post(
    "/invitations/{invitation_id}/accept",
    response_model=MemberResponse,
)
async def accept_invitation(
    invitation_id: uuid.UUID,
    session: DbSession,
    user: CurrentUser,
) -> MemberResponse:
    return await organization_service.accept_invitation(session, invitation_id, user)


@router.post("/invitations/{invitation_id}/decline", status_code=204)
async def decline_invitation(
    invitation_id: uuid.UUID,
    session: DbSession,
    user: CurrentUser,
) -> None:
    await organization_service.decline_invitation(session, invitation_id, user)


@router.post(
    "/invitations/{invitation_id}/revoke",
    response_model=InvitationResponse,
)
async def revoke_invitation(
    invitation_id: uuid.UUID,
    session: DbSession,
    user: CurrentUser,
) -> InvitationResponse:
    return await organization_service.revoke_invitation(session, invitation_id, user)


@router.post("/{organization_id}/invitations", response_model=InvitationResponse, status_code=201)
async def create_invitation(
    organization_id: uuid.UUID,
    payload: CreateInvitationRequest,
    session: DbSession,
    user: CurrentUser,
) -> InvitationResponse:
    return await organization_service.create_invitation(
        session, organization_id, payload, user
    )


@router.get("/{organization_id}/invitations", response_model=list[InvitationResponse])
async def list_invitations(
    organization_id: uuid.UUID,
    session: DbSession,
    user: CurrentUser,
) -> list[InvitationResponse]:
    return await organization_service.list_invitations(session, organization_id, user)


# ---------------------------------------------------------------------------
# Public request link
# ---------------------------------------------------------------------------

@router.post(
    "/{organization_id}/public-request-link",
    response_model=PublicLinkResponse,
    status_code=201,
)
async def create_public_request_link(
    organization_id: uuid.UUID,
    session: DbSession,
    user: CurrentUser,
) -> PublicLinkResponse:
    return await public_link_service.get_or_create_link(session, organization_id, user)


@router.get(
    "/{organization_id}/public-request-link",
    response_model=PublicLinkResponse | None,
)
async def get_public_request_link(
    organization_id: uuid.UUID,
    session: DbSession,
    user: CurrentUser,
) -> PublicLinkResponse | None:
    return await public_link_service.get_or_create_link(session, organization_id, user)
