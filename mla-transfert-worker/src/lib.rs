use worker::*;

mod cors;
mod download;
mod error;
mod info;
mod message;
mod signal;
mod upload;

pub use signal::SignalRoom;

#[event(fetch)]
pub async fn main(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    if req.method() == Method::Options {
        return cors::cors_preflight(&env);
    }

    Router::new()
        .get("/api/health", |_, _| Response::ok("ok"))
        .post_async("/api/upload", upload::handle)
        .get_async("/api/download/:id", download::handle)
        .get_async("/api/info/:id", info::handle)
        .get_async("/api/signal/:room", signal::handle)
        .post_async("/api/message", message::post)
        .get_async("/api/message/:id", message::get)
        .run(req, env)
        .await
}
