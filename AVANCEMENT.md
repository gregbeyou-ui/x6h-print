# Avancement du projet X6h Print

*Mis à jour le 14/11/2026.*

Objectif : imprimer des photos sur la mini-imprimante thermique Bluetooth **X6h-FC21** sans l'appli Tiny Print, d'abord depuis l'iPhone (page web dans Bluefy), plus tard pour des invités via un relais (PC puis ESP32).

**Page en ligne : https://gregbeyou-ui.github.io/x6h-print/**
Dépôt GitHub (public) : https://github.com/gregbeyou-ui/x6h-print

---

## Où on en est

| Étape | État |
|---|---|
| 1. Imprimer depuis le PC (Python) | ✅ Faite |
| 2. Décompiler Tiny Print | ✅ Faite |
| 3. Mettre à jour `index.html` | ✅ Faite |
| 4. Mise en ligne sur GitHub Pages | ✅ Faite — **l'iPhone imprime une photo en entier (N&B, version v5)** |
| 5. Photos des invités | 🟡 Bouton « 📲 Amis » + QR code (v13), testé entre deux onglets du PC, pas encore avec de vrais téléphones. Le relais PC / ESP32 n'est plus indispensable. |

### Ce qui marche

- **Depuis l'iPhone avec Bluefy (version v5)** : une photo en N&B sort en entier. 🎉
- **Depuis l'iPhone en mode Gris** : la photo sort en entier et sans à-coups avec le rythme **Normal** (vitesse imprimante 100 ou 60 essayées). La v12 met par défaut, en Gris : rythme Normal, morceaux de 100 octets, vitesse imprimante 75 (65 sur le curseur).
- **Depuis le PC avec Python** : noir et blanc et niveaux de gris impriment correctement.
- **Depuis Chrome sur le PC** : le noir et blanc imprime une photo complète et propre.

### Ce qui a fallu corriger pour l'iPhone

- La liaison Bluetooth se coupe pendant les moments d'inactivité : la page se reconnecte toute seule à l'impression, et renvoie les réglages de début si la coupure arrive en pleine impression.
- L'iPhone jette sans prévenir ce qu'on lui envoie trop vite (seuls quelques millimètres sortaient) : les lignes sont regroupées par envois de 177 octets, avec un rythme réglable dans « Réglages avancés → Rythme d'envoi Bluetooth » (**Lent** par défaut sur iPhone).
- Bluefy et GitHub gardent l'ancienne page en mémoire quelques minutes : le numéro de version est affiché tout en bas de la page.
- **Mode Gris, rien ne sortait (corrigé en v9)** : un paquet gris (environ 3 850 octets) est découpé en morceaux. La page passait à Bluefy une « fenêtre » sur le gros paquet (`subarray`) ; Bluefy envoyait alors le début du paquet entier au lieu du morceau. Il faut une vraie copie (`slice`). Chrome n'avait pas ce problème.
- L'imprimante **n'accepte pas** les envois avec accusé de réception (essayé en v7).
- **Lignes blanches en Gris** : un paquet = 20 lignes = 2,5 mm. Si le paquet suivant arrive trop tard, l'imprimante s'arrête et laisse une ligne blanche. Essais sur iPhone :
  - rythme Lent : saccadé, même en vitesse imprimante 100 (36 s) ;
  - rythme Rapide + morceaux de 177 octets : 1 cm puis arrêt (morceaux perdus, imprimante bloquée) ;
  - rythme Normal + morceaux de 100 octets, vitesse imprimante 100 : fluide ;
  - même chose en vitesse imprimante 60 : fluide, mais plus contrasté (les gris clairs pâlissent).
- **Curseur de vitesse (v12)** : de 0 (le plus lent) à 100 (le plus rapide). Valeur envoyée à l'imprimante = 12 + 1,8 × (100 − curseur) : 100 → 12, 90 → 30 (N&B), 65 → 75 (Gris), 0 → 192.

### Android

- Essai sur le téléphone d'un ami : « Web Bluetooth API globally disabled ». Ce n'est pas l'imprimante : c'est son navigateur qui bloque le Bluetooth web (Brave, Samsung Internet, ou navigateur intégré de WhatsApp, Instagram ou Messenger). Une page ne peut pas le réactiver.
- **Version v6** : la page détecte ce cas dès l'ouverture, explique quoi faire, et propose sur Android un bouton « Ouvrir dans Chrome ». Pas encore réessayé sur un Android.

### Pas encore vérifié

- **Mode Gris depuis Chrome** : des bandes de 20 lignes manquaient au premier essai ; l'envoi a été ralenti et regroupé depuis, pas encore réimprimé.
- Le rendu en Gris avec les réglages par défaut de la v12 (vitesse imprimante 75), jamais imprimé tel quel.
- Si le rythme Normal suffit aussi en N&B sur iPhone (gagnerait du temps).

---

## Prochaine chose à faire

1. Dans Bluefy (v13), imprimer en Gris sans toucher aux réglages et vérifier le rendu.
2. Essayer le bouton « 📲 Amis » avec un deuxième téléphone : scanner le QR code, envoyer une photo, l'imprimer. Essayer aussi avec l'ami en 4G/5G (pas sur le même Wi-Fi).

### Sens d'impression (v14)

- Photo en hauteur ou carrée : imprimée droite (0°). Photo en largeur : tournée de 90° (sens des aiguilles d'une montre) pour qu'elle s'étale dans la longueur du papier. Exemple : une photo 3:2 en largeur passe de 32 mm à 72 mm de ticket.
- Le texte sous la photo tourne avec elle.
- Bouton « ↻ Tourner de 90° » : ajoute 90° à chaque appui. Sous l'aperçu, la page indique le sens choisi et la longueur du ticket.
- Confirmé sur papier depuis l'iPhone le 14/11/2026.

### Recadrage (v15)

- Bouton « ✂️ Recadrer » : ouvre la photo en plein écran avec un cadre. On le déplace au doigt et on tire ses coins. Formats : Libre, Carré, Portrait (3:4), Paysage (4:3). « Tout » = photo entière.
- Après validation, le sens d'impression est rechoisi d'après le format recadré.
- Confirmé au doigt sur l'iPhone (Bluefy) le 14/11/2026.

### Travail gardé dans le téléphone (v20)

- Problème signalé : photos préparées avant de connecter l'imprimante, puis « Connecter l'imprimante » (fenêtre Bluetooth de Bluefy) → tout le travail disparaissait. Rien dans le code ne l'efface : très probablement, l'iPhone **recharge la page** à ce moment-là, surtout quand les photos prennent beaucoup de mémoire.
- Correction, en deux parties :
  1. Les photos sont réduites dès l'ouverture à 1600 points au plus (JPEG) au lieu de 12 millions de points : beaucoup moins de mémoire, donc moins de rechargements.
  2. Photos (seule, série, amis) et réglages (recadrage, sens, série, texte, luminosité, contraste, amélioration, mode) sont gardés dans le navigateur (IndexedDB) à chaque changement, et rechargés à l'ouverture de la page. Message « Ton travail a été retrouvé ✓ ». Les photos qui ne servent plus sont effacées.
- Bouton « 🗑️ Effacer les photos reçues » dans le panneau Amis (sinon elles restent d'une soirée à l'autre). Le bouton Amis affiche le nombre de photos reçues.
- Essayé sur l'iPhone le 14/11/2026 : les photos restent après la connexion de l'imprimante (« ça a l'air », à confirmer à l'usage).

### Plusieurs photos et amélioration automatique (v17)

- **Série** : la Galerie accepte plusieurs photos. Elles s'affichent en vignettes ; chacune garde son recadrage et son sens.
- **v18** (après un essai de 5 photos à la suite, jugé trop long en v17 : une impression par photo, avec avance du papier, texte répété et pause entre chaque) : la série est assemblée sur **un seul ticket** et part en **une seule impression**. 6 points de blanc (moins d'1 mm) entre deux photos ; texte et date/lieu une seule fois, en bas. Option « 2 photos par ligne » (cases de 189 points de large, gardée dans le téléphone) : ticket environ trois fois plus court. Exemple : 5 photos = 349 mm à 1 par ligne, 118 mm à 2 par ligne.
- **v19** : en 2 par ligne, toutes les photos ont le **même sens et la même taille** (cases de 189 × 252 points, environ 24 × 32 mm). Sens commun automatique : celui de la majorité (majorité en largeur → toutes tournées de 90°). Chaque photo est recadrée au centre pour remplir sa case ; « Recadrer » propose d'office le format de la case pour choisir la partie gardée ; « Tourner » tourne toute la série. 5 photos avec texte et date : 96 mm.
- **Amélioration automatique** (case cochée par défaut), appliquée avant le tramage, d'après les méthodes courantes pour les imprimantes thermiques (auto-niveaux, réglage des tons moyens, accentuation de la netteté, puis tramage) :
  1. étirement des niveaux : 1 % des points les plus sombres → noir, 1 % les plus clairs → blanc ;
  2. tons moyens : correction gamma pour amener la moyenne à 55 % de clarté (entre 0,6 et 1,7) ;
  3. netteté : masque flou 3×3, force 0,6.
- Les curseurs Luminosité et Contraste restent et s'appliquent par-dessus. Le contraste par défaut passe de 20 à 0, puisque l'amélioration s'en charge.
- Testé dans le navigateur du PC (série simulée sans imprimante), pas encore sur papier.

### Date et lieu (v16)

- Case « 📍 Date et lieu en bas du ticket » : ajoute une ligne de 30 points (environ 4 mm) en bas, texte de 16 points, toujours dans le sens du papier, même si la photo est tournée.
- Le texte est imprimé en noir pur (sans tramage, sans luminosité ni contraste) pour rester net.
- Date du jour remplie toute seule (reste à jour si la page reste ouverte), modifiable.
- Lieu : localisation du navigateur, puis nom de la ville demandé à Nominatim (OpenStreetMap, gratuit, sans compte). Bouton « 📍 Me localiser » pour recommencer, ou saisie à la main. La case cochée et le dernier lieu sont gardés dans le téléphone.
- Confirmé sur papier depuis l'iPhone le 14/11/2026 (localisation et texte lisible).

### Photos des invités (v13) : comment ça marche

- Le bouton **📲 Amis** affiche un QR code vers `envoyer.html#<identifiant>`. L'identifiant est gardé dans le téléphone : le QR code reste le même d'une fois sur l'autre.
- Les deux pages se relient directement (WebRTC) grâce à la bibliothèque **PeerJS** et à son serveur gratuit de mise en relation. Les photos ne sont stockées sur aucun serveur.
- La photo est réduite à 768 points de large (JPEG) chez l'ami avant l'envoi.
- Limites : la page de l'imprimante doit rester **ouverte à l'écran** (l'iPhone coupe tout en arrière-plan), les deux téléphones doivent avoir internet, et le service PeerJS gratuit peut être indisponible de temps en temps.

---

## Réglages trouvés (détails dans `REGLAGES.md`)

| | Noir et blanc (N&B) | Gris (16 niveaux) |
|---|---|---|
| Énergie | **8000** (5000 abîme le noir) | **6500** (4715 donne un noir trop pâle) |
| Vitesse (valeur imprimante, petit = rapide) | 30 (15 = plus rapide mais noir un peu moins dense) | **75** (40 = trop rapide pour l'envoi depuis l'iPhone : à-coups) |
| Qualité (commande `A4`) | `35` | `33` |
| Traitement de l'image | correction des gris 1.5 + tramage Atkinson | calcul de Tiny Print (14 paliers, Floyd-Steinberg, coefficient 0,9) |

---

## Ce qu'on a appris du protocole

- Connexion : service `ae30`, écriture sur `ae01` (sans réponse), messages de l'imprimante sur `ae02`. L'imprimante s'annonce avec le service `af30`.
- Paquet : `51 78 | commande | 00 | longueur (2 octets) | données | CRC8 | FF`.
- Mode N&B : une ligne = commande `A2`, 48 octets, le point de gauche dans le bit de poids faible.
- **Mode gris** (le « Haute résolution » de Tiny Print) : commande `CF`, 4 bits par point (0 = blanc, 15 = noir), paquets de 20 lignes compressés en **LZO**. On envoie un LZO « sans réduction », que l'imprimante accepte.
- L'imprimante demande des pauses (`AE 10` / `AE 00`) quand son tampon est plein, surtout en mode gris.
- Sur papier, en mode gris : les niveaux 0 à 5 ne marquent pas, la vraie plage va de 6 à F.
- Tout le détail du code de Tiny Print est dans `TROUVAILLES_TINYPRINT.md` (gardé privé, pas sur GitHub).

---

## Fichiers du dossier

| Fichier | Rôle | Sur GitHub ? |
|---|---|---|
| `index.html` | La page web | Oui |
| `envoyer.html` | La page des amis (ouverte par le QR code) | Oui |
| `imprimer_test.py` | Script Python d'essais (`python imprimer_test.py --help`) | Oui |
| `REGLAGES.md` | Résultats de tous les essais | Oui |
| `README.md` | Mode d'emploi de la page | Oui |
| `AVANCEMENT.md` | Ce récapitulatif | Oui |
| `TROUVAILLES_TINYPRINT.md` | Résumé du code de Tiny Print | Non (privé) |
| `PROMPT_CLAUDE_CODE.md` | Consignes de départ du projet | Non |
| `tinyprint/` | APK et code décompilé de Tiny Print | Non |
| `outils/jadx/` | Outil de décompilation (avec son propre Java) | Non |

## Commandes utiles

Imprimer la mire de test depuis le PC (fermer Tiny Print et déconnecter l'iPhone avant) :

```bash
python imprimer_test.py
```

```bash
python imprimer_test.py --gris
```

Publier une modification de la page sur GitHub (en ligne environ une minute après) :

```bash
git add -A
```

```bash
git commit -m "Description du changement"
```

```bash
git push
```
