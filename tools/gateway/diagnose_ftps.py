#!/usr/bin/env python3
"""Read-only FTPS directory discovery; prints directory *names*, never contents or secrets."""
import ftplib, os, posixpath, ssl
ftp=ftplib.FTP_TLS(timeout=20,context=ssl.create_default_context())
try:
    ftp.connect(os.environ["PCT_FTPS_HOST"],int(os.getenv("PCT_FTPS_PORT","21")))
    ftp.login(os.environ["PCT_FTPS_USER"],os.environ["PCT_FTPS_PASSWORD"])
    ftp.prot_p()
    print("FTPS connection: OK")
    print("Initial FTP directory:",ftp.pwd())
    candidates=("/", "/server/command-center-live", "/piratecartography-gateway/server/command-center-live")
    for target in candidates:
        try:
            ftp.cwd(target)
            entries=ftp.nlst()
            names=sorted(set(posixpath.basename(x.rstrip("/")) for x in entries))
            # Avoid publishing private directory names or user content. Report only expected file/folder presence.
            print("Path:",target,"ACCESSIBLE")
            for item in ("app.js","package.json","public","tmp","knowledge-data","server","piratecartography-gateway","historical-evidence.js","pdf-evidence.js"):
                print(" ",item, "YES" if item in names else "NO")
        except ftplib.all_errors as e:
            print("Path:",target,"NOT ACCESSIBLE (",type(e).__name__,")")
finally:
    try: ftp.quit()
    except Exception: pass
