"""Draws the Starlog mark (same geometry as src/app/shared/star-mark.component.ts) into app icons."""
import glob, os, sys
from PIL import Image, ImageDraw, ImageFilter, ImageChops

# Usage: python -I scripts/draw-icons.py .   (needs Pillow; rewrites web/icons, public/favicon.ico, Android launcher icons and splash)
ROOT = sys.argv[1]
S = 2048  # working size

def bez(p0, p1, p2, p3, n=40):
    return [tuple((1-t)**3*a + 3*(1-t)**2*t*b + 3*(1-t)*t**2*c + t**3*d for a, b, c, d in zip(p0, p1, p2, p3)) for t in (i/n for i in range(n+1))]

def star_points(cx, cy, r):
    # Concave four-point star, matching the SVG path (r = 7 units, inner pull 0.8/2.4).
    k1, k2 = .8/7, 2.4/7
    pts = []
    for (tx, ty), (ex, ey) in [((0,-1),(1,0)), ((1,0),(0,1)), ((0,1),(-1,0)), ((-1,0),(0,-1))]:
        p0 = (cx+tx*r, cy+ty*r); p3 = (cx+ex*r, cy+ey*r)
        p1 = (cx+tx*r - tx*(4.6/7)*r + ex*k1*r, cy+ty*r - ty*(4.6/7)*r + ey*k1*r)
        p2 = (cx+ex*r - ex*(4.6/7)*r + tx*k1*r, cy+ey*r - ey*(4.6/7)*r + ty*k1*r)
        pts += bez(p0, p1, p2, p3)
    return pts

def mark(size, scale, bg, shape):
    """size: output px; scale: fraction of the canvas the 24-unit mark spans; bg: draw night gradient; shape: square|round|rounded|none."""
    u = S*scale/24; ox = S/2 - 12.6*u; oy = S/2 - 11.5*u  # centre of the mark's bounding box
    P = lambda x, y: (ox + x*u, oy + y*u)
    img = Image.new('RGBA', (S, S), (0,0,0,0))
    if bg:
        g = Image.new('RGBA', (S, S))
        stops = [(0, (60,138,114)), (.55, (31,76,65)), (1, (15,39,34))]
        d = ImageDraw.Draw(g)
        for i in range(S*2):
            t = i/(S*2-1)
            for (a, ca), (b, cb) in zip(stops, stops[1:]):
                if a <= t <= b:
                    f = (t-a)/(b-a); c = tuple(int(x+(y-x)*f) for x, y in zip(ca, cb)); break
            d.line([(i, 0), (0, i)], fill=c+(255,), width=2)
        sd = ImageDraw.Draw(g)
        for x, y, r in [(.18,.2,5),(.8,.16,4),(.84,.74,5),(.28,.82,3),(.62,.88,4),(.1,.55,3),(.9,.45,3)]:
            sd.ellipse([x*S-r*S/1024, y*S-r*S/1024, x*S+r*S/1024, y*S+r*S/1024], fill=(255,255,255,140))
        img = g
    layer = Image.new('RGBA', (S, S), (0,0,0,0))
    ld = ImageDraw.Draw(layer)
    # Tail: tapering, fading stroke from the star to bottom-left.
    (x0, y0), (x1, y1) = P(12.6, 11.6), P(3.2, 21)
    n = 220
    for i in range(n):
        t = i/(n-1); r = (1.2*u)*(1-.75*t); a = int(235*(1-t)**1.3)
        x = x0+(x1-x0)*t; y = y0+(y1-y0)*t
        ld.ellipse([x-r, y-r, x+r, y+r], fill=(255,255,255,a))
    ld.polygon(star_points(*P(15, 9), 7*u), fill=(255,255,255,255))
    cx, cy = P(5.2, 5.4); r = 1.2*u
    ld.ellipse([cx-r, cy-r, cx+r, cy+r], fill=(255,255,255,180))
    glow = layer.filter(ImageFilter.GaussianBlur(u*1.4))
    glow = Image.merge('RGBA', (*[Image.new('L', (S,S), v) for v in (170,235,210)], glow.split()[3].point(lambda a: a*.8)))
    img = Image.alpha_composite(img, glow)
    img = Image.alpha_composite(img, layer)
    if shape != 'square' and shape != 'none':
        m = Image.new('L', (S, S), 0); md = ImageDraw.Draw(m)
        if shape == 'round': md.ellipse([0, 0, S-1, S-1], fill=255)
        else: md.rounded_rectangle([0, 0, S-1, S-1], radius=int(S*.22), fill=255)
        img.putalpha(ImageChops.multiply(img.split()[3], m))
    return img.resize((size, size), Image.LANCZOS)

# Web (maskable: keep the mark inside the 80% safe circle).
for s in (192, 512):
    mark(s, .66, True, 'square').convert('RGB').save(f'{ROOT}/web/icons/icon-{s}.png', optimize=True)
mark(48, .8, True, 'rounded').save(f'{ROOT}/public/favicon.ico', sizes=[(16,16),(32,32),(48,48)])

# Android launcher: legacy square/round, adaptive foreground (safe zone is the middle 61%).
res = f'{ROOT}/android/app/src/main/res'
for dens, legacy in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
    mark(legacy, .7, True, 'rounded').save(f'{res}/mipmap-{dens}/ic_launcher.png', optimize=True)
    mark(legacy, .66, True, 'round').save(f'{res}/mipmap-{dens}/ic_launcher_round.png', optimize=True)
    mark(legacy*108//48, .5, False, 'none').save(f'{res}/mipmap-{dens}/ic_launcher_foreground.png', optimize=True)

# Splash: night sky with the mark centred.
for path in glob.glob(f'{res}/drawable*/splash.png'):
    w, h = Image.open(path).size
    side = max(w, h)
    sky = mark(side, .0001, True, 'square').crop(((side-w)//2, (side-h)//2, (side-w)//2+w, (side-h)//2+h))
    m = mark(int(min(w, h)*.34), .9, False, 'none')
    sky.alpha_composite(m, ((w-m.width)//2, (h-m.height)//2))
    sky.convert('RGB').save(path, optimize=True)
print('ok')
