# Guide utilisateur — MLA-Share

MLA-Share est un service de transfert de fichiers chiffré de bout en bout.
Vos fichiers sont chiffrés **dans votre navigateur** avant tout envoi — le serveur
ne voit jamais leur contenu ni les clés utilisées.

---

## Interface web

### Accès

L'instance publique est disponible sur **https://share.kodetis.cloud**.

Pour déployer votre propre instance, voir [Déploiement](DEPLOIEMENT.md).

---

### Envoyer des fichiers

#### 1. Déposer les fichiers

Glissez-déposez vos fichiers dans la zone d'upload, ou cliquez pour parcourir.

- Taille maximale : **100 Mo** par transfert
- Plusieurs fichiers peuvent être inclus dans le même transfert
- Tous les types de fichiers sont acceptés (PDF, images, archives, bases de données…)

#### 2. Choisir un mode de chiffrement

**Mode simple — Mot de passe**

Saisissez un mot de passe d'au moins 12 caractères.
Utilisez le bouton ↺ pour générer un mot de passe fort (20 caractères, entropie ~119 bits).
Ce mot de passe devra être communiqué au destinataire **par un canal séparé** — appel
téléphonique, message Signal, en personne.

**Mode avancé — Clés MLA**

Importez :
- votre clé privée (`.mlapriv`) — signe l'archive, prouve votre identité
- la clé publique du destinataire (`.mlapub`) — chiffre l'archive pour lui seul

Pour générer une paire de clés, cliquez sur **Générer une paire de clés**.
Conservez votre `.mlapriv` en lieu sûr — **ne la transmettez jamais**.

> Vous pouvez aussi générer une paire de clés via la CLI :
> ```bash
> mlar keygen mon-nom
> # Produit : mon-nom.mlapriv + mon-nom.mlapub
> ```

#### 3. Durée d'expiration

| Durée | Usage recommandé |
|-------|-----------------|
| 1 heure | Fichier très sensible, destinataire disponible |
| 24 heures | Usage courant |
| 7 jours | Destinataire potentiellement absent |

Passé ce délai, les fichiers sont **supprimés définitivement**.

#### 4. Envoyer

Cliquez sur **Chiffrer et envoyer**. Le lien de partage est copié automatiquement
dans le presse-papier. Transmettez-le au destinataire.

---

### Recevoir des fichiers

#### 1. Ouvrir le lien

La page affiche la taille du transfert et le temps restant avant expiration.

#### 2. Saisir le secret

- **Mode mot de passe** : saisir le mot de passe communiqué par l'expéditeur
- **Mode clés MLA** : importer votre clé privée (`.mlapriv`) et la clé publique
  de l'expéditeur (`.mlapub`)

#### 3. Déchiffrer et télécharger

Cliquez sur **Déchiffrer et télécharger**. Le déchiffrement s'effectue dans le navigateur.

---

## CLI `mlar`

La CLI `mlar` est fournie par l'ANSSI. Elle est indispensable pour les transferts
de gros fichiers (> 100 Mo) ou l'automatisation.

### Installation

```bash
cargo install mlar
mlar --version
```

### Gestion des clés

```bash
mlar keygen expediteur
mlar keygen destinataire
# Ne transmettez JAMAIS votre .mlapriv
```

### Chiffrer une archive

```bash
# Un fichier, un destinataire
mlar create \
  -k expediteur.mlapriv \
  -p destinataire.mlapub \
  -o archive.mla \
  fichier.tar.gz

# Plusieurs fichiers
mlar create \
  -k expediteur.mlapriv \
  -p destinataire.mlapub \
  -o archive.mla \
  rapport.pdf cles-api.yaml dump.sql

# Depuis un pipe (backup, image disque…)
tar czf - /var/lib/postgresql/data/ | mlar create \
  -k expediteur.mlapriv \
  -p destinataire.mlapub \
  -o backup_$(date +%Y%m%d).mla \
  --stdin-data
```

### Lire et extraire

```bash
mlar list    -k destinataire.mlapriv -p expediteur.mlapub -i archive.mla
mlar extract -k destinataire.mlapriv -p expediteur.mlapub -i archive.mla -o ./extraits/
mlar cat     -k destinataire.mlapriv -p expediteur.mlapub -i archive.mla chemin/fichier.txt
```

### Uploader vers MLA-Share

```bash
curl -sX POST https://share.kodetis.cloud/api/upload \
  -F "file=@archive.mla" \
  -F "expires_hours=24" \
  | jq -r '"Lien : https://share.kodetis.cloud/receive/" + .id'
```

Le destinataire déchiffre depuis le navigateur — **aucune installation requise de son côté**.

---

## Comparaison des modes

| | Mot de passe | Clés MLA |
|---|---|---|
| Authentification expéditeur | Non | Oui (Ed25519 + ML-DSA 87) |
| Secret à transmettre | Le mot de passe (hors-bande) | Aucun |
| Clés à gérer | Non | Oui (1 paire par acteur) |
| Résistance post-quantique | Oui (Argon2id → KEM) | Oui (X25519 + ML-KEM 1024) |
| Idéal pour | Partage ponctuel | Échanges récurrents, contexte régulé |

---

## Cas d'usage

### Transfert d'une VM compromise vers une autorité

```bash
mlar create \
  -k analyste.mlapriv \
  -p autorite.mlapub \
  -o vm_compromise_$(date +%Y%m%d_%H%M).mla \
  dump_memoire.raw disk_image.dd

curl -sX POST https://share.kodetis.cloud/api/upload \
  -F "file=@vm_compromise_*.mla" \
  -F "expires_hours=1" \
  | jq -r '"https://share.kodetis.cloud/receive/" + .id'
```

### Backup PostgreSQL vers administrateur distant

```bash
pg_dump ma_base | gzip | mlar create \
  -k serveur.mlapriv -p admin.mlapub \
  -o pg_backup_$(hostname)_$(date +%Y%m%d).mla --stdin-data

curl -sX POST https://share.kodetis.cloud/api/upload \
  -F "file=@pg_backup_*.mla" -F "expires_hours=168" | jq -r '.id'
```

### Archivage long terme (suppression du chiffrement)

```bash
mlar convert \
  -k destinataire.mlapriv -p expediteur.mlapub \
  -i archive.mla -o archive_longterme.mla \
  --unencrypted --unsigned -q 11
```

### Récupération d'archive tronquée

```bash
mlar repair \
  -k destinataire.mlapriv -p expediteur.mlapub \
  -i archive_tronquee.mla -o archive_reparee.mla
```

---

## Bonnes pratiques de sécurité

- Transmettez le lien et le mot de passe par des **canaux distincts**.
- Importez bien la clé **publique** du destinataire, pas la vôtre.
- Préférez `expires_hours=1` pour tout fichier très sensible.
- Ne committez jamais vos fichiers `.mlapriv` (déjà dans `.gitignore`).
- Une archive non signée (`--unsigned`) n'authentifie pas l'expéditeur.
