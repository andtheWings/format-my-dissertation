pub mod template;

use crate::error::AppError;

pub async fn compile(typst_code: &str) -> Result<Vec<u8>, AppError> {
    let mut child = tokio::process::Command::new("typst")
        .arg("compile")
        .arg("--format")
        .arg("pdf")
        .arg("-")
        .arg("-")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Compilation(format!("Failed to spawn typst: {}", e)))?;

    use tokio::io::AsyncWriteExt;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(typst_code.as_bytes())
            .await
            .map_err(|e| AppError::Compilation(format!("Failed to write to stdin: {}", e)))?;
        stdin.shutdown().await.ok();
    }

    let output = child
        .wait_with_output()
        .await
        .map_err(|e| AppError::Compilation(format!("Failed to wait for typst: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Compilation(stderr.to_string()));
    }

    Ok(output.stdout)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_compile_simple_document() {
        let code = r#"
#set text(font: "Times New Roman", size: 12pt)
Hello, world!
"#;
        let result = compile(code).await;
        assert!(result.is_ok(), "compile failed: {:?}", result.err());
        let pdf = result.unwrap();
        assert!(
            pdf.starts_with(b"%PDF"),
            "Output doesn't start with PDF header"
        );
    }

    #[tokio::test]
    async fn test_compile_syntax_error() {
        let code = r#"
#this is not valid typst
"#;
        let result = compile(code).await;
        assert!(result.is_err());
        match result {
            Err(AppError::Compilation(msg)) => assert!(!msg.is_empty()),
            _ => panic!("Expected Compilation error"),
        }
    }
}
