"""Render the project's vector-style face as opaque home-screen PNG icons."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1] / 'assets'
INK = '#24262b'

def make(size, maskable=False):
    scale = 4
    image = Image.new('RGB', (size*scale, size*scale), '#52c6f2')
    draw = ImageDraw.Draw(image)
    unit = size*scale/100
    def box(x1,y1,x2,y2):
        if maskable:
            x1,y1,x2,y2 = [50+(v-50)*.78 for v in (x1,y1,x2,y2)]
        return tuple(round(v*unit) for v in (x1,y1,x2,y2))
    line = round(unit*(3.5 if maskable else 4))
    for x in (33,67):
        draw.ellipse(box(x-14,22,x+14,65), fill='white', outline=INK, width=line)
        draw.ellipse(box(x-5,37,x+7,60), fill=INK)
        draw.ellipse(box(x-4,36,x,43), fill='white')
    draw.arc(box(32,57,68,80), 7,173, fill=INK, width=round(unit*4))
    draw.ellipse(box(13,12,23,17), fill='#b9efff')
    return image.resize((size,size),Image.Resampling.LANCZOS)

for name,size,mask in [('apple-touch-icon.png',180,False),('icon-192.png',192,False),('icon-512.png',512,False),('icon-maskable-512.png',512,True)]:
    make(size,mask).save(ROOT/name,optimize=True)
