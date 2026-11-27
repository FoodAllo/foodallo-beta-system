/* FoodAllo Retail App – Kamerascan (Strichcode Code 39 der Lebensmittelkarte, QR des Rezeptnachweises).
   1. BarcodeDetector des Browsers, aber nur mit Formaten, die getSupportedFormats() meldet (sonst Fehler oder keine Treffer).
   2. Rückfall zxing (js/vendor, lokal): wenn BarcodeDetector fehlt, Code 39 nicht kann oder ~2 s nichts findet.
      Je Bild abwechselnd: mittleres Querband (auch um ±3/5/8° gedreht), ganzes Bild, um 90° gedreht – Hybrid-/GlobalHistogram-Binarisierer,
      teils waagerecht nachgeschärft. Nur plausible Codes zählen (FAPK mit Prüfziffer, FA-V/FA-PK, Rezept-QR).
   Ergebnis wird normalisiert (Start-/Stoppzeichen * und Leerzeichen am Rand entfernt). */
(function (root) {
  "use strict";
  var WUNSCH = ["code_39", "code_128", "qr_code", "data_matrix", "ean_13"];
  var ZXING_DATEI = "js/vendor/zxing-library-0.23.0.min.js";
  var zxingLaden = null, leser = null, cv = null;

  function normalisiere(t) { return String(t == null ? "" : t).replace(/^[\s*]+|[\s*]+$/g, ""); }
  /* Code 39 hat keine Pflicht-Prüfziffer: Teilstücke („177“, „90000177“) werden sonst als Treffer gemeldet. Strichcodes daher nur
     annehmen, wenn sie wie ein FoodAllo-Code aussehen; FAPK-Codes zusätzlich mit Prüfziffer ISO 7064 Mod 97-10. QR-Codes unverändert. */
  function plausibel(t, format) {
    if (!t) return false;
    if (format === "qr_code") return true;
    var m = /^FAPK(\d{14})(\d{2})$/.exec(t);
    if (m) { var r = 0; for (var i = 0; i < 14; i++) r = (r * 10 + Number(m[1][i])) % 97; return ("0" + (98 - (r * 100) % 97)).slice(-2) === m[2]; }
    return /^FA-(V|PK)-\d{8}-\d{6}(-\d{2})?$/i.test(t) || /^FA-RXN1~/i.test(t);
  }

  function ladeZxing() {
    if (root.ZXing) return Promise.resolve(root.ZXing);
    if (zxingLaden) return zxingLaden;
    zxingLaden = new Promise(function (ok, fehler) {
      var s = document.createElement("script"); s.src = ZXING_DATEI; s.async = true;
      s.onload = function () { root.ZXing ? ok(root.ZXing) : fehler(new Error("zxing")); };
      s.onerror = function () { zxingLaden = null; fehler(new Error("zxing")); };
      document.head.appendChild(s);
    });
    return zxingLaden;
  }

  function zxLeser() {
    var Z = root.ZXing; if (!Z) return null;
    if (leser) return leser;
    var h = new Map();
    h.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.CODE_39, Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.QR_CODE]);
    h.set(Z.DecodeHintType.TRY_HARDER, true);
    leser = new Z.MultiFormatReader(); leser.setHints(h);
    return leser;
  }

  /* Ausschnitt einer Quelle (Video, Bild, Canvas) in ein Arbeits-Canvas zeichnen. modus: "ganz" | "band" | "gedreht" */
  function zeichne(quelle, w, h, modus) {
    cv = cv || document.createElement("canvas");
    var max = 1280, sx = 0, sy = 0, sw = w, sh = h;
    // Querband in voller Auflösung (bis 1920 px), damit schmale Striche des Code 39 nicht weggerechnet werden
    if (modus === "band") { sh = Math.round(h * 0.4); sy = Math.round((h - sh) / 2); max = 1920; }
    if (modus === "gedreht") max = 1920;   // hochkant gehaltener Strichcode: ebenfalls volle Auflösung
    var f = Math.min(1, max / Math.max(sw, sh)), zw = Math.max(1, Math.round(sw * f)), zh = Math.max(1, Math.round(sh * f));
    var ctx = cv.getContext("2d", { willReadFrequently: true });
    var schraeg = /^band@(-?\d+)$/.exec(modus);
    if (schraeg) {
      // Querband aus dem um a Grad gedrehten Gesamtbild: gegen schräg gehaltene Karten mit flachem Strichcode (z. B. Druck A4)
      var a = Number(schraeg[1]) * Math.PI / 180, fg = Math.min(1, 1920 / w);
      cv.width = Math.round(w * fg); cv.height = Math.round(h * 0.4 * fg);
      ctx.save(); ctx.translate(cv.width / 2, cv.height / 2); ctx.rotate(a); ctx.drawImage(quelle, 0, 0, w, h, -w * fg / 2, -h * fg / 2, w * fg, h * fg); ctx.restore();
    } else if (modus === "gedreht") {
      cv.width = zh; cv.height = zw;
      ctx.save(); ctx.translate(zh, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(quelle, sx, sy, sw, sh, 0, 0, zw, zh); ctx.restore();
    } else { cv.width = zw; cv.height = zh; ctx.drawImage(quelle, sx, sy, sw, sh, 0, 0, zw, zh); }
    return ctx.getImageData(0, 0, cv.width, cv.height);
  }

  /* Waagerecht nachschärfen (gegen Unschärfe von Kamera und Bildschirm): l + 1,5·(2l − links − rechts) */
  function schaerfe(lum, w, h) {
    var o = new Uint8ClampedArray(lum.length);
    for (var y = 0; y < h; y++) { var z = y * w; o[z] = lum[z]; o[z + w - 1] = lum[z + w - 1];
      for (var x = 1; x < w - 1; x++) { var i = z + x; o[i] = lum[i] + 1.5 * (2 * lum[i] - lum[i - 1] - lum[i + 1]); } }
    return o;
  }
  function dekodiereBilddaten(bild, binarisierer, scharf) {
    var Z = root.ZXing, r = zxLeser(); if (!r) return null;
    var d = bild.data, n = bild.width * bild.height, lum = new Uint8ClampedArray(n);
    for (var i = 0, j = 0; i < n; i++, j += 4) lum[i] = (d[j] * 299 + d[j + 1] * 587 + d[j + 2] * 114) / 1000;
    if (scharf) lum = schaerfe(lum, bild.width, bild.height);
    try {
      var src = new Z.RGBLuminanceSource(lum, bild.width, bild.height);
      var bin = binarisierer === "global" ? new Z.GlobalHistogramBinarizer(src) : new Z.HybridBinarizer(src);
      var res = r.decodeWithState(new Z.BinaryBitmap(bin));
      if (!res) return null;
      var t = normalisiere(res.getText());
      return plausibel(t, res.getBarcodeFormat() === Z.BarcodeFormat.QR_CODE ? "qr_code" : "") ? t : null;
    } catch (e) { return null; } finally { try { r.reset(); } catch (e2) {} }
  }

  var VERSUCHE = [["band", "hybrid"], ["band", "hybrid", 1], ["band@-5", "hybrid", 1], ["band@5", "hybrid", 1], ["ganz", "hybrid"], ["band", "global", 1],
    ["gedreht", "hybrid"], ["band@-3", "hybrid"], ["band@3", "hybrid"], ["band@-8", "hybrid", 1], ["band@8", "hybrid", 1], ["band", "global"], ["ganz", "hybrid", 1], ["gedreht", "hybrid", 1]];
  /* Ein Versuch (Index i) oder alle Versuche über eine Quelle; liefert Text oder null */
  function dekodiereQuelle(quelle, w, h, i) {
    if (!root.ZXing || !w || !h) return null;
    var liste = i == null ? VERSUCHE : [VERSUCHE[i % VERSUCHE.length]];
    for (var k = 0; k < liste.length; k++) { var t = dekodiereBilddaten(zeichne(quelle, w, h, liste[k][0]), liste[k][1], liste[k][2]); if (t) return t; }
    return null;
  }

  function nativerDetektor() {
    if (!("BarcodeDetector" in root)) return Promise.resolve({ d: null, grund: "kein Browser-Detektor" });
    var BD = root.BarcodeDetector;
    var formate = typeof BD.getSupportedFormats === "function" ? BD.getSupportedFormats() : Promise.resolve(WUNSCH);
    return formate.then(function (f) {
      var nutz = WUNSCH.filter(function (x) { return (f || []).indexOf(x) >= 0; });
      if (root.console) console.info("FAScanner: BarcodeDetector-Formate", f);
      if (nutz.indexOf("code_39") < 0) return { d: null, grund: "Browser ohne Code 39" };   // -> zxing
      return { d: new BD({ formats: nutz }), grund: "" };
    }).catch(function () { return { d: null, grund: "Browser-Erkennung fehlerhaft" }; });
  }

  /* Laufender Scan auf einem <video>. treffer(text) einmal, status(text) für Hinweise. Rückgabe: stop() */
  function starte(video, treffer, status) {
    var aktiv = true, nativ = null, nativFehler = 0, beginn = Date.now(), runde = 0, zxBereit = false;
    status = status || function () {};
    var erkennung = "";
    function melde(e) { if (e !== erkennung) { erkennung = e; status("erkennung", e); } }
    nativerDetektor().then(function (r) { nativ = r.d; melde(r.d ? "Browser (Code 39)" : "zxing (" + r.grund + ")"); });
    function zx() { if (zxBereit) return; ladeZxing().then(function () { zxBereit = true; }).catch(function () { status("zxing-fehlt"); }); }
    zx();
    function fertig(t) { if (!aktiv || !t) return false; aktiv = false; treffer(normalisiere(t)); return true; }
    function tick() {
      if (!aktiv) return;
      var w = video.videoWidth, h = video.videoHeight;
      if (video.readyState < 2 || !w) return setTimeout(tick, 200);
      var p = nativ ? nativ.detect(video).then(function (c) {
        for (var k = 0; c && k < c.length; k++) { var t = normalisiere(c[k].rawValue); if (plausibel(t, c[k].format)) return t; }
        return null; }).catch(function () { nativFehler++; if (nativFehler >= 5) { nativ = null; melde("zxing (Browser-Erkennung fehlerhaft)"); } return null; }) : Promise.resolve(null);
      p.then(function (t) {
        if (fertig(t)) return;
        if (zxBereit && (!nativ || Date.now() - beginn > 2000)) { if (nativ) melde("Browser + zxing"); if (fertig(dekodiereQuelle(video, w, h, runde++))) return; }
        setTimeout(tick, nativ ? 120 : 60);   // Browser-Detektor ca. 8×/s auf dem ganzen Bild; zxing je Runde ein Versuch
      });
    }
    tick();
    return function stop() { aktiv = false; };
  }

  root.FAScanner = { starte: starte, normalisiere: normalisiere, plausibel: plausibel, ladeZxing: ladeZxing, dekodiereQuelle: dekodiereQuelle, VERSUCHE: VERSUCHE.length };
})(typeof self !== "undefined" ? self : this);
