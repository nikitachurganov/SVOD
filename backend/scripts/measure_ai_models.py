"""Measures what the four AI actions cost on one or more OpenRouter models.

Stage 0.2 of docs/TARIFFS_IMPLEMENTATION_PLAN.md: replaces the estimate "1M of Tokens+ costs 150 RUB"
with a measured number. The actions run through the real service code and the real prompts, so the
token counts are the ones production would see; only the survey data for the analysis actions is
synthetic.

  build    create a survey from a description         (2 LLM calls)
  edit     change an existing survey in the chat      (1 call)
  summary  AI summary of the results                  (1 call)
  chat     a question to the AI chat about the results (2 calls)

Run from backend/ (it reads backend/.env, so OPENROUTER_API_KEY must be set). It SPENDS MONEY on the
OpenRouter account of that key; --max-cost-usd stops it when the total reaches the cap.

  python scripts/measure_ai_models.py --dry-run
  python scripts/measure_ai_models.py --models z-ai/glm-5.3-flash,anthropic/claude-sonnet-4.5 --runs 5

Nothing is written to the database.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.schemas.survey import SurveyAiBuildRequest, SurveyAiChatMessage  # noqa: E402
from app.services import ai_usage  # noqa: E402
from app.services import survey_ai_analysis_service as analysis  # noqa: E402
from app.services import survey_ai_builder_service as builder  # noqa: E402

SCENARIOS = ("build", "edit", "summary", "chat")
# Share of each action in real use (docs/PRICING_TARIFFS.md, 3.4)
MIX = {"build": 0.10, "edit": 0.30, "summary": 0.20, "chat": 0.40}

BUILD_REQUEST = (
    "Хочу опрос для студентов о том, как им даётся онлайн-курс по статистике: "
    "удовлетворённость, сложность материала, нагрузка и что стоит улучшить. "
    "Нужен NPS и пара открытых вопросов."
)
EDIT_REQUEST = "Добавь вопрос про качество обратной связи от преподавателя и сократи опрос до 12 вопросов."
CHAT_QUESTION = "Чем недовольны те, кто поставил низкую оценку курса, и что они пишут в открытых ответах?"


def _synthetic_results() -> dict:
    """A digest shaped like survey_ai_analysis_service.results_digest, for 120 respondents."""
    texts = [
        "Слишком много теории и мало практики на занятиях",
        "Задания приходят поздно вечером, не успеваю сдавать",
        "Преподаватель объясняет понятно, но темп очень быстрый",
        "Нет обратной связи по домашним работам, непонятно за что снизили балл",
        "Хотелось бы больше примеров из реальных исследований",
    ]
    return {
        "survey": "Онлайн-курс по статистике: обратная связь студентов",
        "responses_used": 120,
        "responses_excluded_by_quality": 6,
        "completion_rate_percent": 87.5,
        "median_duration_seconds": 214,
        "metrics": [
            {
                "name": "NPS",
                "value": 18,
                "unit": "п.п.",
                "n": 120,
                "details": {"promoters": 44, "passives": 40, "detractors": 36},
                "interpretation": "Умеренно положительный",
            }
        ],
        "questions": [
            {
                "id": f"q{i}",
                "question": f"Насколько вы согласны с утверждением №{i} о курсе?",
                "kind": "choice",
                "answered": 118,
                "options": [
                    {"label": label, "percent": pct}
                    for label, pct in zip(
                        ("Полностью согласен", "Скорее согласен", "Затрудняюсь", "Не согласен"),
                        (31.0, 37.5, 14.0, 17.5),
                    )
                ],
            }
            for i in range(1, 7)
        ]
        + [
            {"id": "q7", "question": "Оцените нагрузку", "kind": "scale", "answered": 119,
             "mean": 3.6, "median": 4.0, "std": 1.1},
            {"id": "q8", "question": "Что стоит улучшить в курсе?", "kind": "text", "answered": 97,
             "samples": texts},
            {"id": "q9", "question": "Что вам понравилось больше всего?", "kind": "text",
             "answered": 90, "samples": texts[::-1]},
        ],
    }


def _synthetic_chat_data() -> dict:
    results = _synthetic_results()
    texts = results["questions"][-2]["samples"]
    return {
        "overall": results,
        "quotes": {
            f"r{i}": {"question": "Что стоит улучшить в курсе?", "text": f"{texts[i % len(texts)]} ({i})"}
            for i in range(30)
        },
        "questions": [
            {"id": q["id"], "question": q["question"], "kind": q["kind"]} for q in results["questions"]
        ],
    }


class Context:
    """What one model carries from the 'build' run to the 'edit' run."""

    def __init__(self) -> None:
        self.pages: list | None = None
        self.title = ""
        self.meta: dict | None = None
        self.reply = ""


async def run_scenario(name: str, ctx: Context) -> None:
    if name == "build":
        response = await builder.build_survey(
            SurveyAiBuildRequest(messages=[SurveyAiChatMessage(role="user", content=BUILD_REQUEST)])
        )
        if response.pages is None:
            raise RuntimeError("the model returned no pages")
        ctx.pages, ctx.title = response.pages, response.title or ""
        ctx.meta, ctx.reply = response.methodology_meta, response.reply
    elif name == "edit":
        if ctx.pages is None:
            raise RuntimeError("no survey from the 'build' run to edit")
        await builder.build_survey(
            SurveyAiBuildRequest(
                messages=[
                    SurveyAiChatMessage(role="user", content=BUILD_REQUEST),
                    SurveyAiChatMessage(role="assistant", content=ctx.reply or "Готово."),
                    SurveyAiChatMessage(role="user", content=EDIT_REQUEST),
                ],
                title=ctx.title,
                pages=ctx.pages,
                methodology_meta=ctx.meta,
            )
        )
    elif name == "summary":
        await analysis._call_llm(
            [
                {"role": "system", "content": analysis._SUMMARY_PROMPT},
                {"role": "user", "content": analysis._data_block(_synthetic_results())},
            ],
            max_tokens=1200,
            timeout=90.0,
        )
    elif name == "chat":
        data = _synthetic_chat_data()
        await analysis._call_llm(
            [
                {"role": "system", "content": analysis._PLAN_PROMPT},
                {"role": "system", "content": analysis._data_block({"questions": data["questions"]})},
                {"role": "user", "content": CHAT_QUESTION},
            ],
            max_tokens=600,
            timeout=60.0,
        )
        await analysis._call_llm(
            [
                {"role": "system", "content": analysis._ANSWER_PROMPT},
                {"role": "system", "content": analysis._data_block(data)},
                {"role": "user", "content": CHAT_QUESTION},
            ],
            max_tokens=2500,
            timeout=120.0,
        )
    else:
        raise ValueError(name)


async def measure(args: argparse.Namespace) -> list[dict]:
    rows: list[dict] = []
    spent = Decimal(0)
    scenarios = [s for s in SCENARIOS if s in args.scenarios]
    for model in args.models:
        settings.OPENROUTER_MODEL = model
        if args.effort is not None:
            settings.OPENROUTER_REASONING_EFFORT = args.effort
        ctx = Context()
        for run in range(1, args.runs + 1):
            for scenario in scenarios:
                if spent >= Decimal(str(args.max_cost_usd)):
                    print(f"STOP: cost cap {args.max_cost_usd} USD reached", file=sys.stderr)
                    return rows
                collector = ai_usage.UsageCollector()
                token = ai_usage.activate(collector)
                ok, error = True, ""
                try:
                    await run_scenario(scenario, ctx)
                except Exception as exc:  # a failed run still cost tokens, so it stays in the log
                    ok, error = False, f"{type(exc).__name__}: {exc}"[:160]
                finally:
                    ai_usage.deactivate(token)
                spent += collector.cost_usd
                rows.append(
                    {
                        "scenario": scenario,
                        "model": model,
                        "run": run,
                        "ok": int(ok),
                        "calls": collector.calls,
                        "prompt_tokens": collector.prompt_tokens,
                        "completion_tokens": collector.completion_tokens,
                        "cost_usd": float(collector.cost_usd),
                        "error": error,
                    }
                )
                tokens = collector.prompt_tokens + collector.completion_tokens
                print(
                    f"{model:<40} {scenario:<8} run {run}: "
                    f"{'ok ' if ok else 'ERR'} {tokens:>6} tok  ${collector.cost_usd:.4f}  {error}"
                )
    return rows


def report(rows: list[dict], rate: float, surcharge: float) -> None:
    factor = rate * (1 + surcharge)
    print(f"\nRUB = USD x {rate} x {1 + surcharge:.2f} (exchange rate and top-up surcharge)\n")
    for model in dict.fromkeys(r["model"] for r in rows):
        per_action: dict[str, tuple[float, float]] = {}
        print(f"== {model}")
        print(f"{'action':<9}{'ok/runs':>8}{'prompt':>9}{'compl.':>9}{'tokens':>9}{'RUB/action':>12}{'RUB/1M tok':>12}")
        for scenario in SCENARIOS:
            mine = [r for r in rows if r["model"] == model and r["scenario"] == scenario]
            if not mine:
                continue
            n = len(mine)
            prompt = sum(r["prompt_tokens"] for r in mine) / n
            compl = sum(r["completion_tokens"] for r in mine) / n
            cost = sum(r["cost_usd"] for r in mine) / n
            tokens = prompt + compl
            per_action[scenario] = (tokens, cost)
            ok = sum(r["ok"] for r in mine)
            rub_m = cost * factor / tokens * 1_000_000 if tokens else 0
            print(
                f"{scenario:<9}{f'{ok}/{n}':>8}{prompt:>9.0f}{compl:>9.0f}{tokens:>9.0f}"
                f"{cost * factor:>12.2f}{rub_m:>12.0f}"
            )
        weight = sum(MIX[s] for s in per_action)
        tok = sum(MIX[s] * per_action[s][0] for s in per_action) / weight
        cost = sum(MIX[s] * per_action[s][1] for s in per_action) / weight
        if tok:
            blended = cost * factor / tok * 1_000_000
            print(
                f"{'MIX':<9}{'':>8}{'':>9}{'':>9}{tok:>9.0f}{cost * factor:>12.2f}{blended:>12.0f}"
                f"   <- cost of 1M tokens by the real mix of actions"
            )
            print(f"   2M tokens per seat = about {2_000_000 / tok:.0f} actions, "
                  f"up to {2 * blended:.0f} RUB at 100 % use\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--models", default=settings.OPENROUTER_MODEL, help="comma-separated OpenRouter ids")
    parser.add_argument("--runs", type=int, default=5, help="repetitions of every action per model")
    parser.add_argument("--scenarios", default=",".join(SCENARIOS))
    parser.add_argument("--effort", default=None, help="reasoning effort (low/medium/high), '' to omit")
    parser.add_argument("--rate", type=float, default=90.0, help="RUB per USD")
    parser.add_argument("--surcharge", type=float, default=0.10, help="top-up surcharge on top of the rate")
    parser.add_argument("--max-cost-usd", type=float, default=2.0, help="stop when the total reaches this")
    parser.add_argument("--out", default="ai_measure.csv", help="CSV with every run")
    parser.add_argument("--dry-run", action="store_true", help="print the plan, call nothing")
    args = parser.parse_args()
    args.models = [m.strip() for m in args.models.split(",") if m.strip()]
    args.scenarios = [s.strip() for s in args.scenarios.split(",") if s.strip()]

    calls = {"build": 2, "edit": 1, "summary": 1, "chat": 2}
    planned = args.runs * sum(calls[s] for s in args.scenarios if s in calls) * len(args.models)
    print(f"models: {args.models}\nscenarios: {args.scenarios}, runs: {args.runs}")
    print(f"about {planned} LLM calls, cost cap {args.max_cost_usd} USD, output {args.out}")
    if args.dry_run:
        print("dry run: nothing was called")
        return

    rows = asyncio.run(measure(args))
    if rows:
        with open(args.out, "w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
        report(rows, args.rate, args.surcharge)
        print(f"every run saved to {args.out}")
        print(json.dumps({"total_cost_usd": round(sum(r['cost_usd'] for r in rows), 4)}))


if __name__ == "__main__":
    main()
