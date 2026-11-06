from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.schemas.join_request import ApproveJoinRequest, RejectJoinRequest
from app.services import join_request_service as svc


def org(**overrides):
    data = dict(id=uuid.uuid4(), name="Org", owner_user_id=uuid.uuid4(), join_token="tok", join_link_enabled=True,
                is_personal=False)
    data.update(overrides)
    return SimpleNamespace(**data)


def user(**overrides):
    data = dict(id=uuid.uuid4(), first_name="Анна", last_name="Иванова", middle_name=None,
                email="a@example.com", phone_number="+7900")
    data.update(overrides)
    return SimpleNamespace(**data)


def join_request(o, u, **overrides):
    data = dict(id=uuid.uuid4(), organization_id=o.id, user_id=u.id, status="pending", job_title="Дизайнер",
                specialization=None, message=None, reject_reason=None, decided_by_user_id=None, decided_at=None,
                created_at=datetime.now(timezone.utc), organization=o, user=u)
    data.update(overrides)
    return SimpleNamespace(**data)


class JoinLinkTests(unittest.IsolatedAsyncioTestCase):
    async def test_disabled_link_is_not_found(self):
        session = MagicMock()
        session.scalar = AsyncMock(return_value=org(join_link_enabled=False))
        with self.assertRaises(HTTPException) as ctx:
            await svc.get_join_page(session, "tok")
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_enabling_creates_token_and_regenerate_replaces_it(self):
        o = org(join_token=None, join_link_enabled=False)
        owner = SimpleNamespace(id=o.owner_user_id)
        session = MagicMock()
        session.commit = AsyncMock()
        with patch.object(svc, "_get_org_or_404", AsyncMock(return_value=o)):
            link = await svc.set_join_link_enabled(session, o.id, True, owner)
            first = link.token
            self.assertTrue(link.enabled and first)
            link = await svc.regenerate_join_link(session, o.id, owner)
        self.assertNotEqual(link.token, first)

    async def test_only_owner_manages_link(self):
        o = org()
        with patch.object(svc, "_get_org_or_404", AsyncMock(return_value=o)):
            with self.assertRaises(HTTPException) as ctx:
                await svc.get_join_link(MagicMock(), o.id, SimpleNamespace(id=uuid.uuid4()))
        self.assertEqual(ctx.exception.status_code, 403)


class ApplyTests(unittest.IsolatedAsyncioTestCase):
    async def test_member_cannot_apply(self):
        with patch.object(svc.organization_repository, "get_member", AsyncMock(return_value=object())):
            with self.assertRaises(HTTPException) as ctx:
                await svc._create_request(MagicMock(), org(), user(), job_title=None, specialization=None, message=None)
        self.assertEqual(ctx.exception.status_code, 409)

    async def test_second_pending_request_conflicts(self):
        session = MagicMock()
        session.scalar = AsyncMock(return_value=object())
        with patch.object(svc.organization_repository, "get_member", AsyncMock(return_value=None)):
            with self.assertRaises(HTTPException) as ctx:
                await svc._create_request(session, org(), user(), job_title=None, specialization=None, message=None)
        self.assertEqual(ctx.exception.status_code, 409)

    async def test_request_notifies_owner(self):
        o, u = org(), user()
        session = MagicMock()
        session.scalar = AsyncMock(return_value=None)
        session.flush = AsyncMock()
        session.refresh = AsyncMock()
        with (
            patch.object(svc.organization_repository, "get_member", AsyncMock(return_value=None)),
            patch.object(svc.notification_service, "create_notification", AsyncMock(return_value=True)) as notify,
        ):
            row = await svc._create_request(session, o, u, job_title="Дизайнер", specialization=None, message="Привет")
        self.assertEqual(row.status, "pending")
        self.assertEqual(notify.await_args.kwargs["recipient_user_id"], o.owner_user_id)
        self.assertEqual(notify.await_args.kwargs["notification_type"], "join_request")


class ModerationTests(unittest.IsolatedAsyncioTestCase):
    def _patches(self, row, o):
        return (
            patch.object(svc, "_get_request_or_404", AsyncMock(return_value=row)),
            patch.object(svc, "_get_org_or_404", AsyncMock(return_value=o)),
            patch.object(svc.notification_service, "create_notification", AsyncMock(return_value=True)),
            patch.object(svc.email_service, "send_email", AsyncMock(return_value=False)),
        )

    async def test_approve_creates_member_with_edited_profile(self):
        o, u = org(), user()
        row = join_request(o, u)
        owner = SimpleNamespace(id=o.owner_user_id)
        session = MagicMock()
        session.commit = AsyncMock()
        member = SimpleNamespace(id=uuid.uuid4(), user=u, role_tag="member", joined_at=MagicMock(isoformat=lambda: "t"),
                                 job_title="Старший дизайнер", specialization=None, token_plus_limit=None)
        p = self._patches(row, o)
        with (
            p[0], p[1], p[2], p[3],
            patch.object(svc.organization_repository, "get_member", AsyncMock(side_effect=[None, member])),
            patch.object(svc.organization_repository, "add_member", AsyncMock(return_value=member)) as add_member,
            patch.object(svc.team_seat_service, "ensure_room", AsyncMock()) as ensure_room,
        ):
            await svc.approve(session, row.id, ApproveJoinRequest(job_title="Старший дизайнер"), owner)
        created = add_member.await_args.args[1]
        self.assertEqual(created.job_title, "Старший дизайнер")
        # Nobody chose a role: a working seat, which has to fit into the team
        self.assertEqual(created.role_tag, "editor")
        ensure_room.assert_awaited_once()
        self.assertEqual(row.status, "approved")

    async def test_reject_keeps_reason_and_allows_new_request(self):
        o, u = org(), user()
        row = join_request(o, u)
        session = MagicMock()
        session.commit = AsyncMock()
        p = self._patches(row, o)
        with p[0], p[1], p[2], p[3]:
            await svc.reject(session, row.id, RejectJoinRequest(reason="Нет мест"), SimpleNamespace(id=o.owner_user_id))
        self.assertEqual(row.status, "rejected")
        self.assertEqual(row.reject_reason, "Нет мест")

    async def test_already_decided_request_cannot_be_approved(self):
        o, u = org(), user()
        row = join_request(o, u, status="rejected")
        p = self._patches(row, o)
        with p[0], p[1], p[2], p[3]:
            with self.assertRaises(HTTPException) as ctx:
                await svc.approve(MagicMock(), row.id, ApproveJoinRequest(), SimpleNamespace(id=o.owner_user_id))
        self.assertEqual(ctx.exception.status_code, 409)


class AdminModerationTests(unittest.IsolatedAsyncioTestCase):
    """Admins moderate join requests like the owner, except they cannot make another admin."""

    def setUp(self):
        self.o, self.u = org(), user()
        self.row = join_request(self.o, self.u)
        self.caller = SimpleNamespace(id=uuid.uuid4())
        self.role = "admin"
        self.session = MagicMock()
        self.session.commit = AsyncMock()
        self.member = SimpleNamespace(id=uuid.uuid4(), user=self.u, role_tag="editor",
                                      joined_at=MagicMock(isoformat=lambda: "t"), job_title=None,
                                      specialization=None, token_plus_limit=None)

        async def get_member(session, org_id, user_id):
            if user_id == self.caller.id:
                return SimpleNamespace(role_tag=self.role)
            return None

        for target in (
            patch.object(svc, "_get_request_or_404", AsyncMock(return_value=self.row)),
            patch.object(svc, "_get_org_or_404", AsyncMock(return_value=self.o)),
            patch.object(svc.notification_service, "create_notification", AsyncMock(return_value=True)),
            patch.object(svc.email_service, "send_email", AsyncMock(return_value=False)),
            patch.object(svc.team_seat_service, "ensure_room", AsyncMock()),
            patch.object(svc.organization_repository, "get_member", AsyncMock(side_effect=get_member)),
            patch.object(svc.organization_repository, "add_member", AsyncMock(return_value=self.member)),
        ):
            target.start()
        self.addCleanup(patch.stopall)

    async def test_an_admin_sees_the_requests(self):
        patch.object(svc, "select", MagicMock()).start()
        self.session.scalars = AsyncMock(return_value=MagicMock(all=lambda: [self.row]))

        result = await svc.list_requests(self.session, self.o.id, self.caller)

        self.assertEqual(len(result), 1)

    async def test_an_admin_rejects_a_request(self):
        await svc.reject(self.session, self.row.id, RejectJoinRequest(reason="Нет мест"), self.caller)

        self.assertEqual(self.row.status, "rejected")
        self.assertEqual(self.row.decided_by_user_id, self.caller.id)

    async def test_an_admin_approves_as_a_reader(self):
        with patch.object(svc.organization_repository, "get_member",
                          AsyncMock(side_effect=[SimpleNamespace(role_tag="admin"), None, self.member])):
            await svc.approve(self.session, self.row.id, ApproveJoinRequest(role_tag="reader"), self.caller)

        created = svc.organization_repository.add_member.await_args.args[1]
        self.assertEqual(created.role_tag, "reader")
        self.assertEqual(self.row.status, "approved")

    async def test_an_admin_cannot_approve_as_an_admin(self):
        with self.assertRaises(HTTPException) as ctx:
            await svc.approve(self.session, self.row.id, ApproveJoinRequest(role_tag="admin"), self.caller)

        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(self.row.status, "pending")

    async def test_an_editor_cannot_moderate(self):
        self.role = "editor"

        with self.assertRaises(HTTPException) as ctx:
            await svc.reject(self.session, self.row.id, RejectJoinRequest(reason="x"), self.caller)

        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(self.row.status, "pending")

    async def test_a_stranger_cannot_list(self):
        with self.assertRaises(HTTPException) as ctx:
            await svc.list_requests(self.session, self.o.id, SimpleNamespace(id=uuid.uuid4()))

        self.assertEqual(ctx.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
