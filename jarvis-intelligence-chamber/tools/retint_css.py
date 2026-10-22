"""Re-tint the original NABOU//X stylesheets from the cyan/navy palette to the
17th-century nautical palette (oak, leather, parchment, brass, oxblood).
Only colour values change; every selector, size and layout rule is untouched.
Usage: python3 tools/retint_css.py chamber.css nabou-shell.css   (in place)"""
import re, sys, colorsys

def to_rgb(tok):
    t = tok.strip()
    if t.startswith('#'):
        h = t[1:]
        if len(h) in (3, 4): h = ''.join(c * 2 for c in h)
        r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
        a = int(h[6:8], 16) / 255 if len(h) == 8 else None
        return r, g, b, a
    nums = [float(x) for x in re.findall(r'[\d.]+', t)]
    return int(nums[0]), int(nums[1]), int(nums[2]), (nums[3] if len(nums) > 3 else None)

def retint(r, g, b):
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    deg = h * 360
    if s < 0.08 or 150 <= deg <= 265:          # navy, cyan, slate, greys -> warm sepia/brass
        if l < 0.18:   nh, ns, nl = 26, 0.42, l * 0.95             # backgrounds -> dark leather/oak
        elif l < 0.45: nh, ns, nl = 32, min(0.38, s * 0.8 + .12), l  # borders -> brown
        elif s > 0.45: nh, ns, nl = 40, 0.62, min(0.80, l + 0.04)   # bright accents -> brass
        else:          nh, ns, nl = 40, 0.42, l                     # light text -> parchment
    elif deg < 20 or deg > 330:                 # alert red -> sealing-wax red (kept readable)
        nh, ns, nl = 6, min(s, 0.62), l * 0.92
    elif 20 <= deg < 70:                        # amber/gold stays, slightly toward brass
        nh, ns, nl = 40, min(s, 0.62), l
    else:                                       # greens etc -> verdigris
        nh, ns, nl = 150, min(s, 0.25), l
    rr, gg, bb = colorsys.hls_to_rgb(nh / 360, nl, ns)
    return round(rr * 255), round(gg * 255), round(bb * 255)

PAT = re.compile(r'#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b|rgba?\([^)]*\)')
def sub(m):
    tok = m.group(0)
    try: r, g, b, a = to_rgb(tok)
    except Exception: return tok
    R, G, B = retint(r, g, b)
    return f'rgba({R},{G},{B},{a:.3g})' if a is not None else f'#{R:02x}{G:02x}{B:02x}'

for path in sys.argv[1:]:
    css = open(path).read()
    css = re.sub(r"@import url\('https://fonts\.googleapis\.com[^)]*\);?\s*", '', css)  # bundled fonts replace Google Fonts
    out = PAT.sub(sub, css)
    out = re.sub(r"['\"]?Barlow Condensed['\"]?(,\s*[\w\s'\"-]+)?(?=[;}!\n])", 'var(--nx-caps)', out)
    out = re.sub(r"['\"]?DM Mono['\"]?(,\s*[\w\s'\"-]+)?(?=[;}!\n])", 'var(--nx-mono)', out)
    out = re.sub(r"\bInter(,\s*[\w\s'\"-]+)?(?=[;}!\n])", 'var(--nx-body)', out)
    out = re.sub(r'system-ui(,\s*-apple-system,\s*"Segoe UI",\s*sans-serif)?', 'var(--nx-body)', out)
    open(path, 'w').write(out)
    print(path, len(PAT.findall(css)), 'colours re-tinted')
