"""Background AI enrichment for public requests (summary + analysis)."""

from __future__ import annotations

import logging

from app.core.database import async_session_factory
from app.services import request_analysis_service, request_summary_service

logger = logging.getLogger(__name__)


async def run_public_request_ai_pipeline(request_id: int) -> None:
    async with async_session_factory() as session:
        try:
            await request_summary_service.generate_summary(session, request_id)
        except Exception:
            logger.exception("AI summary generation failed for public request %s", request_id)

        try:
            await request_analysis_service.generate_analysis(session, request_id)
        except request_analysis_service.AnalysisGenerationFailed:
            logger.warning("AI analysis skipped (LLM unavailable) for public request %s", request_id)
        except Exception:
            logger.exception("AI analysis generation failed for public request %s", request_id)
