# Architecture — MLA-Share

---

## Propriété zero-knowledge

Le serveur ne voit jamais les données en clair. Tout le chiffrement et le déchiffrement
s'effectuent dans le navigateur via la couche `mla-wasm`.

```
Expéditeur (navigateur)
  ├─ Sélectionne les fichiers
  ├─ Chiffre via mla-wasm (dans le navigateur)
  │   Mode mot de passe : Argon2id → clé éphémère → AES-256-GCM
  │   Mode clés MLA    : X25519 + ML-KEM 1024 → clé éphémère → AES-256-GCM
  └─► Envoie le ciphertext opaque au serveur
          (le mot de passe / les clés ne quittent JAMAIS le navigateur)

Serveur / Stockage
  └─ Stocke des octets chiffrés + métadonnées non-sensibles
     Suppression automatique à l'expiration (TTL)

Destinataire (navigateur)
  ├─ Télécharge le ciphertext
  ├─ Déchiffre via mla-wasm (dans le navigateur)
  └─► Télécharge les fichiers en clair localement
```

---

## Composants

| Composant | Technologie | Rôle |
|---|---|---|
| `mla-wasm` | Rust → WebAssembly (wasm-pack) | Chiffrement / déchiffrement MLA dans le navigateur |
| `mla-transfert-web` | Astro 5 + React 19 + TailwindCSS | Interface utilisateur (zero-knowledge) |
| `mla-transfert-server` | Rust / Axum | Relais ciphertext + signaling WebRTC |
| `mla-transfert-worker` | Rust / worker-rs | Variante Cloudflare Worker (R2 + KV) |

---

## Flux de données — mode relay serveur

```
Navigateur (SendForm)
  │  1. Chiffrement WASM → Uint8Array (ciphertext)
  │  2. POST /api/upload (multipart, ciphertext + expires_hours)
  ▼
Serveur (mla-transfert-server ou worker)
  │  3. Stockage ciphertext (fichier disque ou Cloudflare R2)
  │  4. Génération d'un ID unique
  │  5. KV : id → { expiry, size, filename }
  │  6. Réponse JSON : { id }
  ▼
Navigateur (ShareLink)
  │  7. Affichage + copie du lien /receive/<id>
  ▼
Navigateur destinataire (ReceiveForm)
  │  8. GET /api/info/:id → métadonnées (taille, expiration)
  │  9. GET /api/download/:id → ciphertext
  │ 10. Déchiffrement WASM → fichiers en clair
  └─► Téléchargement local
```

---

## Flux de données — mode P2P WebRTC

Le ciphertext transite directement entre les navigateurs. Le serveur sert
uniquement de canal de signaling (WebSocket).

```
Navigateur A (sender)          Serveur (signaling)          Navigateur B (receiver)
  │ 1. WS /api/signal/:room ──►│                             │
  │                             │◄── 2. WS /api/signal/:room │
  │ 3. SDP offer ──────────────►│──────────────────────────► │
  │◄──────────────────────────── │◄─────── 4. SDP answer ─── │
  │ ◄────────────── ICE candidates échangés ──────────────── │
  │ ═══════════════ DataChannel WebRTC direct ══════════════ │
  │ 5. Ciphertext MLA (P2P, pas de relay serveur)            │
```

---

## Modes de transport

| Mode | Relay serveur | Taille max | Cas d'usage |
|---|---|---|---|
| Relay serveur | Oui | 100 Mo (instance publique) | Usage général |
| P2P WebRTC | Non | Limité par RAM navigateur | Réseau local, confidentialité maximale |

---

## Déploiement Cloudflare (instance publique)

```
Cloudflare Pages              Cloudflare Worker
mla-transfert-web             mla-transfert-worker
https://mla-share.kodetis.cloud
  │                                │
  │  /api/*  ────────────────────► │
  │                                │
  │                         ┌──────┴──────┐
  │                         │  R2         │  ciphertext (binaire opaque)
  │                         │  KV Store   │  id → { expiry, size }
  │                         │  Durable    │  SignalRoom WebRTC
  │                         │  Objects    │  (Workers Paid requis)
  │                         └─────────────┘
```

---

## Sécurité de la supply chain WASM

Le binaire WASM n'est **jamais commité** dans le dépôt. Il est reconstruit à chaque
exécution CI à partir des sources Rust auditables :

```
mla-wasm/src/   ← sources Rust (auditables, dans le repo)
mla-wasm/pkg/   ← GITIGNORE — reconstruit en CI via wasm-pack
```

`wasm-pack` est installé via `cargo install --locked` (pas de `curl | sh`).
