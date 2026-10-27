"""The «Добро пожаловать» project with a sample survey, created once for every new personal workspace."""

from __future__ import annotations

import secrets
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.survey import Survey, SurveyProject
from app.repositories import survey_repository

WELCOME_PROJECT_NAME = "Добро пожаловать"
WELCOME_SURVEY_NAME = "Пример опроса: знакомство с СВОД"


def _id() -> str:
    return str(uuid.uuid4())


def _options(*labels: str, other: str | None = None) -> list[dict[str, Any]]:
    options: list[dict[str, Any]] = [{"id": _id(), "label": label} for label in labels]
    if other:
        options.append({"id": _id(), "label": other, "isOther": True})
    return options


def _field(type_: str, label: str, **extra: Any) -> dict[str, Any]:
    field: dict[str, Any] = {"id": _id(), "type": type_, "label": label, "required": False}
    field.update(extra)
    return field


def welcome_survey_pages() -> list[dict[str, Any]]:
    """Greeting page, a page of questions of different types, and a closing note."""
    return [
        {
            "id": _id(),
            "title": "Приветствие",
            "fields": [
                _field(
                    "textBlock",
                    "Добро пожаловать!",
                    placeholder=(
                        "Спасибо, что согласились принять участие в исследовании! "
                        "Эта страница без вопросов — так респондент знакомится с опросом: "
                        "о чём он, сколько займёт и что ответы анонимны.\n\n"
                        "Опрос займёт около 2 минут. Нажмите «Далее», чтобы увидеть вопросы."
                    ),
                )
            ],
        },
        {
            "id": _id(),
            "title": "Вопросы",
            "fields": [
                _field(
                    "radio",
                    "Как вы узнали о нашем сервисе?",
                    required=True,
                    options=_options(
                        "Поиск в интернете", "Рекомендация знакомых", "Соцсети", other="Другое"
                    ),
                ),
                _field("yesNo", "Пользовались ли вы раньше сервисами для опросов?", required=True),
                _field(
                    "rating",
                    "Насколько вам удобно составлять опросы?",
                    placeholder="От 1 до 5, где 5 — очень удобно",
                    config={
                        "ratingVariant": "stars",
                        "min": 1,
                        "max": 5,
                        "step": 1,
                        "showValue": True,
                        "allowClear": True,
                        "disabled": False,
                    },
                ),
                _field(
                    "checkbox",
                    "Что для вас важно в сервисе?",
                    placeholder="Можно выбрать несколько вариантов",
                    options=_options("Простота", "Скорость", "Аналитика ответов", "Помощь ИИ"),
                ),
                _field("longText", "Что бы вы улучшили?"),
            ],
        },
        {
            "id": _id(),
            "title": "Завершение",
            "fields": [
                _field(
                    "textBlock",
                    "Почти готово",
                    placeholder=(
                        "Нажмите «Отправить ответы». Этот опрос — образец: изучайте, меняйте и "
                        "удаляйте его как угодно. Свой опрос можно собрать с помощью ИИ-конструктора."
                    ),
                )
            ],
        },
    ]


async def seed_welcome_project(
    session: AsyncSession, organization_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    """Adds the project and its sample survey to the session (flushed, not committed)."""
    project = await survey_repository.create_project(
        session,
        SurveyProject(
            organization_id=organization_id,
            created_by_user_id=user_id,
            name=WELCOME_PROJECT_NAME,
        ),
    )
    await survey_repository.create(
        session,
        Survey(
            organization_id=organization_id,
            project=project,
            created_by_user_id=user_id,
            name=WELCOME_SURVEY_NAME,
            description="Образец: посмотрите, как выглядит опрос, и попробуйте его изменить.",
            pages=welcome_survey_pages(),
            status="draft",
            public_token=secrets.token_urlsafe(24),
            anonymous=True,
        ),
    )
