#!/usr/bin/env python3
"""N7 Gemma 4 12B: isolated, quota-gated FTPS model transfer.
No production files, settings, API keys or WordPress content are changed.
The full upload is deliberately blocked unless enough free disk can be
independently verified: shared-host disk exhaustion is unacceptable.
"""
import ftplib, hashlib, io, json, os, re, socket, ssl, sys
from urllib import request, error
HOST = os.environ["PCT_FTPS_HOST"]
PORT = int(os.environ.get("PCT_FTPS_PORT", "21"))
TLS_HOST = "linux3087.grserver.gr"
ROOT = "/bot.piratecartography.com"
MIN_FREE_BYTES = 11 * 1024**3
MODEL_URL = "https://huggingface.co/unsloth/gemma-4-12b-it-GGUF/resolve/main/gemma-4-12b-it-Q4_K_M.gguf"
FILE_NAME = "gemma-4-12b-it-Q4_K_M.gguf"
MODEL_DIR = ROOT + "/n7-models/gemma4-12b"
def ftp_connect():
    addresses = {s[4][0] for s in socket.getaddrinfo(HOST, PORT, type=socket.SOCK_STREAM)}
    tls_addresses = {s[4][0] for s in socket.getaddrinfo(TLS_HOST, PORT, type=socket.SOCK_STREAM)}
    if not addresses.intersection(tls_addresses):
        raise RuntimeError("FTPS_TLS_HOST_IDENTITY_MISMATCH")
    ftp = ftplib.FTP_TLS(timeout=30, context=ssl.create_default_context())
    ftp.connect(HOST, PORT)
    ftp.host = TLS_HOST
    ftp.login(os.environ["PCT_FTPS_USER"], os.environ["PCT_FTPS_PASSWORD"])
    ftp.prot_p()
    return ftp
def get_free_quota(ftp):
    # FTP quota responses are server-specific. Never infer free bytes from disk usage.
    for cmd in ("SITE QUOTA", "SITE QUOTA /"):
        try:
            response = ftp.sendcmd(cmd)
        except ftplib.all_errors:
            continue
        # Accept only explicit FREE/AVAILABLE labels with units (not used/total).
        m = re.search(r"(?:free|available)\\s*(?:space|bytes)?\\s*[:=]\\s*([0-9]+)\\s*(GiB|GB|MiB|MB|bytes)", response, re.I)
        if m:
            n = int(m.group(1))
            units = {"gib":1024**3,"gb":10**9,"mib":1024**2,"mb":10**6,"bytes":1}
            return n*units[m.group(2).lower()]
    return None
def main():
    ftp=ftp_connect()
    try:
        ftp.cwd(ROOT)
        print("FTPS_BOT_ROOT_ACCESSIBLE=true")
        free = get_free_quota(ftp)
        print("FTPS_VERIFIABLE_FREE_BYTES=" + (str(free) if free is not None else "UNKNOWN"))
        if free is None or free < MIN_FREE_BYTES:
            print("GEMMA_UPLOAD=SAFETY_BLOCKED: storage headroom not verified; no files uploaded")
            return
        # Do not download full model before confirming that the origin is accessible.
        req = request.Request(MODEL_URL, method="HEAD", headers={"User-Agent":"N7-Gemma-safe-upload/1"})
        with request.urlopen(req, timeout=30) as resp:
            size = int(resp.headers.get("Content-Length") or 0)
            if not 6*10**9 <= size <= 9*10**9:
                raise RuntimeError("MODEL_DOWNLOAD_SIZE_NOT_VERIFIED")
        if free < size + 3*1024**3:
            print("GEMMA_UPLOAD=SAFETY_BLOCKED: insufficient verified headroom")
            return
        for folder in (ROOT + "/n7-models", MODEL_DIR):
            try: ftp.mkd(folder)
            except ftplib.error_perm as e:
                if not str(e).startswith("550"): raise
        ftp.cwd(MODEL_DIR)
        # Avoid memory exhaustion on the CI runner: transfer in a bounded stream.
        import tempfile, urllib.request
        with tempfile.TemporaryFile() as tmp:
            with urllib.request.urlopen(MODEL_URL,timeout=90) as incoming:
                copied = 0
                while True:
                    chunk=incoming.read(1024*1024)
                    if not chunk: break
                    tmp.write(chunk); copied+=len(chunk)
                    if copied>9*10**9:raise RuntimeError("MODEL_DOWNLOAD_EXCEEDS_BOUND")
            if copied!=size:raise RuntimeError("MODEL_DOWNLOAD_LENGTH_MISMATCH")
            tmp.seek(0)
            # A temporary filename prevents incomplete model being mistaken for installed.
            temporary=FILE_NAME+".uploading"
            try:
                ftp.storbinary("STOR "+temporary,tmp,blocksize=1024*1024)
                if ftp.size(temporary)!=copied:raise RuntimeError("FTPS_REMOTE_SIZE_MISMATCH")
                ftp.rename(temporary,FILE_NAME)
            except BaseException:
                try: ftp.delete(temporary)
                except ftplib.all_errors: pass
                raise
            print("GEMMA_WEIGHTS_UPLOADED=true bytes="+str(copied))
            print("GEMMA_RUNNING=false (FTPS cannot start inference runtime)")
    finally:
        ftp.quit()
if __name__=="__main__":main()
