use crate::{error::AppError, institutions::Registry, validate};
use axum::{extract::State, Json};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;

#[derive(Deserialize)]
pub struct ValidateRequest {
    pdf_base64: String,
    institution: String,
}

pub async fn handler(
    State(registry): State<Registry>,
    Json(req): Json<ValidateRequest>,
) -> Result<Json<validate::ValidationResult>, AppError> {
    let institution = registry
        .get(&req.institution)
        .ok_or_else(|| AppError::InstitutionNotFound(req.institution.clone()))?;

    let pdf_bytes = STANDARD
        .decode(&req.pdf_base64)
        .map_err(|e| AppError::Compilation(format!("Invalid base64: {}", e)))?;

    let result = validate::validate(&pdf_bytes, &institution.spec).await?;
    Ok(Json(result))
}
