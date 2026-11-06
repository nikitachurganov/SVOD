"""Seats in a payment, and how many kit places a subscription still holds

* payments.seats: for how many seats the payment was made (1 for every old payment, which were
  per person);
* subscriptions.kit_extra_seats: how many of the two kit places (the 2nd and the 3rd seat, 300 ₽)
  the team still holds at the kit price. 2 until the 7-day window after the first payment is over;
  after it, only as many as the team kept (docs/TARIFFS_FINAL.md section 4.3).

Revision ID: 047_checkout_seats
Revises: 046_ai_usage_pool
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "047_checkout_seats"
down_revision: Union[str, None] = "046_ai_usage_pool"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "payments",
        sa.Column("seats", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "subscriptions",
        sa.Column("kit_extra_seats", sa.Integer(), nullable=False, server_default="2"),
    )


def downgrade() -> None:
    op.drop_column("subscriptions", "kit_extra_seats")
    op.drop_column("payments", "seats")
