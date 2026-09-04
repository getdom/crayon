"""Assemble frames.json (from demo.mjs) into docs/demo.gif. Usage: python3 scripts/gif.py <frames-dir> <out.gif> [width]"""
import json, sys, os
from PIL import Image
d, out = sys.argv[1], sys.argv[2]
width = int(sys.argv[3]) if len(sys.argv) > 3 else 1000
frames = json.load(open(os.path.join(d, "frames.json")))
imgs, durs = [], []
for f in frames:
    im = Image.open(f["file"]).convert("RGB")
    w, h = im.size
    im = im.resize((width, int(h * width / w)), Image.LANCZOS)
    imgs.append(im.quantize(colors=160, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG))
    durs.append(f["ms"])
imgs[0].save(out, save_all=True, append_images=imgs[1:], duration=durs, loop=0, optimize=True)
print(out, os.path.getsize(out) // 1024, "KB", len(imgs), "frames")
