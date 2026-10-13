#!/usr/bin/env python3
"""Read-only client for the staging gateway. No MariaDB credentials on GitHub.

Environment:
  PCT_GATEWAY_URL=https://.../pct-staging-gateway.php
  PCT_GATEWAY_SECRET=<secret from private secret store>
"""
import hashlib
import hmac
import json
import os
import secrets
import sys
import time
import urllib.parse
import urllib.request

def main():
    url = os.getenv("PCT_GATEWAY_URL", "")
    secret = os.getenv("PCT_GATEWAY_SECRET", "")
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or not parsed.netloc or parsed.query or parsed.fragment or len(secret) < 32:
        print("BLOCKED: gateway URL or secret not configured")
        return 2
    timestamp = str(int(time.time()))
    nonce = secrets.token_hex(16)
    payload = f"GET\n{parsed.path}\n{timestamp}\n{nonce}".encode()
    signature = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    request = urllib.request.Request(url, headers={
        "X-PCT-Timestamp": timestamp,
        "X-PCT-Nonce": nonce,
        "X-PCT-Signature": signature,
    }, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            result = json.load(response)
        if result.get("status") != "PASS":
            print("FAIL: staging counts do not match")
            return 1
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return 0
    except Exception as exc:
        print("BLOCKED: gateway request failed (" + type(exc).__name__ + ")")
        return 2

if __name__ == "__main__":
    sys.exit(main())
