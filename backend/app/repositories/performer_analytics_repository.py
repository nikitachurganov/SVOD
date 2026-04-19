from app.models.performer_analytics import PerformerSelectionAnalytics
from sqlalchemy.ext.asyncio import AsyncSession


async def create_event(session: AsyncSession, row: PerformerSelectionAnalytics) -> None:
    session.add(row)
    await session.flush()
