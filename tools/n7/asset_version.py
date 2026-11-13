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
    return source.encode('utf8')
