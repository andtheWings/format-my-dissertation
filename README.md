# scholarpress-publish

<img src="publish-beaver.png" alt="scholarpress-publish logo" width="180" align="right">

AI-powered document formatting service for the [ScholarPress](https://github.com/scholarpress-workshop) ecosystem. Takes a student's dissertation (PDF, DOCX) and uses a conversational LLM to map it into a Typst template matching university formatting requirements, validated by [`scholarpress-check`](https://github.com/scholarpress-workshop/scholarpress-check).

## Status

| Capability | Support |
|------------|---------|
| PDF + DOCX extraction (native, no external deps) | ✅ |
| Typst compilation + validation loop | ✅ |
| LLM-driven document mapping (streaming chat) | ✅ |
| IU doctoral dissertation template | ✅ 31/33 automated checks pass |
| Institution-agnostic profiles (via catalog) | ⚠️ Code paths pending catalog wiring |
| Journal / manuscript submission | 🔜 Planned |

## Architecture

Two Docker services, orchestrated by `docker-compose`:

```
┌─────────────────────────┐     ┌──────────────────────────┐
│   Next.js Chat (3000)   │────▶│  Rust Doc Service (4000) │
│                          │     │                          │
│  · AI SDK streaming     │     │  · PDF/DOCX extraction   │
│  · LLM tool orchestration│    │  · Typst compilation      │
│  · shadcn/ui + Tailwind │     │  · Check validation       │
│  · PDF preview (iframe) │◀────│  · Institution registry   │
│  · Postgres persistence │     │                          │
└─────────────────────────┘     └──────────────────────────┘
```

**Flow:** User uploads dissertation → LLM reads content via extraction tools → LLM builds a Typst document section by section → compiles to PDF → validates against institution spec → iterates until violations are resolved.

## Quick start

```bash
git clone https://github.com/scholarpress-workshop/scholarpress-publish
cd scholarpress-publish
docker-compose up
```

Requires [`scholarpress-catalog`](https://github.com/scholarpress-workshop/scholarpress-catalog) as a sibling directory for institution data.

### Environment

| Variable | Default | Notes |
|----------|---------|-------|
| `LLM_BASE_URL` | `https://reallms.rescloud.iu.edu/direct/v1` | OpenAI-compatible endpoint |
| `LLM_MODEL` | `gemma-4-31B-it` | Provider-agnostic; any OpenAI-compatible model works |
| `RUST_SERVICE_URL` | `http://rust-doc-service:4000` | Internal Docker network |
| `CATALOG_PATH` | `../scholarpress-catalog/` | Institution profiles (pending wiring) |

## Rust Document Service (port 4000)

Built with [axum](https://github.com/tokio-rs/axum). Stateless — all data passes through the request/response cycle.

### Extraction

Native parsers with zero external system dependencies:

| Format | Library | Output |
|--------|---------|--------|
| PDF | pdf_oxide | Characters → word-level spans with bbox, font info |
| DOCX | zip + quick-xml | Paragraphs with style, formatting metadata |

### Compilation

Typst compilation via subprocess (`typst compile --format pdf - -`). The service reads `.typ` content from the request body, compiles to PDF bytes in memory, and returns them for validation or download.

Typst CLI (`typst-cli 0.15.0`) must be installed on the host or in the Docker image.

### Validation

Runs `scholarpress-cli` as a subprocess:

```
scholarpress check --spec <catalog-path>/institutions/iu/spec.yaml --json output.pdf
```

Results are parsed and returned as structured JSON so the LLM can act on individual violations.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/extract` | Extract text + metadata from PDF or DOCX |
| `POST` | `/compile` | Compile Typst source → PDF bytes |
| `POST` | `/validate` | Run check validation against institution spec |
| `GET` | `/institutions` | List available institution profiles |
| `GET` | `/institutions/:id/spec` | Get institution spec YAML |
| `GET` | `/institutions/:id/template` | Get institution Typst template files |
| `GET` | `/health` | Liveness check |

## Next.js Frontend (port 3000)

Chat interface where the LLM guides the user through document conversion. Built with:

- **Next.js 15** (App Router)
- **Vercel AI SDK v7** — streaming chat with tool orchestration
- **shadcn/ui + Tailwind CSS v4** — dark theme default
- **PostgreSQL** — session persistence (chat messages as JSONB)
- **lucide-react** — icons

### LLM tools

The AI SDK exposes 7 tools the model can use autonomously:

| Tool | Action |
|------|--------|
| `extract_document` | Parse uploaded PDF/DOCX into structured text |
| `get_document_chunks` | Fetch paginated sections for large documents |
| `compile_typst` | Compile Typst source → PDF |
| `validate_pdf` | Run check validation, return violations |
| `get_institution_spec` | Load formatting requirements from catalog |
| `get_template` | Fetch institution Typst template files |
| `build_document` | Assemble all sections into a complete `.typ` file |

The model iterates through these tools in conversation — extracting content, writing Typst sections, compiling, and validating — until formatting violations reach zero.

## Development

### Rust service

```bash
cd rust-doc-service
cargo build --release
cargo clippy -- -D warnings
cargo fmt --check
# Run tests per-file (full suite crashes in WSL/OpenCode):
cargo test --test extract_test
cargo test --test chunker_test
```

### Frontend

```bash
cd web
bun install
bun run dev
bun run lint
bun run build
```

### Full stack

```bash
docker-compose up
```

## License

MIT
