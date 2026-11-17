#!/usr/bin/env python3
# Crea una imagen de prueba CON Y SIN importes para verificar:
# 1. La red de seguridad (catálogo → precio automático cuando importe=0)
# 2. La regla cantidad × precio del catálogo
from PIL import Image, ImageDraw, ImageFont
import os

img = Image.new('RGB', (800, 500), color=(255, 253, 247))
draw = ImageDraw.Draw(img)
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
# Línea CON cantidad pero SIN importe — debe usar precio del catálogo × cantidad
draw.text((40, 175), "Piking Bobinas   72 bobinas", fill=(61, 50, 37), font=font_b)
draw.text((40, 210), "Carga Palets   3 palets", fill=(61, 50, 37), font=font_b)
# Línea SIN cantidad ni importe — debe usar precio fijo del catálogo (viaje)
draw.text((40, 245), "Viaje Daroca", fill=(61, 50, 37), font=font_b)

draw.line([(40, 285), (760, 285)], fill=(203, 185, 141), width=1)
draw.text((40, 305), "FACTURACION", fill=(29, 78, 216), font=font_b)
draw.text((40, 345), "Milca/Milagro   20 euros", fill=(61, 50, 37), font=font_b)
# Sin importe — debería usar precio del catálogo si Milca/Milagro está
draw.text((40, 380), "La Boquera/Milca", fill=(61, 50, 37), font=font_b)

out_path = "/tmp/parte-test-precios.png"
img.save(out_path, "PNG")
print(f"Imagen creada: {out_path} ({os.path.getsize(out_path)} bytes)")
print("Contiene:")
print("  - Hualsa/Milagro 125 euros (importe explícito)")
print("  - Piking Bobinas 72 bobinas (cantidad, sin importe → catálogo × cantidad)")
print("  - Carga Palets 3 palets (cantidad, sin importe → catálogo × cantidad)")
print("  - Viaje Daroca (sin cantidad ni importe → precio fijo del catálogo)")
print("  - Milca/Milagro 20 euros (importe explícito)")
print("  - La Boquera/Milca (sin importe → precio del catálogo si existe)")
