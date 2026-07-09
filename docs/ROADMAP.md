# Roadmap — format-my-dissertation

**Updated:** 2026-07-09 (Phase 10 complete)

One round = one testable feature delivered end-to-end.

| Phase | Round | Feature | Status | Spec | Plan | Tests | Notes |
|---|---|---|---|---|---|---|---|
| 1 | 1 | Rust service scaffold + institution config loading | ✅ | [design](../superpowers/specs/2026-07-02-format-my-dissertation-design.md) | [plan](../superpowers/plans/2026-07-02-rust-document-service.md) | 2 | Tasks 1-2 |
| 1 | 2 | `/extract` endpoint (xberg) | ✅ | same | same | 1 | Task 3 — adapted to kreuzberg API, uses xberg re-export |
| 1 | 3 | `/compile` endpoint (typst) | ✅ | same | same | 2 | Task 4 — subprocess: `typst compile --format pdf - -` |
| 1 | 4 | `/validate` endpoint (diss-check) | ✅ | same | same | 1 | Task 5 — subprocess, accepts exit 1 (failures OK), exit 2 = error |
| 1 | 5 | Error handling + Docker | ✅ | same | same | - | Task 6 — tracing::error!, request ID, .dockerignore |
| 2 | 6 | Backend: GET /institutions endpoint | ✅ | same | [plan](../superpowers/plans/2026-07-02-nextjs-frontend.md) | - | Task 1 |
| 2 | 6 | Next.js scaffold + institution selector | ✅ | same | same | - | Task 2 |
| 2 | 7 | Streaming chat UI (Vercel AI SDK v7) | ✅ | same | same | - | Task 3 |
| 2 | 8 | Wire tools to Rust service | ✅ | same | same | - | Task 4 |
| 2 | 9 | File upload flow | ✅ | same | same | - | Task 5 |
| 2 | 10 | Right panel (preview + violations) | ✅ | same | same | - | Task 6 |
| 2 | 11 | Session persistence (Postgres) | ✅ | same | same | - | Task 7 |
| 2 | 12 | Deployment config + polish | ✅ | same | same | - | Task 8 |
| 3 | 13 | Fix: PDF preview (react-pdf → iframe) | ✅ | — | — | — | react-pdf v10 + pdfjs-dist incompatible with Next.js webpack; switched to browser native iframe |
| 3 | 14 | Wire tool results to UI state | ✅ | — | — | — | In-memory store, /api/state endpoint, tool callbacks bubble compile/validate results to right panel |
| 3 | 15 | File upload → auto-extract in chat | ✅ | — | — | — | FileUpload integrated into ChatPanel; auto-extracts on drop and sends content to LLM |
| 3 | 16 | Fix: DOCX extraction | ✅ | — | — | — | Added `office` feature to kreuzberg in Cargo.toml |
| 3 | 17 | Fix: institutions path resolution | ✅ | — | — | — | Default path now resolves relative to CARGO_MANIFEST_DIR |
| 3 | 18 | Switch from npm to bun | ✅ | — | — | — | Faster installs; Dockerfile uses oven/bun for deps/builder |
| 4 | 19 | Copy full IU spec from diss-check | ✅ | [spec](../superpowers/specs/2026-07-02-phase-4-design.md) | [plan](../superpowers/plans/2026-07-02-phase-4-llm-tools.md) | — | 327-line, 33 checks |
| 4 | 20 | Complete IU Typst template (14 sections + styles) | ✅ | same | same | — | Required + optional sections, passes automated checks by construction |
| 4 | 21 | GET /institutions/:id/spec endpoint | ✅ | same | same | — | Returns raw spec + parsed summary (structure, constants, check counts) |
| 4 | 22 | GET /institutions/:id/template endpoint | ✅ | same | same | — | Returns all .typ files recursively with contents |
| 4 | 23 | get_institution_spec + get_template AI SDK tools | ✅ | same | same | — | LLM can read spec and template on-demand during formatting |
| 4 | 24 | Dynamic system prompt | ✅ | same | same | — | Injects institution name, structure, constants, and template file index |
| 5 | 25 | Dual parser: PDF via pdf_oxide, DOCX via XML | ✅ | [spec](../superpowers/specs/2026-07-03-phase-5-dual-parser-design.md) | [plan](../superpowers/plans/2026-07-03-phase-5-dual-parser.md) | 8 | Replaces kreuzberg/xberg with pdf_oxide + zip/quick-xml/roxmltree; multi-signal heading detection; paragraph-boundary chunking |
| 6 | 26 | Fix: LLM-accessible extraction | ✅ | [spec](../superpowers/specs/2026-07-03-phase-6-llm-extraction-fix.md) | — | — | Tool returns headings not raw text; new get_document_chunks; slim upload message; confirm-first workflow |
| 7 | 27 | Fix: extraction store resilience | ✅ | — | — | — | File-based fallback survives HMR resets; PUT response checked; sessionId added to useCallback deps |
| 7 | 28 | Fix: system prompt workflow directive | ✅ | — | — | — | Explicit continuations after tool calls; spec tool returns full checks not just summary |
| 7 | 29 | Fix: tool loop + compile import resolution | ✅ | — | — | — | streamText isStepCount(1→10) so LLM sees tool results; compile --root for Typst imports |
| 7 | 30 | feat: build_document tool | ✅ | [spec](../superpowers/specs/2026-07-03-build-document-tool-design.md) | [plan](../superpowers/plans/2026-07-03-build-document-tool.md) | — | LLM generates structure with {MARKER} placeholders; backend fetches chunks, escapes, compiles |
| 8 | 31 | fix: chunk dedup + heading lookup + dark mode + validate body limit | ✅ | — | — | — | Overlap ranges merged in getChunksFromText; heading-based arg in get_document_chunks; ThemeProvider/Toggle with dark default; axum DefaultBodyLimit::max(50MB) on /validate |
| 9 | 32 | fix: page numbering (hardcoded iii/iv, body arabic) | ✅ | — | — | — | Removed `set page(numbering: "iii")` from abstract.typ and `"iv"` from toc.typ; added `set page(numbering: "1")` to chapters.typ; page_numbers_format passes |
| 9 | 33 | feat: test template with placeholder content | ✅ | — | — | — | `institutions/iu/tests/template-test.typ` calls all 16 section functions with realistic placeholder text; 24 PASS / 5 FAIL / 4 ERROR baseline established |
| 9 | 34 | fix: abstract section detection | ✅ | — | — | — | Two causes: missing pagebreak() (merged with preface) + only 97 spans (<100 heuristic). Added pagebreak(); rewritten with proper top-down layout (heading, author, title, body, committee); now 164 spans, all 3 abstract checkers PASS |
| 9 | 35 | fix: committee chair detection | ✅ | — | — | — | Committee now extracted from acceptance page; mirroring abstract signature format (name, degree, role) with defense_date between members 2-3; chair listed first with ", Chair" suffix |
| 9 | 36 | fix: title clause wording | ✅ | — | — | — | Forced line breaks (`\`) in clause so Typst renders 7 distinct lines instead of 1 wrapped paragraph; checker's fuzzy 70% threshold matches all 7 lines |
| 9 | 37 | investigate: ScholarWorks margin calibration | ✅ | — | — | — | Tested 3 real IU dissertations against template. All 3 real docs fail margin checks (consistent with diss-check calibration). Template margins correctly set at 1.25in/1in — FAILs are placeholder-content artifacts (centered headings/tables/figures skew body-text bbox measurement). Not a template bug. |
| 9 | 38 | fix: references_heading_format false positive | ✅ | — | — | — | Resolved as side effect of bold removal — chapters and references both use regular-weight LibertinusSerif 12pt. Font subset prefix correctly stripped by normalize_family(). PASSes. |
| 9 | 39 | end-to-end template validation | ✅ | — | — | — | Final results: 31 PASS, 2 FAIL, 0 ERROR, 7 MANUAL. 2 FAILs are global_margins + margin_symmetry (confirmed placeholder-content bbox artifacts per ScholarWorks calibration; real body text resolves). Zero compile warnings. All structural, typographic, content, and section-detection checks pass. |
| 10 | 40 | Cluster-based margin checking | ❌ | [spec](../superpowers/specs/2026-07-09-cluster-margin-checking-design.md) | [plan](../superpowers/plans/2026-07-09-cluster-margin-checking.md) | — | FAILED — clustering picks centered-content cluster on sparse pages; worse than percentile. Reverted. |
| 10 | 41 | Full-width line margin checking | ✅ | [spec](../superpowers/specs/2026-07-09-fullwidth-line-margin-checking-design.md) | [plan](../superpowers/plans/2026-07-09-fullwidth-line-margin-checking.md) | 11 | Reconstruct lines from spans, filter to x1>=70% page width (full-width body lines), global 5th percentile on cleaned data. Left/right margins correctly measured at 90pt on template-test. 93 tests pass. |
| 10 | 42 | Synthetic margin test suite | ✅ | [spec](../superpowers/specs/2026-07-09-synthetic-margin-test-suite-design.md) | [plan](../superpowers/plans/2026-07-09-synthetic-margin-test-suite.md) | 4 | 10 synthetic PDFs with deliberate margin variations. Integration tests assert correct FAIL for wrong margins, correct measurements for correct margins. Threshold lowered from 0.8→0.7 for wide margin support. |
