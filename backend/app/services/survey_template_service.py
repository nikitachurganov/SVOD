"""Trusted, deterministic questionnaires. No LLM calls or database catalogue."""
from copy import deepcopy
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.knowledge.methodologies import CATALOG_VERSION, METHODOLOGIES
from app.knowledge.survey_template_library import LIBRARY
from app.knowledge.survey_templates import Subject, TEMPLATES
from app.models.user import User
from app.schemas.survey import CreateSurveyRequest, SurveyDetail
from app.schemas.survey_template import (
    CreateSurveyFromTemplateRequest, SurveyTemplateDetail, SurveyTemplateItem,
)
from app.services import survey_methodology_service, survey_service

# Order is the order of the gallery: the first four fill the home page row, the rest follow.
CATALOG = {
    "usability": ("Юзабилити-тестирование нового продукта", "Оцените удобство интерфейса и сценарии пользователей."),
    "insights": ("Сбор инсайтов о функциях", "Узнайте, какими возможностями продукта пользуются и чего не хватает."),
    "cta": ("Тестирование расположения CTA", "Проверьте заметность и понятность ключевых кнопок."),
    "nps": ("Быстрый сбор обратной связи по NPS", "Измерьте готовность рекомендовать ваш продукт."),
    "csat": ("Удовлетворённость клиентов — CSAT", "Оцените удовлетворённость и причины полученной оценки."),
    "ces": ("Простота взаимодействия — CES", "Выясните, легко ли пользователям решать свои задачи."),
    "sus": ("Удобство продукта — SUS", "Оцените удобство системы по десяти утверждениям."),
    "ueq": ("Впечатление от продукта — UEQ", "Оцените впечатление от продукта по парам противоположных прилагательных."),
    "needs": ("Потребности клиентов", "Узнайте, какие задачи решают клиенты и чего им не хватает."),
    "purchase": ("Обратная связь после покупки", "Поймите, как клиенты выбирали и что повлияло на решение."),
    "brand": ("Узнаваемость бренда", "Измерьте известность бренда и ассоциации с ним."),
    "event": ("Отзыв о мероприятии", "Соберите оценки содержания и организации мероприятия."),
    "employee": ("Вовлечённость сотрудников", "Узнайте, насколько сотрудникам комфортно работать в компании."),
    "course": ("Оценка обучения", "Выясните, насколько курс был понятным и полезным на практике."),
    "price": ("Восприятие цены", "Узнайте, как клиенты оценивают цену и способы оплаты."),
}


def _template_fields(template_id: str) -> list[dict[str, Any]]:
    # Standardised instruments keep fixed wording; the rest are ordinary editable drafts.
    if template_id in TEMPLATES:
        return deepcopy(TEMPLATES[template_id](Subject()))
    return deepcopy(LIBRARY[template_id]())


def _template_meta(template_id: str, description: str) -> dict[str, Any]:
    if template_id in METHODOLOGIES:
        return {
            "catalog_version": CATALOG_VERSION,
            "category": METHODOLOGIES[template_id].category,
            "goals": [description], "methodologies": [template_id],
        }
    return {"catalog_version": CATALOG_VERSION, "goals": [description], "methodologies": []}


def _identify_fields(fields: list[dict[str, Any]]) -> None:
    for field in fields:
        field["id"] = str(uuid4())
        for option in field.get("options", []):
            option["id"] = str(uuid4())
        _identify_fields(field.get("children", []))


def get_template(template_id: str) -> SurveyTemplateDetail:
    if template_id not in CATALOG:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    name, description = CATALOG[template_id]
    fields = _template_fields(template_id)
    _identify_fields(fields)
    pages = [{"id": str(uuid4()), "title": name, "fields": fields}]
    return SurveyTemplateDetail(
        id=template_id, name=name, description=description,
        methodology_id=template_id,
        questions_count=survey_methodology_service.count_questions(pages),
        pages=pages,
        methodology_meta=_template_meta(template_id, description),
    )


def list_templates() -> list[SurveyTemplateItem]:
    return [SurveyTemplateItem.model_validate(get_template(key).model_dump()) for key in CATALOG]


async def create_from_template(
    session: AsyncSession, user: User, payload: CreateSurveyFromTemplateRequest,
) -> SurveyDetail:
    template = get_template(payload.template_id)
    # Reuse the manual creation path: editor rights, question cap and project ownership.
    return await survey_service.create_survey(session, user, CreateSurveyRequest(
        organization_id=payload.organization_id, project_id=payload.project_id,
        name=payload.name, description=template.description,
        pages=template.pages, methodology_meta=template.methodology_meta,
    ))
