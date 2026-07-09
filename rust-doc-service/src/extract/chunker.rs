use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chunk {
    pub text: String,
    pub start_char: usize,
    pub end_char: usize,
}

pub fn chunk_text(raw_text: &str, max_chars: usize, overlap: usize) -> Vec<Chunk> {
    if raw_text.len() <= max_chars {
        return vec![Chunk {
            text: raw_text.to_string(),
            start_char: 0,
            end_char: raw_text.len(),
        }];
    }

    let mut chunks = Vec::new();
    let mut chunk_start = 0usize;

    while chunk_start < raw_text.len() {
        let target_end = (chunk_start + max_chars).min(raw_text.len());
        let mut break_point = target_end;

        let search = &raw_text[..target_end];
        if let Some(pos) = search.rfind("\n\n") {
            let candidate = pos + 2;
            if candidate > chunk_start {
                break_point = candidate;
            }
        }

        let chunk_end = break_point.min(raw_text.len());
        chunks.push(Chunk {
            text: raw_text[chunk_start..chunk_end].to_string(),
            start_char: chunk_start,
            end_char: chunk_end,
        });

        chunk_start = if chunk_end >= raw_text.len() - overlap {
            raw_text.len()
        } else {
            chunk_end.saturating_sub(overlap)
        };
    }

    chunks
}
