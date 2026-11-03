"""Make WebP copies of the site's photos (and an 800px-wide one for phones) next to the originals.
Run after adding or replacing an image:  python3 tools/images.py
The build swaps <img src="x.jpg"> for a <picture> that offers these, so the originals stay as the fallback."""
import os, sys, json
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "src", "assets")
DIRS = ["img", "img/partners", "video"]
SMALL = 800

def save(im, path, q):
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
    im.save(path, "WEBP", quality=q, method=6)

made = 0
widths = {}
for d in DIRS:
    folder = os.path.join(ROOT, d)
    for f in sorted(os.listdir(folder)):
        if not f.lower().endswith((".jpg", ".jpeg", ".png")):
            continue
        src = os.path.join(folder, f)
        base = os.path.splitext(src)[0]
        im = Image.open(src)
        widths["/assets/" + d + "/" + os.path.splitext(f)[0]] = im.width
        mtime = os.path.getmtime(src)
        out = base + ".webp"
        if not os.path.exists(out) or os.path.getmtime(out) < mtime:
            big = im
            if d == "img" and f.startswith("riptide-logo"):
                big = im  # tiny already
            if d == "video" and im.width > 1600:
                big = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
            save(big, out, 72 if d == "video" else 80); made += 1
        if d != "img/partners":
            for size in (480, SMALL):
                if im.width < size * 1.25:
                    continue
                out = base + f"-{size}.webp"
                if not os.path.exists(out) or os.path.getmtime(out) < mtime:
                    save(im.resize((size, round(im.height * size / im.width)), Image.LANCZOS), out, 72 if d == "video" else 78); made += 1
json.dump(widths, open(os.path.join(os.path.dirname(__file__), "image-widths.json"), "w"), indent=0, sort_keys=True)
print("made", made)
