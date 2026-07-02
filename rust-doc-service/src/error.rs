use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
#[allow(dead_code)]
pub enum AppError {
    #[error("Extraction failed: {0}")]
    Extraction(String),
    #[error("Compilation failed: {0}")]
    Compilation(String),
    #[error("Validation failed: {0}")]
    Validation(String),
    #[error("Institution not found: {0}")]
    InstitutionNotFound(String),
    #[error("Internal error: {0}")]
    Internal(String),
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Internal(e.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::Internal(e.to_string())
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::Extraction(ref msg) => {
                tracing::error!(error = %msg, "Extraction failed");
                (StatusCode::INTERNAL_SERVER_ERROR, self.to_string())
            }
            AppError::Compilation(ref msg) => {
                tracing::error!(error = %msg, "Compilation failed");
                (StatusCode::INTERNAL_SERVER_ERROR, self.to_string())
            }
            AppError::Validation(ref msg) => {
                tracing::error!(error = %msg, "Validation failed");
                (StatusCode::INTERNAL_SERVER_ERROR, self.to_string())
            }
            AppError::InstitutionNotFound(ref id) => {
                tracing::error!(institution = %id, "Institution not found");
                (StatusCode::NOT_FOUND, self.to_string())
            }
            AppError::Internal(ref msg) => {
                tracing::error!(error = %msg, "Internal error");
                (StatusCode::INTERNAL_SERVER_ERROR, self.to_string())
            }
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}
