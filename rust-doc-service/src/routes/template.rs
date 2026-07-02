use crate::{error::AppError, institutions::Registry};
use axum::{
    extract::{Path, State},
    Json,
};
use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize)]
pub struct TemplateFile {
    pub path: String,
    pub content: String,
}

#[derive(Serialize)]
pub struct TemplateResponse {
    pub files: Vec<TemplateFile>,
    pub entry: String,
}

async fn read_dir_recursive(
    base: &PathBuf,
    rel: &str,
    files: &mut Vec<TemplateFile>,
) -> Result<(), std::io::Error> {
    let mut entries = tokio::fs::read_dir(base).await?;
    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        let rel_path = if rel.is_empty() {
            entry.file_name().to_string_lossy().to_string()
        } else {
            format!("{}/{}", rel, entry.file_name().to_string_lossy())
        };
        if path.is_dir() {
            Box::pin(read_dir_recursive(&path, &rel_path, files)).await?;
        } else if path.extension().map(|e| e == "typ").unwrap_or(false) {
            let content = tokio::fs::read_to_string(&path).await?;
            files.push(TemplateFile {
                path: rel_path,
                content,
            });
        }
    }
    Ok(())
}

pub async fn handler(
    State(registry): State<Registry>,
    Path(id): Path<String>,
) -> Result<Json<TemplateResponse>, AppError> {
    let institution = registry
        .get(&id)
        .ok_or_else(|| AppError::InstitutionNotFound(id.clone()))?;

    let mut files = Vec::new();
    read_dir_recursive(&institution.template_dir, "", &mut files)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to read template: {}", e)))?;

    Ok(Json(TemplateResponse {
        files,
        entry: "template.typ".to_string(),
    }))
}
