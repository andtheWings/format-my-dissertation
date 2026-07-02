use crate::{compile, error::AppError, institutions::Registry};
use axum::{
    extract::{Query, State},
    Json,
};
use serde::Deserialize;

#[derive(Deserialize)]
pub struct CompileParams {
    institution: String,
}

#[derive(Deserialize)]
pub struct CompileRequest {
    typst_code: String,
    variables: Option<serde_json::Map<String, serde_json::Value>>,
}

pub async fn handler(
    State(registry): State<Registry>,
    Query(params): Query<CompileParams>,
    Json(req): Json<CompileRequest>,
) -> Result<Vec<u8>, AppError> {
    let _institution = registry
        .get(&params.institution)
        .ok_or_else(|| AppError::InstitutionNotFound(params.institution.clone()))?;

    let code = if let Some(vars) = &req.variables {
        compile::template::render_template(&req.typst_code, vars)
    } else {
        req.typst_code.clone()
    };

    let pdf = compile::compile(&code).await?;
    Ok(pdf)
}
