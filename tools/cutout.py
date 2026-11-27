"""Turns chosen paintings from art/raw into game portraits.

    C:/sdenv/Scripts/python tools/cutout.py seren=22 ely=11 ...   # -> public/portraits/<id>.webp and <id>-px.png
    C:/sdenv/Scripts/python tools/cutout.py --preview <dir>         # every raw painting -> <dir>, for the look picker

The white background is flood-filled away from the borders and the edge is feathered.
<id>.webp is the painted bust (384x384); <id>-px.png is a 96x96 pixelated version with a reduced palette.
"""
import os, sys
from collections import deque
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'art', 'raw')


def cut(img):
    a = np.asarray(img.convert('RGB')).astype(np.int16)
    h, w, _ = a.shape
    dist = 255 * 3 - a.sum(axis=2)  # 0 for pure white
    bg = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        q.append((0, x)); q.append((h - 1, x))
    for y in range(h):
        q.append((y, 0)); q.append((y, w - 1))
    while q:
        y, x = q.popleft()
        if bg[y, x] or dist[y, x] > 60:
            continue
        bg[y, x] = True
        if y > 0: q.append((y - 1, x))
        if y < h - 1: q.append((y + 1, x))
        if x > 0: q.append((y, x - 1))
        if x < w - 1: q.append((y, x + 1))
    alpha = np.where(bg, 0, 255).astype(np.float32)
    # feather: pixels next to the background fade by how white they are
    edge = ~bg & (np.roll(bg, 1, 0) | np.roll(bg, -1, 0) | np.roll(bg, 1, 1) | np.roll(bg, -1, 1))
    alpha[edge] = np.clip(dist[edge] / 120 * 255, 60, 255)
    rgba = np.dstack([a.astype(np.uint8), alpha.astype(np.uint8)])
    return Image.fromarray(rgba, 'RGBA')


def pixelate(img, size=96, colors=40):
    small = img.resize((size, size), Image.LANCZOS)
    alpha = small.getchannel('A').point(lambda v: 255 if v > 110 else 0)
    rgb = small.convert('RGB').quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.NONE).convert('RGB')
    out = rgb.convert('RGBA')
    out.putalpha(alpha)
    return out


def main():
    if sys.argv[1] == '--preview':
        out = sys.argv[2]
        os.makedirs(out, exist_ok=True)
        for f in sorted(os.listdir(RAW)):
            if not f.endswith('.png'):
                continue
            c = cut(Image.open(os.path.join(RAW, f)))
            c.resize((384, 384), Image.LANCZOS).save(os.path.join(out, f[:-4] + '.webp'), quality=88)
            pixelate(c).save(os.path.join(out, f[:-4] + '-px.png'))
            print(f, flush=True)
        return
    out = os.path.join(ROOT, 'public', 'portraits')
    os.makedirs(out, exist_ok=True)
    for arg in sys.argv[1:]:
        cid, seed = arg.split('=')
        c = cut(Image.open(os.path.join(RAW, f'{cid}_{seed}.png')))
        c.resize((384, 384), Image.LANCZOS).save(os.path.join(out, f'{cid}.webp'), quality=90)
        pixelate(c).save(os.path.join(out, f'{cid}-px.png'))
        print(cid, seed, flush=True)


if __name__ == '__main__':
    main()
