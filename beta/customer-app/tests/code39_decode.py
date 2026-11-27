#!/usr/bin/env python3
"""Dekodiert Bildschirmfotos der Becker-Karte mit zxing-cpp und vergleicht die Code-39-Tabelle mit python-barcode.
Aufruf: python3 code39_decode.py bild1.png [bild2.png ...]
Voraussetzung (kostenfrei): pip install zxing-cpp python-barcode pillow
Erwartet in jedem Bild genau den Inhalt FAPK1472914090000177. Rückgabe 0 = alles gelesen."""
import json, os, subprocess, sys
import zxingcpp
from PIL import Image

ERWARTET = "FAPK1472914090000177"
HIER = os.path.dirname(os.path.abspath(__file__))
fehler = 0

# 1) Tabelle aus js/code39.js gegen python-barcode
try:
    from barcode.charsets import code39 as ref
    muster = json.loads(subprocess.check_output(
        ["node", "-e", "console.log(JSON.stringify(require(process.argv[1]).MUSTER))", os.path.join(HIER, "..", "js", "code39.js")]))
    def module(nw):
        return "".join(("1" if j % 2 == 0 else "0") * (3 if c == "w" else 1) for j, c in enumerate(nw))
    norm = {k: v[1] for k, v in ref.MAP.items()}
    norm["*"] = ref.EDGE
    abw = [k for k in norm if module(muster.get(k, "")) != norm[k]]
    if abw or set(muster) != set(norm):
        fehler += 1
        print("FAIL python-barcode-Vergleich, abweichend:", abw)
    else:
        print("ok   Tabelle gleich python-barcode (%d Zeichen)" % len(norm))
except ImportError:
    print("Hinweis: python-barcode fehlt, Tabellenvergleich übersprungen")

# 2) Bilder dekodieren
for pfad in sys.argv[1:]:
    treffer = zxingcpp.read_barcodes(Image.open(pfad).convert("L"), formats=zxingcpp.BarcodeFormat.Code39)
    texte = [t.text for t in treffer]
    if ERWARTET in texte:
        print("ok   %s -> %s" % (os.path.basename(pfad), ERWARTET))
    else:
        fehler += 1
        print("FAIL %s -> %s" % (os.path.basename(pfad), texte or "nichts gelesen"))

print("FAILS %d" % fehler)
sys.exit(1 if fehler else 0)
