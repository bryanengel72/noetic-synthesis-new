"""Generate SVG path data for the Noetic Synthesis hero band alternatives.

braid   a braided channel: a trunk that repeatedly splits into anabranches and
        rejoins downstream, leaving lens-shaped islands. Modelled recursively so
        the pattern is self-similar at every scale, the way real braids are.

strata  stacked layers that share one fold and flatten with depth. Amplitude
        decays monotonically, so lines can never cross - which is what separates
        contours from noodles.
"""
import math
import random

W, H = 1600.0, 300.0
MID = H * 0.5


def smooth_path(pts):
    """Catmull-Rom through pts, emitted as integer-rounded cubic beziers."""
    if len(pts) < 2:
        return ""
    d = [f"M{int(round(pts[0][0]))},{int(round(pts[0][1]))}"]
    n = len(pts)
    for i in range(n - 1):
        p0 = pts[i - 1] if i > 0 else pts[0]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[i + 2] if i + 2 < n else pts[-1]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6.0, p1[1] + (p2[1] - p0[1]) / 6.0)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6.0, p2[1] - (p3[1] - p1[1]) / 6.0)
        d.append(
            "C{},{} {},{} {},{}".format(
                int(round(c1[0])), int(round(c1[1])),
                int(round(c2[0])), int(round(c2[1])),
                int(round(p2[0])), int(round(p2[1])),
            )
        )
    return "".join(d)


# --------------------------------------------------------------------- braid

def reach(rng, x0, x1, y0, y1, bow, samples=11):
    """One channel segment: straight run from end to end, bowed to one side."""
    pts = []
    for s in range(samples + 1):
        t = s / samples
        x = x0 + (x1 - x0) * t
        y = y0 + (y1 - y0) * t
        # sin^2 has zero slope at t=0 and t=1, so a branch leaves and rejoins
        # its junction tangentially. Plain sin() leaves at an angle and the
        # island ends up a sharp V instead of a lens.
        y += bow * math.sin(math.pi * t) ** 2
        pts.append((x, y))
    return pts


def braid(seed=12, depth=3):
    """Grow anabranches as deviations from a parent curve.

    A channel is a function x -> y, not a chord. A child channel is its parent
    plus a sin^2 bulge over a window, which is zero-valued and zero-sloped at
    both ends - so it leaves and rejoins the parent tangentially and the island
    comes out a lens. (Building islands from two straight chords meeting at an
    apex is what produces sharp Vs.)
    """
    rng = random.Random(seed)
    out = []  # (points, depth)

    def trunk(x):
        t = x / W
        return (MID
                + 30.0 * math.sin(t * math.pi * 1.25 + 0.5)
                + 13.0 * math.sin(t * math.pi * 2.8 + 1.4))

    def draw(x0, x1, curve, d):
        n = max(6, min(20, int((x1 - x0) / 42)))
        pts = [(x0 + (x1 - x0) * (s / n), 0.0) for s in range(n + 1)]
        out.append(([(x, curve(x)) for x, _ in pts], d))

    def grow(x0, x1, curve, d, amp):
        draw(x0, x1, curve, d)
        span = x1 - x0
        if d == 0 or span < 190:
            return
        # island count follows the length of the reach, otherwise a long trunk
        # spawns two islands and leaves a dead flat stretch between them
        count = max(1, min(4, int(round(span / 380.0))))
        edge = span * 0.06
        usable = span - 2 * edge
        # uneven slot widths - an even partition makes the band read as a
        # repeating decorative wave rather than a river
        weights = [rng.uniform(0.6, 1.7) for _ in range(count)]
        total = sum(weights)
        slots = []
        cursor = x0 + edge
        for wgt in weights:
            wspan = usable * (wgt / total)
            xa = cursor + wspan * rng.uniform(0.03, 0.26)
            xb = cursor + wspan - wspan * rng.uniform(0.03, 0.26)
            cursor += wspan
            if xb - xa > 90:
                slots.append((xa, xb))
        for xa, xb in slots:
            # unequal branches either side; often only one splits off
            sides = [-1, 1] if rng.random() < 0.6 else [rng.choice([-1, 1])]
            scale = rng.uniform(0.45, 1.15)
            for sign in sides:
                bow = sign * amp * scale * rng.uniform(0.5, 1.0)

                def child(x, xa=xa, xb=xb, bow=bow, curve=curve):
                    t = (x - xa) / (xb - xa)
                    return curve(x) + bow * math.sin(math.pi * t) ** 2

                grow(xa, xb, child, d - 1, amp * 0.5)

    grow(-70.0, W + 70.0, trunk, depth, H * 0.30)
    return out


def braid_paths():
    items = braid()
    maxd = max(d for _, d in items) or 1
    out = []
    for pts, d in items:
        # trunk-order channels read heavier than high-order threads
        k = d / maxd
        wgt = round(0.6 + 1.0 * k, 2)
        op = round(0.30 + 0.55 * k, 2)
        out.append(f'<path d="{smooth_path(pts)}" stroke-width="{wgt}" opacity="{op}"/>')
    return out


# -------------------------------------------------------------------- strata

def fold(rng, harmonics=4):
    """One folded profile, reused by every layer so the stack stays coherent."""
    terms = []
    for i in range(harmonics):
        terms.append((
            rng.uniform(0.7, 1.5) * (i + 1),      # frequency
            rng.uniform(0, math.tau),              # phase
            1.0 / (i + 1) ** 1.35,                 # falling weight
        ))
    norm = sum(w for _, _, w in terms)

    def f(t):
        return sum(math.sin(t * math.pi * fr + ph) * w for fr, ph, w in terms) / norm

    return f


def strata(seed=5, layers=13, samples=26):
    """Layers sharing one fold, amplitude decaying with depth so none cross."""
    rng = random.Random(seed)
    f = fold(rng)
    top, bottom = H * 0.14, H * 0.94
    spacing = (bottom - top) / (layers - 1.0)
    amp0 = 34.0
    decay = 0.90
    out = []
    for i in range(layers):
        base = top + spacing * i
        amp = amp0 * (decay ** i)
        pts = []
        for s in range(samples + 1):
            t = s / samples
            pts.append((t * W, base + amp * f(t)))
        op = round(0.62 - 0.026 * i, 3)
        wgt = round(1.15 - 0.045 * i, 2)
        out.append(f'<path d="{smooth_path(pts)}" stroke-width="{wgt}" opacity="{op}"/>')
    return out


def emit(name, lines):
    print(f"===== {name} =====")
    print("\n".join(lines))
    print()


if __name__ == "__main__":
    emit("BRAID", braid_paths())
    emit("STRATA", strata())
