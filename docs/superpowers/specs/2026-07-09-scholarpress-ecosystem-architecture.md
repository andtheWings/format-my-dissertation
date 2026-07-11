# ScholarPress Ecosystem Architecture & Migration Spec

## Motivation

Current state: two independent repos (`diss-check`, `format-my-dissertation`) with
ad-hoc institution content scattered across both. No unified model for adding new
institutions or document types. The ScholarPress ecosystem rebrands and
restructures these into a modular, open-data-driven architecture designed for
long-term extensibility — new institutions, new document types (journals, CVs),
and a scaffolding tool for non-technical administrators.

---

## 1. Ecosystem Architecture

Directed Acyclic Graph (DAG) to prevent circular dependencies:

```
scholarpress-catalog  (DATA — zero dependencies)
       |
       v
scholarpress-check    (VALIDATION — depends on catalog for specs + test fixtures)
       |
       v
scholarpress-publish  (GENERATION — depends on catalog for templates, check for validation)
       ^
       |
scholarpress-foundry  (SCAFFOLDER — depends on catalog for data; invokes check/publish as subprocesses)
       ^
       |
scholarpress-cli      (UNIFIED INTERFACE — binds all modules for CI/CD and developer workflows)
```

**Module responsibilities:**

| Module | Role | Dependencies | Artifact type |
|--------|------|-------------|---------------|
| `catalog` | Passive open-data registry: institution specs, Typst templates, corpus PDFs | None | Git repo (pure data) |
| `check` | Headless Rust library for PDF layout validation | catalog | Rust library crate |
| `publish` | User-facing app: Next.js frontend + Rust doc service | catalog, check | Docker-deployable service |
| `foundry` | Meta-tool: scaffold new institution/journal profiles | catalog (subprocesses check/publish) | Rust binary (future) |
| `cli` | Unified terminal wrapper: `scholarpress check`, `scholarpress publish`, `scholarpress scaffold` | All modules | Rust binary |

**foundry subprocess decision:** foundry depends on catalog only at compile time.
It invokes `check` and `publish` as subprocesses for profile validation, keeping
the compile-time DAG clean. Cross-module testing happens at the CLI level.

---

## 2. Dependency Strategy

Two-tier model for consuming catalog:

| Environment | Mechanism | Rationale |
|-------------|-----------|-----------|
| Development | Sibling directory (`../scholarpress-catalog/`) with a `CATALOG_PATH` env var | Simpler than git submodules — no `.gitmodules`, no `--recursive` friction. Build scripts resolve the path. |
| Production | `rust-embed` bakes spec and template files into the distributed binary at compile time | Single portable executable, zero version-mismatch risks, works offline |

**What is embedded vs. external:**
- **Embedded:** YAML spec files, Typst template files (~KB). Small, needed at runtime.
- **External:** Corpus PDFs (~MB). Large, only needed in CI/development. Never embedded.

**Versioning:** catalog follows Semantic Versioning. Patch/Minor = data updates
(changing a margin requirement). Major = breaking schema change in YAML structure.

**Library stays path-based:** `scholarpress-check` accepts `&Path` to a spec file.
Embedding is a concern of the binary (`scholarpress-cli`), not the library. The
library remains agnostic about how its data is sourced.

**CI adaptation:** Since Git submodules are dropped in favor of `CATALOG_PATH`,
CI workflows for `scholarpress-check` and `scholarpress-cli` must include an
explicit step to clone `scholarpress-catalog` into the sibling directory before
running `cargo test` or `cargo build`. Example:

```yaml
- name: Clone catalog
  run: git clone https://github.com/.../scholarpress-catalog.git ../scholarpress-catalog
```

---

## 3. Directory Structure

### scholarpress-catalog

```
scholarpress-catalog/
  institutions/
    iu/
      spec.yaml              # 33 checks, document structure
      template/              # Typst section files + styles
        sections/            # Section .typ files
        styles.typ
        template.typ
      tests/
        corpus/              # Real-world ScholarWorks PDFs
          chambers.pdf       # 2020-12, 204 pages
          alexander.pdf      # 2025-06
          bent.pdf
          kang.pdf
          ...                # ~12 total
        fixtures/            # Fully synthetic, known-parameter PDFs
          baseline.pdf       # Correct margins: L=1.25, R=1.25, T=1.0, B=1.0
          left-narrow.pdf    # L=0.75
          right-narrow.pdf   # R=0.75
          left-wide.pdf      # L=R=1.75 (symmetric)
          right-wide.pdf     # L=R=1.75 (symmetric)
          top-narrow.pdf     # T=0.5
          top-wide.pdf       # T=2.0
          asymmetric.pdf     # L=1.5, R=1.0
          messy.pdf          # Mixed content (headings, figures, sparse pages)
          synthetic-body.typ # Source for 9 lorem variants
          synthetic-messy.typ # Source for messy variant
          compile.sh          # Regeneration script
      artifacts/             # Reference docs (IU formatting guide, Bo Johnson template)
  journals/                  # Future scope
```

Note: `fixtures/` is flat — no `synthetic/` subdirectory. All test fixtures are
synthetic (known parameters). Real-world testing lives exclusively in `corpus/`.

### scholarpress-check

```
scholarpress-check/
  Cargo.toml
  src/
    lib.rs
    engine.rs
    spec.rs
    document.rs
    extractor.rs
    checkers/
      mod.rs
      layout.rs           # Full-width line margin checking (Round 41)
      typography.rs
      structure.rs
      sections.rs
      content.rs
      title_page.rs
      optional_pages.rs
      footnotes.rs
      toc_details.rs
  tests/
    integration_test.rs   # Corpus sweep: no crashes, all checks complete
    synthetic_margin_test.rs  # Known-parameter margin assertions
  docs/
    calibration-decisions.md
```

### scholarpress-publish

```
scholarpress-publish/
  Cargo.toml              # Rust doc service
  package.json            # Next.js frontend
  web/                    # Next.js app (was format-my-dissertation/web/)
  docker-compose.yml
```

The `institutions/`, `fixtures/`, and `artifacts/` directories are removed from
publish — they live in catalog now. No symlinks. Consumed via `CATALOG_PATH` in
dev or embedded at build time.

### scholarpress-cli

```
scholarpress-cli/
  Cargo.toml              # depends on scholarpress-check, scholarpress-publish
  src/
    main.rs               # CLI entrypoint
    commands/
      check.rs            # scholarpress check <pdf> (was diss-check main.rs)
      publish.rs          # Future: scholarpress publish <docx>
      scaffold.rs         # Future: scholarpress scaffold harvard
```

CLI command: `scholarpress check --spec <path> <pdf>` — same flags as current
diss-check, under the unified binary.

---

## 4. Migration Strategy (Non-Breaking)

No phase leaves any repo in a broken state.

### Phase 1: Create scholarpress-catalog

- Initialize new repo `scholarpress-catalog`
- Populate:
  - Copy `format-my-dissertation/institutions/iu/spec.yaml` → `institutions/iu/spec.yaml`
  - Copy `format-my-dissertation/institutions/iu/template/` → `institutions/iu/template/`
  - Move all PDFs from `diss-check/tests/corpus/` → `institutions/iu/tests/corpus/` (deduplicate)
  - Move synthetic PDFs + sources from `diss-check/tests/fixtures/synthetic/` → `institutions/iu/tests/fixtures/` (flatten, no subdirectory)
  - Copy `diss-check/specs/artifacts/iu/` → `institutions/iu/artifacts/`
- Nothing breaks — no external consumers reference catalog paths yet

### Phase 2: Repoint diss-check to catalog

- Update all hardcoded paths in diss-check:
  - `"specs/iu.yaml"` → `"../scholarpress-catalog/institutions/iu/spec.yaml"` (resolved via `CATALOG_PATH` env var)
  - `"tests/corpus/..."` → `"../scholarpress-catalog/institutions/iu/tests/corpus/..."`
  - `"tests/fixtures/synthetic/..."` → `"../scholarpress-catalog/institutions/iu/tests/fixtures/..."`
- Delete `diss-check/specs/`, `diss-check/tests/corpus/`, `diss-check/tests/fixtures/`
- Delete empty dirs: `tests/checkers/`, `tests/extractors/`, `tests/rust_tests/`
- Rewrite `tests/integration_test.rs` as corpus sweep (no per-PDF PASS/FAIL assertions)
- Rewrite `tests/synthetic_margin_test.rs` with updated fixture paths
- Remove `diss-check/src/main.rs` (CLI entry point extracted in Phase 5). Also
  remove any `[[bin]]` target from `Cargo.toml` and ensure the crate builds
  strictly as a `[lib]`. Without this, Cargo will error on the missing `main`
  function before Phase 5 arrives.
- Verify: `cargo test` passes

### Phase 3: Rename diss-check → scholarpress-check

- Rename `diss-check/` → `scholarpress-check/`
- Update `Cargo.toml`: `name = "scholarpress-check"`, `version = "0.1.0"`
- Update all internal imports: `use diss_check::...` → `use scholarpress_check::...`
- No external consumers exist (standalone binary) — no breaking change
- Add deprecation notice to old repo

### Phase 4: Restructure format-my-dissertation → scholarpress-publish

- Remove `institutions/`, `fixtures/`, and `artifacts/` directories (already migrated to catalog in Phase 1)
- Rename `format-my-dissertation/` → `scholarpress-publish/`
- Verify: `docker compose up` works (no path dependencies on removed directories)

### Phase 5: Extract CLI to scholarpress-cli

- Create `scholarpress-cli/` crate
- Move current diss-check CLI logic (`src/main.rs`) → `src/commands/check.rs`
- Binary entrypoint `src/main.rs` sets up clap with subcommands
- `scholarpress check --spec <path> <pdf>` — mirrors current diss-check behavior
- `scholarpress check` prints results to stdout (current behavior)
- Future: `scholarpress publish`, `scholarpress scaffold` subcommands
- Cargo.toml depends on `scholarpress-check`, `scholarpress-publish`

### Phase 6: Cleanup

- Archive or rename old repos to signal migration complete
- Update documentation across all modules
- Add catalog version pin to check and publish Cargo.toml files

---

## 5. Integration Test Migration

### Before (current diss-check integration_test.rs)

```rust
// test_run_against_chambers: asserts specific statuses against one PDF
// test_run_against_alexander: asserts specific statuses against one PDF
```

### After (corpus sweep + synthetic assertions)

```rust
// test_corpus_sweep: iterate all PDFs in catalog/corpus/
//   assert: no panics, all 33 checks run, errors <= threshold
//   No PASS/FAIL assertions — real docs have unknown ground truth

// Synthetic margin tests remain in synthetic_margin_test.rs
//   assert: known-parameter PDFs produce exactly expected statuses
```

---

## 6. File Inventory

| Phase | Creates | Modifies | Deletes |
|-------|---------|----------|---------|
| 1 | `scholarpress-catalog/` (new repo) | — | — |
| 2 | — | `tests/*.rs` paths, `src/main.rs` removed | `specs/`, `tests/corpus/`, `tests/fixtures/`, 3 empty dirs |
| 3 | — | `Cargo.toml`, all `use diss_check::` imports | `diss-check/` → renamed |
| 4 | — | Remove `institutions/`, `fixtures/`, `artifacts/` | Renamed |
| 5 | `scholarpress-cli/` (new crate) | — | — |
| 6 | — | READMEs, Cargo.toml version pins | — |
