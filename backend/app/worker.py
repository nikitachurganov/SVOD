from __future__ import annotations

import asyncio
import logging
from prometheus_client import start_http_server

from app.core.config import settings
from app.core.database import async_session_factory
from app.services import ai_job_service, notification_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("svod.worker")


async def run() -> None:
    start_http_server(settings.WORKER_METRICS_PORT)
    async with async_session_factory() as session:
        recovered = await ai_job_service.requeue_stale_jobs(session)
        if recovered:
            logger.warning("Requeued %s stale AI job(s)", recovered)
    overdue_tick = 0
    while True:
        async with async_session_factory() as session:
            job = await ai_job_service.claim_next(session)
            if job is not None:
                logger.info("Processing AI job %s (%s)", job.id, job.kind)
                await ai_job_service.process_job(session, job)
            overdue_tick += 1
            if overdue_tick >= max(1, int(300 / max(settings.AI_WORKER_POLL_SECONDS, 0.5))):
                await notification_service.enqueue_overdue_notifications(session)
                overdue_tick = 0
        if job is None:
            await asyncio.sleep(max(settings.AI_WORKER_POLL_SECONDS, 0.5))


if __name__ == "__main__":
    asyncio.run(run())
