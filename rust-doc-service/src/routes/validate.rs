use crate::{error::AppError, institutions::Registry, validate};
use axum::{extract::State, Json};
use serde::Deserialize;

#[derive(Deserialize)]
pub struct ValidateRequest {
    pdf_bytes: Vec<u8>,
    institution: String,
}

pub async fn handler(
    State(registry): State<Registry>,
    Json(req): Json<ValidateRequest>,
) -> Result<Json<validate::ValidationResult>, AppError> {
    let institution = registry
        .get(&req.institution)
        .ok_or_else(|| AppError::InstitutionNotFound(req.institution.clone()))?;

    let result = validate::validate(&req.pdf_bytes, &institution.spec).await?;
    Ok(Json(result))
}
