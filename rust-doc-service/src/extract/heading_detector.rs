use crate::extract::document::{Heading, HeadingDetectionConfig, ParsedParagraph};
use regex::Regex;

pub fn detect_headings(
    paragraphs: &mut [ParsedParagraph],
    config: &HeadingDetectionConfig,
) -> Vec<Heading> {
    let chapter_re =
        Regex::new(r"(?i)^(?:(?:Chapter|CHAPTER)\s+)?\d+[:\s]|^(?:Introduction|Conclusion)\b")
            .unwrap();
    let section_re = Regex::new(r"^\d+\.\d+").unwrap();
    let sub_re = Regex::new(r"^\d+\.\d+\.\d+").unwrap();

    let body_size = median_font_size(paragraphs);

    let mut headings = Vec::new();
    let mut char_pos = 0usize;

    for para in paragraphs.iter_mut() {
        let text = &para.text;
        let score = compute_score(para, &body_size, config);

        para.is_heading = score >= config.threshold;
        if para.is_heading {
            let level = assign_level(
                text,
                para.is_all_caps,
                para.font_size,
                &body_size,
                &chapter_re,
                &section_re,
                &sub_re,
            );
            para.heading_level = Some(level);
            headings.push(Heading {
                text: text.clone(),
                level,
                page_number: para.page_number,
                raw_text_position: char_pos,
            });
        }
        char_pos += text.len() + 2;
    }
    headings
}

fn compute_score(
    para: &ParsedParagraph,
    body_size: &Option<f32>,
    config: &HeadingDetectionConfig,
) -> f64 {
    let sig = &config.signals;
    let mut score = 0.0;
    if para.is_all_caps {
        score += sig.caps;
    }
    if para.is_underline {
        score += sig.underline;
    }
    if para.is_bold {
        score += sig.bold;
    }
    if let (Some(b), Some(s)) = (body_size, para.font_size) {
        if s - b >= config.size_jump_threshold {
            score += sig.size_jump;
        }
    }
    if has_numbering(&para.text) {
        score += sig.numbering;
    }
    if is_context_keyword(&para.text, &config.context_keywords) {
        score += sig.context;
    }
    score
}

fn has_numbering(text: &str) -> bool {
    let trimmed = text.trim();
    Regex::new(r"^(?:Chapter\s+)?\d+[\.:]\s|^\d+\.\d+\s|^[IVX]+\.\s|^[A-Z]\.\s")
        .unwrap()
        .is_match(trimmed)
}

fn is_context_keyword(text: &str, keywords: &[String]) -> bool {
    let upper = text.trim().to_uppercase();
    keywords
        .iter()
        .any(|kw| upper.starts_with(&kw.to_uppercase()))
}

fn assign_level(
    text: &str,
    is_all_caps: bool,
    font_size: Option<f32>,
    body_size: &Option<f32>,
    chapter_re: &Regex,
    section_re: &Regex,
    sub_re: &Regex,
) -> u32 {
    if sub_re.is_match(text) {
        return 3;
    }
    if section_re.is_match(text) {
        return 2;
    }
    if chapter_re.is_match(text) {
        return 1;
    }
    if is_all_caps {
        return 1;
    }
    if let (Some(b), Some(fs)) = (body_size, font_size) {
        if fs - b >= 4.0 {
            return 1;
        }
        if fs - b >= 2.0 {
            return 2;
        }
    }
    2
}

fn median_font_size(paragraphs: &[ParsedParagraph]) -> Option<f32> {
    let mut sizes: Vec<f32> = paragraphs
        .iter()
        .filter_map(|p| p.font_size)
        .filter(|&s| s > 0.0)
        .collect();
    if sizes.is_empty() {
        return None;
    }
    sizes.sort_by(|a, b| a.partial_cmp(b).unwrap());
    Some(sizes[sizes.len() / 2])
}
