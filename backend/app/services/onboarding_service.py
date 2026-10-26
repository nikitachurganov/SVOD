"""First-visit questionnaire and the state of the guided tour."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.user_onboarding import UserOnboarding
from app.repositories import user_onboarding_repository
from app.schemas.onboarding import OTHER, OnboardingSurveyRequest, TourUpdateRequest
from app.schemas.user import OnboardingState


def build_state(row: UserOnboarding | None) -> OnboardingState:
    """What the web client needs: must the questionnaire be shown, may it be closed, where the tour is.

    A person without a row is new: the questionnaire is required for them.
    """
    if row is None:
        return OnboardingState(
            surveyCompleted=False,
            needsSurvey=True,
            dismissible=False,
            tourStatus="pending",
            tourStep=None,
        )
    completed = row.survey_completed_at is not None
    return OnboardingState(
        surveyCompleted=completed,
        needsSurvey=not completed and row.survey_dismissed_at is None,
        dismissible=row.dismissible,
        tourStatus=row.tour_status,
        tourStep=row.tour_step,
    )


async def get_state(session: AsyncSession, user: User) -> OnboardingState:
    return build_state(await user_onboarding_repository.get(session, user.id))


def _other_text(selected: bool, text: str | None) -> str | None:
    """The free text means something only when «Другое» is among the answers."""
    return text if selected else None


async def submit_survey(
    session: AsyncSession, user: User, payload: OnboardingSurveyRequest
) -> OnboardingState:
    row = await user_onboarding_repository.get_or_create(session, user.id)
    row.occupation = payload.occupation
    row.occupation_other = _other_text(payload.occupation == OTHER, payload.occupation_other)
    row.purposes = list(payload.purposes)
    row.purpose_other = _other_text(OTHER in payload.purposes, payload.purpose_other)
    row.source = payload.source
    row.source_other = _other_text(payload.source == OTHER, payload.source_other)
    if row.survey_completed_at is None:
        row.survey_completed_at = datetime.now(timezone.utc)
    await session.commit()
    return build_state(row)


async def dismiss_survey(session: AsyncSession, user: User) -> OnboardingState:
    """Closing the questionnaire is only for accounts that predate it; a new person has to answer."""
    row = await user_onboarding_repository.get(session, user.id)
    if row is None or not row.dismissible:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="onboarding_required")
    if row.survey_dismissed_at is None:
        row.survey_dismissed_at = datetime.now(timezone.utc)
    await session.commit()
    return build_state(row)


async def update_tour(session: AsyncSession, user: User, payload: TourUpdateRequest) -> OnboardingState:
    row = await user_onboarding_repository.get_or_create(session, user.id)
    row.tour_status = payload.status
    row.tour_step = payload.step
    await session.commit()
    return build_state(row)
