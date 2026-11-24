/* =====================================================================
   Galerie mosaïque justifiée + cartes retournables
   ---------------------------------------------------------------------
   Tout le réglage se fait dans CONFIG ci-dessous.
   ===================================================================== */
(() => {
  "use strict";

  const CONFIG = {
    // --- Sources -------------------------------------------------------
    imagesDir: "./images/",     // dossier des images
    dataFile: "./data.json",    // manifeste : { "fichier.jpg": "texte du verso", ... }

    // --- Mise en page --------------------------------------------------
    gap: 8,                     // espacement (px) entre toutes les images
    maxWidthPercent: 90,        // largeur max. de la mosaïque (% de la page)
    maxCrop: 0.12,              // seuil de rognage/ajustement de ratio : 0.12 = 12 %
                                //   (0 = aucun rognage, rangées moins régulières ;
                                //    plus grand = rangées plus proches de la hauteur cible)
    targetRowHeight: 240,       // hauteur de rangée visée (px)
    maxImagesPerRow: 8,         // limite de sécurité par rangée
    fallbackRatio: 4 / 3,       // ratio utilisé si une image ne charge pas

    // --- Verso de la carte --------------------------------------------
    backBackground: "#000000",  // fond uni
    backColor: "#ffffff",       // couleur de la police
    backFontMax: 12,            // taille de police max (px)
    backFontMin: 12,            // taille min avant défilement (px)
    flipDuration: 300,          // durée du retournement (ms)
    borderRadius: 0,            // arrondi (px)
  };

  // Les réglages sont poussés dans les variables CSS (source de vérité unique)
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--gap", CONFIG.gap + "px");
  rootStyle.setProperty("--max-width", CONFIG.maxWidthPercent + "%");
  rootStyle.setProperty("--back-bg", CONFIG.backBackground);
  rootStyle.setProperty("--back-color", CONFIG.backColor);
  rootStyle.setProperty("--flip-duration", CONFIG.flipDuration + "ms");
  rootStyle.setProperty("--radius", CONFIG.borderRadius + "px");

  const $ = (sel) => document.querySelector(sel);

  /* -------------------------------------------------------------------
     1. Algorithme de mosaïque justifiée
     -------------------------------------------------------------------
     Les images sont réparties en rangées. Chaque rangée occupe exactement
     la largeur W (bords gauche et droit alignés), toutes les rangées sont
     collées par le haut avec le même espacement.

     Pour une rangée de k images (ratios r_i), la hauteur "naturelle" qui
     remplit exactement la largeur sans rognage est
         h0 = (W - gap·(k-1)) / Σ r_i
     Chaque image reçoit la largeur r_i·h0. En imposant une hauteur H ≠ h0,
     on rogne (object-fit: cover) d'un facteur s = h0 / H. Le rognage est
     borné : |s-1| ≤ maxCrop, soit H ∈ [h0/(1+t), h0/(1-t)].
     On choisit H le plus proche de la hauteur cible dans cet intervalle.

     Le découpage en rangées est optimal : programmation dynamique qui
     minimise l'écart total à la hauteur cible (+ une petite pénalité de
     rognage). La dernière rangée est justifiée comme les autres : la
     surface couverte est donc maximale.
  ------------------------------------------------------------------- */
  const CROP_WEIGHT = 0.5;   // poids de la pénalité de rognage dans le coût
  const ROW_COST = 0.02;     // petit coût fixe par rangée

  function rowGeometry(sumR, k, W, gap, target, t) {
    const avail = W - gap * (k - 1);
    if (avail <= 0) return null;
    const h0 = avail / sumR;
    const hMin = h0 / (1 + t);
    const hMax = t < 1 ? h0 / (1 - t) : Infinity;
    const H = Math.min(Math.max(target, hMin), hMax);
    return { h0, H, s: h0 / H };
  }

  function computeRows(ratios, W, gap, target, t, maxPer) {
    const n = ratios.length;
    const best = new Array(n + 1).fill(Infinity);
    const prev = new Array(n + 1).fill(0);
    best[0] = 0;

    for (let i = 0; i < n; i++) {
      if (!isFinite(best[i])) continue;
      let sum = 0;
      for (let j = i + 1; j <= Math.min(n, i + maxPer); j++) {
        sum += ratios[j - 1];
        const g = rowGeometry(sum, j - i, W, gap, target, t);
        if (!g) break;
        const dev = (g.H - target) / target;
        const cost = best[i] + dev * dev + CROP_WEIGHT * (g.s - 1) ** 2 + ROW_COST;
        if (cost < best[j]) { best[j] = cost; prev[j] = i; }
      }
    }

    // Reconstruction des rangées
    const rows = [];
    for (let j = n; j > 0; j = prev[j]) rows.unshift([prev[j], j]);
    return rows;
  }

  function layout(items, mosaic) {
    const W = Math.floor(mosaic.clientWidth);
    if (W <= 0 || !items.length) return;

    const gap = CONFIG.gap;
    const target = Math.min(CONFIG.targetRowHeight, Math.max(110, W * 0.45));
    const rows = computeRows(
      items.map((it) => it.ratio), W, gap, target,
      Math.min(Math.max(CONFIG.maxCrop, 0), 0.95), CONFIG.maxImagesPerRow
    );

    let y = 0;
    rows.forEach(([a, b], rowIndex) => {
      const slice = items.slice(a, b);
      const k = slice.length;
      const sum = slice.reduce((acc, it) => acc + it.ratio, 0);
      const g = rowGeometry(sum, k, W, gap, target, Math.min(Math.max(CONFIG.maxCrop, 0), 0.95))
        || { h0: W / sum, H: W / sum };
      const H = Math.max(1, Math.round(g.H));

      let acc = 0; // somme cumulée des largeurs, hors espacements
      slice.forEach((it, idx) => {
        const start = acc + gap * idx;
        acc += it.ratio * g.h0;
        const end = acc + gap * idx;
        const left = Math.round(start);
        const right = idx === k - 1 ? W : Math.round(end); // bord droit exact
        const w = right - left;

        const s = it.el.style;
        s.left = left + "px";
        s.top = y + "px";
        s.width = w + "px";
        s.height = H + "px";
        s.perspective = Math.round(Math.max(w, H) * 3) + "px";
        it.el._fit = null; // la taille a changé : refaire l'ajustement du texte
      });
      y += H + (rowIndex < rows.length - 1 ? gap : 0);
    });

    mosaic.style.height = y + "px";
  }

  /* -------------------------------------------------------------------
     2. Ajustement du texte du verso
     -------------------------------------------------------------------
     On cherche la plus grande police (entre min et max) qui fait tenir le
     texte dans la carte. Si même la taille min déborde, le verso défile.
     Fait au premier survol / focus, donc coût nul pour les cartes jamais
     retournées (galeries volumineuses).
  ------------------------------------------------------------------- */
  function fitText(tile) {
    const back = tile.querySelector(".back");
    const txt = tile.querySelector(".back-text");
    const key = tile.offsetWidth + "x" + tile.offsetHeight;
    if (tile._fit === key) return;
    tile._fit = key;

    let lo = CONFIG.backFontMin;
    let hi = CONFIG.backFontMax;
    const fits = () => back.scrollHeight <= back.clientHeight + 1;

    txt.style.fontSize = hi + "px";
    if (fits()) return;
    while (hi - lo > 0.5) {
      const mid = (lo + hi) / 2;
      txt.style.fontSize = mid + "px";
      if (fits()) lo = mid; else hi = mid;
    }
    txt.style.fontSize = lo + "px";
  }

  /* -------------------------------------------------------------------
     3. Chargement des données et construction du DOM
  ------------------------------------------------------------------- */
  function srcFor(file) {
    if (/^(https?:)?\/\//.test(file) || file.startsWith("/")) return file;
    if (file.includes("/")) return encodeURI(file);
    return CONFIG.imagesDir + encodeURIComponent(file);
  }

  function measure(item, onDone) {
    return new Promise((resolve) => {
      const done = () => { onDone(); resolve(); };
      if (item.w > 0 && item.h > 0) { item.ratio = item.w / item.h; return done(); }
      const probe = new Image();
      probe.onload = () => {
        item.ratio = probe.naturalWidth && probe.naturalHeight
          ? probe.naturalWidth / probe.naturalHeight : CONFIG.fallbackRatio;
        done();
      };
      probe.onerror = () => { item.ratio = CONFIG.fallbackRatio; item.missing = true; done(); };
      probe.src = item.src;
    });
  }

  function buildTile(item) {
    const tile = document.createElement("figure");
    tile.className = "tile";
    tile.tabIndex = 0;

    const flip = document.createElement("div");
    flip.className = "flip";

    const front = document.createElement("div");
    front.className = "face front";

    if (item.missing) {
      tile.classList.add("missing");
      front.textContent = item.file;
    } else {
      const img = document.createElement("img");
      img.src = item.src;
      img.alt = item.text || item.file;
      img.loading = "lazy";
      img.decoding = "async";
      img.draggable = false;
      img.addEventListener("error", () => {
        img.remove();
        tile.classList.add("missing");
        front.textContent = item.file;
      });
      front.appendChild(img);
    }

    const back = document.createElement("div");
    back.className = "face back";
    const txt = document.createElement("div");
    txt.className = "back-text";
    String(item.text || "").split(/\n+/).forEach((line) => {
      const p = document.createElement("p");
      p.textContent = line;   // textContent : pas d'injection HTML
      txt.appendChild(p);
    });
    back.appendChild(txt);

    flip.append(front, back);
    tile.appendChild(flip);

    tile.addEventListener("pointerenter", () => fitText(tile));
    tile.addEventListener("focus", () => fitText(tile));
    tile.addEventListener("click", () => {
      // Écrans tactiles (pas de survol) : un tap retourne la carte
      if (window.matchMedia("(hover: none)").matches) {
        fitText(tile);
        tile.classList.toggle("is-flipped");
      }
    });
    return tile;
  }

  async function init() {
    const mosaic = $("#mosaic");
    const status = $("#status");
    const count = $("#count");

    let data;
    try {
      const res = await fetch(CONFIG.dataFile, { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      data = await res.json();
    } catch (err) {
      status.classList.add("error");
      status.textContent = location.protocol === "file:"
        ? "Impossible de lire data.json depuis file:// . Lancez un petit serveur local, par ex. « python3 -m http.server », puis ouvrez http://localhost:8000."
        : "Impossible de charger " + CONFIG.dataFile + " (" + err.message + ").";
      return;
    }

    // Le JSON peut aussi donner { "x.jpg": { "text": "...", "width": 1200, "height": 800 } }
    // (width/height facultatifs : évite de précharger l'image pour connaître son ratio).
    const items = Object.entries(data).map(([file, v]) => {
      const o = typeof v === "string" ? { text: v } : (v || {});
      return {
        file, src: srcFor(file), text: o.text ?? "",
        w: Number(o.width) || 0, h: Number(o.height) || 0,
        ratio: CONFIG.fallbackRatio, missing: false, el: null,
      };
    });

    if (!items.length) { status.textContent = "Aucune image dans data.json."; return; }

    // Les ratios doivent être connus avant de calculer la mosaïque
    let loaded = 0;
    await Promise.all(items.map((it) => measure(it, () => {
      status.textContent = "Chargement… " + (++loaded) + " / " + items.length;
    })));

    items.forEach((it) => { it.el = buildTile(it); mosaic.appendChild(it.el); });

    layout(items, mosaic);
    status.hidden = true;
    count.textContent = items.length + (items.length > 1 ? " random images from Korea" : " random image from Korea");
    requestAnimationFrame(() => mosaic.classList.add("ready"));

    // Recalcul quand la largeur change (redimensionnement, rotation d'écran)
    let lastW = mosaic.clientWidth;
    let raf = 0;
    new ResizeObserver(() => {
      const w = mosaic.clientWidth;
      if (w === lastW) return;
      lastW = w;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => layout(items, mosaic));
    }).observe(mosaic);
  }

  init();
})();
