use crate::error::AppError;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub violations: Vec<Violation>,
    pub pass_count: u32,
    pub fail_count: u32,
    pub error_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Violation {
    pub check_id: String,
    pub status: String,
    pub detail: String,
    pub page: Option<usize>,
}

pub async fn validate(
    pdf_bytes: &[u8],
    spec: &serde_yaml::Value,
) -> Result<ValidationResult, AppError> {
    let tmp_dir = std::env::temp_dir().join(format!("diss-check-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&tmp_dir)
        .map_err(|e| AppError::Validation(format!("Failed to create temp dir: {}", e)))?;

    let pdf_path = tmp_dir.join("document.pdf");
    std::fs::write(&pdf_path, pdf_bytes)
        .map_err(|e| AppError::Validation(format!("Failed to write temp PDF: {}", e)))?;

    let spec_path = tmp_dir.join("spec.yaml");
    let spec_yaml = serde_yaml::to_string(spec)
        .map_err(|e| AppError::Validation(format!("Failed to serialize spec: {}", e)))?;
    std::fs::write(&spec_path, &spec_yaml)
        .map_err(|e| AppError::Validation(format!("Failed to write temp spec: {}", e)))?;

    let output = tokio::process::Command::new("cargo")
        .args([
            "run",
            "--release",
            "--",
            "check",
            "--spec",
            &spec_path.to_string_lossy(),
            "--json",
            &pdf_path.to_string_lossy(),
        ])
        .current_dir("../../diss-check")
        .output()
        .await
        .map_err(|e| AppError::Validation(format!("Failed to run diss-check: {}", e)))?;

    let _ = std::fs::remove_dir_all(&tmp_dir);

    let exit_code = output.status.code().unwrap_or(-1);
    if exit_code == 2 {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Validation(format!(
            "diss-check failed: {}",
            stderr
        )));
    }

    let parsed: Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| AppError::Validation(format!("Failed to parse diss-check output: {}", e)))?;

    let violations: Vec<Violation> = parsed["results"]
        .as_array()
        .map(|results| {
            results
                .iter()
                .map(|r| {
                    let page = r["evidence"]
                        .as_array()
                        .and_then(|e| e.first())
                        .and_then(|ev| ev["page"].as_u64())
                        .map(|p| p as usize);

                    Violation {
                        check_id: r["check_id"].as_str().unwrap_or("unknown").to_string(),
                        status: r["status"].as_str().unwrap_or("ERROR").to_string(),
                        detail: r["detail"].as_str().unwrap_or("").to_string(),
                        page,
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    let pass_count = violations.iter().filter(|v| v.status == "PASS").count() as u32;
    let fail_count = violations.iter().filter(|v| v.status == "FAIL").count() as u32;
    let error_count = violations.iter().filter(|v| v.status == "ERROR").count() as u32;

    Ok(ValidationResult {
        violations,
        pass_count,
        fail_count,
        error_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_validate_returns_result() {
        let pdf_bytes = include_bytes!("../../../fixtures/test-dissertation.pdf");
        let spec_yaml: serde_yaml::Value = serde_yaml::from_str(
            r#"
institution: Indiana University
source_revision: September 2025
document_structure:
  front_matter:
    - id: title_page
      required: true
    - id: abstract
      required: true
    - id: toc
      required: true
  body:
    - id: chapters
      required: true
  end_matter:
    - id: references
      required: true
    - id: curriculum_vitae
      required: true
checks:
  - id: global_margins
    category: layout
    checker: margins
    target:
      scope: all_pages
    params:
      top: 1in
      bottom: 1in
      left: 1.25in
      right: 1.25in
  - id: font_family_consistent
    category: typography
    checker: font_family
    target:
      scope: all_pages
    params:
      consistent: true
  - id: front_matter_presence
    category: structure
    checker: section_presence
    target:
      scope: front_matter
    params:
      required_sections:
        - id: title_page
        - id: abstract
        - id: toc
constants:
  degree: Doctor of Philosophy
"#,
        )
        .unwrap();

        let result = validate(pdf_bytes, &spec_yaml).await;
        assert!(result.is_ok(), "validate failed: {:?}", result.err());
        let vr = result.unwrap();
        assert!(
            vr.pass_count + vr.fail_count + vr.error_count > 0,
            "Expected at least one check result"
        );
    }
}
