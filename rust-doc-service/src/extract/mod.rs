pub mod chunker;
pub mod document;
pub mod docx_parser;
pub mod heading_detector;
pub mod pdf_parser;

use crate::error::AppError;
use document::{
    Document, DocumentContent, DocumentMetadata, DocumentStructure, HeadingDetectionConfig,
    HeadingRef, Page, ParsedDocument, SectionRef,
};

pub async fn extract(file_bytes: &[u8], mime_type: &str) -> Result<Document, AppError> {
    let mut parsed = match mime_type {
        "application/pdf" => pdf_parser::parse_pdf(file_bytes),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        | "application/vnd.openxmlformats-officedocument.wordprocessingml.template" => {
            docx_parser::parse_docx(file_bytes)
        }
        other => {
            return Err(AppError::Extraction(format!(
                "Unsupported format: {}",
                other
            )));
        }
    }?;

    let config = HeadingDetectionConfig::default();
    let headings = heading_detector::detect_headings(&mut parsed.paragraphs, &config);
    parsed.headings = headings;

    Ok(convert_to_document(parsed))
}

fn convert_to_document(parsed: ParsedDocument) -> Document {
    let headings: Vec<HeadingRef> = parsed
        .headings
        .iter()
        .map(|h| HeadingRef {
            text: h.text.clone(),
            level: h.level,
            page_number: h.page_number,
        })
        .collect();

    let mut doc = Document {
        content: DocumentContent {
            pages: parsed
                .pages
                .iter()
                .map(|p| Page {
                    number: p.number,
                    text: p.text.clone(),
                })
                .collect(),
            raw_text: parsed.raw_text.clone(),
        },
        structure: DocumentStructure {
            headings,
            front_matter: vec![],
            body: vec![],
            end_matter: vec![],
        },
        metadata: DocumentMetadata {
            title: parsed.metadata.title,
            author: parsed.metadata.author,
            page_count: parsed.metadata.page_count,
            page_count_estimated: parsed.metadata.page_count_estimated,
            detected_fonts: parsed.metadata.detected_fonts,
        },
    };

    let mut in_front = true;
    let mut in_body = false;

    for h in &parsed.headings {
        let upper = h.text.to_uppercase();
        if upper.contains("INTRODUCTION") || upper.starts_with("CHAPTER") {
            in_front = false;
            in_body = true;
        }
        if upper.contains("REFERENCE")
            || upper.contains("BIBLIOGRAPHY")
            || upper.contains("APPENDIX")
        {
            in_body = false;
        }

        let section = SectionRef {
            id: h.text.to_lowercase().replace(' ', "_"),
            title: Some(h.text.clone()),
            page_start: h.page_number.unwrap_or(0),
        };

        if in_front {
            doc.structure.front_matter.push(section);
        } else if in_body {
            doc.structure.body.push(section);
        } else {
            doc.structure.end_matter.push(section);
        }
    }

    doc
}
