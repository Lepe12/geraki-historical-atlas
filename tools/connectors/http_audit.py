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
    params=[(k,'REDACTED' if re.search(r'^(?:api_?key|wskey|access_token|token|secret|password|jsessionid)$',k,re.I) else v)
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
        if isinstance(error,urllib.error.HTTPError):
            row['http_status']=error.code
            row['retry_after']=error.headers.get('Retry-After') if error.headers else None
        row['error_code']=error_code(error)
        raise
    finally:
        row['elapsed_ms']=round((time.monotonic()-started)*1000)
        rows=_receipts.get()
        if rows is not None:rows.append(row)

def browser_fetch(url,timeout=30000):
    """Normal Chromium TLS validation for public catalogues with legacy TLS.

    No ignore_https_errors, login session, stealth flags or challenge handling.
    """
    if urllib.parse.urlsplit(url).hostname not in {'sias-archivi.cultura.gov.it','anemi.lib.uoc.gr'}:
        raise ValueError('BROWSER_CATALOGUE_HOST_NOT_ALLOWED')
    from playwright.sync_api import sync_playwright
    row={'url':safe_url(url),'method':'ANONYMOUS_BROWSER_GET','request_performed':True,
         'http_status':None,'tls_verification':True}
    try:
        with sync_playwright() as pw:
            browser=pw.chromium.launch(headless=True)
            try:
                page=browser.new_page()
                response=page.goto(url,wait_until='domcontentloaded',timeout=timeout)
                raw=page.content().encode()
                row.update(http_status=response.status if response else None,final_url=safe_url(page.url),
                           response_sha256=hashlib.sha256(raw).hexdigest(),response_bytes=len(raw))
                return raw
            finally:browser.close()
    except Exception as error:
        row['error_code']=type(error).__name__;raise
    finally:
        rows=_receipts.get()
        if rows is not None:rows.append(row)

def anemi_search(query):
    """Submit the site's actual anonymous form, preserving its hidden fields."""
    from playwright.sync_api import sync_playwright
    url='https://anemi.lib.uoc.gr/search'
    row={'url':url,'method':'ANONYMOUS_BROWSER_FORM_GET','request_performed':True,
         'http_status':None,'tls_verification':True,'query':query}
    try:
        with sync_playwright() as pw:
            browser=pw.chromium.launch(headless=True)
            try:
                page=browser.new_page()
                response=page.goto(url,wait_until='domcontentloaded',timeout=30000)
                row.update(http_status=response.status if response else None,form_loaded=True,search_submitted=False)
                field=page.locator('input[name="cclterm1"][type="text"]')
                if not field.count():raise ValueError('ANEMI_PUBLIC_SEARCH_FORM_NOT_FOUND')
                field.fill(query)
                row['search_script_loaded']=page.evaluate('typeof search_tidy === \"function\"')
                with page.expect_navigation(wait_until='domcontentloaded',timeout=30000) as submitted:
                    field.evaluate('(element)=>element.form.requestSubmit()')
                response=submitted.value
                row['search_submitted']=True
                row['submitted_body_excerpt']=' '.join(page.locator('body').inner_text().split())[:2500]
                row['submitted_query_values']=urllib.parse.parse_qs(urllib.parse.urlsplit(page.url).query).get('cclterm1',[])
                row['result_links']=page.locator('a').evaluate_all('(els)=>els.slice(0,100).map(e=>({href:e.getAttribute("href"),text:e.innerText,onclick:e.getAttribute("onclick")}))')
                raw=page.content().encode()
                row.update(http_status=response.status if response else None,final_url=safe_url(page.url),
                           response_sha256=hashlib.sha256(raw).hexdigest(),response_bytes=len(raw))
                return raw
            finally:browser.close()
    except Exception as error:
        row['error_code']=type(error).__name__;raise
    finally:
        rows=_receipts.get()
        if rows is not None:rows.append(row)
