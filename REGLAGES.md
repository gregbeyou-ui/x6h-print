# Réglages de l'imprimante X6h-FC21

Notes des essais faits depuis le PC avec `imprimer_test.py` (13/11/2026).

## Ce qui est confirmé sur la vraie imprimante

- Nom Bluetooth : `X6h-FC21`. Elle s'annonce avec le service `af30`, mais le service à utiliser une fois connecté est bien `ae30`.
- Écriture sur `ae01` (sans réponse), notifications sur `ae02`.
- Le format des paquets et la séquence « qualité → énergie → type 00 → vitesse → lignes A2 → fin » fonctionnent.
- Largeur de 384 points correcte (le cadre de la mire est visible sur les 4 bords).
- L'imprimante accepte un ticket de 470 lignes d'un seul coup sans demander de pause.

## Réglages retenus pour l'instant

| Réglage | Valeur | Pourquoi |
|---|---|---|
| Énergie | **8000** | Noir plein de bonne qualité. À 5000 le noir plein se dégrade ; 12000 n'apporte rien de visible. |
| Correction des gris (gamma) | **1.5** | Sans correction, les gris foncés se confondent avec le noir. Choisi à l'œil sur la mire des gris. |
| Vitesse | 30 pour un noir dense, 15 pour aller vite | La vitesse a un effet réel (jugé sur le papier) : à 15 le noir plein est un peu moins noir qu'à 30. Gain de temps de la vitesse 15 non mesuré. |
| Qualité | 5 | Valeur de départ, pas encore comparée à d'autres. |

## Essais réalisés

| Énergie | Vitesse | Qualité | Résultat |
|---|---|---|---|
| 12000 | 30 | 5 | Net, noir dense, gris foncés bouchés. |
| 8000 | 30 | 5 | Comme 12000. |
| 5000 | 30 | 5 | Noir plein de moins bonne qualité. Éliminé. |
| 8000 | 30 | 5 | Mire des gris : correction 1.5 retenue (parmi 1.0, 1.5, 2.0, 2.5). |
| 8000 | 15 | 5 | Avec correction 1.5 : ticket complet, texte net, dégradé meilleur, mais noir plein un peu moins noir qu'en vitesse 30. |

## Mode gris (16 niveaux, « Haute résolution » de Tiny Print)

Confirmé sur la vraie imprimante le 13/11/2026 avec `python imprimer_test.py --gris` : commande `CF`, emballage LZO sans réduction, énergie 4715, vitesse 40, qualité 3. L'imprimante demande des pauses pendant l'envoi (5 pour 400 lignes) et elles sont respectées.

Noirceur de chaque niveau à l'énergie 4715, mesurée sur une photo du ticket (donc approximative ; 0 % = papier blanc) :

| Niveau | 0 à 5 | 6 | 7 | 8 | 9 | A | B | C | D | E | F |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Noirceur | 0 % | 3 % | 10 % | 21 % | 40 % | 56 % | 67 % | 75 % | 82 % | 86 % | 88 % |

Observations sur le papier :

- Le fond est bien blanc : le niveau 3 que Tiny Print utilise pour le blanc ne marque pas le papier.
- Seuls les niveaux 6 à F sont visibles, soit 10 teintes. E et F sont proches mais distincts.
- Le dégradé est globalement lisse, sans grain.
- **La bande noire sur toute la largeur est moins noire que la case F** (environ 82 %, comme la case D). Quand toute la ligne chauffe en même temps, chaque point reçoit moins d'énergie.
- Le cadre d'un point d'épaisseur est mal rendu (traits fins irréguliers).
- Un trait horizontal clair apparaît dans le dégradé à la jonction entre deux paquets de 20 lignes.

Essai à l'énergie 6500 (vitesse 40, qualité 3), jugé sur le papier : la bande noire pleine largeur est plus noire qu'à 4715, mais les cases E et F sont toutes les deux bien noires (un niveau de perdu en haut de l'échelle). Le fond du ticket reste bien blanc. Premier niveau visible à 6500 : pas relevé.

**Réglage retenu pour le mode gris : énergie 6500, vitesse 40, qualité 3.**

## Essais depuis la page (Chrome sur le PC)

- Noir et blanc : photo imprimée complète et propre.
- Gris (rythme d'envoi de Tiny Print : blocs de 177 octets, 4 ms entre deux) : des bandes entières de l'image ont disparu. Le rythme a été ralenti (12 ms entre deux blocs, 60 ms après chaque paquet de 20 lignes) ; pas encore réimprimé.
- Liaison Bluetooth : Chrome sous Windows la coupe pendant les moments d'inactivité ; la page se reconnecte maintenant toute seule à l'impression.

## Ce qui reste à vérifier

- Le rendu d'une vraie photo, en gris et en noir et blanc, pour choisir le meilleur mode.

- Si la vitesse 15 imprime réellement plus vite que la vitesse 30 (pas chronométré).
- La part de la vitesse dans l'amélioration du dégradé : le ticket en vitesse 15 avait la correction 1.5, celui en vitesse 30 non. Il manque un ticket vitesse 30 avec correction 1.5 pour comparer à égalité.
- Si monter l'énergie (par exemple 12000) rend son noir à la vitesse 15.
- L'effet du réglage de qualité (seule la qualité 5 a été testée).
- Les valeurs de Tiny Print (voir `TROUVAILLES_TINYPRINT.md`) : qualité `A4 33`, mode normal énergie 5000 / vitesse 10, mode gris énergie 4715 / vitesse 40. Aucune n'a encore été imprimée depuis le PC.
