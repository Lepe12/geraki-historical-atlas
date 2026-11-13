"""Deterministic public asset cache key derived from the actual canonical app bytes."""
import hashlib
import re


def version_html(original, app, css=None):
    key = hashlib.sha256(app).hexdigest()[:20]
    source, count = re.subn(r'''(src=["']/app\.js)(?:\?[^"']*)?(["'])''',
                            lambda m: m[1] + '?n7asset=' + key + m[2],
                            original.decode('utf8'))
    if count != 1:
        raise ValueError('N7_APP_ASSET_REFERENCE_NOT_UNIQUE')
    if css is not None:
        # The stylesheet is cached for days by the host: its URL must change whenever its bytes change.
        css_key = hashlib.sha256(css).hexdigest()[:20]
        source, count = re.subn(r'''(href=["']/style\.css)(?:\?[^"']*)?(["'])''',
                                lambda m: m[1] + '?n7asset=' + css_key + m[2], source)
        if count != 1:
            raise ValueError('N7_STYLE_ASSET_REFERENCE_NOT_UNIQUE')
    return with_csp(source).encode('utf8')


# N7_STATIC_CSP_V1: on the host, nginx serves index.html and the assets itself, so the Content-Security-Policy
# that server.js sets never reaches the page. The same policy travels inside the page as a meta tag.
# frame-ancestors cannot be set from a meta tag; it needs the web-server header (see docs).
# Inline style attributes and data:/blob: images and media (the approved Humanoid artwork and motion) are allowed
# because the live page has always used them (no header was sent).
PAGE_CSP = ("default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; media-src 'self' data: blob:; "
            "connect-src 'self' https://pct-live.piratecartography.com; frame-src 'self' https://lepe12.github.io; "
            "object-src 'none'; base-uri 'none'; form-action 'self'")
CSP_META = '<meta http-equiv="Content-Security-Policy" content="' + PAGE_CSP + '">'


def with_csp(source):
    existing = re.compile(r'<meta http-equiv="Content-Security-Policy" content="[^"]*">')
    if existing.search(source):
        return existing.sub(lambda m: CSP_META, source, count=1)
    charset = re.search(r'<meta charset=["\']?utf-8["\']?>', source, re.I)
    if not charset:
        return source  # not a full page (fragment in tests): nothing to anchor to
    return source[:charset.end()] + CSP_META + source[charset.end():]
