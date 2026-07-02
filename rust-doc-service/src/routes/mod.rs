mod compile;
mod extract;
mod institutions;
mod validate;

use crate::institutions::Registry;
use axum::{
    routing::{get, post},
    Router,
};

pub fn router() -> Router<Registry> {
    Router::new()
        .route("/extract", post(extract::handler))
        .route("/compile", post(compile::handler))
        .route("/validate", post(validate::handler))
        .route("/health", get(|| async { "ok" }))
        .route("/institutions", get(institutions::handler))
}
