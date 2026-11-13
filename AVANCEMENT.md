# Avancement du projet X6h Print

*Mis à jour le 13/11/2026.*

Objectif : imprimer des photos sur la mini-imprimante thermique Bluetooth **X6h-FC21** sans l'appli Tiny Print, d'abord depuis l'iPhone (page web dans Bluefy), plus tard pour des invités via un relais (PC puis ESP32).

**Page en ligne : https://gregbeyou-ui.github.io/x6h-print/**
Dépôt GitHub (public) : https://github.com/gregbeyou-ui/x6h-print

---

## Où on en est

| Étape | État |
|---|---|
| 1. Imprimer depuis le PC (Python) | ✅ Faite |
| 2. Décompiler Tiny Print | ✅ Faite |
| 3. Mettre à jour `index.html` | ✅ Faite, mais l'impression depuis l'iPhone reste à faire fonctionner |
| 4. Mise en ligne sur GitHub Pages | ✅ Faite |
| 5. Relais pour les invités (PC, puis ESP32) | ⏳ Pas commencée |

### Ce qui marche

- **Depuis le PC avec Python** : noir et blanc et niveaux de gris impriment correctement.
- **Depuis Chrome sur le PC** : le noir et blanc imprime une photo complète et propre.

### Ce qui ne marche pas encore

- **Depuis Bluefy sur l'iPhone** : la page indique que l'impression est faite, mais rien ne sort.
  - Premier essai : la liaison s'est coupée en pleine impression (erreur `writeChar … null`), c'est corrigé.
  - Deuxième essai : seulement quelques millimètres imprimés, avec l'ancien message « pauses demandées : 0 », donc une ancienne version de la page encore en mémoire. Cause probable : l'iPhone jette ce qu'on lui envoie trop vite.
  - **Version v5** (numéro affiché en bas de la page) : les lignes sont regroupées par envois de 177 octets, avec un rythme réglable dans « Réglages avancés → Rythme d'envoi Bluetooth » (Lent par défaut sur iPhone). Après une coupure, la page renvoie les réglages de début. À la fin, elle affiche un rapport « pauses, reconnexions, messages reçus, état ».
- **Mode gris depuis Chrome** : des bandes de 20 lignes manquaient. L'envoi a été ralenti, mais ce n'est pas encore réimprimé.

---

## Prochaine chose à faire

1. Éteindre puis rallumer l'imprimante (elle peut être bloquée par l'impression interrompue).
2. Dans Bluefy, recharger la page et **vérifier qu'il est écrit « Version 13/11 – v5 » tout en bas**. Sinon, attendre quelques minutes et recharger.
3. Se connecter, imprimer une photo en **N&B**. Si elle s'arrête encore trop tôt, essayer un rythme encore plus lent (à ajouter dans le code si « Lent » ne suffit pas).
4. **Noter le message de fin** (pauses, reconnexions, messages reçus, état) et le donner à Claude :
   - « l'imprimante ne répond pas » ou « messages reçus : 0 » : Bluefy ne reçoit rien de l'imprimante, et il faut chercher du côté de la liaison iPhone ;
   - un état autre que `00` : l'imprimante signale peut-être un problème (papier, batterie, surchauffe).
5. Pour comparer, imprimer la même photo depuis Chrome sur le PC : si ça sort, le problème est propre à l'iPhone.

---

## Réglages trouvés (détails dans `REGLAGES.md`)

| | Noir et blanc (N&B) | Gris (16 niveaux) |
|---|---|---|
| Énergie | **8000** (5000 abîme le noir) | **6500** (4715 donne un noir trop pâle) |
| Vitesse | 30 (15 = plus rapide mais noir un peu moins dense) | 40 |
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
