"""Load test of the respondent side: open a public survey and submit answers, many at a time.

    python scripts/load_public_survey.py --base-url http://api:8000 --token <public token> \\
        --requests 300 --concurrency 30 --distinct-ips

It is the first thing to run before a launch with ads (docs/LAUNCH_CHECKLIST.md). Every virtual person
opens the survey page and then submits one response; the report gives the outcome counts and the
latency of each step.

The public submit is limited per person (about 40 per 3 minutes per address, see
public_suggest_rate_limit.py). From one computer through nginx, everything beyond that comes back as
429 and says nothing about capacity. ``--distinct-ips`` gives every request its own address in
X-Real-IP; the API believes that header only from a private peer, so use it from inside the Docker
network, straight to the API container (``--base-url http://api:8000``), never against the public
address. The survey must be open, public and have room in the owner's response quota (or the answers
are kept but locked, which is also worth seeing: they still come back 201).
"""

from __future__ import annotations

import argparse
import asyncio
import random
import statistics
import sys
import time
from collections import Counter
from typing import Any

import httpx


def required_answers(pages: Any) -> dict[str, Any]:
    """A non-empty answer for every required question; the server checks only that they are filled."""
    answers: dict[str, Any] = {}

    def walk(fields: Any) -> None:
        for field in fields or []:
            if not isinstance(field, dict):
                continue
            if field.get("required") and field.get("id"):
                answers[str(field["id"])] = "тест"
            walk(field.get("children"))

    for page in pages or []:
        if isinstance(page, dict):
            walk(page.get("fields"))
    return answers


def random_address() -> str:
    return ".".join(str(random.randint(1, 254)) for _ in range(4))


def percentile(values: list[float], share: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(len(ordered) * share))]


async def one_person(
    client: httpx.AsyncClient, token: str, distinct_ips: bool, outcomes: Counter, times: dict[str, list[float]]
) -> None:
    headers = {"X-Real-IP": random_address()} if distinct_ips else {}
    started = time.perf_counter()
    try:
        page = await client.get(f"/public/surveys/{token}", headers=headers)
    except httpx.HTTPError as exc:
        outcomes[f"open: {exc.__class__.__name__}"] += 1
        return
    times["open"].append(time.perf_counter() - started)
    outcomes[f"open {page.status_code}"] += 1
    if page.status_code != 200:
        return
    payload = {"answers": required_answers(page.json().get("pages")), "duration_seconds": 30}
    started = time.perf_counter()
    try:
        sent = await client.post(f"/public/surveys/{token}/responses", json=payload, headers=headers)
    except httpx.HTTPError as exc:
        outcomes[f"submit: {exc.__class__.__name__}"] += 1
        return
    times["submit"].append(time.perf_counter() - started)
    outcomes[f"submit {sent.status_code}"] += 1


async def run(args: argparse.Namespace) -> int:
    outcomes: Counter = Counter()
    times: dict[str, list[float]] = {"open": [], "submit": []}
    gate = asyncio.Semaphore(args.concurrency)
    limits = httpx.Limits(max_connections=args.concurrency, max_keepalive_connections=args.concurrency)

    async with httpx.AsyncClient(base_url=args.base_url.rstrip("/"), timeout=30.0, limits=limits) as client:

        async def guarded() -> None:
            async with gate:
                await one_person(client, args.token, args.distinct_ips, outcomes, times)

        started = time.perf_counter()
        await asyncio.gather(*(guarded() for _ in range(args.requests)))
        elapsed = time.perf_counter() - started

    print(f"{args.requests} человек, {args.concurrency} одновременно, {elapsed:.1f} с, "
          f"{args.requests / elapsed:.1f} человек/с")
    print("Исходы:")
    for name, count in sorted(outcomes.items()):
        print(f"  {name}: {count}")
    for step, values in times.items():
        if values:
            print(
                f"{step}: p50 {statistics.median(values) * 1000:.0f} мс, "
                f"p95 {percentile(values, 0.95) * 1000:.0f} мс, макс {max(values) * 1000:.0f} мс"
            )
    accepted = outcomes.get("submit 201", 0)
    throttled = outcomes.get("submit 429", 0)
    if throttled and not args.distinct_ips:
        print("Часть ответов отбита лимитом на одного человека (429): это не ёмкость. См. --distinct-ips.")
    failed = sum(
        count for name, count in outcomes.items()
        if name not in ("open 200", "submit 201") and not name.endswith(" 429")
    )
    print(f"Принято ответов: {accepted} из {args.requests}.")
    return 1 if failed else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Нагрузка на публичную страницу опроса и приём ответов")
    parser.add_argument("--base-url", required=True, help="адрес API, например http://api:8000")
    parser.add_argument("--token", required=True, help="публичный токен открытого опроса")
    parser.add_argument("--requests", type=int, default=200, help="сколько человек пройдут опрос")
    parser.add_argument("--concurrency", type=int, default=20, help="сколько одновременно")
    parser.add_argument(
        "--distinct-ips", action="store_true",
        help="у каждого запроса свой адрес (только изнутри сети Docker прямо в API)",
    )
    return asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    sys.exit(main())
