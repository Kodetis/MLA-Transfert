# Déploiement — MLA-Share

Deux modes de déploiement sont disponibles : **self-hosted** (serveur Axum + Docker)
et **Cloudflare** (Worker + R2 + Pages).

---

## Prérequis communs

- Rust stable (`rustup update stable`)
- `wasm-pack` (`cargo install wasm-pack --locked`)
- Node.js 22 + npm

---

## Self-hosted

### Build complet

```bash
# Clone du dépôt
git clone https://github.com/Kodetis/MLA-Transfert.git
cd MLA-Transfert

# Build WASM + serveur + frontend
./build.sh
```

Le script `build.sh` enchaîne :
1. `wasm-pack build --target web --release` → `mla-wasm/pkg/`
2. Copie du binaire WASM dans `mla-transfert-web/public/`
3. `npm ci && npm run build` dans `mla-transfert-web/`
4. `cargo build --release` pour `mla-transfert-server`

### Variables d'environnement — serveur

| Variable | Défaut | Description |
|---|---|---|
| `PORT` | `3001` | Port d'écoute |
| `STORAGE_DIR` | `./data/uploads` | Répertoire de stockage des archives chiffrées |
| `MAX_FILE_SIZE_BYTES` | `2147483648` (2 Go) | Taille maximale par transfert |
| `ALLOWED_ORIGIN` | `*` | Origine CORS autorisée — **restreindre en production** |

Fichier `.env` exemple :
```env
PORT=3001
STORAGE_DIR=/var/lib/mla-share/uploads
MAX_FILE_SIZE_BYTES=104857600
ALLOWED_ORIGIN=https://votre-domaine.example.com
```

### Variables d'environnement — frontend

| Variable | Défaut | Description |
|---|---|---|
| `PUBLIC_API_URL` | `http://localhost:3001` | URL du serveur backend |

Fichier `mla-transfert-web/.env` :
```env
PUBLIC_API_URL=https://votre-domaine.example.com
```

### Docker

```bash
# Build de l'image
docker build -t mla-transfert-server ./mla-transfert-server

# Lancement
docker run -d \
  -p 3001:3001 \
  -v /var/lib/mla-share:/data \
  -e STORAGE_DIR=/data/uploads \
  -e ALLOWED_ORIGIN=https://votre-domaine.example.com \
  mla-transfert-server
```

L'image est multi-stage, l'utilisateur est non-root, un healthcheck est inclus.

### Lancement local (développement)

```bash
# Serveur (port 3001)
cd mla-transfert-server && cargo run

# Frontend (port 4321, terminal séparé)
cd mla-transfert-web && npm run dev
```

---

## Cloudflare (instance publique)

L'instance publique utilise Cloudflare Pages (frontend) + Cloudflare Worker (API).

### Ressources Cloudflare requises

| Ressource | Nom | Usage |
|---|---|---|
| R2 Bucket | `mla-transfers` | Stockage des archives chiffrées |
| KV Namespace | `TRANSFERS_KV` | Métadonnées + TTL |
| Durable Objects | `SignalRoom` | Signaling WebRTC (Workers Paid requis) |
| Pages Project | `mla-transfert-web` | Frontend Astro |

### Secrets GitHub Actions (CI/CD)

| Secret | Usage |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Déploiement via wrangler |
| `CLOUDFLARE_ACCOUNT_ID` | Identifiant du compte Cloudflare |

Ces secrets sont configurés dans **Settings → Secrets → Actions** du dépôt GitHub.
Ne jamais les commiter dans le code.

### Déploiement manuel

```bash
# Frontend
cd mla-transfert-web
npx wrangler pages deploy dist --project-name mla-transfert-web

# Worker (nécessite wrangler.toml configuré localement — non commité)
npx wrangler deploy
```

---

## CI/CD

La pipeline de sécurité est implémentée avec Dagger (SDK Python).

Pour les détails des étapes (fmt, clippy, tests, audit CVE, build WASM, build web) :
→ **[`ci/README.md`](../ci/README.md)**

Déclenchement automatique sur chaque push vers `main` via GitHub Actions
(`.github/workflows/`).

---

## Domaine et routes

| URL | Service |
|---|---|
| `https://mla-share.kodetis.cloud` | Cloudflare Pages (frontend) |
| `https://mla-share.kodetis.cloud/api/*` | Cloudflare Worker (prioritaire sur Pages) |
| `https://mla-share.kodetis.cloud/receive/:id` | Pages (page de réception) |
