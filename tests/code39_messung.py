# Code-39-Messung und Lesesimulation für die Lebensmittelkarte (Desktopversion), benutzt zxing-cpp und Pillow.
# messen <png> <dpi>   -> JSON: text, modul_mm, verhaeltnis, ruhe_links_mm/ruhe_rechts_mm (in Modulen: ruhe_*_module), hoehe_mm
#                        (richtungsunabhängig: misst entlang der zxing-Leselinie, also auch bei gedrehtem Strichcode)
# simulation <pdf> <soll> -> JSON: treffer, versuche (150 dpi, unscharf 0,8/1,2/1,6 px, gedreht -5..+5 Grad)
import sys, json, math, statistics, subprocess, tempfile, os
import zxingcpp
from PIL import Image, ImageFilter

def lies(im):
    return zxingcpp.read_barcodes(im, formats=zxingcpp.BarcodeFormat.Code39)

def messen(pfad, dpi):
    im = Image.open(pfad).convert("L"); w, h = im.size; px = im.load(); mm = 25.4 / dpi
    r = lies(im)
    if not r: return {"text": ""}
    q = r[0].position
    p0 = ((q.top_left.x + q.bottom_left.x) / 2, (q.top_left.y + q.bottom_left.y) / 2)
    p1 = ((q.top_right.x + q.bottom_right.x) / 2, (q.top_right.y + q.bottom_right.y) / 2)
    L = math.hypot(p1[0] - p0[0], p1[1] - p0[1]); dx, dy = (p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L
    def dunkel(x, y):
        xi, yi = int(round(x)), int(round(y))
        return 0 <= xi < w and 0 <= yi < h and px[xi, yi] < 128
    ext = L * 0.2; schritt = 0.25; n = int((L + 2 * ext) / schritt)
    werte = [dunkel(p0[0] + dx * (i * schritt - ext), p0[1] + dy * (i * schritt - ext)) for i in range(n)]
    laeufe = []; i = 0
    while i < n:
        j = i
        while j < n and werte[j] == werte[i]: j += 1
        laeufe.append([werte[i], i, j]); i = j
    dunkle = [k for k, l in enumerate(laeufe) if l[0]]
    a, b = dunkle[0], dunkle[-1]
    # Striche und Lücken getrennt (Druck/Kantenglättung macht Striche dünner, Lücken breiter), dann gemittelt
    def schmal_breit(dunkel_):
        x = [(l[2] - l[1]) * schritt for l in laeufe[a:b + 1] if l[0] == dunkel_]
        med = statistics.median(x); return statistics.median([v for v in x if v < 2 * med]), statistics.median([v for v in x if v >= 2 * med] or [0])
    sd, bd = schmal_breit(True); sl, bl = schmal_breit(False)
    schmal, breit = (sd + sl) / 2, (bd + bl) / 2
    def ruhe(k):  # heller Lauf vor dem ersten bzw. nach dem letzten Strich (bis zum Bildrand)
        if 0 <= k < len(laeufe) and not laeufe[k][0]: return (laeufe[k][2] - laeufe[k][1]) * schritt
        return 0
    rl, rr = ruhe(a - 1), ruhe(b + 1)
    hoehen = []
    for l in laeufe[a:b + 1]:
        if not l[0]: continue
        t = ((l[1] + l[2]) / 2) * schritt - ext; cx, cy = p0[0] + dx * t, p0[1] + dy * t; s = 0
        u = 0
        while dunkel(cx - dy * (u + 1), cy + dx * (u + 1)): u += 1
        v = 0
        while dunkel(cx + dy * (v + 1), cy - dx * (v + 1)): v += 1
        hoehen.append(u + v + 1)
    return {"text": r[0].text, "modul_mm": round(schmal * mm, 3), "verhaeltnis": round(breit / schmal, 2) if schmal else 0,
            "ruhe_links_mm": round(rl * mm, 2), "ruhe_rechts_mm": round(rr * mm, 2),
            "ruhe_links_module": round(rl / schmal, 1), "ruhe_rechts_module": round(rr / schmal, 1),
            "hoehe_mm": round(statistics.median(hoehen) * mm, 2), "laenge_mm": round(((laeufe[b][2] - laeufe[a][1]) * schritt) * mm, 2)}

def simulation(pdf, soll):
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(["pdftoppm", "-r", "150", "-gray", "-png", "-singlefile", pdf, os.path.join(d, "s")], check=True)
        im = Image.open(os.path.join(d, "s.png")).convert("L")
    treffer = 0; versuche = []
    for unschaerfe in (0.8, 1.2, 1.6):
        for winkel in (-5, -2.5, 0, 2.5, 5):
            bild = im.filter(ImageFilter.GaussianBlur(unschaerfe)).rotate(winkel, resample=Image.BICUBIC, expand=True, fillcolor=255)
            t = "|".join(x.text for x in lies(bild)); ok = t == soll; treffer += ok
            versuche.append({"unschaerfe_px": unschaerfe, "winkel": winkel, "gelesen": ok})
    return {"treffer": treffer, "versuche": len(versuche), "einzeln": versuche}

if __name__ == "__main__":
    if sys.argv[1] == "messen": print(json.dumps(messen(sys.argv[2], float(sys.argv[3]))))
    else: print(json.dumps(simulation(sys.argv[2], sys.argv[3])))
