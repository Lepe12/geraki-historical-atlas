#!/usr/bin/env python3
"""Read-only OpenClaw readiness probe on the EXISTING N7 Top.Host FTPS connection.

No code execution, file write, restart, token extraction, or private file access.
Print only known non-sensitive capability fields.
"""
import ftplib
import hashlib
import json
import os
import re
import socket
import ssl
import urllib.request
from pathlib import PurePosixPath

ROOT = "/bot.piratecartography.com/n7-app"
TLS = "linux3087.grserver.gr"
ARCHIVE = ROOT + "/.openclaw-staging/openclaw-2026.11.2.tgz"
EXPECTED_SHA256 = "7881887b88d81e5fdff361b7aac59b6a736308e1815a175b9ccd9cdca1bb5e48"
MAX_JSON = 64 * 1024


def verified_ftp():
    host = os.environ["PCT_FTPS_HOST"]
    port = int(os.getenv("PCT_FTPS_PORT", "21"))
    ips = lambda name: {v[4][0] for v in socket.getaddrinfo(name, port, type=socket.SOCK_STREAM)}
    if not ips(host).intersection(ips(TLS)):
        raise RuntimeError("FTPS_TLS_HOST_IDENTITY_MISMATCH")
    ftp = ftplib.FTP_TLS(timeout=50, context=ssl.create_default_context())
    ftp.connect(host, port)
    ftp.host = TLS
    ftp.login(os.environ["PCT_FTPS_USER"], os.environ["PCT_FTPS_PASSWORD"])
    ftp.prot_p()
    return ftp


def read_exact(ftp, name, max_bytes):
    parts = []
    length = 0
    def on_chunk(chunk):
        nonlocal length
        length += len(chunk)
        if length > max_bytes:
            raise ValueError("UNEXPECTED_FILE_LENGTH")
        parts.append(chunk)
    ftp.retrbinary("RETR " + name, on_chunk)
    return b"".join(parts)


def optional_bytes(ftp, full_path, limit=MAX_JSON):
    try:
        return read_exact(ftp, full_path, limit)
    except ftplib.error_perm as err:
        if str(err).startswith("550"):
            return None
        raise


def verified_stage(ftp):
    size = ftp.size(ARCHIVE)
    if not isinstance(size, int) or not 100_000_000 <= size <= 160_000_000:
        raise ValueError("STAGED_ARCHIVE_WRONG_SIZE")
    h = hashlib.sha256()
    ftp.retrbinary("RETR " + ARCHIVE, h.update, blocksize=1024 * 1024)
    if h.hexdigest() != EXPECTED_SHA256:
        raise ValueError("STAGED_ARCHIVE_CHECKSUM_FAILED")
    return size


def read_quota(ftp):
    for command in ("SITE QUOTA", "SITE QUOTA /"):
        try:
            response = ftp.sendcmd(command)
        except ftplib.all_errors:
            continue
        match = re.search(r"(?:free|available)\s*(?:space|bytes)?\s*[:=]\s*(\d+)\s*(GiB|GB|MiB|MB|bytes)", response, re.I)
        if match:
            multiplier = {"gib": 1024**3, "gb": 10**9, "mib": 1024**2, "mb": 10**6, "bytes": 1}
            return int(match.group(1)) * multiplier[match.group(2).lower()]
    return None


def main():
    ftp = verified_ftp()
    try:
        ftp.cwd(ROOT)
        print("N7_OPENCLAW_FTPS_AUTHENTICATED=true")
        package = optional_bytes(ftp, ROOT + "/package.json")
        if package:
            parsed = json.loads(package)
            print("N7_EXISTING_APP_PACKAGE=" + str(parsed.get("name", "unspecified"))[:80])
            print("N7_EXISTING_APP_NODE_ENGINES=" + json.dumps(parsed.get("engines", {}), sort_keys=True)[:150])
        else:
            print("N7_EXISTING_APP_PACKAGE=not_found")
        config = optional_bytes(ftp, "/bot.piratecartography.com/httpdocs/.htaccess", 128 * 1024)
        if config is None:
            config = optional_bytes(ftp, ROOT + "/.htaccess", 128 * 1024)
        if config:
            print("N7_PLESK_PASSENGER_DIRECTIVES_DETECTED=" + str(bool(re.search(rb"Passenger(?:Enabled|AppRoot|StartupFile|Nodejs)", config, re.I))).lower())
        else:
            print("N7_PLESK_PASSENGER_DIRECTIVES_DETECTED=not_visible_by_ftps")
        for version_file in (".node-version", ".nvmrc"):
            content = optional_bytes(ftp, ROOT + "/" + version_file, 512)
            if content:
                version = content.decode("ascii", "replace").strip()
                if re.fullmatch(r"v?[0-9.]+", version):
                    print("N7_NODE_VERSION_DECLARATION=" + version)
                break
        archived = verified_stage(ftp)
        print("N7_OPENCLAW_ARCHIVE_FTPS_SHA256=PASS")
        print("N7_OPENCLAW_ARCHIVE_SIZE_BYTES=" + str(archived))
        free = read_quota(ftp)
        print("N7_FTPS_QUOTA_VERIFIABLE_FREE_BYTES=" + (str(free) if free is not None else "UNKNOWN"))
        print("N7_CAN_START_GATEWAY_VIA_FTPS=false")
        print("N7_PLESK_APP_CONTROL_AVAILABLE_FROM_FTPS=false")
    finally:
        try:
            ftp.quit()
        except ftplib.all_errors:
            ftp.close()
    request = urllib.request.Request("https://bot.piratecartography.com/api/status",
                                     headers={"User-Agent": "N7-OpenClaw-readonly-preflight"})
    with urllib.request.urlopen(request, timeout=15, context=ssl.create_default_context()) as response:
        status = json.loads(response.read(10000))
        if response.status != 200 or not isinstance(status.get("modelConfigured"), bool):
            raise RuntimeError("EXISTING_N7_STATUS_FAIL")
        print("N7_EXISTING_HTTPS_HEALTH=PASS")
        print("N7_EXISTING_MODEL_CONFIGURED=" + str(status["modelConfigured"]).lower())
    print("N7_OPENCLAW_HOST_PREFLIGHT_COMPLETE=true")
    print("N7_OPENCLAW_GATEWAY_RUNNING=UNVERIFIED")


if __name__ == "__main__":
    main()
