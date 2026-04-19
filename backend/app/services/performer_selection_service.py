"""Performer recommendation and assignment for requests."""

from __future__ import annotations

import logging
import re
import uuid
from typing import Any, Literal

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.external_contractor import ExternalContractor
from app.models.performer_analytics import PerformerSelectionAnalytics
from app.models.request import Request
from app.models.user import User
from app.repositories import (
    external_contractor_repository,
    form_repository,
    organization_repository,
    performer_analytics_repository,
    request_repository,
)
from app.schemas.performer_selection import AssignRequestPayload
from app.services import performer_hints
from app.services.request_tz_service import format_ai_tz_plain_text

logger = logging.getLogger(__name__)

ALLOWED_CONTACT_METHODS = frozenset(
    {"email", "telegram", "phone", "whatsapp", "sms", "auto"}
)

async def _ensure_org_member(session: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID) -> None:
    m = await organization_repository.get_member(session, org_id, user_id)
    if m is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this organization",
        )


def parse_performer_ref(performer_id: str) -> tuple[Literal["internal", "external"], uuid.UUID]:
    parts = performer_id.strip().split(":", 1)
    if len(parts) != 2:
        raise ValueError("invalid performer id")
    kind_s, uuid_s = parts
    if kind_s not in ("internal", "external"):
        raise ValueError("invalid performer kind")
    return kind_s, uuid.UUID(uuid_s)


def _normalize(s: str | None) -> str:
    if not s:
        return ""
    return " ".join(s.lower().split())


def _spec_match_score(
    required: str | None,
    cand_spec: str | None,
    cand_position: str | None,
) -> tuple[int, list[str], list[str]]:
    req = _normalize(required)
    combined = f"{cand_spec or ''} {cand_position or ''}"
    cn = _normalize(combined)
    reasons: list[str] = []
    warnings: list[str] = []

    if not req:
        return 20, ["Релевантность по специализации оценена нейтрально"], warnings

    if not cn.strip():
        return 5, [], warnings + ["Нет данных о специализации у кандидата"]

    if req in cn or cn in req:
        reasons.append("Точное совпадение специализации")
        return 40, reasons, warnings

    rt = set(re.findall(r"[a-zа-яё]{3,}", req))
    ct = set(re.findall(r"[a-zа-яё]{3,}", cn))
    overlap = rt & ct
    if overlap:
        reasons.append("Частичное совпадение специализации")
        return 25, reasons, warnings

    if any(t in cn for t in rt if len(t) > 4):
        reasons.append("Частичное совпадение специализации")
        return 15, reasons, warnings

    return 5, [], warnings


def _history_score(count: int) -> tuple[int, list[str]]:
    capped = min(count, 10)
    pts = min(25, int(round(capped * 2.5)))
    reasons = []
    if pts > 0:
        reasons.append("Завершал похожие заявки (та же форма)")
    return pts, reasons


def _workload_score(active: int) -> tuple[int, list[str], list[str]]:
    warnings: list[str] = []
    if active > 8:
        warnings.append("Высокая загрузка")
        return 2, ["Высокая загрузка активными задачами"], warnings
    if active <= 2:
        return 15, ["Низкая текущая загрузка"], warnings
    if active <= 6:
        return 10, ["Умеренная загрузка"], warnings
    return 5, ["Повышенная загрузка"], warnings


def _geo_score(req_geo: str | None, cand_geo: str | None) -> tuple[int, list[str]]:
    if not _normalize(req_geo) or not _normalize(cand_geo):
        return 5, []
    r, c = _normalize(req_geo), _normalize(cand_geo)
    if r in c or c in r:
        return 10, ["Совпадение региона"]
    rt = set(r.replace(",", " ").split())
    ct = set(c.replace(",", " ").split())
    if rt & ct:
        return 7, ["Близкий регион"]
    return 2, []


def _internal_display_name(user: User) -> str:
    parts = [user.last_name, user.first_name, user.middle_name]
    name = " ".join(p for p in parts if p).strip()
    return name or user.full_name or "Пользователь"


async def log_analytics(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    request_id: int,
    event: str,
    payload: dict[str, Any] | None = None,
) -> None:
    row = PerformerSelectionAnalytics(
        organization_id=organization_id,
        request_id=request_id,
        event=event,
        payload=payload,
    )
    await performer_analytics_repository.create_event(session, row)


async def get_recommended_performers(
    session: AsyncSession,
    request_id: int,
    current_user: User,
) -> dict[str, Any]:
    req = await request_repository.get_by_id(session, request_id)
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if req.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Request has no organization",
        )

    org_id = req.organization_id
    await _ensure_org_member(session, org_id, current_user.id)

    form_row = await form_repository.get_by_id(session, req.form_id)
    hints_dict: dict[str, Any] | None = None
    form_fields: Any = []
    if form_row:
        hints_dict = form_row.performer_hints if isinstance(form_row.performer_hints, dict) else None
        form_fields = form_row.fields or []

    req_spec = performer_hints.extract_required_specialization(
        performer_hints=hints_dict,
        form_fields=form_fields,
        request_data=req.data if isinstance(req.data, dict) else {},
        form_snapshot=req.form_snapshot if isinstance(req.form_snapshot, dict) else None,
        ai_summary=req.ai_summary if isinstance(req.ai_summary, dict) else None,
        ai_analysis=req.ai_analysis if isinstance(req.ai_analysis, dict) else None,
    )
    req_geo = performer_hints.extract_geography_hint(
        performer_hints=hints_dict,
        request_data=req.data if isinstance(req.data, dict) else {},
    )

    org = await organization_repository.get_org_by_id(session, org_id)
    org_name = org.name if org else ""

    members = await organization_repository.list_members(session, org_id)
    contractors = await external_contractor_repository.list_by_org(session, org_id)

    performers_out: list[dict[str, Any]] = []

    for m in members:
        user = m.user
        if user is None or not user.is_active:
            continue
        uid = user.id
        internal_id = f"internal:{uid}"

        hist = await request_repository.count_closed_same_form_internal(
            session, req.form_id, org_id, uid
        )
        active = await request_repository.count_active_for_internal_user(
            session, org_id, uid, exclude_request_id=request_id
        )

        pos = m.job_title or (
            "Владелец" if m.role_tag == "owner" else "Сотрудник"
        )
        cand_spec = m.specialization or ""

        sp_pts, sp_r, sp_w = _spec_match_score(req_spec, cand_spec, pos)
        hi_pts, hi_r = _history_score(hist)
        wl_pts, wl_r, wl_w = _workload_score(active)
        g_pts, g_r = _geo_score(req_geo, m.geography)

        rt_pts, _ = performer_hints.rating_to_score_points(None)

        score = min(100, sp_pts + hi_pts + wl_pts + g_pts + int(round(rt_pts)))
        reasons = [*sp_r, *hi_r, *wl_r, *g_r]
        warnings = [*sp_w, *wl_w]

        email_ok = bool(user.email and user.email.strip())
        phone_ok = bool(user.phone_number and user.phone_number.strip())
        contact_available = email_ok or phone_ok
        if not contact_available:
            warnings.append("Нет контактных данных")

        performers_out.append(
            {
                "id": internal_id,
                "full_name": _internal_display_name(user),
                "position": pos,
                "organization": org_name or None,
                "is_internal": True,
                "score": score,
                "reasons": reasons,
                "warnings": warnings,
                "active_tasks": active,
                "contact_available": contact_available,
                "_sort": score,
            }
        )

    for c in contractors:
        eid = f"external:{c.id}"

        hist = await request_repository.count_closed_same_form_external(
            session, req.form_id, org_id, c.id
        )
        active = await request_repository.count_active_for_external_contractor(
            session, org_id, c.id, exclude_request_id=request_id
        )

        cand_spec = c.specialization or ""
        pos = c.position or "Подрядчик"

        sp_pts, sp_r, sp_w = _spec_match_score(req_spec, cand_spec, pos)
        hi_pts, hi_r = _history_score(hist)
        wl_pts, wl_r, wl_w = _workload_score(active)
        g_pts, g_r = _geo_score(req_geo, c.geography)

        rating_dec = c.rating
        rt_pts, _ = performer_hints.rating_to_score_points(rating_dec)

        score = min(
            100,
            sp_pts + hi_pts + wl_pts + g_pts + int(round(rt_pts)),
        )
        reasons = [*sp_r, *hi_r, *wl_r, *g_r]
        if rating_dec is not None:
            reasons.append("Указан рейтинг исполнителя")

        warnings = [*sp_w, *wl_w]
        cv = (c.contact_value or "").strip()
        ck = (c.contact_kind or "").lower()
        contact_available = bool(cv)
        if not contact_available:
            warnings.append("Нет контактных данных")

        performers_out.append(
            {
                "id": eid,
                "full_name": c.full_name,
                "position": pos,
                "organization": c.organization or None,
                "is_internal": False,
                "score": score,
                "reasons": reasons,
                "warnings": warnings,
                "active_tasks": active,
                "contact_available": contact_available,
                "_contact_kind": ck,
                "_sort": score,
            }
        )

    performers_out.sort(key=lambda x: (-x["_sort"], x["full_name"]))
    top5 = performers_out[:5]

    recommended_id = top5[0]["id"] if top5 else None
    top_score = top5[0]["score"] if top5 else 0

    if top_score >= 70:
        reco_status: Literal["strong_match", "partial_match", "no_match"] = "strong_match"
    elif top_score >= 40:
        reco_status = "partial_match"
    else:
        reco_status = "no_match"

    confidence = top_score if top5 else 0

    fb_geo = req_geo or (
        hints_dict.get("geography") if isinstance(hints_dict, dict) else None
    )
    fallback = {
        "required_role": performer_hints.fallback_required_role(hints_dict),
        "recommended_sources": ["LinkedIn", "Upwork"],
        "geography": str(fb_geo or "Не указано"),
    }

    clean = []
    for p in top5:
        clean.append(
            {
                "id": p["id"],
                "full_name": p["full_name"],
                "position": p["position"],
                "organization": p["organization"],
                "is_internal": p["is_internal"],
                "score": p["score"],
                "reasons": p["reasons"],
                "warnings": p["warnings"],
                "active_tasks": p["active_tasks"],
                "contact_available": p["contact_available"],
            }
        )

    await log_analytics(
        session,
        organization_id=org_id,
        request_id=request_id,
        event="view",
        payload={"recommended_performer_id": recommended_id, "confidence": confidence},
    )
    await session.commit()

    return {
        "status": reco_status,
        "confidence": confidence,
        "recommended_performer_id": recommended_id,
        "performers": clean,
        "fallback": fallback,
    }


def _resolve_internal_contact(user: User, contact_method: str) -> tuple[str | None, str]:
    cm = contact_method.lower()
    if cm in ("auto", "email"):
        if user.email and user.email.strip():
            return user.email.strip(), "email"
    if cm in ("phone", "sms", "whatsapp"):
        if user.phone_number and user.phone_number.strip():
            return user.phone_number.strip(), cm
    if cm == "telegram":
        return None, "telegram"
    if user.email and user.email.strip():
        return user.email.strip(), "email"
    if user.phone_number and user.phone_number.strip():
        return user.phone_number.strip(), "phone"
    return None, cm


def _resolve_external_contact(c: ExternalContractor, contact_method: str) -> tuple[str | None, str]:
    cm = contact_method.lower()
    val = (c.contact_value or "").strip()
    kind = (c.contact_kind or "").lower()
    if not val:
        return None, cm
    if cm == "auto":
        return val, kind or "unknown"
    if kind == cm or cm == "email" and kind == "email":
        return val, kind
    if cm == "phone" and kind in ("phone", "whatsapp", "sms"):
        return val, kind
    if cm == kind:
        return val, kind
    # Method mismatch but we have some contact — still allow if auto-like
    if cm in ("auto",):
        return val, kind
    return None, cm


def send_technical_spec_stub(request: Request, channel: str, address: str) -> None:
    tz_plain = format_ai_tz_plain_text(request)
    logger.info(
        "TZ stub send: request_id=%s channel=%s address_prefix=%s has_tz_body=%s",
        request.id,
        channel,
        (address[:24] + "…") if len(address) > 24 else address,
        bool(tz_plain),
    )
    if tz_plain:
        logger.info(
            "TZ stub body (preview, first 4000 chars): %s",
            tz_plain[:4000] + ("…" if len(tz_plain) > 4000 else ""),
        )


async def assign_performer(
    session: AsyncSession,
    request_id: int,
    payload: AssignRequestPayload,
    current_user: User,
) -> Request:
    """Assigns the active execution stage (creates a default stage if none)."""
    from app.services import request_execution_service

    return await request_execution_service.assign_active_stage(
        session, request_id, payload, current_user
    )
