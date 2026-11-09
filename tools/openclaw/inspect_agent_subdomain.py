#!/usr/bin/env python3
"""Read-only probe: isolated N7-agent subdomain via existing production FTPS credentials."""
import ftplib
import json
import os
import socket
import ssl
import urllib.error
import urllib.request

DOMAIN = "n7-agent.piratecartography.com"
TLS = "linux3087.grserver.gr"
TARGETS = ["/" + DOMAIN, "/" + DOMAIN + "/httpdocs", "/" + DOMAIN + "/app",
           "/" + DOMAIN + "/nodejs"]
ALLOW = {"httpdocs", "logs", "tmp", "cgi-bin", "app", "public", "n7-agent", "node_modules",
         "app.js", "server.js", "package.json", "index.html", ".htaccess", "restart.txt"}


def connect():
    host = os.environ["PCT_FTPS_HOST"]
    port = int(os.environ.get("PCT_FTPS_PORT", "21"))
    ips = lambda h: {r[4][0] for r in socket.getaddrinfo(h, port, type=socket.SOCK_STREAM)}
    if not ips(host).intersection(ips(TLS)):
        raise RuntimeError("FTPS_HOST_MISMATCH")
    ftp = ftplib.FTP_TLS(timeout=30, context=ssl.create_default_context())
    ftp.connect(host, port)
    ftp.host = TLS
    ftp.login(os.environ["PCT_FTPS_USER"], os.environ["PCT_FTPS_PASSWORD"])
    ftp.prot_p()
    return ftp


def inspect(ftp, folder):
    try:
        ftp.cwd(folder)
        filenames = [s.split("/")[-1] for s in ftp.nlst()]
        print("AGENT_DIR " + json.dumps({"folder": folder,
            "exists": True, "known_entries": sorted(set(filenames) & ALLOW)}, sort_keys=True))
    except ftplib.error_perm as e:
        if str(e).startswith("550"):
            print("AGENT_DIR " + json.dumps({"folder": folder, "exists": False}))
        else:
            raise


def main():
    ftp = connect()
    try:
        print("AGENT_FTPS_CONNECTION=PASS")
        for folder in TARGETS:
            inspect(ftp, folder)
    finally:
        try: ftp.quit()
        except ftplib.all_errors: ftp.close()
    for scheme in ("https",):
        url = scheme + "://" + DOMAIN + "/"
        request = urllib.request.Request(url, headers={"User-Agent": "N7-agent-new-subdomain-readonly/1"})
        try:
            with urllib.request.urlopen(request, timeout=12, context=ssl.create_default_context()) as response:
                print("AGENT_HTTPS_STATUS=" + str(response.status))
        except urllib.error.HTTPError as e:
            print("AGENT_HTTPS_STATUS=" + str(e.code))
        except (urllib.error.URLError, TimeoutError) as e:
            print("AGENT_HTTPS_ERROR=" + type(e).__name__)
    print("AGENT_READ_ONLY_PROBE_COMPLETED=true")


if __name__ == "__main__":
    main()
