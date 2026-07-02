use crate::{error::AppError, institutions::Registry};
use axum::{
    extract::{Path, State},
    Json,
};
use serde::Serialize;

#[derive(Serialize)]
pub struct SpecSummary {
    pub institution: String,
    pub document_structure: serde_yaml::Value,
    pub constants: serde_yaml::Value,
    pub check_count: CheckCount,
}

#[derive(Serialize)]
pub struct CheckCount {
    pub automated: usize,
    pub human: usize,
}

#[derive(Serialize)]
pub struct SpecResponse {
    pub raw: serde_yaml::Value,
    pub summary: SpecSummary,
}

pub async fn handler(
    State(registry): State<Registry>,
    Path(id): Path<String>,
) -> Result<Json<SpecResponse>, AppError> {
    let institution = registry
        .get(&id)
        .ok_or_else(|| AppError::InstitutionNotFound(id.clone()))?;

    let checks = institution
        .spec
        .get("checks")
        .and_then(|c| c.as_sequence());

    let (automated, human) = if let Some(checks) = checks {
        let automated = checks
            .iter()
            .filter(|c| {
                c.get("category")
                    .and_then(|v| v.as_str())
                    .map(|cat| cat != "human")
                    .unwrap_or(true)
            })
            .count();
        let human = checks.len() - automated;
        (automated, human)
    } else {
        (0, 0)
    };

    let summary = SpecSummary {
        institution: institution.name.clone(),
        document_structure: institution
            .spec
            .get("document_structure")
            .cloned()
            .unwrap_or(serde_yaml::Value::Null),
        constants: institution
            .spec
            .get("constants")
            .cloned()
            .unwrap_or(serde_yaml::Value::Null),
        check_count: CheckCount { automated, human },
    };

    Ok(Json(SpecResponse {
        raw: institution.spec.clone(),
        summary,
    }))
}
