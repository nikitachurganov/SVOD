"""Roles of a team and what each of them may do (docs/TARIFFS_FINAL.md, stage 1 of the plan).

Four roles, from the strongest down:

* owner  - everything, plus billing and handing the team over;
* admin  - everything except billing: members, roles, personal limits;
* editor - creates and edits surveys, runs data collection, uses the AI;
* reader - looks at surveys and results, changes nothing, spends no AI.

The reader is free: it takes no seat. The other three do. The legacy tag "member" (everything
before the tariffs) is an editor, so an old team keeps working exactly as it did.
"""

from __future__ import annotations

ROLE_OWNER = "owner"
ROLE_ADMIN = "admin"
ROLE_EDITOR = "editor"
ROLE_READER = "reader"

# The tag every membership had before the four roles
LEGACY_ROLE_MEMBER = "member"

ROLES = (ROLE_OWNER, ROLE_ADMIN, ROLE_EDITOR, ROLE_READER)
# Roles that may be given to a person (the owner is changed only by handing the team over)
ASSIGNABLE_ROLES = (ROLE_ADMIN, ROLE_EDITOR, ROLE_READER)

# The role a person gets when nobody chose one: a working seat, as before the tariffs
DEFAULT_ROLE = ROLE_EDITOR

# The seat limit while billing is switched off
SEATS_UNLIMITED = 1_000_000_000

# Readers are free, so their number is capped to keep the "free" role from being a loophole
MAX_READERS_PER_TEAM = 10

_RANK = {ROLE_READER: 0, ROLE_EDITOR: 1, ROLE_ADMIN: 2, ROLE_OWNER: 3}


def normalize_role(tag: str | None) -> str:
    """Any stored tag as one of the four roles; the legacy "member" is an editor.

    An unknown tag falls to the weakest role, so a bad value in the database can never widen
    anyone's rights.
    """
    if tag == LEGACY_ROLE_MEMBER:
        return ROLE_EDITOR
    return tag if tag in _RANK else ROLE_READER


def has_at_least(tag: str | None, minimum: str) -> bool:
    return _RANK[normalize_role(tag)] >= _RANK[minimum]


def can_edit(tag: str | None) -> bool:
    """Create and change surveys, run the collection, use the AI."""
    return has_at_least(tag, ROLE_EDITOR)


def can_manage_members(tag: str | None) -> bool:
    """Invite, remove, change roles, set personal limits."""
    return has_at_least(tag, ROLE_ADMIN)


def can_manage_billing(tag: str | None) -> bool:
    return normalize_role(tag) == ROLE_OWNER


def takes_seat(tag: str | None) -> bool:
    """Every role but the reader is paid for with a seat."""
    return normalize_role(tag) != ROLE_READER


def parse_assignable_role(tag: str | None) -> str | None:
    """The role as the API accepts it, or None for anything that cannot be assigned.

    The legacy "member" is still accepted from old clients and means an editor.
    """
    role = ROLE_EDITOR if tag == LEGACY_ROLE_MEMBER else tag
    return role if role in ASSIGNABLE_ROLES else None
