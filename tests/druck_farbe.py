# Farbprüfung für den Kartendruck: PDF (pdftoppm, 100 dpi) oder PNG als RGB lesen und farbige Pixel zählen.
# Ein Pixel gilt als farbig, wenn max(R,G,B) - min(R,G,B) > Toleranz (Standard 8). Ausgabe: JSON.
import sys, json, subprocess, tempfile, os
from PIL import Image
datei = sys.argv[1]; tol = int(sys.argv[2]) if len(sys.argv) > 2 else 8
if datei.lower().endswith(".pdf"):
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(["pdftoppm", "-r", "100", "-png", "-singlefile", datei, os.path.join(d, "s")], check=True, stderr=subprocess.DEVNULL)
        im = Image.open(os.path.join(d, "s.png")).convert("RGB")
else:
    im = Image.open(datei).convert("RGB")
w, h = im.size; px = im.load(); mx = 0; bunt = []
for y in range(h):
    for x in range(w):
        r, g, b = px[x, y]; s = max(r, g, b) - min(r, g, b)
        if s > mx: mx = s
        if s > tol and len(bunt) < 2000: bunt.append([x, y, r, g, b])
print(json.dumps({"max_abweichung": mx, "farbige_pixel": len(bunt), "toleranz": tol, "beispiele": bunt[:5]}))
