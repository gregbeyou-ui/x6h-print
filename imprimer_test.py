"""
Test d'impression sur la mini-imprimante thermique X6h, depuis le PC, en Bluetooth.

Exemples (à taper dans le terminal, depuis ce dossier) :

  python imprimer_test.py --scan              -> liste les appareils Bluetooth autour du PC
  python imprimer_test.py --apercu            -> fabrique seulement l'image de test (apercu.png), sans imprimer
  python imprimer_test.py                     -> imprime l'image de test (noir et blanc)
  python imprimer_test.py --energie 12000     -> plus noir (défaut : 8000)
  python imprimer_test.py --vitesse 20        -> plus rapide (petit = rapide)
  python imprimer_test.py --gamma 2           -> gris plus clairs (défaut : 1.5, 1 = aucune correction)
  python imprimer_test.py --mire-gamma        -> imprime la mire qui compare 4 corrections des gris
  python imprimer_test.py --image photo.jpg   -> imprime une photo au lieu de l'image de test

  python imprimer_test.py --gris              -> imprime en 16 niveaux de gris (mode « Haute résolution » de Tiny Print)
  python imprimer_test.py --gris --image photo.jpg
"""

import argparse
import asyncio
import sys
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# Pour que les accents s'affichent bien dans le terminal Windows
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# =====================================================================
# PROTOCOLE (le même que dans index.html)
# Paquet = 51 78 | commande | 00 | longueur (2 octets) | données | CRC8 | FF
# =====================================================================
SERVICE = "0000ae30-0000-1000-8000-00805f9b34fb"
WRITE_UUID = "0000ae01-0000-1000-8000-00805f9b34fb"  # on écrit ici
NOTIF_UUID = "0000ae02-0000-1000-8000-00805f9b34fb"  # l'imprimante répond ici
LARGEUR = 384  # largeur de la tête d'impression, en points

CMD_AVANCE = 0xA1    # avancer le papier (2 octets : nombre de lignes)
CMD_LIGNE = 0xA2     # une ligne d'image (48 octets, 1 bit par point)
CMD_ETAT = 0xA3      # demander l'état de l'imprimante
CMD_QUALITE = 0xA4   # qualité (0x31 à 0x35) ; Tiny Print envoie toujours 0x33 au X6h
CMD_STATUT = 0xAE    # envoyé PAR l'imprimante : 0x10 = pause, 0x00 = reprendre
CMD_ENERGIE = 0xAF   # énergie de chauffe (2 octets)
CMD_VITESSE = 0xBD   # vitesse (petit = rapide)
CMD_TYPE = 0xBE      # type d'impression (0x00 = image)
CMD_GRIS = 0xCF      # paquet de lignes en 16 niveaux de gris, compressé LZO

# Valeurs par défaut de chaque mode
DEFAUTS_NB = {"energie": 8000, "vitesse": 30, "qualite": 5}     # trouvées par nos essais
DEFAUTS_GRIS = {"energie": 4715, "vitesse": 40, "qualite": 3}   # celles de Tiny Print pour le X6h
LIGNES_PAR_PAQUET_GRIS = 20   # comme Tiny Print
ECHELLE_GRIS = 0.9            # coefficient « grayScale » du X6h dans Tiny Print


def crc8(donnees: bytes) -> int:
    """Somme de contrôle CRC8 (polynôme 0x07), calculée sur les données seules."""
    c = 0
    for octet in donnees:
        c ^= octet
        for _ in range(8):
            c = ((c << 1) ^ 0x07) & 0xFF if c & 0x80 else (c << 1) & 0xFF
    return c


def paquet(cmd: int, donnees: bytes) -> bytes:
    """Fabrique un paquet complet prêt à envoyer."""
    donnees = bytes(donnees)
    n = len(donnees)
    return bytes([0x51, 0x78, cmd, 0x00, n & 0xFF, n >> 8]) + donnees + bytes([crc8(donnees), 0xFF])


def u16(n: int) -> bytes:
    """Nombre sur 2 octets, poids faible d'abord."""
    return bytes([n & 0xFF, (n >> 8) & 0xFF])


# =====================================================================
# IMAGE
# =====================================================================
def police(taille: int, gras: bool = True):
    """Charge la police Arial de Windows (ou une police de secours)."""
    for nom in (["arialbd.ttf"] if gras else []) + ["arial.ttf"]:
        try:
            return ImageFont.truetype(str(Path("C:/Windows/Fonts") / nom), taille)
        except OSError:
            pass
    return ImageFont.load_default(taille)


def image_de_test(energie: int, vitesse: int, qualite: int) -> Image.Image:
    """Dessine une mire : titre, réglages utilisés, dégradé, paliers de gris, traits fins."""
    H = 470
    img = Image.new("L", (LARGEUR, H), 255)
    d = ImageDraw.Draw(img)

    d.text((LARGEUR // 2, 24), "TEST X6h", font=police(38), fill=0, anchor="mm")
    # Les réglages sont écrits sur le ticket : pratique pour comparer plusieurs essais
    d.text((LARGEUR // 2, 62), f"énergie {energie}  vitesse {vitesse}  qualité {qualite}",
           font=police(19), fill=0, anchor="mm")
    d.text((LARGEUR // 2, 86), time.strftime("%d/%m/%Y %H:%M:%S"), font=police(15, gras=False), fill=0, anchor="mm")

    # Dégradé continu noir -> blanc
    y0 = 104
    for x in range(LARGEUR):
        d.line([(x, y0), (x, y0 + 70)], fill=round(255 * x / (LARGEUR - 1)))

    # 8 paliers de gris (0 % à 100 % de blanc)
    y0 = 186
    for i in range(8):
        d.rectangle([i * 48, y0, i * 48 + 47, y0 + 50], fill=round(255 * i / 7))

    # Bande noire pleine : montre si le noir est bien dense et régulier
    y0 = 248
    d.rectangle([0, y0, LARGEUR - 1, y0 + 34], fill=0)
    d.text((LARGEUR // 2, y0 + 17), "NOIR PLEIN", font=police(20), fill=255, anchor="mm")

    # Traits verticaux de plus en plus fins (1, 2, 3, 4 points)
    y0 = 296
    x = 0
    for epaisseur in (4, 3, 2, 1):
        for _ in range(96 // (2 * epaisseur)):
            d.rectangle([x, y0, x + epaisseur - 1, y0 + 40], fill=0)
            x += 2 * epaisseur
    # Traits horizontaux d'1 point (montre si le papier avance régulièrement)
    y0 = 346
    for i in range(0, 30, 2):
        d.line([(0, y0 + i), (LARGEUR - 1, y0 + i)], fill=0)

    # Texte de plusieurs tailles
    d.text((4, 386), "Petit texte 14 : abcdefghij 0123456789", font=police(14, gras=False), fill=0)
    d.text((4, 406), "Texte moyen 20 : éèàç ÉÀ", font=police(20, gras=False), fill=0)
    d.text((4, 432), "Gros texte 28", font=police(28), fill=0)

    # Cadre : les 4 bords doivent être visibles (vérifie la largeur de 384 points)
    d.rectangle([0, 0, LARGEUR - 1, H - 1], outline=0)
    return img


def appliquer_gamma(img: Image.Image, gamma: float) -> Image.Image:
    """Éclaircit les gris moyens (gamma > 1) sans toucher au noir pur ni au blanc pur.
    Sert à compenser l'imprimante, qui rend les gris plus foncés que prévu."""
    table = [round(255 * (v / 255) ** (1 / gamma)) for v in range(256)]
    return img.point(table)


def mire_gamma(energie: int, vitesse: int, qualite: int) -> Image.Image:
    """Mire de comparaison : le même dégradé et les mêmes 8 paliers,
    imprimés avec 4 corrections différentes sur un seul ticket."""
    gammas = (1.0, 1.5, 2.0, 2.5)
    haut_bande = 100
    H = 62 + haut_bande * len(gammas)
    img = Image.new("L", (LARGEUR, H), 255)
    d = ImageDraw.Draw(img)
    d.text((LARGEUR // 2, 18), "TEST DES GRIS", font=police(28), fill=0, anchor="mm")
    d.text((LARGEUR // 2, 44), f"énergie {energie}  vitesse {vitesse}  qualité {qualite}",
           font=police(17), fill=0, anchor="mm")

    # Une bande « modèle » : dégradé continu + 8 paliers
    bande = Image.new("L", (LARGEUR, 72), 255)
    db = ImageDraw.Draw(bande)
    for x in range(LARGEUR):
        db.line([(x, 0), (x, 33)], fill=round(255 * x / (LARGEUR - 1)))
    for i in range(8):
        db.rectangle([i * 48, 38, i * 48 + 47, 71], fill=round(255 * i / 7))

    for n, g in enumerate(gammas):
        y0 = 62 + n * haut_bande
        d.text((4, y0), f"correction {g}" + ("  (aucune)" if g == 1.0 else ""), font=police(18), fill=0)
        img.paste(appliquer_gamma(bande, g), (0, y0 + 22))
    return img


def charger_photo(chemin: str) -> Image.Image:
    """Ouvre une photo, la met en gris et à 384 points de large."""
    img = Image.open(chemin).convert("L")
    h = round(img.height * LARGEUR / img.width)
    return img.resize((LARGEUR, h), Image.LANCZOS)


# ---------- Mode noir et blanc (1 bit par point) ----------
def tramage_atkinson(img: Image.Image) -> list[list[int]]:
    """Transforme une image en gris en points noirs (1) ou blancs (0).
    Même algorithme que dans index.html."""
    w, h = img.size
    gris = [float(v) for v in img.tobytes()]
    lignes = []
    for y in range(h):
        ligne = [0] * w
        for x in range(w):
            i = y * w + x
            ancien = gris[i]
            nouveau = 0 if ancien < 128 else 255
            ligne[x] = 1 if nouveau == 0 else 0
            err = (ancien - nouveau) / 8
            for dx, dy in ((1, 0), (2, 0), (-1, 1), (0, 1), (1, 1), (0, 2)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and ny < h:
                    gris[ny * w + nx] += err
        lignes.append(ligne)
    return lignes


def ligne_en_octets(ligne: list[int]) -> bytes:
    """384 points -> 48 octets. Le point le plus à gauche = bit de poids faible."""
    out = bytearray(LARGEUR // 8)
    for x, noir in enumerate(ligne):
        if noir:
            out[x >> 3] |= 1 << (x & 7)
    return bytes(out)


def enregistrer_apercu(lignes: list[list[int]], chemin: Path) -> None:
    """Enregistre en PNG exactement ce qui sera imprimé (noir et blanc)."""
    h = len(lignes)
    img = Image.new("1", (LARGEUR, h), 1)
    img.putdata([0 if noir else 1 for ligne in lignes for noir in ligne])
    img.save(chemin)


def paquets_noir_et_blanc(lignes, energie: int, vitesse: int, qualite: int) -> list[bytes]:
    """Enchaînement des commandes pour une impression en noir et blanc."""
    p = [
        paquet(CMD_QUALITE, [0x30 + qualite]),
        paquet(CMD_ENERGIE, u16(energie)),
        paquet(CMD_TYPE, [0x00]),                 # 0x00 = image
        paquet(CMD_VITESSE, [vitesse]),
        paquet(CMD_LIGNE, bytes(LARGEUR // 8)),   # 1re ligne blanche
    ]
    p += [paquet(CMD_LIGNE, ligne_en_octets(ligne)) for ligne in lignes]
    p += [
        paquet(CMD_VITESSE, [0x19]),
        paquet(CMD_AVANCE, u16(0x30)),
        paquet(CMD_AVANCE, u16(0x30)),
        paquet(CMD_VITESSE, [0x19]),
    ]
    return p


# ---------- Mode gris (4 bits par point : 0 = blanc, 15 = noir) ----------
def image_vers_niveaux(img: Image.Image, echelle: float = ECHELLE_GRIS) -> list[list[int]]:
    """Transforme une image en gris en niveaux de chauffe de 0 (blanc) à 15 (noir).
    Reproduit le calcul de Tiny Print (m2.ditherGrayPixels + convert4ColorImageToPointData)."""
    w, h = img.size
    px = [int(v * echelle) for v in img.tobytes()]
    lignes = []
    for y in range(h):
        ligne = [0] * w
        for x in range(w):
            i = y * w + x
            v = px[i]
            q = int(v / 18) * 19          # arrondi à l'un des 14 paliers
            err = v - q                   # l'erreur est répartie sur les voisins (Floyd-Steinberg)
            if x < w - 1:
                px[i + 1] += int(err * 7 / 16)
            if y < h - 1:
                if x > 0:
                    px[i + w - 1] += int(err * 3 / 16)
                px[i + w] += int(err * 5 / 16)
                if x < w - 1:
                    px[i + w + 1] += int(err / 16)
            palier = int(q / (256 / 14))
            if palier == 13:
                palier = 15
            palier = max(0, min(15, palier))
            ligne[x] = 15 - palier
        lignes.append(ligne)
    return lignes


def mire_grise(energie: int, vitesse: int, qualite: int) -> list[list[int]]:
    """Mire pour le mode gris. Renvoie directement les niveaux de chauffe (0 à 15)."""
    H = 400
    img = Image.new("L", (LARGEUR, H), 255)
    d = ImageDraw.Draw(img)
    d.text((LARGEUR // 2, 22), "TEST GRIS X6h", font=police(34), fill=0, anchor="mm")
    d.text((LARGEUR // 2, 56), f"énergie {energie}  vitesse {vitesse}  qualité {qualite}",
           font=police(19), fill=0, anchor="mm")
    d.text((LARGEUR // 2, 78), time.strftime("%d/%m/%Y %H:%M:%S"), font=police(15, gras=False), fill=0, anchor="mm")

    # Zone A : les 16 niveaux de chauffe bruts, de 0 à F (remplie plus bas, sans passer par le calcul)
    d.text((4, 92), "Les 16 niveaux bruts", font=police(16), fill=0)
    for n in range(16):
        d.text((n * 24 + 12, 122), "0123456789ABCDEF"[n], font=police(15), fill=0, anchor="mm")
    y_brut = (132, 182)

    # Zone B : dégradé continu, converti avec la méthode de Tiny Print
    d.text((4, 190), "Dégradé (méthode Tiny Print)", font=police(16), fill=0)
    for x in range(LARGEUR):
        d.line([(x, 212), (x, 262)], fill=round(255 * (1 - x / (LARGEUR - 1))))

    # Bande noire pleine
    d.rectangle([0, 274, LARGEUR - 1, 308], fill=0)
    d.text((LARGEUR // 2, 291), "NOIR PLEIN", font=police(20), fill=255, anchor="mm")

    d.text((4, 318), "Petit texte 14 : abcdefghij 0123456789", font=police(14, gras=False), fill=0)
    d.text((4, 338), "Texte moyen 20 : éèàç ÉÀ", font=police(20, gras=False), fill=0)
    d.text((4, 364), "Gros texte 28", font=police(28), fill=0)
    d.rectangle([0, 0, LARGEUR - 1, H - 1], outline=0)

    niveaux = image_vers_niveaux(img)
    for y in range(*y_brut):
        niveaux[y] = [x // 24 for x in range(LARGEUR)]
    return niveaux


def enregistrer_apercu_gris(niveaux: list[list[int]], chemin: Path) -> None:
    """Enregistre en PNG une idée du rendu : niveau 0 = blanc, niveau 15 = noir."""
    img = Image.new("L", (LARGEUR, len(niveaux)))
    img.putdata([255 - 17 * n for ligne in niveaux for n in ligne])
    img.save(chemin)


def lzo_sans_compression(donnees: bytes) -> bytes:
    """Emballe des données au format LZO sans chercher à les réduire.
    L'imprimante attend du LZO ; ce format « tout en clair » en est une forme valide
    (un seul bloc de données littérales, puis le marqueur de fin 11 00 00)."""
    n = len(donnees)
    if n < 4:
        raise ValueError("bloc trop court")
    if n <= 238:
        entete = bytes([n + 17])
    else:
        zeros, dernier = divmod(n - 18, 255)
        if dernier == 0:
            zeros, dernier = zeros - 1, 255
        entete = bytes([0]) + bytes(zeros) + bytes([dernier])
    return entete + donnees + b"\x11\x00\x00"


def paquet_gris(donnees: bytes) -> bytes:
    """Paquet CF : taille d'origine, taille compressée, données compressées."""
    comp = lzo_sans_compression(donnees)
    return paquet(CMD_GRIS, u16(len(donnees)) + u16(len(comp)) + comp)


def paquets_gris(niveaux, energie: int, vitesse: int, qualite: int) -> list[bytes]:
    """Enchaînement des commandes de Tiny Print pour le mode gris (iy/c0.java)."""
    # 2 points par octet, le point de gauche dans les 4 bits de poids faible
    brut = bytearray(16 * (LARGEUR // 2))          # 16 lignes blanches au début, comme Tiny Print
    for ligne in niveaux:
        for x in range(0, LARGEUR, 2):
            brut.append(ligne[x] | (ligne[x + 1] << 4))

    p = [
        paquet(CMD_QUALITE, [0x30 + qualite]),
        paquet(CMD_ENERGIE, u16(energie)),
        paquet(CMD_TYPE, [0x00, 0x01]),            # type « niveaux de gris »
        paquet(CMD_VITESSE, [vitesse]),
    ]
    taille = LIGNES_PAR_PAQUET_GRIS * (LARGEUR // 2)
    for i in range(0, len(brut), taille):
        p.append(paquet_gris(bytes(brut[i:i + taille])))
        p.append(paquet(CMD_VITESSE, [vitesse]))
    p += [
        paquet(CMD_VITESSE, [0x0F]),
        paquet(CMD_AVANCE, u16(0x30)),
        paquet(CMD_AVANCE, u16(0x30)),
        paquet(CMD_ETAT, [0x00]),
    ]
    return p


# =====================================================================
# BLUETOOTH
# =====================================================================
async def scanner(duree: float = 8.0):
    """Liste tous les appareils Bluetooth (BLE) visibles."""
    from bleak import BleakScanner

    print(f"Recherche des appareils Bluetooth pendant {duree:.0f} secondes…")
    trouves = await BleakScanner.discover(timeout=duree, return_adv=True)
    if not trouves:
        print("Aucun appareil trouvé. Le Bluetooth du PC est-il allumé ?")
        return
    for appareil, pub in sorted(trouves.values(), key=lambda t: -t[1].rssi):
        nom = pub.local_name or appareil.name or "(sans nom)"
        marque = "  <-- IMPRIMANTE ?" if est_imprimante(appareil, pub) else ""
        print(f"  {appareil.address}  signal {pub.rssi:4d} dBm  {nom}{marque}")
        if marque and pub.service_uuids:
            print(f"      services annoncés : {', '.join(pub.service_uuids)}")


def est_imprimante(appareil, pub) -> bool:
    nom = (pub.local_name or appareil.name or "").upper()
    return nom.startswith("X6")


async def imprimer(paquets: list[bytes], adresse: str | None, bloc_max: int | None = None,
                   delai: float = 0.0, attente_fin: float = 3.0):
    """Se connecte à l'imprimante et lui envoie les paquets, en respectant ses demandes de pause.
    bloc_max / delai : taille maximale de chaque envoi et attente entre deux envois."""
    from bleak import BleakClient, BleakScanner

    # 1) Trouver l'imprimante
    if adresse:
        print(f"Recherche de l'imprimante à l'adresse {adresse}…")
        appareil = await BleakScanner.find_device_by_address(adresse, timeout=15)
    else:
        print("Recherche d'une imprimante dont le nom commence par « X6 »…")
        appareil = await BleakScanner.find_device_by_filter(est_imprimante, timeout=15)
    if appareil is None:
        print("Imprimante introuvable. Vérifie qu'elle est allumée, et que l'appli Tiny Print")
        print("est bien fermée sur l'iPhone (elle ne peut parler qu'à un appareil à la fois).")
        print("Astuce : lance  python imprimer_test.py --scan  pour voir ce que le PC détecte.")
        return False
    print(f"Trouvée : {appareil.name} ({appareil.address}). Connexion…")

    en_pause = asyncio.Event()   # « levé » quand l'imprimante demande une pause
    nb_pauses = 0

    def reponse_imprimante(_car, data: bytearray):
        nonlocal nb_pauses
        if len(data) >= 7 and data[0] == 0x51 and data[1] == 0x78 and data[2] == CMD_STATUT:
            if data[6] == 0x10:
                nb_pauses += 1
                en_pause.set()
            else:
                en_pause.clear()
            if ARGS.bavard:
                print("    [imprimante] " + ("PAUSE" if data[6] == 0x10 else "reprise"))
        elif ARGS.bavard:
            print("    [imprimante] " + data.hex(" "))

    async with BleakClient(appareil, timeout=30) as client:
        # 2) Vérifier que l'imprimante parle bien le protocole attendu
        car_ecriture = client.services.get_characteristic(WRITE_UUID)
        if car_ecriture is None:
            print("Cette imprimante n'a pas la caractéristique d'écriture attendue (ae01).")
            print("Voici ce qu'elle propose (à me copier-coller) :")
            for service in client.services:
                print(f"  service {service.uuid}")
                for car in service.characteristics:
                    print(f"    {car.uuid}  {','.join(car.properties)}")
            return False
        try:
            await client.start_notify(NOTIF_UUID, reponse_imprimante)
        except Exception as e:  # pas bloquant : on imprimera sans gestion de pause
            print(f"Attention : notifications indisponibles ({e}).")

        sans_reponse = "write-without-response" in car_ecriture.properties
        bloc = car_ecriture.max_write_without_response_size if sans_reponse else 512
        if bloc_max:
            bloc = min(bloc, bloc_max)
        total = sum(len(p) for p in paquets)
        print(f"Connectée. Envoi de {total} octets par blocs de {bloc}.")

        async def envoyer(donnees: bytes):
            # Le Bluetooth n'accepte que de petits morceaux : on découpe si besoin
            for i in range(0, len(donnees), bloc):
                # On attend si l'imprimante a dit « pause » (30 s maximum, par sécurité)
                debut_pause = time.monotonic()
                while en_pause.is_set():
                    if time.monotonic() - debut_pause > 30:
                        print("    (pause de plus de 30 s : on reprend quand même)")
                        en_pause.clear()
                        break
                    await asyncio.sleep(0.02)
                await client.write_gatt_char(car_ecriture, donnees[i:i + bloc], response=not sans_reponse)
                if delai:
                    await asyncio.sleep(delai)

        # 3) Envoi
        debut = time.monotonic()
        envoye, prochain = 0, 0
        for n, p in enumerate(paquets):
            await envoyer(p)
            envoye += len(p)
            if n % 8 == 0 and not delai:
                await asyncio.sleep(0.004)
            if 100 * envoye // total >= prochain:
                print(f"  {100 * envoye // total:3d} %")
                prochain += 10

        # On laisse à l'imprimante le temps de finir avant de couper la connexion
        await asyncio.sleep(attente_fin)
        print(f"Terminé en {time.monotonic() - debut:.1f} s. "
              f"L'imprimante a demandé {nb_pauses} pause(s).")
    return True


# =====================================================================
# PROGRAMME PRINCIPAL
# =====================================================================
def lire_arguments():
    p = argparse.ArgumentParser(description="Test d'impression sur l'imprimante thermique X6h")
    p.add_argument("--scan", action="store_true", help="lister les appareils Bluetooth et s'arrêter")
    p.add_argument("--apercu", action="store_true", help="fabriquer apercu.png sans imprimer")
    p.add_argument("--gris", action="store_true",
                   help="imprimer en 16 niveaux de gris (mode « Haute résolution » de Tiny Print)")
    p.add_argument("--energie", type=int, help="noirceur (défaut : 8000, ou 4715 en mode gris)")
    p.add_argument("--vitesse", type=int, help="petit = rapide (défaut : 30, ou 40 en mode gris)")
    p.add_argument("--qualite", type=int, choices=range(1, 6), help="de 1 à 5 (défaut : 5, ou 3 en mode gris)")
    p.add_argument("--gamma", type=float, default=1.5,
                   help="noir et blanc seulement, correction des gris : 1 = aucune, 2 = nettement éclaircis (défaut 1.5)")
    p.add_argument("--mire-gamma", action="store_true",
                   help="imprimer la mire qui compare 4 corrections des gris sur un seul ticket")
    p.add_argument("--image", help="chemin d'une photo à imprimer à la place de l'image de test")
    p.add_argument("--adresse", help="adresse Bluetooth de l'imprimante (si le nom ne commence pas par X6)")
    p.add_argument("--bavard", action="store_true", help="afficher tous les messages envoyés par l'imprimante")
    a = p.parse_args()

    defauts = DEFAUTS_GRIS if a.gris else DEFAUTS_NB
    for nom, valeur in defauts.items():
        if getattr(a, nom) is None:
            setattr(a, nom, valeur)
    if not 0 <= a.energie <= 0xFFFF:
        p.error("--energie doit être entre 0 et 65535")
    if not 0.2 <= a.gamma <= 5:
        p.error("--gamma doit être entre 0.2 et 5")
    if not 1 <= a.vitesse <= 255:
        p.error("--vitesse doit être entre 1 et 255")
    if a.gris and a.mire_gamma:
        p.error("--mire-gamma ne s'utilise pas avec --gris")
    return a


def main():
    global ARGS
    ARGS = lire_arguments()

    if ARGS.scan:
        asyncio.run(scanner())
        return

    reglages = (ARGS.energie, ARGS.vitesse, ARGS.qualite)
    apercu = Path(__file__).with_name("apercu.png")

    if ARGS.gris:
        niveaux = image_vers_niveaux(charger_photo(ARGS.image)) if ARGS.image else mire_grise(*reglages)
        enregistrer_apercu_gris(niveaux, apercu)
        paquets = paquets_gris(niveaux, *reglages)
        nb_lignes = len(niveaux)
        # Même rythme que Tiny Print : petits blocs de 177 octets, 4 millièmes de seconde entre deux
        rythme = {"bloc_max": 177, "delai": 0.004, "attente_fin": 6.0}
    else:
        if ARGS.mire_gamma:
            img = mire_gamma(*reglages)
        elif ARGS.image:
            img = charger_photo(ARGS.image)
        else:
            img = image_de_test(*reglages)
        if ARGS.gamma != 1.0 and not ARGS.mire_gamma:
            img = appliquer_gamma(img, ARGS.gamma)
        lignes = tramage_atkinson(img)
        enregistrer_apercu(lignes, apercu)
        paquets = paquets_noir_et_blanc(lignes, *reglages)
        nb_lignes = len(lignes)
        rythme = {}

    mode = "16 niveaux de gris" if ARGS.gris else "noir et blanc"
    print(f"Aperçu enregistré : {apercu.name} ({LARGEUR} x {nb_lignes} points, {mode})")
    if ARGS.apercu:
        return

    print(f"Impression de {nb_lignes} lignes (énergie {ARGS.energie}, vitesse {ARGS.vitesse}, qualité {ARGS.qualite})…")
    asyncio.run(imprimer(paquets, ARGS.adresse, **rythme))


if __name__ == "__main__":
    main()
