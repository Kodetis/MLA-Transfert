// mla-transfert-worker/src/message.rs
// POST /api/message  — stocke un blob chiffré dans KV avec TTL
// GET  /api/message/:id — récupère le blob (clé absente si expiré → 410)
//
// KV key format : `msg:{uuid}` (préfixe pour isoler du namespace fichiers)
// La clé AES n'est JAMAIS stockée — elle est dans le fragment URL ou dérivée du mot de passe côté client.

use serde::{Deserialize, Serialize};
use worker::{Request, Response, Result, RouteContext};

use crate::cors::add_cors;
use crate::error::json_err;

/// Structure stockée en KV sous `msg:{uuid}`.
#[derive(Serialize, Deserialize)]
struct MessageBlob {
    ciphertext: String,      // base64url — ciphertext AES-256-GCM + tag 16B
    iv: String,              // base64url — nonce 12 bytes
    salt: Option<String>,    // base64url — Argon2id salt 16 bytes (uniquement si has_password=true)
    has_password: bool,
}

/// Body JSON attendu par POST /api/message.
#[derive(Deserialize)]
struct PostBody {
    ciphertext: String,
    iv: String,
    salt: Option<String>,
    has_password: bool,
    ttl_hours: u64,
}

/// POST /api/message
/// Body : JSON PostBody
/// Réponse : { "id": "<uuid>" }
pub async fn post(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let body: PostBody = req
        .json()
        .await
        .map_err(|_| worker::Error::RustError("invalid JSON body".to_string()))?;

    let ttl_hours: u64 = match body.ttl_hours {
        1 => 1,
        24 => 24,
        _ => 7, // défaut
    };

    if body.ciphertext.is_empty() || body.iv.is_empty() {
        return json_err(400, "ciphertext and iv are required");
    }
    if body.has_password && body.salt.is_none() {
        return json_err(400, "salt is required when has_password is true");
    }

    let id = uuid::Uuid::new_v4().to_string();
    let kv_key = format!("msg:{id}");

    let blob = MessageBlob {
        ciphertext: body.ciphertext,
        iv: body.iv,
        salt: body.salt,
        has_password: body.has_password,
    };

    let kv = ctx.env.kv("TRANSFERS_KV")?;
    kv.put(&kv_key, serde_json::to_string(&blob).map_err(|e| worker::Error::RustError(e.to_string()))?)?
        .expiration_ttl(ttl_hours * 3600)
        .execute()
        .await?;

    let res = Response::from_json(&serde_json::json!({ "id": id }))?;
    add_cors(res, &ctx.env)
}

/// GET /api/message/:id
/// Réponse : MessageBlob JSON
/// 410 si expiré ou introuvable
pub async fn get(_req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let id = match ctx.param("id") {
        Some(id) => id.to_string(),
        None => return json_err(400, "missing id"),
    };

    let kv_key = format!("msg:{id}");
    let kv = ctx.env.kv("TRANSFERS_KV")?;

    let raw = match kv.get(&kv_key).text().await? {
        Some(v) => v,
        None => return json_err(410, "message expired or not found"),
    };

    let blob: MessageBlob = serde_json::from_str(&raw)
        .map_err(|e| worker::Error::RustError(e.to_string()))?;

    let res = Response::from_json(&blob)?;
    add_cors(res, &ctx.env)
}
