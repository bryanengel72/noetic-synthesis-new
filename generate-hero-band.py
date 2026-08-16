"""Generate SVG path data for the Noetic Synthesis hero band alternatives.

braid   a braided channel: a bundle of lines that bunch into a cord in places
        and open into islands in others. Spacing is built in, not checked after
        the fact, so channels can close right up without ever touching.

strata  stacked layers that share one fold and flatten with depth. Amplitude
        decays monotonically, so lines can never cross - which is what separates
        contours from noodles.
"""
import math
import random

W, H = 1600.0, 300.0
MID = H * 0.5

# Clearance every branch keeps from its parent, in viewBox units. The band is
# ~1600 units wide on screen, so this is close to a 1:1 pixel gap.
GAP = 6.0


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

def braid(seed=12, channels=11, samples=46):
    """A bundle of channels that pinch together and swell apart.

    Separation is built in rather than checked afterwards. Channel i sits at the
    running sum of the gaps below it, and every gap is GAP plus a non-negative
    swell, so neighbours can close to GAP but never nearer, and never cross.
    Each gap swells in its own places, so the bundle bunches here and opens into
    an island there, which is what reads as a braid.

    Grown recursively instead, a branch must either nest inside its parent's
    bulge or be dropped once it has to keep clear of it, and the band turns into
    rows of concentric leaf shapes.
    """
    rng = random.Random(seed)

    def trunk(x):
        t = x / W
        return (MID
                + 30.0 * math.sin(t * math.pi * 1.25 + 0.5)
                + 13.0 * math.sin(t * math.pi * 2.8 + 1.4))

    # Each gap opens in a few specific places and is shut everywhere else.
    # Periodic swells average out into an evenly spaced ribbon; localised bumps
    # are what make the bundle bunch into a cord here and open into an island
    # there.
    swells = []
    for _ in range(channels - 1):
        bumps = []
        for _ in range(rng.randint(1, 3)):
            bumps.append((
                rng.uniform(-0.05, 1.05),    # centre, in t
                rng.uniform(0.05, 0.17),     # width
                rng.uniform(16.0, 62.0),     # how far it opens
            ))
        swells.append(bumps)

    def gap_at(i, t):
        g = GAP
        for centre, width, amp in swells[i]:
            g += amp * math.exp(-(((t - centre) / width) ** 2))
        return g

    xs = [-70.0 + (W + 140.0) * (s / samples) for s in range(samples + 1)]
    # precompute every gap at every station, so the running sums are cheap
    table = [[gap_at(i, (x + 70.0) / (W + 140.0)) for i in range(channels - 1)]
             for x in xs]

    raw = []
    for i in range(channels):
        pts = []
        for xi, x in enumerate(xs):
            row = table[xi]
            pts.append((x, trunk(x) + sum(row[:i]) - sum(row) * 0.5))
        raw.append(pts)

    # How wide the bundle runs depends on where the swells happen to land, so
    # fit it to the band rather than hoping. Scaling about the bundle's own
    # centre keeps every gap in proportion; separation scales with it.
    ys = [y for pts in raw for _, y in pts]
    lo, hi = min(ys), max(ys)
    pad = 14.0
    k = min(1.0, (H - 2 * pad) / max(1e-6, hi - lo))
    centre = (lo + hi) * 0.5

    out = []
    half = (channels - 1) / 2.0
    for i, pts in enumerate(raw):
        fitted = [(x, MID + (y - centre) * k) for x, y in pts]
        # the middle of the bundle is the main channel and reads heaviest
        centrality = 1.0 - abs(i - half) / half
        out.append((fitted, centrality))
    return out


def braid_paths():
    items = braid()
    n = len(items)
    # emit from the middle outward, so the stagger fills from the main channel
    order = sorted(range(n), key=lambda i: -items[i][1])
    out = [None] * n
    for rank, i in enumerate(order):
        pts, centrality = items[i]
        # the centre of the bundle is the main channel and carries the weight
        wgt = round(0.55 + 1.05 * centrality, 2)
        op = round(0.32 + 0.5 * centrality, 2)
        # pathLength=1 normalises every path so one dash animation draws them all
        # at the same rate whatever their real length. --i staggers them by rank,
        # so the braid fills outward from its main channel rather than all at once.
        out[i] = (
            f'<path pathLength="1" style="--i:{rank}" d="{smooth_path(pts)}" '
            f'stroke-width="{wgt}" opacity="{op}"/>'
        )
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
