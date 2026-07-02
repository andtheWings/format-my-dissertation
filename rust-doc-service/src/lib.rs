pub mod compile;
pub mod config;
mod error;
pub mod extract;
pub mod institutions;
pub mod routes;
pub mod validate;

use std::net::SocketAddr;
use tower_http::cors::CorsLayer;

pub async fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "doc_service=info,tower_http=info".into()),
        )
        .init();

    let app_config = config::load();
    let institutions = institutions::Registry::load(&app_config.institutions_path)
        .await
        .expect("Failed to load institutions");

    let app = routes::router()
        .with_state(institutions)
        .layer(CorsLayer::permissive());

    let addr = SocketAddr::from(([0, 0, 0, 0], app_config.port));
    tracing::info!("Listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
