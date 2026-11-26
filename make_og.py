# -*- coding: utf-8 -*-
"""make_og.py - build the share cards for the Taskmarket live visualizer.

Reads data.json and writes one 1200x630 card per view into assets/.
The cards follow the same visual language as the site: warm black, the
Taskmarket lockup as supplied, Instrument Serif for the headline, Departure
Mono for figures, magenta as the single accent.

Every figure on a card is read straight out of data.json, so a card can
never disagree with the page. Needs Pillow; if Pillow is missing the file
is skipped and the cards already in the repository are used as they are.
"""
import json
import os

try:
    from PIL import Image, ImageDraw, ImageFont
except Exception:
    Image = None

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data.json")
ASSETS = os.path.join(HERE, "assets")
GROUND = (18, 16, 14)
MAROON = (58, 20, 32)
CREAM = (239, 233, 226)
PAPER = (255, 246, 232)
MUTED = (176, 167, 157)
MAGENTA = (231, 64, 121)
CHAIN = "tempo"


def font(name, size):
    return ImageFont.truetype(os.path.join(HERE, "fonts", name), size)


def usd(v):
    """Exact dollars, the same way the page shows them."""
    try:
        v = float(v)
    except Exception:
        return "\u2014"
    if abs(v) >= 1000000:
        return "$" + format(v / 1000000, ".2f") + "M"
    s = format(v, ".4f").rstrip("0")
    if s.endswith("."):
        s = s[:-1]
    return "$" + s


def hours(h):
    try:
        h = float(h)
    except Exception:
        return "\u2014"
    if h < 1:
        return str(int(round(h * 60))) + " min"
    if h < 48:
        return format(h, ".1f") + " h"
    return format(h / 24.0, ".1f") + " d"


def canvas():
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), GROUND)
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    for r in range(430, 0, -6):
        a = int(130 * (1 - r / 430.0))
        od.ellipse([W - 520 - r, -300 - r, W - 520 + r, -300 + r], fill=(MAROON[0], MAROON[1], MAROON[2], a))
    img = Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")
    d = ImageDraw.Draw(img)
    lock = os.path.join(ASSETS, "taskmarket-lockup.png")
    if os.path.exists(lock):
        li = Image.open(lock).convert("RGBA")
        img.paste(li, (72, 58), li)
    return img, d


def fit(d, xy, text, fnt, fill, maxw):
    """Draw text, stepping the size down until it fits maxw pixels."""
    size = fnt.size
    while size > 14 and d.textlength(text, font=fnt) > maxw:
        size -= 2
        fnt = ImageFont.truetype(fnt.path, size)
    d.text(xy, text, font=fnt, fill=fill)


def card(name, head1, head2, stats, body):
    img, d = canvas()
    f1 = font("InstrumentSerif-Regular.ttf", 74)
    f2 = font("InstrumentSerif-Italic.ttf", 74)
    f3 = font("DepartureMono-Regular.otf", 26)
    f4 = font("InterTight-Variable.ttf", 28)
    d.text((72, 210), head1, font=f1, fill=CREAM)
    d.text((72, 296), head2, font=f2, fill=MAGENTA)
    fit(d, (72, 404), stats, f3, PAPER, 1050)
    fit(d, (72, 462), body, f4, MUTED, 1050)
    d.text((72, 518), "taskmarket.dev  \u00b7  " + CHAIN + " chain", font=f3, fill=MUTED)
    d.text((72, 562), "data as of " + GENERATED, font=f3, fill=(120, 112, 104))
    out = os.path.join(ASSETS, "og-" + name + ".png")
    img.save(out)
    return out, os.path.getsize(out)


def build():
    if Image is None:
        print("Pillow is not installed, skipping share cards")
        return
    global GENERATED
    with open(DATA, encoding="utf-8") as fh:
        data = json.load(fh)
    GENERATED = data.get("generated_at", "")
    ch = (data.get("chains") or {}).get(CHAIN) or {}
    st = ch.get("stats") or {}
    fl = ch.get("flow") or {}
    tot = fl.get("totals") or {}
    life = fl.get("lifetime") or {}
    dec = fl.get("decision") or {}
    con = fl.get("concentration") or {}
    es = ch.get("expired_summary") or {}
    made = []
    made.append(card("overview", "What the market is doing", "right now.",
                      "open tasks " + str(st.get("openTasks")) + "   active agents 7d " + str(st.get("activeAgents7d")) +
                      "   paid workers " + str(st.get("paidWorkers")),
                      "Live read-only figures from the public Taskmarket API."))
    made.append(card("flow", "Where the money", "goes.",
                      "paid 30d " + usd(tot.get("paidAmount")) + "   settlements " + str(tot.get("settlements")) +
                      "   payers " + str(con.get("payers")),
                      "Every payment the API records, from the poster to the worker it paid."))
    made.append(card("swarm", "The swarm", "converging.",
                      "tasks " + str(life.get("tasks")) + "   submissions " + str(life.get("submissions")) +
                      "   median decision " + hours(dec.get("median_hours")),
                      "How many agents piled onto the same task, and what it paid."))
    top1 = con.get("top1_share")
    top1s = (format(top1 * 100, ".1f") + "%") if isinstance(top1, (int, float)) else "\u2014"
    made.append(card("insight", "What is not", "obvious.",
                      "top payer " + top1s + "   expired no claim " + str(es.get("unclaimed")) +
                      "   unclaimed " + usd(es.get("unclaimed_reward_usd")),
                      "How concentrated posting is, which tasks died, what is growing."))
    for path, size in made:
        print("share card", os.path.basename(path), size, "bytes")
    # the overview card doubles as the repository's front page image
    src = os.path.join(ASSETS, "og-overview.png")
    if os.path.exists(src):
        Image.open(src).save(os.path.join(ASSETS, "og.png"))
        print("share card og.png", os.path.getsize(os.path.join(ASSETS, "og.png")), "bytes")


if __name__ == "__main__":
    build()
