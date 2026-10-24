"""Outgoing email over SMTP (stdlib smtplib, run in a worker thread)."""

from __future__ import annotations

import asyncio
import html
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from app.core.config import settings

logger = logging.getLogger(__name__)


def is_configured() -> bool:
    return bool(settings.SMTP_HOST.strip() and (settings.SMTP_FROM.strip() or settings.SMTP_USERNAME.strip()))


def _sender() -> str:
    address = settings.SMTP_FROM.strip() or settings.SMTP_USERNAME.strip()
    return formataddr(("СВОД", address))


def _send_sync(message: EmailMessage) -> None:
    security = settings.SMTP_SECURITY.strip().lower()
    timeout = settings.SMTP_TIMEOUT_SECONDS
    if security == "ssl":
        client: smtplib.SMTP = smtplib.SMTP_SSL(
            settings.SMTP_HOST, settings.SMTP_PORT, timeout=timeout, context=ssl.create_default_context()
        )
    else:
        client = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=timeout)
    with client:
        if security == "starttls":
            client.starttls(context=ssl.create_default_context())
        if settings.SMTP_USERNAME:
            client.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        client.send_message(message)


async def send_email(*, to: str, subject: str, text: str, html_body: str | None = None) -> bool:
    """Send an email. Returns False (and logs) instead of raising — callers offer a manual fallback."""
    if not is_configured():
        logger.info("SMTP is not configured, email to %s was not sent: %s", to, subject)
        return False

    message = EmailMessage()
    message["From"] = _sender()
    message["To"] = to
    message["Subject"] = subject
    message["Message-ID"] = make_msgid(domain=(settings.SMTP_FROM or settings.SMTP_USERNAME).split("@")[-1] or None)
    message.set_content(text)
    if html_body:
        message.add_alternative(html_body, subtype="html")

    try:
        await asyncio.to_thread(_send_sync, message)
    except Exception:
        logger.exception("Failed to send email to %s: %s", to, subject)
        return False
    return True


def _button_html(url: str, label: str) -> str:
    safe_url = html.escape(url, quote=True)
    return (
        f'<a href="{safe_url}" style="display:inline-block;padding:10px 18px;border-radius:6px;'
        f'background:#c2410c;color:#ffffff;text-decoration:none;font-weight:600">{html.escape(label)}</a>'
    )


async def send_account_invitation(
    *,
    to: str,
    first_name: str,
    organization_name: str,
    inviter_name: str,
    activation_url: str,
    ttl_days: int,
) -> bool:
    subject = f"Приглашение в «{organization_name}» — СВОД"
    text = (
        f"Здравствуйте, {first_name}!\n\n"
        f"{inviter_name} добавил(а) вас в организацию «{organization_name}» в сервисе СВОД.\n"
        f"Чтобы войти, подтвердите аккаунт и придумайте пароль по ссылке:\n{activation_url}\n\n"
        f"Ссылка действует {ttl_days} дн. Если вы не ждали это письмо, просто проигнорируйте его."
    )
    body = (
        f"<p>Здравствуйте, {html.escape(first_name)}!</p>"
        f"<p>{html.escape(inviter_name)} добавил(а) вас в организацию "
        f"«{html.escape(organization_name)}» в сервисе СВОД.</p>"
        f"<p>Чтобы войти, подтвердите аккаунт и придумайте пароль:</p>"
        f"<p>{_button_html(activation_url, 'Подтвердить аккаунт')}</p>"
        f"<p style=\"color:#6b7280;font-size:13px\">Ссылка действует {ttl_days} дн. "
        f"Если вы не ждали это письмо, просто проигнорируйте его.</p>"
    )
    return await send_email(to=to, subject=subject, text=text, html_body=body)


async def send_password_reset(
    *,
    to: str,
    first_name: str,
    reset_url: str,
    ttl_minutes: int,
) -> bool:
    subject = "Восстановление пароля — СВОД"
    text = (
        f"Здравствуйте, {first_name}!\n\n"
        f"Мы получили запрос на смену пароля в сервисе СВОД. Чтобы задать новый пароль, перейдите по ссылке:\n"
        f"{reset_url}\n\n"
        f"Ссылка действует {ttl_minutes} мин. и работает один раз. "
        f"Если вы не запрашивали смену пароля, просто проигнорируйте письмо — пароль останется прежним."
    )
    body = (
        f"<p>Здравствуйте, {html.escape(first_name)}!</p>"
        f"<p>Мы получили запрос на смену пароля в сервисе СВОД.</p>"
        f"<p>{_button_html(reset_url, 'Задать новый пароль')}</p>"
        f"<p style=\"color:#6b7280;font-size:13px\">Ссылка действует {ttl_minutes} мин. и работает один раз. "
        f"Если вы не запрашивали смену пароля, просто проигнорируйте письмо — пароль останется прежним.</p>"
    )
    return await send_email(to=to, subject=subject, text=text, html_body=body)


async def send_organization_invitation(
    *,
    to: str,
    organization_name: str,
    inviter_name: str,
    app_url: str,
) -> bool:
    subject = f"Приглашение в «{organization_name}» — СВОД"
    text = (
        f"{inviter_name} пригласил(а) вас в организацию «{organization_name}» в сервисе СВОД.\n"
        f"Войдите в свой аккаунт, чтобы принять приглашение: {app_url}"
    )
    body = (
        f"<p>{html.escape(inviter_name)} пригласил(а) вас в организацию "
        f"«{html.escape(organization_name)}» в сервисе СВОД.</p>"
        f"<p>{_button_html(app_url, 'Открыть СВОД')}</p>"
        f"<p style=\"color:#6b7280;font-size:13px\">Приглашение появится в уведомлениях после входа.</p>"
    )
    return await send_email(to=to, subject=subject, text=text, html_body=body)
