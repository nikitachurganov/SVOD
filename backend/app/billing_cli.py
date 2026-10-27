"""Operator commands, run on the server: python -m app.billing_cli <command>."""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.billing_plans import PLAN_RESEARCHER, STATUS_ACTIVE, get_plan
from app.constants.roles import ROLE_ADMIN
from app.core.config import settings
from app.core.database import async_session_factory, engine
from app.models.subscription import Subscription
from app.models.user import User
from app.repositories import billing_repository, survey_repository, user_repository
from app.services import billing_service, launch_service
from app.services import subscription_lifecycle_service as lifecycle

BETA_NOTE = "beta"
BETA_BATCH = 200
SHOWN_EVENTS = 10


class CliError(Exception):
    """A problem the operator can fix; shown without a traceback."""


async def _find_user(session: AsyncSession, email: str) -> User:
    user = await user_repository.get_by_email_ignore_case(session, email.strip())
    if user is None:
        raise CliError(f"Пользователь {email} не найден")
    return user


async def make_admin(session: AsyncSession, email: str) -> tuple[User, bool]:
    """Give the account the admin role (no commit). The second value is False if it already had it."""
    user = await _find_user(session, email)
    if not user.is_active:
        raise CliError(f"Аккаунт {user.email} отключён, администратором его делать нельзя")
    if user.role == ROLE_ADMIN:
        return user, False
    user.role = ROLE_ADMIN
    return user, True


async def unlock_responses(session: AsyncSession, email: str) -> tuple[User, int]:
    """Open the responses the quota kept back (no commit): for a manual upgrade or a repair."""
    user = await _find_user(session, email)
    return user, await billing_service.unlock_responses(session, user.id)


async def grant_plan(
    session: AsyncSession,
    email: str,
    plan: str,
    *,
    days: int | None,
    until: datetime | None,
    note: str | None,
) -> tuple[User, Subscription]:
    """Give a paid plan by hand (no commit): payment by invoice, a gift, a compensation."""
    user = await _find_user(session, email)
    try:
        sub = await lifecycle.grant(session, user.id, plan, days=days, until=until, note=note)
    except ValueError as exc:
        raise CliError(str(exc)) from exc
    return user, sub


async def grant_beta(
    session: AsyncSession, until: datetime, *, dry_run: bool = False
) -> tuple[int, int]:
    """Give every active account the paid plan until the date; commits after every batch.

    Accounts that already have the paid plan for at least that long are left as they are.
    Returns (granted, skipped); with ``dry_run`` nothing is written and "granted" is how many would be.
    """
    granted = skipped = 0
    last_id = None
    while True:
        ids = await user_repository.list_active_ids(session, after_id=last_id, limit=BETA_BATCH)
        if not ids:
            break
        last_id = ids[-1]
        for user_id in ids:
            sub = await billing_repository.get_subscription(session, user_id)
            if (
                sub is not None
                and sub.plan_code == PLAN_RESEARCHER
                and sub.status == STATUS_ACTIVE
                and sub.current_period_end >= until
            ):
                skipped += 1
                continue
            granted += 1
            if not dry_run:
                await lifecycle.grant(session, user_id, PLAN_RESEARCHER, until=until, note=BETA_NOTE)
        if not dry_run:
            await session.commit()
    return granted, skipped


def _moment(value: datetime | None) -> str:
    return value.astimezone(timezone.utc).strftime("%d.%m.%Y %H:%M") if value else "—"


async def show_user(session: AsyncSession, email: str) -> str:
    """What the operator needs to answer "what is going on with this account" (read only)."""
    user = await _find_user(session, email)
    now = datetime.now(timezone.utc)
    lines = [
        f"{user.email} — {user.full_name}",
        f"Роль: {user.role}; аккаунт {'активен' if user.is_active else 'отключён'}; "
        f"почта {'подтверждена' if user.email_verified_at else 'не подтверждена'}; "
        f"ИИ {'включён' if user.ai_enabled else 'выключен'}",
        "Удаление: "
        + (f"запланировано, запрошено {_moment(user.deletion_requested_at)}" if user.deletion_requested_at else "нет"),
    ]
    sub = await billing_repository.get_subscription(session, user.id)
    if sub is None:
        lines.append("Подписки ещё нет: до первого обращения действует бесплатный тариф «Старт».")
        return "\n".join(lines)

    ent = billing_service.resolve_entitlements(sub, now, settings.BILLING_PAST_DUE_GRACE_DAYS)
    stored = get_plan(sub.plan_code).title
    lines.append(
        f"Тариф: «{stored}», статус {sub.status}; действует «{ent.plan.title}»; "
        f"период {_moment(ent.period_start)} — {_moment(ent.period_end)}"
        + ("; продление отключено" if sub.cancel_at_period_end else "")
    )
    lines.append(
        "Пробный период: "
        + (f"использован {_moment(sub.trial_used_at)}" if sub.trial_used_at else "не использован")
    )
    if sub.limit_overrides:
        lines.append(f"Индивидуальные лимиты: {sub.limit_overrides}")
    used = await billing_repository.get_usage(session, user.id, ent.period_start)
    locked = await survey_repository.count_locked_for_owner(session, user.id)
    lines.append(
        f"Использовано в периоде: ИИ-действий {used.get('ai_actions', 0)}, "
        f"ответов {used.get('responses', 0)}; скрытых ответов {locked}"
    )
    events = await billing_repository.list_events(session, sub.id, limit=SHOWN_EVENTS)
    if events:
        lines.append("Последние события:")
        lines += [f"  {_moment(e.created_at)}  {e.kind}  {e.payload or ''}" for e in events]
    return "\n".join(lines)


async def _run(args: argparse.Namespace) -> int:
    try:
        async with async_session_factory() as session:
            if args.command == "make-admin":
                user, changed = await make_admin(session, args.email)
                await session.commit()
                print(
                    f"{user.email} теперь администратор."
                    if changed
                    else f"{user.email} уже администратор."
                )
            elif args.command == "unlock-responses":
                user, opened = await unlock_responses(session, args.email)
                await session.commit()
                print(f"{user.email}: открыто ответов — {opened}.")
            elif args.command == "grant":
                user, sub = await grant_plan(
                    session, args.email, args.plan, days=args.days, until=args.until, note=args.note
                )
                await session.commit()
                print(
                    f"{user.email}: тариф «{get_plan(sub.plan_code).title}» "
                    f"до {_moment(sub.current_period_end)}."
                )
            elif args.command == "grant-beta":
                granted, skipped = await grant_beta(session, args.until, dry_run=args.dry_run)
                verb = "получили бы" if args.dry_run else "получили"
                print(f"Аккаунтов, которые {verb} тариф: {granted}; уже с таким сроком или длиннее: {skipped}.")
            elif args.command == "show":
                print(await show_user(session, args.email))
            elif args.command == "preflight":
                checks = await launch_service.preflight(session, head_revision=_head_revision())
                print(launch_service.format_checks(checks))
                return 1 if launch_service.has_failures(checks) else 0
            elif args.command == "reset-response-counters":
                rows, counted = await launch_service.reset_response_counters(
                    session, dry_run=args.dry_run
                )
                await session.commit()
                verb = "были бы обнулены" if args.dry_run else "обнулены"
                print(f"Счётчиков ответов, которые {verb}: {rows} (ответов в них: {counted}).")
                if settings.BILLING_ENFORCE and not args.dry_run:
                    print("Внимание: лимиты уже блокируют, обнулять счётчики нужно было до их включения.")
            elif args.command == "funnel":
                _, report = await launch_service.funnel(session, days=args.days)
                print(report)
        return 0
    except CliError as exc:
        print(f"Ошибка: {exc}", file=sys.stderr)
        return 1
    finally:
        await engine.dispose()


def _head_revision() -> str | None:
    """The newest migration of this code, or None when it cannot be told (run outside the backend folder)."""
    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory

        return ScriptDirectory.from_config(Config("alembic.ini")).get_current_head()
    except Exception:
        return None


def _end_of_day(value: str) -> datetime:
    """A date typed by the operator, meaning the end of that day (UTC)."""
    try:
        day = datetime.strptime(value, "%Y-%m-%d")
    except ValueError as exc:
        raise argparse.ArgumentTypeError("дата в формате ГГГГ-ММ-ДД") from exc
    return day.replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.billing_cli")
    commands = parser.add_subparsers(dest="command", required=True)

    admin = commands.add_parser("make-admin", help="назначить пользователя администратором")
    admin.add_argument("email", help="почта аккаунта")

    unlock = commands.add_parser(
        "unlock-responses", help="открыть ответы, которые держала квота тарифа"
    )
    unlock.add_argument("email", help="почта владельца опросов")

    grant = commands.add_parser(
        "grant", help="выдать платный тариф: оплата по счёту, подарок, компенсация"
    )
    grant.add_argument("email", help="почта аккаунта")
    grant.add_argument("--plan", default=PLAN_RESEARCHER, help="код тарифа (по умолчанию researcher)")
    term = grant.add_mutually_exclusive_group(required=True)
    term.add_argument("--days", type=int, help="на сколько дней; прибавляется к действующему периоду")
    term.add_argument("--until", type=_end_of_day, help="до какой даты включительно, ГГГГ-ММ-ДД")
    grant.add_argument("--note", default=None, help="пометка в журнале, например номер счёта")

    beta = commands.add_parser(
        "grant-beta", help="выдать всем активным аккаунтам платный тариф до даты (бета-доступ)"
    )
    beta.add_argument("--until", type=_end_of_day, required=True, help="до какой даты, ГГГГ-ММ-ДД")
    beta.add_argument("--dry-run", action="store_true", help="только посчитать, ничего не менять")

    show = commands.add_parser("show", help="тариф, использование и события аккаунта")
    show.add_argument("email", help="почта аккаунта")

    commands.add_parser(
        "preflight", help="проверить, готов ли сервис к платному запуску (код выхода 1, если нет)"
    )

    reset = commands.add_parser(
        "reset-response-counters",
        help="обнулить счётчик ответов, накопленный в теневом режиме, перед включением лимитов",
    )
    reset.add_argument("--dry-run", action="store_true", help="только посчитать, ничего не менять")

    funnel = commands.add_parser(
        "funnel", help="как далеко дошли зарегистрировавшиеся: почта, опрос, ответ, пробный период, оплата"
    )
    funnel.add_argument("--days", type=int, default=30, help="за сколько дней (по умолчанию 30)")

    return asyncio.run(_run(parser.parse_args(argv)))


if __name__ == "__main__":
    sys.exit(main())
