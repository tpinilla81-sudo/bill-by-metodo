#!/usr/bin/env python3
# Crea una imagen PNG con texto simulando un parte de trabajo manuscrito
# para probar el endpoint /api/agenda-diaria/interpretar con VLM.
from PIL import Image, ImageDraw, ImageFont
import base64, os

img = Image.new('RGB', (800, 600), color=(255, 253, 247))
draw = ImageDraw.Draw(img)

# Intentar cargar una fuente serif; si no existe, default
try:
    font_h = ImageFont.truetype("/usr/share/fonts/truetype/chinese/NotoSansSC-Regular.ttf", 28)
    font_b = ImageFont.truetype("/usr/share/fonts/truetype/chinese/NotoSansSC-Regular.ttf", 22)
except:
    font_h = ImageFont.load_default()
    font_b = ImageFont.load_default()

draw.text((40, 30), "PARTE DE TRABAJO - 17/11/2026", fill=(61, 50, 37), font=font_h)
draw.line([(40, 75), (760, 75)], fill=(203, 185, 141), width=2)

draw.text((40, 100), "LOGISTICA", fill=(122, 31, 43), font=font_b)
draw.text((40, 140), "Hualsa/Milagro   125 euros", fill=(61, 50, 37), font=font_b)
draw.text((40, 175), "Piking Bobinas   72 bobinas a 1,20", fill=(61, 50, 37), font=font_b)
draw.text((40, 210), "Carga Palets   3 palets a 3 euros", fill=(61, 50, 37), font=font_b)

draw.line([(40, 250), (760, 250)], fill=(203, 185, 141), width=1)
draw.text((40, 270), "FACTURACION", fill=(29, 78, 216), font=font_b)
draw.text((40, 310), "Milca/Milagro   20 euros", fill=(61, 50, 37), font=font_b)
draw.text((40, 345), "La Boquera/Milca   90 euros  facturar a Vega", fill=(61, 50, 37), font=font_b)
draw.text((40, 380), "Villafranca/Milagro   180 euros", fill=(61, 50, 37), font=font_b)

draw.line([(40, 420), (760, 420)], fill=(203, 185, 141), width=1)
draw.text((40, 440), "URGENTE: viaje daroca", fill=(122, 31, 43), font=font_b)

out_path = "/tmp/parte-test.png"
img.save(out_path, "PNG")
print(f"Imagen creada: {out_path} ({os.path.getsize(out_path)} bytes)")

# Codificar a base64 data URL
with open(out_path, "rb") as f:
    b64 = base64.b64encode(f.read()).decode()
print(f"Base64 length: {len(b64)}")
print(f"Data URL preview: data:image/png;base64,{b64[:80]}...")
