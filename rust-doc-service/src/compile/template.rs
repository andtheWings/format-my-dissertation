use crate::institutions::Institution;

pub fn load_template(institution: &Institution) -> std::io::Result<String> {
    let template_path = institution.template_dir.join("template.typ");
    std::fs::read_to_string(template_path)
}

pub fn render_template(
    code: &str,
    variables: &serde_json::Map<String, serde_json::Value>,
) -> String {
    let mut result = code.to_string();
    for (key, value) in variables {
        let placeholder = format!("{{{}}}", key.to_uppercase());
        let val = match value {
            serde_json::Value::String(s) => s.clone(),
            _ => value.to_string(),
        };
        result = result.replace(&placeholder, &val);
    }
    result
}
