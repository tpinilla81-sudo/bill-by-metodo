#!/usr/bin/env python3
# Genera un audio WAV de prueba con síntesis de voz (es-ES) diciendo una frase
# típica del dictado de la agenda, para probar /api/agenda-diaria/transcribir.
# Usa espeak-ng si está disponible; si no, crea un tono sine.
import subprocess, os, shutil

texto = "Hualsa Milagro ciento veinticinco euros. Piking Bobinas setenta y dos bobinas a uno coma veinte. Nueva carga. Milca Milagro veinte euros. La Boquera Milca noventa euros facturar a Vega. Urgente viaje Daroca."

out = "/tmp/dictado-test.wav"
if shutil.which('espeak-ng'):
    subprocess.run(['espeak-ng', '-v', 'es', '-s', '140', '-w', out, texto], check=True)
    print(f"✓ Audio generado con espeak-ng: {out} ({os.path.getsize(out)} bytes)")
elif shutil.which('espeak'):
    subprocess.run(['espeak', '-v', 'es', '-s', '140', '-w', out, texto], check=True)
    print(f"✓ Audio generado con espeak: {out} ({os.path.getsize(out)} bytes)")
else:
    # Fallback: tono puro (no sirve para ASR pero prueba el pipeline)
    import wave, struct, math
    f = wave.open(out, 'w')
    f.setnchannels(1); f.setsampwidth(2); f.setframerate(16000)
    for i in range(16000 * 3):  # 3 segundos
        v = int(32767 * 0.3 * math.sin(2 * math.pi * 440 * i / 16000))
        f.writeframes(struct.pack('<h', v))
    f.close()
    print(f"✓ Audio fallback (tono) generado: {out} ({os.path.getsize(out)} bytes) — no útil para ASR")
print("Contenido:", texto)
