"""billing: subscriptions, their journal, usage counters and the AI usage log

A user's subscription row is created lazily on first use, so this migration does not touch the
existing users and rolling it back loses nothing but the billing data itself.

Revision ID: 037_billing
Revises: 036_email_verification
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "037_billing"
down_revision: Union[str, None] = "036_email_verification"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("plan_code", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("billing_interval", sa.String(length=16), nullable=False),
        sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("trial_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancel_at_period_end", sa.Boolean(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=True),
        sa.Column("provider_subscription_id", sa.String(length=255), nullable=True),
        sa.Column("payment_method_ref", sa.String(length=255), nullable=True),
        sa.Column("limit_overrides", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_subscriptions_user_id", "subscriptions", ["user_id"], unique=True)

    op.create_table(
        "subscription_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "subscription_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("subscriptions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=True),
        sa.Column(
            "actor_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_subscription_events_subscription_id", "subscription_events", ["subscription_id"]
    )

    op.create_table(
        "usage_counters",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("metric", sa.String(length=32), nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("value", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("user_id", "metric", "period_start"),
    )

    op.create_table(
        "ai_usage_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("survey_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("calls", sa.Integer(), nullable=False),
        sa.Column("model", sa.String(length=100), nullable=True),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False),
        sa.Column("completion_tokens", sa.Integer(), nullable=False),
        sa.Column("cost_usd", sa.Numeric(precision=12, scale=6), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_ai_usage_log_user_id_created_at", "ai_usage_log", ["user_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_table("ai_usage_log")
    op.drop_table("usage_counters")
    op.drop_table("subscription_events")
    op.drop_table("subscriptions")
