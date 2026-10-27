from __future__ import annotations

import asyncio
import logging
from prometheus_client import start_http_server

from app.core.config import settings
from app.core.database import async_session_factory
from app.services import account_deletion_service, ai_job_service, notification_service
from app.services import ops_alert_service, payment_service, subscription_lifecycle_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("svod.worker")

# What the billing tick does, each in a session of its own so one failure does not stop the rest
_BILLING_STEPS = (
    ("payments", payment_service.reconcile_open),
    ("ops alerts", ops_alert_service.run),
    ("subscriptions", subscription_lifecycle_service.process_due),
    ("scheduled deletions", account_deletion_service.process_scheduled_deletions),
    ("deletion reminders", account_deletion_service.send_deletion_reminders),
)


async def run_billing_tick() -> None:
    for name, step in _BILLING_STEPS:
        try:
            async with async_session_factory() as session:
                result = await step(session)
            if result:
                logger.info("Billing tick, %s: %s", name, dict(result) if hasattr(result, "items") else result)
        except Exception:
            logger.exception("Billing tick, %s, failed", name)


async def run() -> None:
    start_http_server(settings.WORKER_METRICS_PORT)
    async with async_session_factory() as session:
        recovered = await ai_job_service.requeue_stale_jobs(session)
        if recovered:
            logger.warning("Requeued %s stale AI job(s)", recovered)
    overdue_tick = 0
    billing_tick = 0
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
            billing_tick += 1
            if billing_tick >= max(1, int(settings.BILLING_TICK_SECONDS / max(settings.AI_WORKER_POLL_SECONDS, 0.5))):
                billing_tick = 0
                if settings.BILLING_ENABLED:
                    await run_billing_tick()
        if job is None:
            await asyncio.sleep(max(settings.AI_WORKER_POLL_SECONDS, 0.5))


if __name__ == "__main__":
    asyncio.run(run())
