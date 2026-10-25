#!/usr/bin/env python3
"""Build deploy/xray/config.json (HTTP proxy :8118 -> VLESS) from a vless:// link or a subscription URL.

Usage on the server:  python3 deploy/xray/make_config.py 'vless://...'   (or a https:// subscription URL)
The generated config contains secrets and is git-ignored.
"""
import base64
import json
import sys
import urllib.request
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

OUT = Path(__file__).with_name("config.json")


def first_vless_link(source: str) -> str:
    if source.startswith("vless://"):
        return source
    req = urllib.request.Request(source, headers={"User-Agent": "Happ/1.0"})
    raw = urllib.request.urlopen(req, timeout=20).read().strip()
    try:
        raw = base64.b64decode(raw + b"=" * (-len(raw) % 4))
    except ValueError:
        pass
    for line in raw.decode("utf-8", "ignore").splitlines():
        if line.strip().startswith("vless://"):
            return line.strip()
    sys.exit("No vless:// link found. In Happ open a server and copy its link, then pass it directly.")


def build(link: str) -> dict:
    url = urlsplit(link)
    q = {k: v[0] for k, v in parse_qs(url.query).items()}
    network = q.get("type", "tcp")
    security = q.get("security", "none")

    stream: dict = {"network": network, "security": security}
    if security == "reality":
        stream["realitySettings"] = {
            "serverName": q.get("sni", ""),
            "fingerprint": q.get("fp", "chrome"),
            "publicKey": q.get("pbk", ""),
            "shortId": q.get("sid", ""),
            "spiderX": unquote(q.get("spx", "")),
        }
    elif security == "tls":
        stream["tlsSettings"] = {"serverName": q.get("sni", url.hostname), "fingerprint": q.get("fp", "chrome")}
    if network == "ws":
        stream["wsSettings"] = {"path": unquote(q.get("path", "/")), "headers": {"Host": q.get("host", "")}}
    elif network == "grpc":
        stream["grpcSettings"] = {"serviceName": unquote(q.get("serviceName", ""))}

    user = {"id": url.username, "encryption": q.get("encryption", "none")}
    if q.get("flow"):
        user["flow"] = q["flow"]

    return {
        "log": {"loglevel": "warning"},
        "inbounds": [{"listen": "0.0.0.0", "port": 8118, "protocol": "http", "settings": {}}],
        "outbounds": [
            {
                "protocol": "vless",
                "settings": {"vnext": [{"address": url.hostname, "port": url.port or 443, "users": [user]}]},
                "streamSettings": stream,
            }
        ],
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    OUT.write_text(json.dumps(build(first_vless_link(sys.argv[1])), indent=2), encoding="utf-8")
    print(f"written {OUT}")
