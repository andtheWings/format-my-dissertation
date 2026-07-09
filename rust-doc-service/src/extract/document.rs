use serde::{Deserialize, Serialize};

// --- Parsed document IR (internal) ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedDocument {
    pub raw_text: String,
    pub pages: Vec<ParsedPage>,
    pub paragraphs: Vec<ParsedParagraph>,
    pub headings: Vec<Heading>,
    pub metadata: ParsedMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedPage {
    pub number: u32,
    pub text: String,
    pub width: Option<f32>,
    pub height: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedParagraph {
    pub text: String,
    pub page_number: Option<u32>,
    pub is_bold: bool,
    pub is_italic: bool,
    pub is_underline: bool,
    pub is_all_caps: bool,
    pub is_heading: bool,
    pub heading_level: Option<u32>,
    pub font_size: Option<f32>,
    pub font_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Heading {
    pub text: String,
    pub level: u32,
    pub page_number: Option<u32>,
    pub raw_text_position: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedMetadata {
    pub title: Option<String>,
    pub author: Option<String>,
    pub page_count: u32,
    pub page_count_estimated: bool,
    pub detected_fonts: Vec<String>,
}

// --- Heading detection config ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeadingDetectionConfig {
    #[serde(default = "default_threshold")]
    pub threshold: f64,
    #[serde(default)]
    pub signals: SignalWeights,
    #[serde(default = "default_context_keywords")]
    pub context_keywords: Vec<String>,
    #[serde(default = "default_size_jump_threshold")]
    pub size_jump_threshold: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignalWeights {
    #[serde(default = "default_caps_weight")]
    pub caps: f64,
    #[serde(default = "default_underline_weight")]
    pub underline: f64,
    #[serde(default = "default_bold_weight")]
    pub bold: f64,
    #[serde(default = "default_size_jump_weight")]
    pub size_jump: f64,
    #[serde(default = "default_numbering_weight")]
    pub numbering: f64,
    #[serde(default = "default_context_weight")]
    pub context: f64,
}

fn default_threshold() -> f64 {
    0.5
}
fn default_caps_weight() -> f64 {
    0.35
}
fn default_underline_weight() -> f64 {
    0.35
}
fn default_bold_weight() -> f64 {
    0.15
}
fn default_size_jump_weight() -> f64 {
    0.0
}
fn default_numbering_weight() -> f64 {
    0.10
}
fn default_context_weight() -> f64 {
    0.05
}
fn default_size_jump_threshold() -> f32 {
    2.0
}
fn default_context_keywords() -> Vec<String> {
    vec![
        "Introduction".into(),
        "Abstract".into(),
        "References".into(),
        "Bibliography".into(),
        "Acknowledgements".into(),
        "Dedication".into(),
        "Preface".into(),
        "Table of Contents".into(),
        "List of Tables".into(),
        "List of Figures".into(),
        "Appendices".into(),
        "Curriculum Vitae".into(),
        "Conclusion".into(),
        "Methodology".into(),
        "Results".into(),
        "Discussion".into(),
    ]
}

impl Default for HeadingDetectionConfig {
    fn default() -> Self {
        Self {
            threshold: default_threshold(),
            signals: SignalWeights::default(),
            context_keywords: default_context_keywords(),
            size_jump_threshold: default_size_jump_threshold(),
        }
    }
}

impl Default for SignalWeights {
    fn default() -> Self {
        Self {
            caps: default_caps_weight(),
            underline: default_underline_weight(),
            bold: default_bold_weight(),
            size_jump: default_size_jump_weight(),
            numbering: default_numbering_weight(),
            context: default_context_weight(),
        }
    }
}

// --- Frontend-facing Document ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    pub content: DocumentContent,
    pub structure: DocumentStructure,
    pub metadata: DocumentMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentContent {
    pub pages: Vec<Page>,
    pub raw_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Page {
    pub number: u32,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentStructure {
    pub headings: Vec<HeadingRef>,
    pub front_matter: Vec<SectionRef>,
    pub body: Vec<SectionRef>,
    pub end_matter: Vec<SectionRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeadingRef {
    pub text: String,
    pub level: u32,
    pub page_number: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SectionRef {
    pub id: String,
    pub title: Option<String>,
    pub page_start: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentMetadata {
    pub title: Option<String>,
    pub author: Option<String>,
    pub page_count: u32,
    pub page_count_estimated: bool,
    pub detected_fonts: Vec<String>,
}
