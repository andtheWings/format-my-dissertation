use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Serialize)]
pub struct Institution {
    pub id: String,
    pub name: String,
    pub spec: serde_yaml::Value,
    pub template_dir: PathBuf,
    pub llm_config: Option<serde_yaml::Value>,
    pub ui_config: Option<serde_yaml::Value>,
}

#[derive(Clone, Debug)]
pub struct Registry {
    institutions: HashMap<String, Institution>,
}

impl Registry {
    pub async fn load(base_path: &Path) -> Result<Self, Box<dyn std::error::Error>> {
        let mut institutions = HashMap::new();
        let mut entries = tokio::fs::read_dir(base_path).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let id = entry.file_name().to_string_lossy().to_string();
            let spec_path = path.join("spec.yaml");
            let template_dir = path.join("template");
            let llm_path = path.join("llm.yaml");
            let ui_path = path.join("ui.yaml");

            if !spec_path.exists() || !template_dir.exists() {
                continue;
            }

            let spec_content = tokio::fs::read_to_string(&spec_path).await?;
            let spec: serde_yaml::Value = serde_yaml::from_str(&spec_content)?;
            let name = spec
                .get("institution")
                .and_then(|v| v.as_str())
                .unwrap_or(&id)
                .to_string();

            let llm_config = if llm_path.exists() {
                let content = tokio::fs::read_to_string(&llm_path).await?;
                Some(serde_yaml::from_str(&content)?)
            } else {
                None
            };

            let ui_config = if ui_path.exists() {
                let content = tokio::fs::read_to_string(&ui_path).await?;
                Some(serde_yaml::from_str(&content)?)
            } else {
                None
            };

            institutions.insert(
                id.clone(),
                Institution {
                    id,
                    name,
                    spec,
                    template_dir,
                    llm_config,
                    ui_config,
                },
            );
        }
        Ok(Registry { institutions })
    }

    pub fn get(&self, id: &str) -> Option<&Institution> {
        self.institutions.get(id)
    }

    pub fn list(&self) -> Vec<&Institution> {
        self.institutions.values().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[tokio::test]
    async fn test_load_institutions() {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let path = manifest.parent().unwrap().join("institutions");
        let registry = Registry::load(&path).await.unwrap();
        assert!(!registry.institutions.is_empty());

        let iu = registry.get("iu").unwrap();
        assert_eq!(iu.name, "Indiana University");
        assert!(iu.spec.get("institution").is_some());
        assert!(iu.template_dir.join("template.typ").exists());
    }

    #[tokio::test]
    async fn test_get_missing_institution() {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let path = manifest.parent().unwrap().join("institutions");
        let registry = Registry::load(&path).await.unwrap();
        assert!(registry.get("nonexistent").is_none());
    }
}
