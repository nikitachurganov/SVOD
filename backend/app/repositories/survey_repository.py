import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.survey import Survey, SurveyResponse


def _apply_filters(
    stmt,
    *,
    organization_id: uuid.UUID,
    status: str | None = None,
    created_by_user_id: uuid.UUID | None = None,
    include_archived: bool = False,
):
    stmt = stmt.where(Survey.organization_id == organization_id)
    if status is not None:
        stmt = stmt.where(Survey.status == status)
    elif not include_archived:
        stmt = stmt.where(Survey.status != "archived")
    if created_by_user_id is not None:
        stmt = stmt.where(Survey.created_by_user_id == created_by_user_id)
    return stmt


async def list_filtered(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    status: str | None = None,
    created_by_user_id: uuid.UUID | None = None,
) -> list[Survey]:
    stmt = _apply_filters(
        select(Survey),
        organization_id=organization_id,
        status=status,
        created_by_user_id=created_by_user_id,
    ).order_by(Survey.created_at.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def count_filtered(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    status: str | None = None,
    created_by_user_id: uuid.UUID | None = None,
    include_archived: bool = False,
) -> int:
    stmt = _apply_filters(
        select(func.count(Survey.id)),
        organization_id=organization_id,
        status=status,
        created_by_user_id=created_by_user_id,
        include_archived=include_archived,
    )
    result = await session.execute(stmt)
    return int(result.scalar_one() or 0)


async def get_by_id(session: AsyncSession, survey_id: uuid.UUID) -> Survey | None:
    result = await session.execute(select(Survey).where(Survey.id == survey_id))
    return result.scalar_one_or_none()


async def get_by_token(session: AsyncSession, token: str) -> Survey | None:
    result = await session.execute(select(Survey).where(Survey.public_token == token))
    return result.scalar_one_or_none()


async def create(session: AsyncSession, survey: Survey) -> Survey:
    session.add(survey)
    await session.flush()
    await session.refresh(survey)
    return survey


async def update(session: AsyncSession, survey: Survey) -> Survey:
    await session.flush()
    await session.refresh(survey)
    return survey


async def response_counts(
    session: AsyncSession, survey_ids: list[uuid.UUID]
) -> dict[uuid.UUID, int]:
    if not survey_ids:
        return {}
    stmt = (
        select(SurveyResponse.survey_id, func.count(SurveyResponse.id))
        .where(SurveyResponse.survey_id.in_(survey_ids))
        .group_by(SurveyResponse.survey_id)
    )
    result = await session.execute(stmt)
    return {sid: int(count) for sid, count in result.all()}


async def last_response_dates(
    session: AsyncSession, survey_ids: list[uuid.UUID]
) -> dict[uuid.UUID, datetime]:
    if not survey_ids:
        return {}
    stmt = (
        select(SurveyResponse.survey_id, func.max(SurveyResponse.submitted_at))
        .where(SurveyResponse.survey_id.in_(survey_ids))
        .group_by(SurveyResponse.survey_id)
    )
    result = await session.execute(stmt)
    return {sid: last for sid, last in result.all() if last is not None}


async def add_response(session: AsyncSession, response: SurveyResponse) -> SurveyResponse:
    session.add(response)
    await session.flush()
    await session.refresh(response)
    return response


async def list_responses(
    session: AsyncSession,
    survey_id: uuid.UUID,
    *,
    limit: int | None = None,
    offset: int = 0,
) -> list[SurveyResponse]:
    stmt = (
        select(SurveyResponse)
        .where(SurveyResponse.survey_id == survey_id)
        .order_by(SurveyResponse.submitted_at.desc())
        .offset(offset)
    )
    if limit is not None:
        stmt = stmt.limit(limit)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def count_responses(
    session: AsyncSession, survey_id: uuid.UUID, *, flagged_only: bool = False
) -> int:
    stmt = select(func.count(SurveyResponse.id)).where(SurveyResponse.survey_id == survey_id)
    if flagged_only:
        # JSONB may hold SQL NULL or JSON null for "no flags"; only an object means flagged
        stmt = stmt.where(func.jsonb_typeof(SurveyResponse.quality_flags) == "object")
    result = await session.execute(stmt)
    return int(result.scalar_one() or 0)


async def get_response(
    session: AsyncSession, survey_id: uuid.UUID, response_id: uuid.UUID
) -> SurveyResponse | None:
    result = await session.execute(
        select(SurveyResponse).where(
            SurveyResponse.id == response_id, SurveyResponse.survey_id == survey_id
        )
    )
    return result.scalar_one_or_none()


async def response_number(
    session: AsyncSession, survey_id: uuid.UUID, submitted_at: datetime
) -> int:
    """Ordinal of a response in the order of arrival (the first received one is 1)."""
    result = await session.execute(
        select(func.count(SurveyResponse.id)).where(
            SurveyResponse.survey_id == survey_id, SurveyResponse.submitted_at <= submitted_at
        )
    )
    return int(result.scalar_one() or 0)


async def neighbour_response_ids(
    session: AsyncSession, survey_id: uuid.UUID, submitted_at: datetime
) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    """(previous = received just before, next = received just after)."""
    older = await session.execute(
        select(SurveyResponse.id)
        .where(SurveyResponse.survey_id == survey_id, SurveyResponse.submitted_at < submitted_at)
        .order_by(SurveyResponse.submitted_at.desc())
        .limit(1)
    )
    newer = await session.execute(
        select(SurveyResponse.id)
        .where(SurveyResponse.survey_id == survey_id, SurveyResponse.submitted_at > submitted_at)
        .order_by(SurveyResponse.submitted_at.asc())
        .limit(1)
    )
    return older.scalar_one_or_none(), newer.scalar_one_or_none()


async def last_response_at(session: AsyncSession, survey_id: uuid.UUID) -> datetime | None:
    result = await session.execute(
        select(func.max(SurveyResponse.submitted_at)).where(SurveyResponse.survey_id == survey_id)
    )
    return result.scalar_one_or_none()
