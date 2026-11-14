# X6h Print

Une page web pour imprimer des photos sur une mini-imprimante thermique Bluetooth **X6h** (famille « cat printer », 384 points de large), sans l'appli officielle.

**Page en ligne : https://gregbeyou-ui.github.io/x6h-print/**

## Utilisation

- **iPhone** : ouvrir la page dans le navigateur **Bluefy** (Safari ne gère pas le Bluetooth).
- **Android / ordinateur** : ouvrir la page dans **Chrome** (ou Edge sur ordinateur). Les navigateurs intégrés à WhatsApp, Instagram ou Messenger, ainsi que Brave et Samsung Internet, bloquent le Bluetooth : la page le détecte et propose « Ouvrir dans Chrome ». Sur Android, le Bluetooth **et la Localisation** doivent être activés.

1. Allumer l'imprimante et fermer l'appli Tiny Print.
2. **Connecter l'imprimante**, choisir l'appareil dont le nom commence par `X6h`.
3. Choisir une photo, régler luminosité et contraste, ajouter un texte si besoin.
   - **📲 Amis** : affiche un QR code. Les amis le scannent avec l'appareil photo de leur téléphone (Safari ou Chrome suffit, pas besoin de Bluefy), choisissent une photo et l'envoient. Elle apparaît dans la liste ; la toucher la prépare pour l'impression. La page doit rester ouverte à l'écran pendant ce temps, et les deux téléphones doivent avoir internet.
   - **Plusieurs photos** : en choisir plusieurs d'un coup dans la Galerie. Elles sont assemblées sur **un seul ticket** (une seule impression, presque sans blanc entre elles, texte et date une seule fois en bas). Option **2 photos par ligne**. Chacune se règle à part (recadrage, sens).
   - **✨ Amélioration automatique** (cochée par défaut) : étirement des niveaux, tons moyens et netteté ajustés à chaque photo pour le papier thermique. Les curseurs Luminosité et Contraste s'ajoutent par-dessus.
   - **✂️ Recadrer** : un cadre à déplacer au doigt, coins à tirer, formats Libre / Carré / Portrait / Paysage. « Tout » revient à la photo entière.
   - **📍 Date et lieu** : petite ligne en bas du ticket. La date du jour est remplie toute seule ; le lieu vient de la localisation de l'appareil (nom de la ville trouvé par OpenStreetMap). Les deux se modifient à la main.
   - **Sens d'impression automatique** : une photo en hauteur est imprimée droite, une photo en largeur est tournée de 90° pour s'étaler dans la longueur du papier (image plus grande). Le bouton **↻ Tourner de 90°** change le sens à la main.
4. Choisir le mode, puis **Imprimer** :
   - **N&B** : noir profond, texte net, rendu granuleux ;
   - **Gris** : 16 niveaux de gris, dégradés lisses, plus lent.

## Fichiers

- `index.html` : la page (un seul fichier, rien à installer).
- `envoyer.html` : la page ouverte par les amis via le QR code. Les photos passent directement d'un téléphone à l'autre (WebRTC, bibliothèque PeerJS et son serveur de mise en relation gratuit).
- `imprimer_test.py` : script Python (bibliothèque `bleak`) pour imprimer depuis un PC et faire des essais de réglages.
- `REGLAGES.md` : réglages trouvés par les essais sur une X6h-FC21.
