"""Extract specialization / geography hints from forms and request payloads."""

from __future__ import annotations

import re
from typing import Any

SPEC_KEYS = frozenset(
    {
        "specialization",
        "специализация",
        "speciality",
        "skill",
        "skills",
        "навык",
        "компетенция",
    }
)
GEO_KEYS = frozenset(
    {
        "geography",
        "geo",
        "location",
        "city",
        "region",
        "город",
        "регион",
        "локация",
        "страна",
    }
)


def _norm(s: str) -> str:
    return " ".join(s.lower().strip().split())


def _walk_values(obj: Any, out: list[str]) -> None:
    if isinstance(obj, str) and obj.strip():
        out.append(obj.strip())
    elif isinstance(obj, dict):
        for k, v in obj.items():
            kl = str(k).lower()
            if any(x in kl for x in ("special", "skill", "компетен", "специал")):
                if isinstance(v, str) and v.strip():
                    out.append(v.strip())
            _walk_values(v, out)
    elif isinstance(obj, list):
        for item in obj:
            _walk_values(item, out)


def _collect_form_field_texts(fields_root: Any) -> list[str]:
    texts: list[str] = []
    if isinstance(fields_root, list):
        for page in fields_root:
            if isinstance(page, dict):
                for block in page.get("fields", []) or []:
                    if isinstance(block, dict):
                        fid = str(block.get("id", "")).lower()
                        lab = str(block.get("label", "") or "").lower()
                        if "special" in fid or "специал" in lab or "компетен" in lab:
                            t = block.get("label")
                            if isinstance(t, str) and t.strip():
                                texts.append(t.strip())
    return texts


def extract_required_specialization(
    *,
    performer_hints: dict[str, Any] | None,
    form_fields: Any,
    request_data: dict[str, Any] | None,
    form_snapshot: dict[str, Any] | None,
    ai_summary: dict[str, Any] | None,
    ai_analysis: dict[str, Any] | None,
) -> str | None:
    if isinstance(performer_hints, dict):
        rs = performer_hints.get("required_specialization")
        if rs is not None and str(rs).strip():
            return str(rs).strip()

    data = request_data or {}
    for key, val in data.items():
        if _norm(str(key)) in SPEC_KEYS or "специал" in str(key).lower():
            if isinstance(val, str) and val.strip():
                return val.strip()

    roots = [form_fields]
    if isinstance(form_snapshot, dict) and form_snapshot.get("fields"):
        roots.append(form_snapshot.get("fields"))
    for root in roots:
        texts = _collect_form_field_texts(root)
        if texts:
            return texts[0]

    blobs: list[str] = []
    _walk_values(data, blobs)
    for b in blobs:
        if len(b) > 3 and any(
            w in b.lower() for w in ("разработ", "инженер", "менеджер", "аналит", "дизайн")
        ):
            return b

    if isinstance(ai_summary, dict):
        tags = ai_summary.get("tags") or []
        if isinstance(tags, list) and tags:
            parts = [str(t) for t in tags[:3] if t]
            if parts:
                return ", ".join(parts)

    if isinstance(ai_analysis, dict):
        rec = ai_analysis.get("recommendation")
        if isinstance(rec, str) and len(rec.strip()) > 10:
            return rec.strip()[:500]

    return None


def extract_geography_hint(
    *,
    performer_hints: dict[str, Any] | None,
    request_data: dict[str, Any] | None,
) -> str | None:
    if isinstance(performer_hints, dict):
        g = performer_hints.get("geography")
        if g is not None and str(g).strip():
            return str(g).strip()

    data = request_data or {}
    for key, val in data.items():
        lk = str(key).lower()
        if lk in GEO_KEYS or any(x in lk for x in ("город", "регион", "страна")):
            if isinstance(val, str) and val.strip():
                return val.strip()

    blobs: list[str] = []
    _walk_values(data, blobs)
    for b in blobs:
        if re.search(
            r"\b(moscow|москв|spb|петербург|nsk|екатерин|казань|новосиб)\b",
            b,
            re.I,
        ):
            return b[:200]

    return None


def fallback_required_role(performer_hints: dict[str, Any] | None) -> str:
    if isinstance(performer_hints, dict):
        rr = performer_hints.get("required_role")
        if rr is not None and str(rr).strip():
            return str(rr).strip()
    return "Специалист по обработке заявок"


def rating_to_score_points(rating_val: Any) -> tuple[float, float]:
    """Return (points 0-10, raw display). Uses DB rating as 0-10 scale."""
    if rating_val is None:
        return 5.0, 5.0
    try:
        r = float(rating_val)
    except (TypeError, ValueError):
        return 5.0, 5.0
    if r <= 5.0 and r == int(r):
        # Likely 0-5 scale → map to 0-10
        r = min(10.0, r * 2.0)
    return max(0.0, min(10.0, r)), r
