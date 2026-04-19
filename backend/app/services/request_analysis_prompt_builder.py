"""Build LLM user prompt for semantic request quality analysis (not summarization)."""

from __future__ import annotations

from app.models.request import Request
from app.services.request_ai_common import (
    build_applicant_block,
    build_author_context_line,
    build_label_map,
    format_value,
)


def _form_structure_block(req: Request) -> str:
    snapshot = req.form_snapshot
    if not snapshot:
        return "(структура формы недоступна)"
    fields = snapshot if isinstance(snapshot, list) else snapshot.get("fields", [])
    if not isinstance(fields, list) or not fields:
        return "(в снимке формы нет полей)"

    lines: list[str] = []
    for f in fields:
        if not isinstance(f, dict) or "id" not in f:
            continue
        fid = f["id"]
        label = f.get("label", fid)
        ftype = f.get("type", "?")
        required = f.get("required", False)
        lines.append(f"- id={fid!r}, подпись={label!r}, тип={ftype!r}, обязательное={required}")
    return "\n".join(lines) if lines else "(нет полей)"


def _form_answers_block(req: Request) -> str:
    if not req.data or not isinstance(req.data, dict):
        return "(нет ответов)"

    labels = build_label_map(req.form_snapshot)
    lines: list[str] = []
    for key, value in sorted(req.data.items(), key=lambda x: x[0]):
        if value is None:
            lines.append(f"- {labels.get(key, key)}: (пусто)")
            continue
        if isinstance(value, str) and not value.strip():
            lines.append(f"- {labels.get(key, key)}: (пусто)")
            continue
        if isinstance(value, (list, dict)) and not value:
            lines.append(f"- {labels.get(key, key)}: (пусто)")
            continue
        lines.append(f"- {labels.get(key, key)}: {format_value(value)}")
    return "\n".join(lines) if lines else "(все ответы пустые)"


def _optional_description_hint(req: Request) -> str | None:
    """First longText answer as free-text description context (not a summary)."""
    snapshot = req.form_snapshot
    fields = snapshot if isinstance(snapshot, list) else (snapshot or {}).get("fields", [])
    if not isinstance(fields, list):
        return None
    data = req.data if isinstance(req.data, dict) else {}
    for f in fields:
        if not isinstance(f, dict) or f.get("type") != "longText":
            continue
        fid = f.get("id")
        if not fid:
            continue
        val = data.get(fid)
        if isinstance(val, str) and len(val.strip()) > 20:
            return f"Текстовое описание (поле «{f.get('label', fid)}», фрагмент): {val.strip()[:800]}"
    return None


def _summary_context_line(req: Request) -> str | None:
    """Single line of existing AI summary for orientation only — do not rewrite as analysis."""
    summary = req.ai_summary if isinstance(req.ai_summary, dict) else None
    if not summary:
        return None
    text = summary.get("summary")
    if isinstance(text, str) and text.strip():
        return (
            "Справочно: уже есть краткое ИИ-резюме заявки (не пересказывай и не заменяй анализом): "
            + text.strip()[:400]
        )
    return None


def build_rule_findings_text(rule_issues: list[dict]) -> str:
    if not rule_issues:
        return "(автопроверка замечаний не нашла)"
    lines = []
    for i, issue in enumerate(rule_issues, 1):
        msg = issue.get("message", "")
        lines.append(f"{i}. [{issue.get('type')}] поле={issue.get('field')!r}: {msg}")
    return "\n".join(lines)


def build_user_prompt(req: Request, rule_issues: list[dict]) -> str:
    blocks: list[str] = [
        "## Заголовок заявки\n" + req.title.strip(),
        "## Статус в системе\n" + str(req.status),
        "## Структура полей формы (id, подпись, тип, обязательность)\n" + _form_structure_block(req),
        "## Ответы заявителя по полям\n" + _form_answers_block(req),
        "## Уже найдено автоматической проверкой (не дублируй эти пункты в issues)\n"
        + build_rule_findings_text(rule_issues),
    ]

    desc = _optional_description_hint(req)
    if desc:
        blocks.append("## Описание / детали\n" + desc)

    summ = _summary_context_line(req)
    if summ:
        blocks.append("## Контекст\n" + summ)

    applicant = build_applicant_block(req)
    if applicant:
        blocks.append("## Заявитель (публичная заявка)\n" + applicant)

    author = build_author_context_line(req)
    if author:
        blocks.append("## " + author)

    return "\n\n".join(blocks)


SYSTEM_PROMPT = """Ты координатор приёма заявок. Твоя задача — оценить качество и полноту заявки для передачи в работу.

Это НЕ резюме и НЕ пересказ текста. Не придумывай факты, которых нет в данных. Не пиши длинные абзацы.

Уже выполнена автоматическая проверка (список в запросе). В ответе НЕ повторяй те же проблемы в массиве issues.

Верни СТРОГО один JSON-объект без Markdown и без текста до или после JSON.

Формат ответа (только эти ключи):
{
  "issues": [
    {
      "type": "ambiguity | contradiction | weak_goal | missing_context | missing_constraints | missing_deadline | missing_artifacts | missing_info",
      "severity": "low | medium | high",
      "field": "<id поля из формы или general, если ко всей заявке>",
      "message": "<одна конкретная фраза: что не так и что добавить; без общих формулировок вроде «можно улучшить»>"
    }
  ],
  "strengths": [
    "<короткая сильная сторона заявки по фактам из данных, 1 строка>"
  ],
  "recommendation": "<1–2 предложения: что сделать дальше автору заявки, по делу>"
}

Требования к issues:
- Только смысловые замечания: неясные формулировки, слабая цель, нехватка контекста, противоречия между полями, отсутствие ожидаемого артефакта/результата, если это видно из текста (не из пустых обязательных полей — их уже проверили).
- Сообщения по-русски, конкретно: например «Не указан ожидаемый формат отчёта», а не «стоит что-то уточнить».
- severity: high — блокирует работу; medium — желательно уточнить; low — желательно улучшить.
- Если серьёзных смысловых проблем нет, issues может быть [].
- strengths: 0–4 пункта; если нечего отметить, [].

recommendation: если автопроверка уже нашла проблемы, сфокусируйся на смысловых шагах или подтверди готовность, если всё ясно."""


def build_messages(req: Request, rule_issues: list[dict]) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": build_user_prompt(req, rule_issues)},
    ]
