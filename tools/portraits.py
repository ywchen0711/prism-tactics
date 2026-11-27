"""Paints character portraits with an open anime model on this machine's GPU (SDXL + Animagine XL 4.0).

    C:/sdenv/Scripts/python tools/portraits.py [ids] [seeds]   # -> art/raw/<id>_<seed>.png

ids and seeds are comma lists (default: every character, seeds 11,22,33,44).
The model and VAE live in C:/sdmodels. Raw paintings are not committed; the chosen ones are
cut out and shrunk into public/portraits by tools/cutout.py.
"""
import os, sys, torch
from diffusers import StableDiffusionXLPipeline, AutoencoderKL, EulerAncestralDiscreteScheduler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = 'C:/sdmodels'
# CLIP reads only 77 tokens, so each prompt is kept short: subject first, then framing, then quality tags.
FRAME = 'upper body, looking at viewer, white background'
STYLE = 'anime coloring, masterpiece, high score, great score, absurdres'
NEG = ('lowres, bad anatomy, bad hands, text, error, cropped, head out of frame, close-up, worst quality, low quality, '
       'low score, bad score, average score, signature, watermark, blurry, 3d, realistic, multiple views, open mouth, teeth')

CHARS = {
    'seren': '1boy, solo, young knight, short messy brown hair, ahoge, blue eyes, serious, closed mouth, blue armor, gold trim, silver pauldrons, blue cape',
    'roland': '1boy, solo, male focus, adult knight, no helmet, short brown hair, green eyes, brown mustache, stubble, stern, red tabard, silver armor, white plume',
    'fid': '1boy, solo, male focus, young man, hunter, short auburn hair, freckles, amber eyes, grin, closed mouth, green hood, orange scarf, green tunic',
    'corti': '1girl, solo, mage, long silver hair, red eyes, gold circlet, mole under eye, calm, closed mouth, purple robe, gold trim',
    'ely': '1girl, solo, healer, long blonde hair, blue eyes, gentle smile, closed mouth, blush, gold circlet, red ribbon, white robe, blue trim',
    'benny': '1boy, solo, old man, butler, slicked back grey hair, grey beard, monocle, kind smile, closed mouth, black tailcoat',
    'general': '1boy, solo, male focus, middle-aged man, tan skin, short black beard, scar across eye, red eyes, horned helmet, grey steel armor, red cape, fierce, bright lighting',
    'eMage': '1girl, solo, sorceress, crimson hood, pale skin, glowing red eyes, facial mark, cold, closed mouth, crimson robe, villain',
}


def pipe():
    vae = AutoencoderKL.from_single_file(f'{MODELS}/sdxl-vae-fp16-fix.safetensors', torch_dtype=torch.float16)
    p = StableDiffusionXLPipeline.from_single_file(f'{MODELS}/animagine-xl-4.0-opt.safetensors', vae=vae,
                                                   torch_dtype=torch.float16, use_safetensors=True)
    p.scheduler = EulerAncestralDiscreteScheduler.from_config(p.scheduler.config)
    p.enable_model_cpu_offload()
    p.vae.enable_slicing()
    return p


def main():
    ids = sys.argv[1].split(',') if len(sys.argv) > 1 and sys.argv[1] != 'all' else list(CHARS)
    seeds = [int(s) for s in sys.argv[2].split(',')] if len(sys.argv) > 2 else [11, 22, 33, 44]
    out = os.path.join(ROOT, 'art', 'raw')
    os.makedirs(out, exist_ok=True)
    P = pipe()
    for cid in ids:
        for s in seeds:
            path = os.path.join(out, f'{cid}_{s}.png')
            if os.path.exists(path):
                continue
            g = torch.Generator('cuda').manual_seed(s)
            img = P(prompt=f'{CHARS[cid]}, {FRAME}, {STYLE}', negative_prompt=NEG, width=1024, height=1024,
                    num_inference_steps=28, guidance_scale=5.5, generator=g).images[0]
            img.save(path)
            print(path, flush=True)


if __name__ == '__main__':
    main()
