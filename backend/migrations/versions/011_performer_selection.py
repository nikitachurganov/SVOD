"""Performer selection: contractors, assignments, member profiles, hints, analytics.

Revision ID: 011_performer_selection
Revises: 010_add_ai_analysis
Create Date: 2026-04-19
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "011_performer_selection"
down_revision: Union[str, None] = "010_add_ai_analysis"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "external_contractors",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("full_name", sa.String(length=500), nullable=False),
        sa.Column(
            "organization",
            sa.String(length=500),
            nullable=True,
            comment="Contractor company name",
        ),
        sa.Column("specialization", sa.Text(), nullable=True),
        sa.Column("position", sa.String(length=300), nullable=True),
        sa.Column("geography", sa.String(length=300), nullable=True),
        sa.Column("contact_kind", sa.String(length=50), nullable=True),
        sa.Column("contact_value", sa.String(length=500), nullable=True),
        sa.Column(
            "rating",
            sa.Numeric(4, 2),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_external_contractors_organization_id",
        "external_contractors",
        ["organization_id"],
    )

    op.add_column(
        "organization_members",
        sa.Column("job_title", sa.String(length=300), nullable=True),
    )
    op.add_column(
        "organization_members",
        sa.Column("specialization", sa.Text(), nullable=True),
    )
    op.add_column(
        "organization_members",
        sa.Column("geography", sa.String(length=300), nullable=True),
    )

    op.add_column(
        "forms",
        sa.Column("performer_hints", postgresql.JSONB(), nullable=True),
    )

    op.add_column(
        "requests",
        sa.Column("assigned_kind", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "requests",
        sa.Column(
            "assigned_internal_user_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.add_column(
        "requests",
        sa.Column(
            "assigned_external_contractor_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_requests_assigned_internal_user_id_users",
        "requests",
        "users",
        ["assigned_internal_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_requests_assigned_external_contractor_id",
        "requests",
        "external_contractors",
        ["assigned_external_contractor_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_requests_assigned_internal_user_id",
        "requests",
        ["assigned_internal_user_id"],
    )
    op.create_index(
        "ix_requests_assigned_external_contractor_id",
        "requests",
        ["assigned_external_contractor_id"],
    )

    op.create_check_constraint(
        "ck_requests_assigned_kind_consistency",
        "requests",
        "assigned_kind IS NULL "
        "OR assigned_kind IN ('internal', 'external')",
    )
    op.create_check_constraint(
        "ck_requests_assigned_fk_consistency",
        "requests",
        "(assigned_kind IS NULL AND assigned_internal_user_id IS NULL "
        "AND assigned_external_contractor_id IS NULL) "
        "OR (assigned_kind = 'internal' AND assigned_internal_user_id IS NOT NULL "
        "AND assigned_external_contractor_id IS NULL) "
        "OR (assigned_kind = 'external' AND assigned_external_contractor_id IS NOT NULL "
        "AND assigned_internal_user_id IS NULL)",
    )

    op.create_table(
        "performer_selection_analytics",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("request_id", sa.Integer(), nullable=False),
        sa.Column("event", sa.String(length=50), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["request_id"],
            ["requests.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_performer_selection_analytics_org",
        "performer_selection_analytics",
        ["organization_id"],
    )
    op.create_index(
        "ix_performer_selection_analytics_request",
        "performer_selection_analytics",
        ["request_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_performer_selection_analytics_request",
        table_name="performer_selection_analytics",
    )
    op.drop_index(
        "ix_performer_selection_analytics_org",
        table_name="performer_selection_analytics",
    )
    op.drop_table("performer_selection_analytics")

    op.drop_constraint("ck_requests_assigned_fk_consistency", "requests", type_="check")
    op.drop_constraint("ck_requests_assigned_kind_consistency", "requests", type_="check")
    op.drop_index("ix_requests_assigned_external_contractor_id", table_name="requests")
    op.drop_index("ix_requests_assigned_internal_user_id", table_name="requests")
    op.drop_constraint(
        "fk_requests_assigned_external_contractor_id", "requests", type_="foreignkey"
    )
    op.drop_constraint(
        "fk_requests_assigned_internal_user_id_users", "requests", type_="foreignkey"
    )
    op.drop_column("requests", "assigned_external_contractor_id")
    op.drop_column("requests", "assigned_internal_user_id")
    op.drop_column("requests", "assigned_kind")

    op.drop_column("forms", "performer_hints")

    op.drop_column("organization_members", "geography")
    op.drop_column("organization_members", "specialization")
    op.drop_column("organization_members", "job_title")

    op.drop_index("ix_external_contractors_organization_id", table_name="external_contractors")
    op.drop_table("external_contractors")
