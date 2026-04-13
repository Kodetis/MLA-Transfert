# Référence technique — MLA-Share

Ce document couvre les détails techniques de la couche MLA-Share (WASM, API).
Pour la spécification complète du format MLA (crypto, format d'archive, format des clés),
voir la documentation ANSSI dans [`doc/src/`](src/CRYPTO.md).

---

## Cryptographie

MLA-Share repose sur le format MLA développé par l'ANSSI, audité par Synacktiv
en janvier 2026. Il utilise une cryptographie hybride post-quantique.

| Fonction | Classique | Post-quantique | Standard |
|---|---|---|---|
| Échange de clés | X25519 (ECDH) | ML-KEM 1024 | FIPS 203 (CRYSTALS-Kyber) |
| Signature | Ed25519 | ML-DSA 87 | FIPS 204 (CRYSTALS-Dilithium) |
| Chiffrement symétrique | AES-256-GCM | — | 128 bits sécurité PQ |
| KDF (mode mot de passe) | Argon2id (t=3, m=64 MiB, p=4) | — | résistant PQ |

**Hybridation :** MLA combine algorithmes classiques ET post-quantiques. Si l'un est
compromis, l'autre maintient la sécurité (recommandation ANSSI / NIST).

Pour les détails de construction cryptographique : [`doc/src/CRYPTO.md`](src/CRYPTO.md)
Pour le format des clés `.mlapriv` / `.mlapub` : [`doc/src/KEY_FORMAT.md`](src/KEY_FORMAT.md)

---

## Couche WASM (`mla-wasm`)

`mla-wasm` expose la bibliothèque MLA au navigateur via WebAssembly (wasm-bindgen).

### API publique

```typescript
// Génération de paire de clés
function generate_keypair(): MlaKeypair

interface MlaKeypair {
  private_key: Uint8Array   // .mlapriv
  public_key:  Uint8Array   // .mlapub
}

// Mode mot de passe
function encrypt_with_password(
  file_names:    string[],
  file_contents: Uint8Array[],
  password:      string
): Uint8Array  // archive MLA chiffrée

function decrypt_with_password(
  archive:  Uint8Array,
  password: string
): DecryptedFile[]

// Mode clés MLA
function encrypt_with_keys(
  file_names:          string[],
  file_contents:       Uint8Array[],
  sender_private_key:  Uint8Array,  // .mlapriv expéditeur
  recipient_public_key: Uint8Array  // .mlapub destinataire
): Uint8Array

function decrypt_with_keys(
  archive:              Uint8Array,
  recipient_private_key: Uint8Array,  // .mlapriv destinataire
  sender_public_key:     Uint8Array   // .mlapub expéditeur
): DecryptedFile[]

interface DecryptedFile {
  name:    string
  content: Uint8Array
}
```

### Chargement

```typescript
import init, { encrypt_with_password, decrypt_with_password,
                encrypt_with_keys, decrypt_with_keys,
                generate_keypair } from '/mla_wasm.js';

await init('/mla_wasm_bg.wasm');
```

Le binaire WASM est servi depuis `public/` et reconstruit en CI à chaque build
(jamais commité dans le dépôt).

---

## API serveur

L'API est exposée par `mla-transfert-server` (Axum) ou `mla-transfert-worker`
(Cloudflare Worker) selon le mode de déploiement. Les deux implémentent le même contrat.

### Endpoints

| Méthode | Chemin | Description |
|---|---|---|
| `GET` | `/api/health` | Health check — répond `200 OK` |
| `POST` | `/api/upload` | Upload d'une archive MLA chiffrée |
| `GET` | `/api/download/:id` | Téléchargement d'une archive par identifiant |
| `GET` | `/api/info/:id` | Métadonnées d'un transfert |
| `GET` | `/api/signal/:room` | WebSocket de signaling WebRTC |

### POST /api/upload

**Content-Type:** `multipart/form-data`

| Champ | Type | Description |
|---|---|---|
| `file` | binaire | Archive MLA chiffrée |
| `expires_hours` | entier | Durée de vie : `1`, `24` ou `168` |

**Réponse 200 :**
```json
{ "id": "abc123xyz" }
```

**Limites :** 100 Mo par défaut sur l'instance publique (configurable via `MAX_FILE_SIZE_BYTES`).

### GET /api/info/:id

**Réponse 200 :**
```json
{
  "id": "abc123xyz",
  "size": 4096,
  "expires_at": "2026-04-14T10:00:00Z",
  "filename": "archive.mla"
}
```

**Réponse 404 :** transfert expiré ou inexistant.

---

## Sécurité applicative

| Mesure | Implémentation |
|---|---|
| Rate limiting | `tower_governor` — 20 req/s, burst 40, par IP socket (non-spoofable) |
| CORS | `ALLOWED_ORIGIN` env var — `AllowOrigin::exact()` |
| Headers HTTP | CSP, X-Frame-Options DENY, X-Content-Type-Options, HSTS — `src/middleware.ts` |
| Filename sanitisation | `sanitize_filename()` dans `relay.rs` — alphanum + `.`, `-`, `_`, max 255 bytes |
| Erreurs WASM | Messages génériques uniquement (`"Decryption failed"`) — pas de fuite d'information |
| Mot de passe | Générateur CSPRNG avec rejection sampling (pas de biais de modulo) |
```
