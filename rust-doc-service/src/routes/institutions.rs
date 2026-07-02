use crate::institutions::Registry;
use axum::extract::State;
use axum::Json;
use serde::Serialize;

#[derive(Serialize)]
pub struct InstitutionSummary {
    pub id: String,
    pub name: String,
    pub ui_config: Option<serde_yaml::Value>,
}

pub async fn handler(State(registry): State<Registry>) -> Json<Vec<InstitutionSummary>> {
    let institutions = registry
        .list()
        .into_iter()
        .map(|inst| InstitutionSummary {
            id: inst.id.clone(),
            name: inst.name.clone(),
            ui_config: inst.ui_config.clone(),
        })
        .collect();
    Json(institutions)
}
