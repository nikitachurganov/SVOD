import uuid
from datetime import datetime

from sqlalchemy import delete, func, select, tuple_
# Renamed: this module has its own ``update(session, survey)``
from sqlalchemy import update as sql_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization import Organization
from app.models.survey import Survey, SurveyProject, SurveyResponse

# The sample project every personal workspace starts with (see welcome_seed_service)
WELCOME_PROJECT_NAME = "Добро пожаловать"


def _in_quota():
    """The responses the owner can see.

    Those received beyond the response quota are locked: kept, but out of lists, counts and
    analysis until the plan grows. Only ``count_responses(include_locked=True)`` sees them.
    """
    return SurveyResponse.locked.is_(False)


def _apply_filters(
    stmt,
    *,
    organization_id: uuid.UUID,
    status: str | None = None,
    created_by_user_id: uuid.UUID | None = None,
    include_archived: bool = False,
    project_id: uuid.UUID | None = None,
):
    stmt = stmt.where(Survey.organization_id == organization_id)
    if project_id is not None:
        stmt = stmt.where(Survey.project_id == project_id)
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
    project_id: uuid.UUID | None = None,
) -> list[Survey]:
    stmt = _apply_filters(
        select(Survey),
        organization_id=organization_id,
        status=status,
        created_by_user_id=created_by_user_id,
        project_id=project_id,
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
    project_id: uuid.UUID | None = None,
) -> int:
    stmt = _apply_filters(
        select(func.count(Survey.id)),
        organization_id=organization_id,
        status=status,
        created_by_user_id=created_by_user_id,
        include_archived=include_archived,
        project_id=project_id,
    )
    result = await session.execute(stmt)
    return int(result.scalar_one() or 0)


# ─── Projects ─────────────────────────────────────────────────────────────────


async def list_projects(
    session: AsyncSession, organization_id: uuid.UUID
) -> list[SurveyProject]:
    result = await session.execute(
        select(SurveyProject)
        .where(SurveyProject.organization_id == organization_id)
        .order_by(SurveyProject.created_at.desc(), SurveyProject.id)
    )
    return list(result.scalars().all())


async def get_project(session: AsyncSession, project_id: uuid.UUID) -> SurveyProject | None:
    result = await session.execute(select(SurveyProject).where(SurveyProject.id == project_id))
    return result.scalar_one_or_none()


async def get_default_project(
    session: AsyncSession, organization_id: uuid.UUID
) -> SurveyProject | None:
    """The oldest project of the organization — the target for a survey created without one.

    The sample «Добро пожаловать» project is skipped: user surveys must not land in it."""
    result = await session.execute(
        select(SurveyProject)
        .where(
            SurveyProject.organization_id == organization_id,
            SurveyProject.name != WELCOME_PROJECT_NAME,
        )
        .order_by(SurveyProject.created_at, SurveyProject.id)
        .limit(1)
    )
    return result.scalar_one_or_none()


async def create_project(session: AsyncSession, project: SurveyProject) -> SurveyProject:
    session.add(project)
    await session.flush()
    await session.refresh(project)
    return project


async def update_project(session: AsyncSession, project: SurveyProject) -> SurveyProject:
    await session.flush()
    await session.refresh(project)
    return project


async def delete_project(session: AsyncSession, project: SurveyProject) -> None:
    await session.delete(project)
    await session.flush()


async def survey_counts_by_project(
    session: AsyncSession, project_ids: list[uuid.UUID]
) -> dict[uuid.UUID, int]:
    """Surveys per project, archived ones not counted (as in the project's table)."""
    if not project_ids:
        return {}
    result = await session.execute(
        select(Survey.project_id, func.count(Survey.id))
        .where(Survey.project_id.in_(project_ids), Survey.status != "archived")
        .group_by(Survey.project_id)
    )
    return {pid: int(count) for pid, count in result.all()}


async def count_all_in_project(session: AsyncSession, project_id: uuid.UUID) -> int:
    """Every survey of the project, archived included — they still hold collected answers."""
    result = await session.execute(
        select(func.count(Survey.id)).where(Survey.project_id == project_id)
    )
    return int(result.scalar_one() or 0)


async def count_open_surveys_for_owner(session: AsyncSession, owner_user_id: uuid.UUID) -> int:
    """Published surveys in the organizations the user owns: what the plan's limit counts."""
    result = await session.execute(
        select(func.count(Survey.id))
        .join(Organization, Organization.id == Survey.organization_id)
        .where(Organization.owner_user_id == owner_user_id, Survey.status == "open")
    )
    return int(result.scalar_one() or 0)


async def count_projects_for_owner(session: AsyncSession, owner_user_id: uuid.UUID) -> int:
    """The user's own projects; the sample «Добро пожаловать» one is not theirs and is not counted."""
    result = await session.execute(
        select(func.count(SurveyProject.id))
        .join(Organization, Organization.id == SurveyProject.organization_id)
        .where(
            Organization.owner_user_id == owner_user_id,
            SurveyProject.name != WELCOME_PROJECT_NAME,
        )
    )
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
        .where(SurveyResponse.survey_id.in_(survey_ids), _in_quota())
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
        .where(SurveyResponse.survey_id.in_(survey_ids), _in_quota())
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
        .where(SurveyResponse.survey_id == survey_id, _in_quota())
        .order_by(SurveyResponse.submitted_at.desc(), SurveyResponse.id.desc())
        .offset(offset)
    )
    if limit is not None:
        stmt = stmt.limit(limit)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def count_responses(
    session: AsyncSession,
    survey_id: uuid.UUID,
    *,
    flagged_only: bool = False,
    include_locked: bool = False,
) -> int:
    """Responses of the survey; ``include_locked`` also counts those the quota kept back."""
    stmt = select(func.count(SurveyResponse.id)).where(SurveyResponse.survey_id == survey_id)
    if not include_locked:
        stmt = stmt.where(_in_quota())
    if flagged_only:
        # JSONB may hold SQL NULL or JSON null for "no flags"; only an object means flagged
        stmt = stmt.where(func.jsonb_typeof(SurveyResponse.quality_flags) == "object")
    result = await session.execute(stmt)
    return int(result.scalar_one() or 0)


async def delete_demo_responses(session: AsyncSession, survey_id: uuid.UUID) -> int:
    """Removes the responses generated for the guided tour (marked ``demo`` in respondent_meta)."""
    stmt = delete(SurveyResponse).where(
        SurveyResponse.survey_id == survey_id,
        SurveyResponse.respondent_meta["demo"].astext == "true",
    )
    result = await session.execute(stmt)
    return int(result.rowcount or 0)


async def get_response(
    session: AsyncSession, survey_id: uuid.UUID, response_id: uuid.UUID
) -> SurveyResponse | None:
    result = await session.execute(
        select(SurveyResponse).where(
            SurveyResponse.id == response_id,
            SurveyResponse.survey_id == survey_id,
            _in_quota(),
        )
    )
    return result.scalar_one_or_none()


def _numbered(survey_id: uuid.UUID):
    """Every visible response of the survey with its ordinal in the order of arrival (first = 1)."""
    return (
        select(
            SurveyResponse.id.label("rid"),
            func.row_number()
            .over(order_by=(SurveyResponse.submitted_at, SurveyResponse.id))
            .label("n"),
        )
        .where(SurveyResponse.survey_id == survey_id, _in_quota())
        .subquery()
    )


def _flagged_condition(flagged: bool):
    # JSONB may hold SQL NULL or JSON null for "no flags"; only an object means flagged
    is_flagged = func.coalesce(func.jsonb_typeof(SurveyResponse.quality_flags), "null") == "object"
    return is_flagged if flagged else ~is_flagged


async def list_numbered_responses(
    session: AsyncSession,
    survey_id: uuid.UUID,
    *,
    limit: int,
    offset: int,
    flagged: bool | None = None,
    newest_first: bool = True,
) -> tuple[list[tuple[SurveyResponse, int]], int]:
    """A page of responses with their arrival numbers, and the total under the filter.

    The number is the ordinal among *all* responses, so it does not change with the filter.
    """
    ranked = _numbered(survey_id)
    stmt = (
        select(SurveyResponse, ranked.c.n)
        .join(ranked, ranked.c.rid == SurveyResponse.id)
        .where(SurveyResponse.survey_id == survey_id, _in_quota())
    )
    count_stmt = select(func.count(SurveyResponse.id)).where(
        SurveyResponse.survey_id == survey_id, _in_quota()
    )
    if flagged is not None:
        stmt = stmt.where(_flagged_condition(flagged))
        count_stmt = count_stmt.where(_flagged_condition(flagged))
    if newest_first:
        stmt = stmt.order_by(SurveyResponse.submitted_at.desc(), SurveyResponse.id.desc())
    else:
        stmt = stmt.order_by(SurveyResponse.submitted_at.asc(), SurveyResponse.id.asc())
    result = await session.execute(stmt.offset(offset).limit(limit))
    total = int((await session.execute(count_stmt)).scalar_one() or 0)
    return [(row[0], int(row[1])) for row in result.all()], total


async def response_number(
    session: AsyncSession, survey_id: uuid.UUID, response_id: uuid.UUID
) -> int:
    ranked = _numbered(survey_id)
    result = await session.execute(select(ranked.c.n).where(ranked.c.rid == response_id))
    return int(result.scalar_one_or_none() or 0)


async def neighbour_response_ids(
    session: AsyncSession, survey_id: uuid.UUID, response: SurveyResponse
) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    """(previous = received just before, next = received just after)."""
    key = tuple_(SurveyResponse.submitted_at, SurveyResponse.id)
    here = tuple_(response.submitted_at, response.id)
    older = await session.execute(
        select(SurveyResponse.id)
        .where(SurveyResponse.survey_id == survey_id, _in_quota(), key < here)
        .order_by(SurveyResponse.submitted_at.desc(), SurveyResponse.id.desc())
        .limit(1)
    )
    newer = await session.execute(
        select(SurveyResponse.id)
        .where(SurveyResponse.survey_id == survey_id, _in_quota(), key > here)
        .order_by(SurveyResponse.submitted_at.asc(), SurveyResponse.id.asc())
        .limit(1)
    )
    return older.scalar_one_or_none(), newer.scalar_one_or_none()


async def last_response_at(session: AsyncSession, survey_id: uuid.UUID) -> datetime | None:
    result = await session.execute(
        select(func.max(SurveyResponse.submitted_at)).where(
            SurveyResponse.survey_id == survey_id, _in_quota()
        )
    )
    return result.scalar_one_or_none()


def _survey_ids_of_owner(owner_user_id: uuid.UUID):
    return (
        select(Survey.id)
        .join(Organization, Organization.id == Survey.organization_id)
        .where(Organization.owner_user_id == owner_user_id)
    )


async def count_locked_for_owner(session: AsyncSession, owner_user_id: uuid.UUID) -> int:
    """Responses of the user's surveys that wait for a bigger plan."""
    result = await session.execute(
        select(func.count(SurveyResponse.id)).where(
            SurveyResponse.locked.is_(True),
            SurveyResponse.survey_id.in_(_survey_ids_of_owner(owner_user_id)),
        )
    )
    return int(result.scalar_one() or 0)


async def unlock_responses_for_owner(session: AsyncSession, owner_user_id: uuid.UUID) -> int:
    """Open every response of the user's surveys that the quota kept back; returns how many."""
    result = await session.execute(
        sql_update(SurveyResponse)
        .where(
            SurveyResponse.locked.is_(True),
            SurveyResponse.survey_id.in_(_survey_ids_of_owner(owner_user_id)),
        )
        .values(locked=False)
    )
    return int(result.rowcount or 0)


async def list_open_survey_ids_by_activity(
    session: AsyncSession, owner_user_id: uuid.UUID
) -> list[uuid.UUID]:
    """The user's published surveys, the most recently active first (last response, else last edit)."""
    last_response = (
        select(SurveyResponse.survey_id.label("sid"), func.max(SurveyResponse.submitted_at).label("at"))
        .group_by(SurveyResponse.survey_id)
        .subquery()
    )
    result = await session.execute(
        select(Survey.id)
        .join(Organization, Organization.id == Survey.organization_id)
        .outerjoin(last_response, last_response.c.sid == Survey.id)
        .where(Organization.owner_user_id == owner_user_id, Survey.status == "open")
        .order_by(func.coalesce(last_response.c.at, Survey.updated_at).desc(), Survey.id)
    )
    return list(result.scalars().all())


async def close_surveys(session: AsyncSession, survey_ids: list[uuid.UUID]) -> int:
    """Stop collecting answers in these surveys; nothing is deleted."""
    if not survey_ids:
        return 0
    result = await session.execute(
        sql_update(Survey).where(Survey.id.in_(survey_ids)).values(status="closed")
    )
    return int(result.rowcount or 0)
