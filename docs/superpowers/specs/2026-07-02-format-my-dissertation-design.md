# format-my-dissertation — Design Spec

**Date:** 2026-07-02
**Status:** Approved

## Overview

Web app that takes a student's dissertation in any form (docx, pdf, latex), uses a conversational LLM interface to map it into an institution-compliant Typst template, then validates and iteratively refines using diss-check. Non-technical grad students chat with an AI that guides them through formatting their dissertation.

## Key Decisions

| Decision | Choice |
|---|---|
| Deployment | Web app (hosted) |
| Frontend | Next.js + Vercel AI SDK |
| Backend | Rust document service (axum) |
| LLM provider | Provider-agnostic abstraction, REALLMS default for IU |
| Scope | Multi-institution from day one |
| Interaction | Conversational AI chat (multi-turn) |
| Document ingestion | xberg (Rust library, native) |
| Compilation | typst (Rust library, native) |
| Validation | diss-check (Rust library, native) |

## Architecture

### Service Boundaries

```
Browser (Next.js Chat UI)
    |
    |--- streaming ---> Vercel AI SDK (LLM orchestration)
    |                        |
    |                        +--> REALLMS / OpenAI / Anthropic (chat + template mapping)
    |                        |
    |                        +--> Rust Document Service (REST)
    |                              |-- xberg (extract docx/pdf/latex -> structured content)
    |                              |-- typst (compile .typ -> PDF)
    |                              |-- diss-check (validate PDF against institution YAML)
```

### Rust Document Service (port 4000)

Single binary HTTP server (axum). Embeds xberg, typst, and diss-check as native library dependencies. Stateless. Exposes three endpoints:

**POST `/extract`** — Extract structured content from uploaded document.

```
Input:  file_bytes (multipart), mime_type (string)
Output: {
  content: { pages: [{number, text, fonts[], images[], tables[]}] },
  structure: { front_matter: [...], body: [...], end_matter: [...] },
  metadata: { title, author, page_count, detected_fonts[] },
  raw_text: string
}
```

**POST `/compile`** — Compile Typst source to PDF.

```
Input:  { typst_code: string, institution_id: string }
Output: pdf_bytes (application/pdf)
```

Returns structured compilation errors as diagnostics on failure (for LLM self-correction).

**POST `/validate`** — Run diss-check against compiled PDF.

```
Input:  { pdf_bytes: bytes, institution_id: string }
Output: {
  violations: [{check_id, category, status, message, page}],
  pass_count, fail_count, error_count
}
```

**Internal structure:**
```
rust-doc-service/
  src/
    main.rs            # axum HTTP server, routes, request/response types
    extract/
      mod.rs           # xberg integration, format normalization
      document.rs      # canonical Document struct
    compile/
      mod.rs           # typst library integration, template loading
      template.rs      # per-institution template discovery
    validate/
      mod.rs           # diss-check engine integration, spec loading
    institutions/
      mod.rs           # YAML spec parser, institution registry
    error.rs           # unified error type -> HTTP responses
  institutions/        # institution configs (mounted at deploy)
    iu/
      spec.yaml        # diss-check format checks
      template/
        template.typ   # entrypoint
        styles.typ     # shared styling
        sections/      # includable per-section .typ files
          title-page.typ
          acceptance-page.typ
          abstract.typ
          toc.typ
          ...
      llm.yaml         # default LLM config
      ui.yaml          # branding, help text
```

### Next.js Chat Frontend (port 3000)

Single-page chat interface. Vercel AI SDK manages streaming chat, tool calls, and multi-turn conversation.

**UI:** Left panel (chat thread with streaming, tool progress), right panel (document preview, violation summary, PDF viewer).

**LLM tools exposed to the model:**
- `extract_document(file_id)` → POST /extract
- `compile_typst(code, institution)` → POST /compile
- `validate_pdf(pdf_id, institution)` → POST /validate
- `get_institution_spec(institution)` → reads institution YAML
- `get_template(institution)` → reads Typst template

**Provider abstraction:**
```typescript
interface LLMConfig {
  provider: "openai-compatible"
  baseURL: string   // e.g. https://reallms.rescloud.iu.edu/direct/v1
  apiKey: string
  model: string     // e.g. gemma-4-31B-it
}
```

REALLMS uses OpenAI-compatible API shape (`/chat/completions`). Vercel AI SDK supports this natively. Institution configs declare defaults; users can override with their own API keys.

**Session state (persisted in Postgres):**
- Session metadata (institution, status, variables)
- Full chat history (OpenAI-compatible message array)
- Extracted document content (JSONB)
- Typst snapshots (code + compiled PDF URL per iteration)
- Validation runs (violations per iteration)

**File storage:** Object storage (S3/MinIO) for uploaded dissertations and generated PDFs.

## Institution Abstraction

Institutions are directories, not code.

### Directory structure
```
institutions/<id>/
  spec.yaml        # diss-check format: checks, constants, document_structure
  template/        # Typst template files
    template.typ
    styles.typ
    sections/
      title-page.typ
      acceptance-page.typ
      abstract.typ
      toc.typ
      ...
  llm.yaml         # default LLM config for this institution
  ui.yaml          # branding (logo, colors, help text)
```

### spec.yaml format

Identical to diss-check's existing YAML format. Contains `institution`, `checks[]`, `constants{}`, `document_structure{}`. The Rust service loads it directly.

### Adding a new institution

1. Create `institutions/<id>/` directory
2. Write `spec.yaml` (diss-check checks)
3. Write Typst template files
4. Write `llm.yaml` (or use default)
5. Optional `ui.yaml`

No code changes. Rust service scans on startup. Next.js loads on first request.

## LLM Inference Pipeline

### Phase 1: Ingestion & Structure Discovery

Upload → xberg extracts → LLM receives structured content. LLM presents summary to student, confirms detected structure.

### Phase 2: Variable Elicitation

LLM identifies known vs. unknown. Known (from extraction): title, author, chapter titles, body text. Unknown (must ask): degree, committee, defense date, campus, font preference, spacing. System prompt includes institution `constants` as defaults. Targeted conversational questions, not a form.

### Phase 3: Template Mapping

LLM generates Typst code section by section. Each section is an includable `.typ` file:
1. Styles & config (font, size, spacing, margins)
2. Title page (title, author, clause)
3. Acceptance page (committee)
4. Abstract (truncated to institution word limit)
5. Table of Contents (from detected structure)
6. Body chapters (preserving structure)
7. References
8. Curriculum Vitae

### Phase 4: Validation & Refinement

Compile → get PDF or errors → if errors, fix Typst → if PDF, validate → get violations → fix → repeat.

Typst handles incremental compilation internally; we always compile the full template and Typst only re-renders changed parts.

## Refinement Loop

```
compile_typst(code, institution)
    |
    +-- compilation error -> LLM fixes Typst syntax -> retry
    |
    v
validate_pdf(pdf, institution)
    |
    +-- all pass -> done (download ready)
    |
    v
violations found
    |
    v
LLM categorizes:
  - Automatable: fix Typst code directly
  - Ambiguous: ask the student
  - Human-only: flag for later
    |
    v
LLM modifies relevant .typ -> back to compile_typst
```

**Guardrails:** Max 10 iterations. Stuck violations (same failure across iterations) escalate to student. Student can target specific fixes ("just fix margins") or go full auto.

## Data Model

```
Session
  id, institution_id, created_at, updated_at
  variables: jsonb        # {name, degree, committee[], defense_date, ...}
  status: enum(uploading, extracting, mapping, validating, complete)

Document
  id, session_id
  original_filename, mime_type, file_size
  storage_key             # S3/MinIO key
  extracted_content: jsonb

TypstSnapshot
  id, session_id, iteration
  typst_code: text
  pdf_storage_key
  created_at

ValidationRun
  id, session_id, typst_snapshot_id
  violations: jsonb[]
  pass_count, fail_count, error_count
  created_at
```

**Storage:** Postgres for structured data. Object storage (S3/MinIO) for files. Chat messages persisted as OpenAI-compatible message array.

## Deployment

- **Rust Document Service:** Docker container. Long-running service (fly.io, Railway, VPS). Ships institution configs in image or volume mount.
- **Next.js Frontend:** Deployed on Vercel. `RUST_SERVICE_URL`, default LLM config, database URL as env vars.
- **Development:** `docker-compose up` brings up Rust service, Next.js dev server, Postgres, MinIO. Institution configs mounted from local filesystem.

## External Dependencies

| Dependency | Role | Interface |
|---|---|---|
| xberg | Document extraction (96 formats) | Rust library |
| typst | Compile .typ to PDF | Rust library |
| diss-check | Validate PDF against institution spec | Rust library |
| REALLMS | IU's free LLM API | OpenAI-compatible HTTP (`/chat/completions`) |
| Any OpenAI-compatible LLM | Fallback/other institutions | Same HTTP interface |

## REALLMS Integration Notes

- Base URL: `https://reallms.rescloud.iu.edu/direct/v1`
- Available models: `gemma-4-31B-it`, `gpt-oss-120b`, `Qwen3-Coder-Next`
- Embedding models: `Qwen3-Embedding-8B`, `embeddinggemma-300m`, `Qwen3-Reranker-8B`
- API key via IU RT Projects
- Approved for critical research data
- OpenAI-compatible — no special integration needed

## System Prompt Shape

```
You are a dissertation formatting assistant for {institution_name}.

FORMATTING REQUIREMENTS:
{institution_spec_summary}

TEMPLATE STRUCTURE:
{typst_template_summary}

WORKFLOW:
1. Ask the student to upload their dissertation
2. Extract the document structure using extract_document
3. Present what you found — confirm sections, title, author, etc.
4. Ask about any missing information (degree, committee, defense date, etc.)
5. Apply the template section by section using compile_typst
6. Validate against institution requirements using validate_pdf
7. Present violations to the student and fix them iteratively
8. When all automatable checks pass, offer the final PDF for download
```

## Non-Goals (v1)

- User accounts / authentication (single session per visit)
- Payment / billing
- Institution spec authoring UI (YAML files are hand-written)
- Batch processing multiple dissertations
- LaTeX or DOCX output (output is always PDF + Typst source)
- Local/offline mode
