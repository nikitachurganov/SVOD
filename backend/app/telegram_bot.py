from __future__ import annotations

import asyncio
import logging

from app.telegram.bot import run

logging.basicConfig(level=logging.INFO)


if __name__ == "__main__":
    asyncio.run(run())
