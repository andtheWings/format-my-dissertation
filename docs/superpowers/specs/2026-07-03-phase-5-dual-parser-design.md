# Phase 5 — Dual Document Parser: PDF via pdf_oxide, DOCX via XML

**Date:** 2026-07-03
**Status:** In design

## Overview

Replace kreuzberg entirely with custom format-native parsers. PDF extraction uses `pdf_oxide` (same pipeline as diss-check) to get per-word font metadata. DOCX extraction parses the OOXML directly via `zip` + `quick-xml` to get per-run formatting. Both paths produce a common intermediate representation with rich font metadata, enabling accurate heading detection via a multi-signal scoring pipeline.

Kreuzberg text extraction was correct but its post-processing (chunking, summarization, keywords, language detection) proved unnecessary for dissertations. Its heading detection (font-size clustering and ONNX layout) was either inaccurate or too slow. Custom parsers eliminate ~200MB of transitive dependencies and give us exactly the structural information we need.

## Goals

1. **Accurate heading detection** across varying formatting conventions — ALL CAPS, underline, bold, font-size jumps, or numbering
2. **Real page boundaries** for PDFs (pdf_oxide gives actual pages), estimated for DOCX
3. **Rich font metadata** per paragraph (bold, italic, font size, font name, underline) — enough to detect headings and validate Typst output
4. **Lightweight dependency footprint** — no ONNX, no kreuzberg, no xberg
5. **Configurable per institution** — signal weights stored in `spec.yaml`, not hardcoded
6. **Simple chunking** — paragraph-boundary chunker for LLM context-window management

## Architecture

```
src/extract/
├── mod.rs              # dispatch by MIME, produce ParsedDocument
├── document.rs          # ParsedDocument, ParsedPage, ParsedParagraph, Heading
├── pdf_parser.rs        # pdf_oxide extraction, adapted from diss-check
├── docx_parser.rs       # zip + quick-xml + roxmltree OOXML parser
├── heading_detector.rs  # multi-signal scoring pipeline
└── chunker.rs           # paragraph-boundary chunking
```

Dependencies (new, replaces kreuzberg + xberg):
- `pdf_oxide` — per-character PDF extraction with font metadata
- `zip` — read OOXML container
- `quick-xml` — parse OOXML elements
- `roxmltree` — resolve OOXML style inheritance

Removed dependencies: `kreuzberg`, `xberg`, `ort`, `hf-hub`, `tokenizers`, `whatlang`, `rake`, `chardetng`, and ~50 transitive crates.

## Intermediate representation

All parsers produce a single `ParsedDocument`:

```rust
struct ParsedDocument {
    raw_text: String,
    pages: Vec<ParsedPage>,
    paragraphs: Vec<ParsedParagraph>,
    headings: Vec<Heading>,
    metadata: ParsedMetadata,
}

struct ParsedPage {
    number: u32,
    text: String,
    width: Option<f32>,
    height: Option<f32>,
}

struct ParsedParagraph {
    text: String,
    page_number: Option<u32>,
    is_bold: bool,
    is_italic: bool,
    is_underline: bool,
    is_all_caps: bool,
    is_heading: bool,
    heading_level: Option<u32>,
    font_size: Option<f32>,
    font_name: Option<String>,
}

struct Heading {
    text: String,
    level: u32,
    page_number: Option<u32>,
    raw_text_position: usize,
}

struct ParsedMetadata {
    title: Option<String>,
    author: Option<String>,
    page_count: u32,
    page_count_estimated: bool,
    detected_fonts: Vec<String>,
}
```

### Relationship to existing Document type

The existing `Document` type (exposed to the frontend) is populated from `ParsedDocument`:

- `content.pages` ← `ParsedDocument.pages` (page text)
- `content.raw_text` ← `ParsedDocument.raw_text`
- `structure.front_matter` ← headings in document front matter (abstract, acknowledgements, etc.)
- `structure.body` ← headings in body (chapters and sections)
- `structure.end_matter` ← headings in end matter (references, CV, appendices)
- `metadata.title` ← `ParsedDocument.metadata.title`
- `metadata.author` ← `ParsedDocument.metadata.author`
- `metadata.page_count` ← `ParsedDocument.metadata.page_count`
- `metadata.detected_fonts` ← `ParsedDocument.metadata.detected_fonts`

The `paragraphs` and `headings` fields are available to the LLM directly (not currently exposed in the frontend API, but stored in-memory for tool access).

## Parser details

### PDF parser (`pdf_parser.rs`)

Adapted from `diss-check/src/extractor.rs`:

1. Open PDF with `pdf_oxide::PdfDocument::open()`
2. For each page, extract characters via `extract_chars()` — gives `TextChar` with `x, y, width, height, font_name, font_size, font_weight, char`
3. Group consecutive characters into words (`TextSpan`) by:
   - Same line (origin_y within 3.0)
   - Same font (name matches, size within 1.0)
   - No large gap (>20.0 units)
4. Convert word `TextSpan`s to `ParsedParagraph`:
   - Merge consecutive same-line spans into a single paragraph text string, separated by space for same-line words and `\n` for line breaks. Paragraph boundaries: `\n\n` (blank line) or a vertical gap >1.5x the median line height since previous line.
   - `is_bold` = any span bold
   - `is_underline` = any span underlined (pdf_oxide may not expose this; set to false until supported)
   - `is_all_caps` = all alpha chars uppercase
   - `font_size` = median span font size
   - `font_name` = mode span font name
   - `page_number` = page index + 1
5. Run heading detection on paragraphs
6. Build `raw_text` by concatenating paragraph text

Page dimensions from `get_page_media_box()`. Page count from `page_count()` is accurate.

### DOCX parser (`docx_parser.rs`)

1. Open DOCX as zip archive
2. Parse `word/document.xml` with `quick-xml` (streaming)
3. For each `<w:p>` (paragraph):
   - Read style from `<w:pPr><w:pStyle w:val="..."/>`
   - For each `<w:r>` (run):
     - Read formatting from `<w:rPr>`:
       - `<w:b/>` or `<w:b w:val="true"/>` → bold
       - `<w:i/>` → italic
       - `<w:u w:val="single"/>` → underline
       - `<w:sz w:val="24"/>` → font size (half-points)
       - `<w:rFonts w:ascii="Times New Roman"/>` → font name
     - Read text from `<w:t>`
     - Handle `<w:br/>` as line break
   - Collapse runs into paragraph text
   - `is_bold` = any run bold
   - `is_underline` = any run underlined
   - `is_all_caps` = all alpha chars uppercase in run text
   - `font_size` = size from first run with explicit size, or inherited from style
   - `font_name` = name from first run with explicit font
4. Resolve inherited font properties from `word/styles.xml`:
   - Parse with `roxmltree`
   - Build a map of `style_id → (font_name, font_size, bold, italic, underline)` by reading `<w:style w:styleId="...">` elements and their `<w:rPr>` children
   - Default body size: 24 half-pts (12pt) if no explicit default found
   - Default body font: Times New Roman if no explicit default found
   - When a run has no explicit size/font/bold in its `<w:rPr>`, use the resolved style value
5. Build per-page text: split paragraph list at `<w:br w:type="page"/>` and `<w:lastRenderedPageBreak/>` markers. If none found, all text goes on page 1.
6. Estimate page count using the two-tier strategy described below
7. Run heading detection on paragraphs
8. Build `raw_text` by concatenating paragraph text with `\n\n` separators

### Page count for DOCX

DOCX has no concept of rendered pages. We use a two-tier estimate:

1. **Explicit page breaks** — count `<w:lastRenderedPageBreak/>` and `<w:br w:type="page"/>`. Usually 1-5 per document (chapter boundaries). Set `page_count_estimated = true`.
2. **Word-count fallback** — if explicit breaks < 5, fall back to `total_words ÷ 250` for 12pt double-spaced. Store as `page_count_estimated = true`.

PDF page count from `pdf_oxide::page_count()` is accurate. Store as `page_count_estimated = false`.

## Heading detection pipeline

### Signal computation

| Signal | Weight | DOCX source | PDF source | Fires when |
|--------|--------|-------------|------------|------------|
| `caps` | 0.35 | 100% uppercase run text | 100% uppercase span text | paragraph text ≥4 chars, all `[A-Z\s\d]` |
| `underline` | 0.35 | `<w:u>` in any run | underline attribute on any span | at least one run/span underlined |
| `bold` | 0.15 | `<w:b>` in any run | `is_bold` on any span | at least one run/span bold |
| `numbering` | 0.10 | regex on text | regex on text | matches `Chapter \d+`, `^\d+\.\d+`, `^\d+\.`, `^[IVX]+\.` |
| `context` | 0.05 | text + position | text + position | known keywords OR short all-caps before blank line |

### Score and classification

```
score = w_caps · caps + w_underline · underline + w_bold · bold + w_num · numbering + w_ctx · context

heading if score ≥ 0.5 threshold
```

**Level assignment:**
1. If numbering matches `Chapter \d+` or `^\d+\.\s` → level 1 (chapter)
2. If numbering matches `^\d+\.\d+\.` → level 2 (section)
3. If numbering matches `^\d+\.\d+\.\d+` → level 3 (subsection)
4. If no numbering and is_all_caps → level 1
5. If no numbering and not is_all_caps → level 2
6. If font_size is >2pt above body median → bump level up 1
7. If font_size is <1pt from body → bump level down 1

### Context keywords

`Introduction`, `Abstract`, `References`, `Bibliography`, `Acknowledgements`, `Dedication`, `Preface`, `Table of Contents`, `List of Tables`, `List of Figures`, `Appendices`, `Curriculum Vitae`, `Conclusion`, `Methodology`, `Results`, `Discussion`

### Example for IU template

| Paragraph | caps | under | bold | num | ctx | score | Heading? | Level |
|-----------|------|-------|------|-----|-----|-------|----------|-------|
| `CHAPTER 1: INTRODUCTION` | 0.35 | 0 | 0 | 0.10 | 0.05 | 0.50 | yes | 1 (chapter) |
| `1.1 Background` | 0 | 0.35 | 0 | 0.10 | 0 | 0.45 | no | — |
| `1.1 Background` (bold) | 0 | 0.35 | 0.15 | 0.10 | 0 | 0.60 | yes | 2 (section) |
| `1.2 Prior Work` (bold+underline) | 0 | 0.35 | 0.15 | 0.10 | 0 | 0.60 | yes | 2 (section) |
| `Abstract` | 0 | 0 | 0 | 0 | 0.05 | 0.05 | no | — |
| `ABSTRACT` (all caps) | 0.35 | 0 | 0 | 0 | 0.05 | 0.40 | no | — |

Note: `ABSTRACT` alone doesn't pass threshold. This is intentional — only the chapter heading `CHAPTER 1: INTRODUCTION` which has caps + numbering + context passes. The IU template presumably uses larger font for all-caps chapter titles; when `size_jump` is re-enabled, the score jumps well past 0.5.

### Signal weights per institution

Weights stored in `institutions/{id}/spec.yaml` under a `heading_detection` key:

```yaml
heading_detection:
  threshold: 0.5
  signals:
    caps: 0.35
    underline: 0.35
    bold: 0.15
    size_jump: 0.0
    numbering: 0.10
    context: 0.05
  context_keywords:
    - Introduction
    - Abstract
    - References
    # ... etc
  size_jump_threshold: 2.0
```

## Chunking

Simple paragraph-boundary chunker replacing kreuzberg's chunking:

1. Split `raw_text` on `\n\n` (paragraph boundaries)
2. Build chunks of ~8000 chars with 500-char overlap
3. If a paragraph >8000 chars, split at nearest sentence boundary
4. Store chunks as `Vec<Chunk>` where `Chunk = { text, start_char, end_char, paragraph_indices }`

Available to the LLM via the `extract_document` tool (reads stored `ParsedDocument` from in-memory store).

## API changes

### `/extract` endpoint

No change to request format (multipart upload with optional `?institution=` param).

Response enriched:

```json
{
  "content": {
    "pages": [{ "number": 1, "text": "..." }, ...],
    "raw_text": "..."
  },
  "structure": {
    "headings": [
      { "text": "INTRODUCTION", "level": 1, "page_number": 5 },
      { "text": "1.1 Background", "level": 2, "page_number": 6 },
      ...
    ],
    "front_matter": [{ "id": "abstract", "title": "ABSTRACT", "page_start": 3 }],
    "body": [{ "id": "ch1", "title": "INTRODUCTION", "page_start": 5 }],
    "end_matter": [{ "id": "refs", "title": "REFERENCES", "page_start": 320 }]
  },
  "metadata": {
    "title": null,
    "author": null,
    "page_count": 334,
    "page_count_estimated": true,
    "detected_fonts": ["Times New Roman", "Arial"]
  }
}
```

### `extract_document` tool

Updated to return `ParsedDocument` instead of raw text only. The LLM receives:

```json
{
  "full_text": "<truncated for context window>",
  "headings": [{ "text": "INTRODUCTION", "level": 1, "page_number": 5 }, ...],
  "page_count": 334,
  "chunks": [{ "text": "...", "paragraph_indices": [0,1,2] }, ...]
}
```

The `headings` field replaces what previously required the LLM to scan raw text for chapter boundaries.

## Testing strategy

### Unit tests

- **`docx_parser` tests**: Given a minimal DOCX with known styles (bold, italic, underline, caps, font sizes), verify parsed paragraphs have correct flags
- **`pdf_parser` tests**: Given a minimal PDF with known typography, verify per-word spans and paragraph assembly
- **`heading_detector` tests**: Given known paragraph flags, verify correct heading detection and level assignment for IU weights
- **`heading_detector` tests**: Same paragraphs with different institution weights, verify different results
- **`chunker` tests**: Given known text with paragraphs, verify correct chunk boundaries and overlap

### Integration tests

- Run on the Hall dissertation (DOCX) and verify detected headings match known chapter list
- Run on the test-dissertation.pdf (existing fixture) and verify page count and heading extraction
- Verify `/extract` endpoint returns enriched response for both formats

### Regression

- Existing compile and validate endpoints unchanged
- Existing extract test (test_extract_pdf) should still pass with updated response shape

## Migration plan

1. Add `pdf_oxide`, `zip`, `quick-xml`, `roxmltree` as deps
2. Implement `pdf_parser.rs`, `docx_parser.rs`, `heading_detector.rs`, `chunker.rs`
3. Update `extract/mod.rs` to dispatch by MIME type
4. Update `document.rs` with new types
5. Update `/extract` route handler
6. Remove `kreuzberg` and `xberg` from Cargo.toml
7. Update frontend `ExtractResult` TypeScript type for new response shape
8. Update `extract_document` tool to return heading information
9. Run tests, verify build
10. Commit
