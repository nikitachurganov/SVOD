"""Answer-based jumps between survey pages (pure functions).

A survey is a list of pages. By default the respondent goes through them in order. On a question
with one answer (``radio``, ``dropdown``, ``yesNo``) ``config.jumps`` maps an option id to the page
the respondent goes to next (a page id) or to ``"end"``. ``page.next`` sets where to go after the
page when no jump fired. A page with ``ending: true`` is an ending screen: it is shown only after the
answers are sent, and only when a jump or ``next`` leads to it; going in order skips it.

Jumps work only forward, so a path never loops and is fully defined by the answers. A jump to an
unknown page, or to a page that is not below the current one, is ignored (the respondent goes on
in order). A page without fields is passed through: it is never shown, but its ``next`` applies.

The same rules live in ``src/shared/survey-logic/surveyLogic.ts``; both are checked against
``backend/tests/fixtures/survey_logic_cases.json``.
"""

from __future__ import annotations

from typing import Any

END = "end"
JUMP_FIELD_TYPES = {"radio", "dropdown", "yesNo"}
_OTHER_PREFIX = "__other__:"
_YES_NO_OPTIONS = [{"id": "yes", "label": "Да"}, {"id": "no", "label": "Нет"}]


def _page_list(pages: Any) -> list[dict[str, Any]]:
    if not isinstance(pages, list):
        return []
    return [p if isinstance(p, dict) else {} for p in pages]


def _fields(page: dict[str, Any]) -> list[dict[str, Any]]:
    fields = page.get("fields")
    return [f for f in fields if isinstance(f, dict)] if isinstance(fields, list) else []


def _leaves(fields: list[dict[str, Any]]):
    for field in fields:
        if field.get("type") == "group":
            children = field.get("children")
            yield from _leaves([c for c in children if isinstance(c, dict)] if isinstance(children, list) else [])
        else:
            yield field


def is_ending(page: dict[str, Any]) -> bool:
    return page.get("ending") is True


def field_options(field: dict[str, Any]) -> list[dict[str, Any]]:
    if field.get("type") == "yesNo" and not field.get("options"):
        return _YES_NO_OPTIONS
    options = field.get("options")
    return [o for o in options if isinstance(o, dict) and isinstance(o.get("id"), str)] if isinstance(options, list) else []


def jumps_of(field: dict[str, Any]) -> dict[str, str]:
    if field.get("type") not in JUMP_FIELD_TYPES:
        return {}
    config = field.get("config")
    jumps = config.get("jumps") if isinstance(config, dict) else None
    if not isinstance(jumps, dict):
        return {}
    return {k: v for k, v in jumps.items() if isinstance(k, str) and isinstance(v, str) and v}


def chosen_option_id(field: dict[str, Any], value: Any) -> str | None:
    """The option a one-answer question was answered with.

    Accepts what the form holds while it is filled in (an option id, or ``{"selected": id}`` for a
    question with «Другое») and what is stored (radio keeps the option label, «Другое» is
    ``"__other__:text"``, yes/no is ``"yes"`` / ``"no"``).
    """
    if isinstance(value, dict):
        selected = value.get("selected")
        value = selected if isinstance(selected, str) else None
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    options = field_options(field)
    for option in options:
        if option["id"] == text:
            return text
    if text.startswith(_OTHER_PREFIX):
        other = next((o for o in options if o.get("isOther")), None)
        return other["id"] if other else None
    lowered = text.lower()
    for option in options:
        if str(option.get("label", "")).strip().lower() == lowered:
            return option["id"]
    return None


def page_target(page: dict[str, Any], answers: dict[str, Any]) -> str | None:
    """Where the page sends the respondent: the first fired jump from the top, else ``page.next``."""
    for field in _leaves(_fields(page)):
        jumps = jumps_of(field)
        if not jumps or not isinstance(field.get("id"), str):
            continue
        option_id = chosen_option_id(field, answers.get(field["id"]))
        if option_id is not None and option_id in jumps:
            return jumps[option_id]
    nxt = page.get("next")
    return nxt if isinstance(nxt, str) and nxt else None


def _resolve(pages: list[dict[str, Any]], current: int, target: str | None) -> tuple[str, int | None]:
    """("page", index) or ("end", ending page index or None) for leaving page ``current``."""
    if target == END:
        return ("end", None)
    if target is not None:
        index = next((i for i, p in enumerate(pages) if p.get("id") == target), None)
        if index is not None and index > current:
            return ("end", index) if is_ending(pages[index]) else ("page", index)
    k = current + 1
    while k < len(pages) and is_ending(pages[k]):
        k += 1
    return ("page", k) if k < len(pages) else ("end", None)


def survey_path(pages: Any, answers: dict[str, Any]) -> tuple[list[int], int | None]:
    """Indexes of the pages the respondent sees, in order, and the ending page index (or None)."""
    items = _page_list(pages)
    path: list[int] = []
    kind, index = _resolve(items, -1, None)
    while kind == "page" and index is not None:
        page = items[index]
        if _fields(page):
            path.append(index)
        kind, index = _resolve(items, index, page_target(page, answers))
    return path, index


def shown_field_ids(pages: Any, answers: dict[str, Any]) -> set[str]:
    items = _page_list(pages)
    path, _ = survey_path(items, answers)
    return {
        f["id"]
        for i in path
        for f in _leaves(_fields(items[i]))
        if isinstance(f.get("id"), str)
    }


def has_logic(pages: Any) -> bool:
    for page in _page_list(pages):
        if is_ending(page) or (isinstance(page.get("next"), str) and page.get("next")):
            return True
        if any(jumps_of(f) for f in _leaves(_fields(page))):
            return True
    return False
