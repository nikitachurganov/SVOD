"""The address of the person behind a request.

Behind our own nginx every request arrives from the proxy's address, so the peer is useless for telling
people apart (a rate limit "per address" would be one limit for everybody). nginx puts the real address
in ``X-Real-IP`` (it overwrites whatever the client sent). That header is believed only when the peer is
a private address, i.e. our proxy; a request that reaches the API directly from the internet gets its
own address and cannot choose another one with a header.
"""

from __future__ import annotations

import ipaddress

from fastapi import Request

UNKNOWN = "unknown"


def _valid(address: str) -> bool:
    try:
        ipaddress.ip_address(address)
    except ValueError:
        return False
    return True


def client_ip(request: Request) -> str:
    peer = request.client.host if request.client else ""
    if not _valid(peer):
        return peer or UNKNOWN
    peer_ip = ipaddress.ip_address(peer)
    if peer_ip.is_private or peer_ip.is_loopback:
        forwarded = (request.headers.get("x-real-ip") or "").strip()
        if _valid(forwarded):
            return forwarded
    return peer
