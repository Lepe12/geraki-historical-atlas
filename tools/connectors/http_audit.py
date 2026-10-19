"""Bounded HTTPS transport receipts, without credentials or raw exception text."""
from contextlib import contextmanager
from contextvars import ContextVar
import hashlib
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request

_receipts=ContextVar('connector_http_receipts',default=None)

def safe_url(url):
    parsed=urllib.parse.urlsplit(str(url))
    params=[(k,'REDACTED' if re.search(r'key|token|secret|password|session',k,re.I) else v)
            for k,v in urllib.parse.parse_qsl(parsed.query,keep_blank_values=True)]
    return urllib.parse.urlunsplit((parsed.scheme,parsed.hostname or '',parsed.path,urllib.parse.urlencode(params),''))

@contextmanager
def trace():
    rows=[];token=_receipts.set(rows)
    try:yield rows
    finally:_receipts.reset(token)

def error_code(error):
    if isinstance(error,urllib.error.HTTPError):return 'HTTP_'+str(error.code)
    cause=getattr(error,'reason',error)
    if isinstance(cause,ssl.SSLCertVerificationError):return 'TLS_CERTIFICATE_VERIFY_FAILED'
    if isinstance(cause,(TimeoutError,)):return 'TIMEOUT'
    return type(cause).__name__

def fetch(url,headers=None,timeout=25,data=None):
    row={'url':safe_url(url),'method':'POST' if data is not None else 'GET',
         'request_performed':True,'http_status':None,'tls_verification':True}
    started=time.monotonic()
    context=ssl.create_default_context()
    # Add the maintained public root bundle to, rather than replacing, runtime
    # trust (which can include a managed session proxy CA).
    try:
        import certifi
        context.load_verify_locations(certifi.where())
    except ImportError:pass
    try:
        req=urllib.request.Request(url,data=data,headers=headers or {})
        with urllib.request.urlopen(req,timeout=timeout,context=context) as response:
            raw=response.read(8_000_001)
            row.update(http_status=response.status,final_url=safe_url(response.geturl()),
                       content_type=response.headers.get('Content-Type'),response_bytes=len(raw),
                       response_sha256=hashlib.sha256(raw).hexdigest())
            if len(raw)>8_000_000:raise ValueError('CATALOGUE_RESPONSE_TOO_LARGE')
            return raw
    except Exception as error:
        if isinstance(error,urllib.error.HTTPError):row['http_status']=error.code
        row['error_code']=error_code(error)
        raise
    finally:
        row['elapsed_ms']=round((time.monotonic()-started)*1000)
        rows=_receipts.get()
        if rows is not None:rows.append(row)
