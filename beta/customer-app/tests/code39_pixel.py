#!/usr/bin/env python3
"""Prüft den Strichcode in Bildschirmfotos (Gerätepixel) auf Ruhezone und Strichbreiten.
Aufruf: python3 code39_pixel.py pixel.json   (Liste von {bild, rect [l,t,r,b] in CSS-px, dpr, achse "x"|"y", n, modul_geraet, name})
Der Ausschnitt ist genau das SVG (rect × dpr, auf Gerätepixel gerundet).
- Ruhezone: links und rechts (bzw. oben und unten) mindestens 10 Module weiß (Toleranz 1 Gerätepixel)
- n > 0: alle schmalen Striche und Lücken genau n, alle breiten genau 3n Gerätepixel (Mitte des Codes, ohne Graustufen)
- 22 Zeichen × 5 Striche = 110 Striche
- eingepasst (n = 0, unter 1 Gerätepixel je Modul): nur Hinweis, Lage prüft code39-decode.js"""
import json, sys, itertools
from PIL import Image

fehler = 0
for e in json.load(open(sys.argv[1])):
    d = e["dpr"]; l, t, r, b = [round(v * d) for v in e["rect"]]
    l0, t0, r0, b0 = l, t, r, b
    voll = Image.open(e["bild"]).convert("L")
    # Ruhezone = weiße Fläche vor und nach dem Code: Ausschnitt in Leserichtung um 10 Module erweitert,
    # aber nur innerhalb des Bildschirmfotos (was außerhalb des Bildschirms liegt, zählt nicht)
    z = int(round(10 * e["modul_geraet"])) + 2
    if e["achse"] == "x": l, r = max(0, l - z), min(voll.size[0], r + z)
    else: t, b = max(0, t - z), min(voll.size[1], b + z)
    im = voll.crop((l, t, r, b))
    w, h = im.size
    linie = [im.getpixel((x, h // 2)) for x in range(w)] if e["achse"] == "x" else [im.getpixel((w // 2, y)) for y in range(h)]
    schwarz = [v < 128 for v in linie]
    # Graupixel nur im Strichcode selbst zählen (der Ausschnitt reicht darüber hinaus bis in den Kartenrand)
    ia, ib = (l0 - l, r0 - l) if e["achse"] == "x" else (t0 - t, b0 - t)
    grau = sum(1 for v in linie[max(0, ia):ib] if 40 < v < 215)
    if True not in schwarz:
        print("FAIL %s: keine Striche" % e["name"]); fehler += 1; continue
    links = schwarz.index(True); rechts = len(schwarz) - 1 - schwarz[::-1].index(True)
    ruhe_l, ruhe_r = links, len(schwarz) - 1 - rechts
    soll = 10 * e["modul_geraet"] - 1
    laeufe = [(k, len(list(g))) for k, g in itertools.groupby(schwarz[links:rechts + 1])]
    striche = [l for k, l in laeufe if k]
    msg = []
    if ruhe_l < soll or ruhe_r < soll: msg.append("Ruhezone %d/%d < %.1f" % (ruhe_l, ruhe_r, soll))
    if len(striche) != 110: msg.append("%d Striche statt 110" % len(striche))
    n = e["n"]
    if not n:
        # eingepasst (weniger als 1 Gerätepixel je Modul, z. B. sehr schmales Fenster): Striche verschwimmen,
        # Lage und Ruhezone prüft code39-decode.js geometrisch (Code im weißen Platz, Platz im Kartenrahmen)
        print("info %s: eingepasst (< 1 Gerätepixel je Modul), Pixelprüfung entfällt" % e["name"])
        continue
    if n:
        falsch = sorted(set(l for _, l in laeufe if l not in (n, 3 * n)))
        if falsch: msg.append("Breiten %s statt %d/%d" % (falsch, n, 3 * n))
        if grau: msg.append("%d Graupixel" % grau)
    if msg:
        fehler += 1; print("FAIL %s: %s" % (e["name"], "; ".join(msg)))
    else:
        print("ok   %s: Ruhezone %d/%d Gerätepx, Module %s" % (e["name"], ruhe_l, ruhe_r, ("%d/%d" % (n, 3 * n)) if n else "eingepasst"))
print("PIXEL-FAILS %d" % fehler)
sys.exit(1 if fehler else 0)
