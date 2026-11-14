/* =====================================================================
   TRAITEMENT DES PHOTOS POUR LE PAPIER THERMIQUE
   Partagé par la page de l'imprimante (index.html) et la page des amis
   (envoyer.html) : l'aperçu de l'ami est exactement ce qui sera imprimé.
   ===================================================================== */
const GAMMA_NB = 1.5;       // éclaircit les gris en noir et blanc (l'imprimante les fonce)
const GRAY_SCALE = 0.9;     // coefficient de Tiny Print pour le X6h en mode gris

// Noirceur approximative de chaque niveau (0 = papier blanc, 1 = noir), pour l'aperçu seulement
const DARKNESS = [0, 0, 0, 0, 0, 0.03, 0.1, 0.22, 0.4, 0.58, 0.7, 0.8, 0.88, 0.94, 1, 1];

// Tramage d'Atkinson : transforme des gris (0 à 255) en points noirs (1) ou blancs (0).
// Donne ce rendu « ticket » granuleux.
function atkinson(gray, w, h) {
  const out = new Uint8Array(w * h);
  const spread = [[1,0],[2,0],[-1,1],[0,1],[1,1],[0,2]];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const old = gray[i];
      const val = old < 128 ? 0 : 255;
      out[i] = val === 0 ? 1 : 0;
      const err = (old - val) / 8;
      for (const [dx, dy] of spread) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < w && ny < h) gray[ny * w + nx] += err;
      }
    }
  }
  return out;
}

/* Amélioration automatique pour le papier thermique (méthode courante pour ces
   imprimantes : on étire les niveaux, on règle les tons moyens, on accentue un peu
   les contours, puis seulement on fait le tramage).
   - Étirement : les 1 % de points les plus sombres deviennent noirs, les 1 % les plus
     clairs deviennent blancs. Une photo terne ou sombre retrouve tout son contraste.
   - Tons moyens : la photo est éclaircie ou foncée pour que sa moyenne tombe vers
     le gris moyen (le tramage rend mal les photos très sombres).
   - Netteté : un léger « masque flou » rend les contours plus francs, ce que le
     tramage a tendance à adoucir.
   On ne travaille que sur les h premières lignes (la photo, pas la date en bas).

   Les deux modes ne rendent pas du tout pareil, donc réglages différents :
   - N&B : chaque point est noir ou blanc. Le tramage perd les nuances fines et les
     contours s'empâtent : on coupe plus franchement les extrêmes (1 %) et on
     accentue fort la netteté (la correction des gris du mode N&B éclaircit ensuite).
   - Gris : 10 teintes réelles sur le papier. Les nuances passent bien : on coupe
     moins les extrêmes (0,3 %) pour garder les détails dans les blancs et les noirs,
     on vise des tons moyens plus clairs (le papier fonce) et on accentue peu
     (sinon le grain du tramage ressort). */
const ENHANCE = {
  nb:   { clip: 0.01,  mean: 0.55, sharpen: 0.9 },
  gris: { clip: 0.003, mean: 0.58, sharpen: 0.35 },
};
function enhance(gray, w, h, opt = ENHANCE.nb) {
  const n = w * h;
  if (!n) return;
  // a) étirement des niveaux
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[Math.max(0, Math.min(255, gray[i] | 0))]++;
  let lo = 0, hi = 255, acc = 0;
  while (lo < 255 && (acc += hist[lo]) < n * opt.clip) lo++;
  acc = 0;
  while (hi > 0 && (acc += hist[hi]) < n * opt.clip) hi--;
  if (hi - lo < 32) { const mid = (hi + lo) / 2; lo = Math.max(0, mid - 16); hi = Math.min(255, mid + 16); }
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.max(0, Math.min(255, (gray[i] - lo) * 255 / (hi - lo)));
    gray[i] = v; sum += v;
  }
  // b) tons moyens : on amène la moyenne de la photo vers la clarté visée pour ce mode
  const mean = Math.max(0.05, Math.min(0.95, sum / n / 255));
  const gamma = Math.max(0.6, Math.min(1.7, Math.log(opt.mean) / Math.log(mean)));
  if (Math.abs(gamma - 1) > 0.03)
    for (let i = 0; i < n; i++) gray[i] = 255 * Math.pow(gray[i] / 255, gamma);
  // c) netteté : on ajoute une part de la différence avec une version floue (flou 3×3)
  if (!opt.sharpen) return;
  const blur = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - 1) * w, y1 = y * w, y2 = Math.min(h - 1, y + 1) * w;
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - 1), x2 = Math.min(w - 1, x + 1);
      blur[y1 + x] = (gray[y0 + x0] + 2 * gray[y0 + x] + gray[y0 + x2] +
                      2 * gray[y1 + x0] + 4 * gray[y1 + x] + 2 * gray[y1 + x2] +
                      gray[y2 + x0] + 2 * gray[y2 + x] + gray[y2 + x2]) / 16;
    }
  }
  for (let i = 0; i < n; i++) gray[i] = Math.max(0, Math.min(255, gray[i] + opt.sharpen * (gray[i] - blur[i])));
}

/* Mode gris : transforme des gris (0 à 255) en niveaux de chauffe de 0 (blanc) à 15 (noir).
   On ne garde que les niveaux qui marquent vraiment le papier, chacun avec sa noirceur
   mesurée (tableau DARKNESS), et on choisit pour chaque point le niveau dont la
   noirceur est la plus proche de celle voulue. L'écart est reporté sur les points
   voisins (Floyd-Steinberg), dans un sens puis dans l'autre une ligne sur deux.
   (L'ancien calcul, repris de Tiny Print, envoyait tous les gris clairs vers les
   niveaux 3 à 5, qui ne marquent pas : les zones claires sortaient toutes blanches.) */
const GRAY_PALETTE = [0, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15].map(l => ({ l, d: DARKNESS[l] }));
function toLevels(gray, w, h) {
  const want = new Float32Array(w * h);          // noirceur voulue, 0 (blanc) à 1 (noir)
  for (let i = 0; i < want.length; i++) want[i] = 1 - gray[i] / 255;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const ltr = y % 2 === 0;                      // sens de parcours de la ligne
    for (let k = 0; k < w; k++) {
      const x = ltr ? k : w - 1 - k, i = y * w + x, v = want[i];
      let best = GRAY_PALETTE[0];
      for (const p of GRAY_PALETTE) if (Math.abs(p.d - v) < Math.abs(best.d - v)) best = p;
      out[i] = best.l;
      const err = v - best.d, dx = ltr ? 1 : -1;
      if (x + dx >= 0 && x + dx < w) want[i + dx] += err * 7 / 16;
      if (y < h - 1) {
        if (x - dx >= 0 && x - dx < w) want[i + w - dx] += err * 3 / 16;
        want[i + w] += err * 5 / 16;
        if (x + dx >= 0 && x + dx < w) want[i + w + dx] += err / 16;
      }
    }
  }
  return out;
}

// Ancien calcul de Tiny Print (gardé pour mémoire, plus utilisé)
function toLevelsTinyPrint(gray, w, h) {
  const px = new Int32Array(w * h);
  for (let i = 0; i < px.length; i++) px[i] = Math.trunc(gray[i] * GRAY_SCALE);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const v = px[i];
      const q = Math.trunc(v / 18) * 19;
      const err = v - q;
      if (x < w - 1) px[i + 1] += Math.trunc(err * 7 / 16);
      if (y < h - 1) {
        if (x > 0) px[i + w - 1] += Math.trunc(err * 3 / 16);
        px[i + w] += Math.trunc(err * 5 / 16);
        if (x < w - 1) px[i + w + 1] += Math.trunc(err / 16);
      }
      let step = Math.trunc(q / (256 / 14));
      if (step === 13) step = 15;
      out[i] = 15 - Math.max(0, Math.min(15, step));
    }
  }
  return out;
}

// Luminosité (-100 à 100) et contraste (-100 à 100), réglés à la main, par-dessus le reste
function applyLook(gray, bright, contrast) {
  const k = (259 * (contrast + 255)) / (255 * (259 - contrast));
  for (let i = 0; i < gray.length; i++)
    gray[i] = Math.max(0, Math.min(255, k * (gray[i] - 128) + 128 + bright));
}

/* Chaîne complète pour une photo (utilisée par la page des amis) :
   gris → amélioration automatique (si auto) → luminosité / contraste → tramage.
   isGray : mode Gris (sinon N&B). Renvoie l'aperçu (gris 0 à 255 par point). */
function processPhoto(gray, w, h, isGray, look) {
  if (look.auto) enhance(gray, w, h, isGray ? ENHANCE.gris : ENHANCE.nb);
  applyLook(gray, look.bright, look.contrast);
  const out = new Uint8ClampedArray(w * h);
  if (isGray) {
    const lv = toLevels(gray, w, h);
    for (let i = 0; i < lv.length; i++) out[i] = Math.round(255 * (1 - DARKNESS[lv[i]]));
  } else {
    for (let i = 0; i < gray.length; i++) gray[i] = 255 * Math.pow(gray[i] / 255, 1 / GAMMA_NB);
    const b = atkinson(gray, w, h);
    for (let i = 0; i < b.length; i++) out[i] = b[i] ? 0 : 255;
  }
  return out;
}