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
// fond (facultatif, v27) : tableau qui vaut 1 pour les points du fond supprimé.
// Ces points ne comptent pas dans les mesures (sinon tout ce blanc ferait croire
// que la photo est très claire, et la personne sortirait trop foncée).
function enhance(gray, w, h, opt = ENHANCE.nb, fond = null) {
  const n = w * h;
  if (!n) return;
  let compte = n;                                   // nombre de points mesurés
  if (fond) {
    compte = 0;
    for (let i = 0; i < n; i++) if (!fond[i]) compte++;
    if (compte < n * 0.02) { fond = null; compte = n; }   // presque tout est du fond : on mesure tout
  }
  // a) étirement des niveaux
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) if (!fond || !fond[i]) hist[Math.max(0, Math.min(255, gray[i] | 0))]++;
  let lo = 0, hi = 255, acc = 0;
  while (lo < 255 && (acc += hist[lo]) < compte * opt.clip) lo++;
  acc = 0;
  while (hi > 0 && (acc += hist[hi]) < compte * opt.clip) hi--;
  if (hi - lo < 32) { const mid = (hi + lo) / 2; lo = Math.max(0, mid - 16); hi = Math.min(255, mid + 16); }
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.max(0, Math.min(255, (gray[i] - lo) * 255 / (hi - lo)));
    gray[i] = v;
    if (!fond || !fond[i]) sum += v;
  }
  // b) tons moyens : on amène la moyenne de la photo vers la clarté visée pour ce mode
  const mean = Math.max(0.05, Math.min(0.95, sum / compte / 255));
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

/* =====================================================================
   RENDU ASCII (v26) : la photo est redessinée avec des caractères.
   On découpe l'image en cases (une case = un caractère). Pour chaque case, on
   mesure sa noirceur moyenne, puis on y écrit le caractère qui « noircit » le plus
   pareil : un espace pour le blanc, un @ pour le noir, etc.
   La noirceur de chaque caractère est mesurée pour de vrai (on le dessine et on
   compte ses points noirs) : n'importe quels caractères marchent, dans n'importe
   quel ordre.
   ===================================================================== */
const ASCII_SETS = {
  classique: ' .:-=+*#%@',
  detaille: ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$',
  blocs: ' ░▒▓█',
};
const ASCII_FONT = 'Menlo, Consolas, "DejaVu Sans Mono", "Courier New", monospace';

// Mesure la noirceur de chaque caractère (0 = rien, 1 = le plus noir de la liste)
function glyphRamp(text, font, cw, ch) {
  const chars = [...new Set([...text])];
  const W = Math.max(2, Math.ceil(cw)), H = Math.max(2, Math.ceil(ch));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle';
  let ramp = chars.map(g => {
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#000'; c.fillText(g, W / 2, H / 2);
    const d = c.getImageData(0, 0, W, H).data;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4) ink += 1 - d[i] / 255;
    return { g, d: ink / (W * H) };
  });
  if (!ramp.some(r => r.g === ' ')) ramp.push({ g: ' ', d: 0 });   // toujours un « blanc »
  const lo = Math.min(...ramp.map(r => r.d)), hi = Math.max(...ramp.map(r => r.d));
  ramp = ramp.map(r => ({ g: r.g, d: hi > lo ? (r.d - lo) / (hi - lo) : 0 }));
  return ramp.sort((a, b) => a.d - b.d);
}

/* gray : gris 0 à 255 (déjà amélioré et réglé), w × h points.
   o : { cols (caractères par ligne), set ('classique', 'detaille', 'blocs', 'phrase',
         'perso'), text (la phrase ou mes caractères), bold, invert (fond noir) }
   Renvoie la noirceur de chaque point (0 = blanc, 1 = noir). */
function asciiArt(gray, w, h, o) {
  const weight = o.bold ? 'bold ' : '';
  // Taille de police pour que « cols » caractères remplissent la largeur
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.font = weight + '100px ' + ASCII_FONT;
  const adv = c.measureText('M').width / 100;       // largeur d'un caractère pour une police de 1 point
  const cw = w / o.cols, fs = cw / adv;
  const rows = Math.max(1, Math.round(h / (fs * 1.1))), ch = h / rows;   // un caractère est plus haut que large
  const font = weight + fs.toFixed(2) + 'px ' + ASCII_FONT;
  const boldFont = 'bold ' + fs.toFixed(2) + 'px ' + ASCII_FONT;

  // Fond (blanc, ou noir si « Fond noir ») et couleur des caractères
  c.fillStyle = o.invert ? '#000' : '#fff'; c.fillRect(0, 0, w, h);
  c.fillStyle = o.invert ? '#fff' : '#000';
  c.textAlign = 'center'; c.textBaseline = 'middle';

  const phrase = o.set === 'phrase';
  const letters = phrase ? [...(o.text || 'X6H').replace(/\s+/g, '')] : null;
  const chars = phrase ? null : (o.set === 'perso' ? (o.text || ASCII_SETS.classique) : (ASCII_SETS[o.set] || ASCII_SETS.classique));
  const ramp = phrase ? null : glyphRamp(chars, font, cw, ch);
  let k = 0;   // position dans la phrase

  for (let r = 0; r < rows; r++) {
    const y0 = Math.round(r * ch), y1 = Math.round((r + 1) * ch);
    for (let col = 0; col < o.cols; col++) {
      const x0 = Math.round(col * cw), x1 = Math.round((col + 1) * cw);
      // noirceur moyenne de la case
      let s = 0, n = 0;
      for (let y = y0; y < y1 && y < h; y++)
        for (let x = x0; x < x1 && x < w; x++) { s += 1 - gray[y * w + x] / 255; n++; }
      const dark = n ? s / n : 0;
      const t = o.invert ? 1 - dark : dark;   // fond noir : un caractère blanc = de la clarté
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      if (phrase) {
        // Phrase : on écrit la lettre suivante seulement là où l'image est assez foncée,
        // en gras là où elle est très foncée. La silhouette apparaît faite de mots.
        if (t < 0.3) continue;
        c.font = (t > 0.6 ? boldFont : font);
        c.fillText(letters[k++ % letters.length], cx, cy);
      } else {
        let best = ramp[0];
        for (const g of ramp) if (Math.abs(g.d - t) < Math.abs(best.d - t)) best = g;
        if (best.g !== ' ') { c.font = font; c.fillText(best.g, cx, cy); }
      }
    }
  }
  const d = c.getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = 1 - d[i * 4] / 255;
  return out;
}

// Tourne un tableau de w × h points de « deg » degrés (0, 90, 180 ou 270, sens des
// aiguilles d'une montre). Renvoie { a, w, h } (largeur et hauteur échangées à 90° et 270°).
function rotateGrid(a, w, h, deg) {
  for (let t = 0; t < (((deg / 90) | 0) % 4 + 4) % 4; t++) {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) out[x * h + (h - 1 - y)] = a[y * w + x];
    a = out; [w, h] = [h, w];
  }
  return { a, w, h };
}

// Mode gris : niveau de chauffe dont la noirceur est la plus proche (sans tramage,
// pour garder les caractères nets ; les bords adoucis passent en gris)
function inkToLevel(v) {
  let best = GRAY_PALETTE[0];
  for (const p of GRAY_PALETTE) if (Math.abs(p.d - v) < Math.abs(best.d - v)) best = p;
  return best.l;
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
  // Fond supprimé (v27) : la photo arrive déjà avec un fond blanc pur ; on le repère
  // pour qu'il ne fausse pas la correction auto, puis on le remet bien blanc à la fin.
  const fond = look.fond ? reperFond(gray) : null;
  if (look.auto) enhance(gray, w, h, isGray ? ENHANCE.gris : ENHANCE.nb, fond);
  applyLook(gray, look.bright, look.contrast);
  if (fond) garderFondBlanc(gray, fond);
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
/* =====================================================================
   SUPPRESSION DU FOND (v27) : on ne garde que la ou les personnes.
   Un petit modèle d'intelligence artificielle de Google (MediaPipe « Selfie
   segmenter », environ 250 Ko) regarde la photo et donne, pour chaque point,
   la probabilité qu'il appartienne à une personne. Tout le reste devient blanc :
   sur le papier thermique, le blanc ne chauffe pas, la personne ressort mieux.
   - Tout se passe dans le téléphone : la photo n'est envoyée nulle part.
   - L'outil n'est téléchargé que la première fois qu'on coche la case, puis le
     navigateur le garde en mémoire.
   - Il ne reconnaît que les personnes (pas les animaux ni les objets).
   ===================================================================== */
const FOND_LIB = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const FOND_MODELE = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
const FOND_TAILLE = 512;       // la photo est réduite à 512 points pour l'analyse (le modèle travaille en 256)
const FOND_MINI = 0.03;        // moins de 3 % de personne sur la photo : on considère qu'il n'y en a pas

// Chargement de l'outil, une seule fois (les appels suivants attendent le même chargement)
let segmenteurPromesse = null;
function obtenirSegmenteur() {
  if (!segmenteurPromesse) {
    segmenteurPromesse = (async () => {
      const { FilesetResolver, ImageSegmenter } = await import(FOND_LIB + '/vision_bundle.mjs');
      const fichiers = await FilesetResolver.forVisionTasks(FOND_LIB + '/wasm');
      return ImageSegmenter.createFromOptions(fichiers, {
        baseOptions: { modelAssetPath: FOND_MODELE, delegate: 'CPU' },  // CPU : marche partout, même dans Bluefy
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    })();
    // En cas d'échec (pas d'internet…), on pourra réessayer plus tard
    segmenteurPromesse.catch(() => { segmenteurPromesse = null; });
  }
  return segmenteurPromesse;
}
function segmenteurCharge() { return !!segmenteurPromesse; }

/* Détoure une image (photo ou canvas). Renvoie { image, part } :
   - image : un canvas de la même taille que la photo, personne gardée, fond blanc
     (null si aucune personne n'a été trouvée) ;
   - part : la part de la photo occupée par des personnes (0 à 1). */
async function detourer(img) {
  const seg = await obtenirSegmenteur();
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  // 1) analyse sur une copie réduite (rapide)
  const k = Math.min(1, FOND_TAILLE / Math.max(W, H));
  const petit = document.createElement('canvas');
  petit.width = Math.max(1, Math.round(W * k)); petit.height = Math.max(1, Math.round(H * k));
  petit.getContext('2d').drawImage(img, 0, 0, petit.width, petit.height);
  const res = seg.segment(petit);
  const masques = res.confidenceMasks || [];
  // Avec ce modèle, le dernier masque est celui des personnes (s'il y en a deux,
  // le premier est celui du fond)
  const m = masques[masques.length - 1];
  if (!m) { res.close(); throw new Error('aucun résultat'); }
  const mw = m.width, mh = m.height;
  const proba = m.getAsFloat32Array().slice();      // copie : le résultat est libéré juste après
  res.close();
  // 2) masque adouci : en dessous de 0,35 c'est du fond, au-dessus de 0,65 c'est la
  //    personne, entre les deux on passe en douceur (pas d'effet « découpé aux ciseaux »)
  const mc = document.createElement('canvas'); mc.width = mw; mc.height = mh;
  const g = mc.getContext('2d');
  const d = g.createImageData(mw, mh);
  let somme = 0;
  for (let i = 0; i < proba.length; i++) {
    const t = Math.max(0, Math.min(1, (proba[i] - 0.35) / 0.3));
    const a = t * t * (3 - 2 * t);
    somme += a;
    d.data[i * 4 + 3] = Math.round(255 * a);
  }
  g.putImageData(d, 0, 0);
  const part = somme / proba.length;
  if (part < FOND_MINI) return { image: null, part };
  // 3) photo en taille réelle, découpée par le masque (agrandi en douceur), puis posée sur du blanc
  const decoupe = document.createElement('canvas'); decoupe.width = W; decoupe.height = H;
  const g2 = decoupe.getContext('2d');
  g2.drawImage(img, 0, 0, W, H);
  g2.globalCompositeOperation = 'destination-in';   // on ne garde la photo que là où le masque est plein
  g2.imageSmoothingEnabled = true;
  g2.drawImage(mc, 0, 0, W, H);
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const g3 = out.getContext('2d');
  g3.fillStyle = '#fff'; g3.fillRect(0, 0, W, H);
  g3.drawImage(decoupe, 0, 0);
  return { image: out, part };
}

// Mémoire des détourages : chaque photo n'est analysée qu'une fois
const detourages = new WeakMap();      // image → promesse du résultat
const detouragesFaits = new WeakMap(); // image → résultat (une fois prêt)
function detourerEnMemoire(img) {
  if (!detourages.has(img)) {
    const p = detourer(img).then(r => { detouragesFaits.set(img, r); return r; });
    p.catch(() => detourages.delete(img));   // échec : on pourra réessayer
    detourages.set(img, p);
  }
  return detourages.get(img);
}
// Image à dessiner : la version sans fond si elle est prête, sinon la photo d'origine
function imageDetouree(img) {
  const r = detouragesFaits.get(img);
  return r && r.image ? r.image : img;
}
function detourageFait(img) { return detouragesFaits.has(img); }
function detourageResultat(img) { return detouragesFaits.get(img) || null; }

// Repère les points du fond : ceux qui sont d'un blanc pur (le fond supprimé est
// peint en blanc pur ; un point blanc de la personne compté avec ne gêne pas)
function reperFond(gray) {
  const fond = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) fond[i] = gray[i] >= 254 ? 1 : 0;
  return fond;
}
// Après luminosité et contraste, le fond redevient blanc pur (rien ne s'imprime dessus)
function garderFondBlanc(gray, fond) {
  for (let i = 0; i < gray.length; i++) if (fond[i]) gray[i] = 255;
}
