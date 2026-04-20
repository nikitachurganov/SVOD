"""Build GigaChat messages for technical specification (ТЗ) generation."""

from __future__ import annotations

import json

from app.models.request import Request
from app.services.request_ai_common import (
    build_applicant_block,
    build_author_context_line,
    build_form_answers_text,
)


def _analysis_block(req: Request) -> str:
    if not req.ai_analysis or not isinstance(req.ai_analysis, dict):
        return "(анализ заявки отсутствует — сгенерируй ТЗ только по данным формы и пометь пробелы в missing_or_unclear)"
    a = req.ai_analysis
    lines = [
        f"Статус готовности анализа: {a.get('status', '')}",
        f"Готовность к обработке: {a.get('ready_for_processing', '')}",
        f"Балл полноты: {a.get('completeness_score', '')}",
        f"Рекомендация анализа: {a.get('recommendation', '')}",
    ]
    issues = a.get("issues") or []
    if isinstance(issues, list):
        for iss in issues[:20]:
            if isinstance(iss, dict):
                lines.append(
                    f"- [{iss.get('severity', '')}] {iss.get('field', '')}: {iss.get('message', '')}"
                )
    strengths = a.get("strengths") or []
    if isinstance(strengths, list) and strengths:
        lines.append("Сильные стороны: " + "; ".join(str(s) for s in strengths[:10]))
    return "\n".join(lines)


def _summary_block(req: Request) -> str:
    if not req.ai_summary or not isinstance(req.ai_summary, dict):
        return "(краткое ИИ-резюме отсутствует)"
    s = req.ai_summary
    tags = s.get("tags") or []
    tg = ", ".join(str(t) for t in tags) if isinstance(tags, list) else ""
    return (
        f"Резюме: {s.get('summary', '')}\n"
        f"Приоритет: {s.get('priority', '')}\n"
        f"Теги: {tg}"
    )


def build_tz_messages(req: Request) -> list[dict[str, str]]:
    applicant = build_applicant_block(req)
    author_ln = build_author_context_line(req)
    answers = build_form_answers_text(req)

    user_parts = [
        "Сформируй техническое задание для исполнителя по следующей заявке.",
        "",
        f"Заголовок заявки: {req.title}",
        f"Статус заявки в системе: {req.status}",
        "",
        "### Ответы по форме",
        answers,
        "",
    ]
    if applicant:
        user_parts.extend(["### Заявитель (публичная заявка)", applicant, ""])
    if author_ln:
        user_parts.extend([author_ln, ""])

    user_parts.extend(
        [
            "### ИИ-резюме (используй как подсказку по сути, не копируй дословно)",
            _summary_block(req),
            "",
            "### ИИ-анализ качества (обязательно учти пробелы и риски)",
            _analysis_block(req),
            "",
            "Сформируй ТЗ по структуре для исполнителя:",
            "1) Цель",
            "2) Что нужно сделать",
            "3) Исходные данные",
            "4) Требования к результату",
            "5) Критерии приёмки",
            "6) Риски и уточнения",
            "7) Резюме для исполнителя",
            "",
            "Верни ТОЛЬКО один JSON-объект без markdown и без текста вокруг. Ключи верхнего уровня:",
            json.dumps(
                {
                    "title": "краткое рабочее название задачи",
                    "short_description": "резюме для исполнителя, 2-4 предложения без воды",
                    "goal": "чёткая деловая цель, зачем задача и какой эффект",
                    "tasks": [
                        "конкретное действие 1",
                        "конкретное действие 2",
                        "конкретное действие 3",
                    ],
                    "expected_result": "требования к результату в проверяемой форме",
                    "inputs": ["исходные данные, материалы и доступы"],
                    "constraints": ["ограничения, стандарты, бюджет, формат"],
                    "deadline": "срок или null, если не определён в заявке",
                    "acceptance_criteria": ["критерии приёмки в формате 'готово, если ...'"],
                    "clarifications_and_risks": ["риски и вопросы, которые нужно уточнить"],
                    "missing_or_unclear": ["чего явно не хватает в данных заявки"],
                },
                ensure_ascii=False,
            ),
            "",
            "Требования к качеству:",
            "- пиши деловым языком без общих фраз и канцелярита;",
            "- не выдумывай факты, источником служат только данные выше;",
            "- если данных недостаточно, явно заполняй missing_or_unclear и clarifications_and_risks;",
            "- tasks, acceptance_criteria, inputs, constraints: списки по 2-7 пунктов, без дублей;",
            "- expected_result: конкретный измеримый результат, а не пересказ заявки;",
            "- short_description: суть задачи для исполнителя, без повторения исходного текста заявки;",
            "- если срок не указан, deadline = null и укажи это в missing_or_unclear.",
        ]
    )

    system = (
        "Ты помощник сервис-деска. Твоя задача — превратить сырую заявку в структурированное и полезное "
        "техническое задание для исполнителя на русском языке. Ответ только валидным JSON по заданной схеме ключей."
    )

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": "\n".join(user_parts)},
    ]
