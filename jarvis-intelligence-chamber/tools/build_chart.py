"""Build nautical-chart.js: a 17th-century style portolan / sea chart of the
Mediterranean and western Europe, drawn from Natural Earth 1:10m land (public domain).
Mercator projection (as on period sea charts), uniform scale.
Run: python3 tools/build_chart.py  (needs shapely; NE_LAND env var or /workspace/ne_10m_land.geojson)
"""
import json, math, os
from shapely.geometry import shape, box, Polygon
from shapely.geometry.polygon import orient

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.environ.get('NE_LAND', '/workspace/ne_10m_land.geojson')
IMG = 'assets/nautical/img/'
LON0, LON1, LAT0, LAT1T = -20.0, 40.0, 28.4, 55.2
CW = 1800
K = CW / (LON1 - LON0)
def M(lat): return math.degrees(math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)))
MY1 = M(LAT1T)
CH = round((MY1 - M(LAT0)) * K)
LAT1 = LAT1T
def P(lon, lat): return ((lon - LON0) * K, (MY1 - M(lat)) * K)
def ring_d(coords): return 'M' + 'L'.join(f'{x:.1f},{y:.1f}' for x, y in (P(a, b) for a, b in coords)) + 'Z'

CORE = (17.2, 35.1)          # central rose (the research core)
ANALYSIS = (-13.6, 43.6)     # secondary rose in the Atlantic, ringed by the analysis lanes

def rose(x, y, r, cls, main=True):
    out = [f'<g class="rose {cls}" transform="translate({x:.1f},{y:.1f})"><g class="rose-spin">']
    out.append(f'<circle r="{r*1.02:.1f}" class="rring"/><circle r="{r*0.94:.1f}" class="rring t"/>')
    for j in range(32):
        a = j * 360 / 32
        ln = r * (1 if j % 4 == 0 else 0.72 if j % 2 == 0 else 0.5); wd = r * (0.13 if j % 4 == 0 else 0.09 if j % 2 == 0 else 0.06)
        if j % 4 == 0 and j % 8 != 0: ln = r * 0.82
        c = 'pk' if j % 8 == 0 else 'pg' if j % 4 == 0 else 'pr' if j % 2 == 0 else 'pg2'
        out.append(f'<g transform="rotate({a})"><path class="{c}" d="M0,{-ln:.1f}L{wd:.1f},0L0,0Z"/><path class="{c} s" d="M0,{-ln:.1f}L{-wd:.1f},0L0,0Z"/></g>')
    out.append(f'<circle r="{r*0.1:.1f}" class="rhub"/></g>')
    if main:
        s = r / 60
        out.append(f'<g transform="translate(0,{-r*1.1:.1f}) scale({s:.2f})" class="fleur"><path d="M0,-26C6,-18 8,-10 3,-2C9,-6 16,-6 18,0C12,-1 8,2 4,6L4,10L-4,10L-4,6C-8,2 -12,-1 -18,0C-16,-6 -9,-6 -3,-2C-8,-10 -6,-18 0,-26Z"/><rect x="-8" y="10" width="16" height="3"/></g>')
        out.append(f'<g transform="translate({r*1.1:.1f},0) scale({s:.2f})" class="cross"><path d="M-2,-8H2V-2H8V2H2V8H-2V2H-8V-2H-2Z"/></g>')
    out.append('</g>'); return ''.join(out)

def build():
    gj = json.load(open(SRC))
    clip = box(LON0 - 1, LAT0 - 1, LON1 + 1, LAT1 + 1)
    parts, big, bigpolys = [], [], []
    for f in gj['features']:
        g = shape(f['geometry'])
        if not g.intersects(clip): continue
        g = g.intersection(clip).simplify(0.014, preserve_topology=True)
        for poly in (getattr(g, 'geoms', None) or [g]):
            if not isinstance(poly, Polygon) or poly.area < 0.006: continue
            poly = orient(poly, 1.0)
            parts.append(ring_d(poly.exterior.coords))
            if poly.area > 0.25: big.append(ring_d(poly.exterior.coords)); bigpolys.append(Polygon(poly.exterior.coords))
            for hole in poly.interiors:
                if Polygon(hole).area > 0.003: parts.append(ring_d(hole.coords))
    land, bigd = ''.join(parts), ''.join(big)
    # rhumb-line network: central rose + 16 satellites on a hidden circle
    cx, cy = P(*CORE); R = 520; L = 2600
    nodes = [(cx, cy)] + [(cx + R * math.cos(i * math.pi / 8), cy + R * math.sin(i * math.pi / 8)) for i in range(16)]
    lines = {'k': [], 'g': [], 'r': []}
    for nx, ny in nodes:
        for j in range(32):
            ang = j * math.pi / 16; c = 'k' if j % 4 == 0 else ('g' if j % 2 == 0 else 'r')
            lines[c].append(f'M{nx:.1f},{ny:.1f}L{nx + L * math.cos(ang):.1f},{ny + L * math.sin(ang):.1f}')
    rh = ''.join(f'<path class="rh {c}" d="{"".join(v)}"/>' for c, v in lines.items())
    # Coastal ripple lines as real vector offsets (no SVG mask: masks stall software rasterisers on phones/CI).
    from shapely.ops import unary_union, transform as shp_transform
    projected = unary_union([shp_transform(lambda xs, ys, z=None: tuple(zip(*[P(a, b) for a, b in zip(xs, ys)])), q) for q in bigpolys]).buffer(0)
    frame = box(-20, -20, CW + 20, CH + 20)
    ripple = []
    for dist, alpha in ((9, 0.12), (5.75, 0.22), (3, 0.33)):
        edge = projected.buffer(dist, resolution=4).boundary.intersection(frame).simplify(0.6)
        segs = []
        for ln in (getattr(edge, 'geoms', None) or [edge]):
            cs = list(ln.coords)
            if len(cs) > 1: segs.append('M' + 'L'.join(f'{x:.1f},{y:.1f}' for x, y in cs))
        ripple.append(f'<path class="ripple" stroke-opacity="{alpha}" d="{"".join(segs)}"/>')
    ripples = ''.join(ripple)
    def label(lon, lat, txt, cls, rot=0):
        x, y = P(lon, lat); return f'<text class="{cls}" x="{x:.1f}" y="{y:.1f}" transform="rotate({rot} {x:.1f} {y:.1f})">{txt}</text>'
    labels = ''.join([
        label(4.2, 38.0, 'Mare Mediterraneum', 'sea big', -2), label(11.2, 39.6, 'Mare Tyrrhenum', 'sea', 0),
        label(16.6, 42.2, 'Mare Adriaticum', 'sea sm', -38), label(19.6, 38.6, 'Mare Ionium', 'sea sm', -62),
        label(25.3, 39.3, 'Mare Aegaeum', 'sea sm', -74), label(25.0, 33.3, 'Mare Libycum', 'sea', 0),
        label(34.0, 43.4, 'Pontus Euxinus', 'sea', 0), label(-15.5, 36.2, 'Oceanus Atlanticus', 'sea big', -64),
        label(-5.2, 45.4, 'Mare Cantabricum', 'sea sm', 0), label(3.4, 54.4, 'Mare Germanicum', 'sea', 0),
        label(-1.6, 50.15, 'Fretum Gallicum', 'sea xs', -8),
        label(-3.4, 38.9, 'HISPANIA', 'land', 0), label(2.4, 46.6, 'GALLIA', 'land', 0), label(14.6, 41.6, 'ITALIA', 'land sm', -42),
        label(1.4, 33.6, 'BARBARIA', 'land', 0), label(14.5, 30.2, 'LIBYA', 'land', 0), label(29.4, 29.7, 'AEGYPTUS', 'land sm', 0),
        label(33.0, 39.0, 'ANATOLIA', 'land', 0), label(22.1, 39.6, 'GRAECIA', 'land xs', 0), label(19.6, 46.6, 'HUNGARIA', 'land sm', 0),
        label(36.9, 32.6, 'SYRIA', 'land sm', -80), label(9.6, 50.9, 'GERMANIA', 'land', 0), label(-2.3, 52.7, 'BRITANNIA', 'land sm', 0),
        label(-8.1, 53.2, 'HIBERNIA', 'land xs', 0), label(20.5, 52.2, 'POLONIA', 'land', 0), label(-6.6, 31.6, 'MAURITANIA', 'land sm', 0),
        label(29.5, 49.2, 'TARTARIA MINOR', 'land xs', 0),
    ])
    mts = [(0.3, 42.75), (-1.6, 42.9), (2.0, 42.5), (7.2, 45.8), (9.6, 46.2), (12.0, 46.3), (12.6, 43.4), (14.3, 41.9), (16.2, 40.0),
           (-5.5, 31.6), (-3.0, 32.6), (4.2, 35.6), (7.0, 35.5), (22.3, 41.9), (24.4, 41.8), (20.4, 42.4), (31.8, 37.2), (34.8, 37.4), (29.6, 37.6),
           (-3.6, 37.1), (-5.8, 40.4), (36.3, 33.9), (-2.0, 40.4), (14.5, 47.3), (24.5, 46.3), (26.0, 45.6), (-4.0, 56.0), (3.0, 45.3)]
    m = ''
    for lon, lat in mts:
        x, y = P(lon, lat)
        for dx in (-7, 0, 7):
            m += f'<path class="mt" d="M{x+dx-6:.1f},{y+4:.1f}Q{x+dx:.1f},{y-8:.1f} {x+dx+6:.1f},{y+4:.1f}"/><path class="mth" d="M{x+dx+0.5:.1f},{y-3:.1f}L{x+dx+4:.1f},{y+4:.1f}"/>'
    sx, sy = P(-18.6, 29.6)
    scale = (f'<g class="scale" transform="translate({sx:.1f},{sy:.1f})">' + ''.join(f'<rect x="{i*20}" y="0" width="20" height="5" class="{"b" if i % 2 == 0 else "w"}"/>' for i in range(8))
             + '<rect x="0" y="0" width="160" height="5" class="o"/><text x="80" y="-6" class="sc">Scala Leucarum Hispanicarum</text>'
             + ''.join(f'<text x="{i*40}" y="17" class="scn">{i*50}</text>' for i in range(5)) + '</g>')
    def pic(name, lon, lat, w, flip=False):
        x, y = P(lon, lat)
        t = f' transform="scale(-1,1) translate({-2*x:.1f},0)"' if flip else ''
        return f'<image href="{IMG}{name}.png" x="{x-w/2:.1f}" y="{y-w*0.8:.1f}" width="{w}" height="{w}" class="pic"{t}/>'
    pics = (pic('ship', 5.6, 41.4, 92) + pic('ship', -16.5, 39.6, 64, True) + pic('ship', 33.2, 34.6, 54, True)
            + pic('monster', -8.0, 48.6, 104) + pic('monster', 27.6, 33.0, 84, True))
    roses = rose(*P(*CORE), 74, 'core-rose') + rose(*P(*ANALYSIS), 46, 'analysis-rose') + rose(*P(36.4, 42.6), 24, 'minor', False) + rose(*P(-4.5, 54.6), 22, 'minor', False)
    ax, ay = P(*ANALYSIS)
    cart = (f'<g class="cartouche" transform="translate({ax:.1f},{ay:.1f})"><circle r="150" class="cart-ring"/><circle r="156" class="cart-ring t"/></g>')
    svg = (f'<svg class="chart" viewBox="0 0 {CW} {CH}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">'
           f'<defs><path id="landP" d="{land}"/><path id="bigP" d="{bigd}"/>'
           f'<clipPath id="cclip"><rect width="{CW}" height="{CH}"/></clipPath>'
           f'<pattern id="pp" patternUnits="userSpaceOnUse" width="640" height="640"><image href="{IMG}parchment.jpg" width="640" height="640"/></pattern>'
           f'<pattern id="pl" patternUnits="userSpaceOnUse" width="640" height="640"><image href="{IMG}land.jpg" width="640" height="640"/></pattern>'
           f'</defs><g clip-path="url(#cclip)">'
           f'<rect width="{CW}" height="{CH}" class="seabase"/><rect width="{CW}" height="{CH}" class="seawash"/><g class="rhumbs">{rh}</g>'
           f'<g class="wlines">{ripples}</g>'
           f'<use href="#landP" class="landbase"/>'
           f'<use href="#landP" class="coastwash"/>'
           f'<g class="mts">{m}</g><use href="#landP" class="coast"/>'
           f'<g class="layer-labels">{labels}</g>{pics}{cart}{roses}{scale}'
           f'<rect width="{CW}" height="{CH}" class="neat"/></g></svg>')
    meta = dict(W=CW, H=CH, proj='mercator', lon0=LON0, lon1=LON1, lat0=LAT0, lat1=LAT1, k=K, my1=MY1,
                core=[round(v, 1) for v in P(*CORE)], analysis=[round(v, 1) for v in P(*ANALYSIS)])
    out = os.path.join(ROOT, 'nautical-chart.js')
    with open(out, 'w') as fh:
        fh.write('/* Generated by tools/build_chart.py from Natural Earth 1:10m land (public domain). Do not edit by hand. */\n')
        fh.write('window.NABOU_CHART=' + json.dumps({**meta, 'svg': svg}, separators=(',', ':')) + ';\n')
    print('nautical-chart.js', os.path.getsize(out) // 1024, 'KB', len(parts), 'rings', CW, 'x', CH)
build()
