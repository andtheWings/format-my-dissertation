# ScholarPress Ecosystem Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate disaggregated `diss-check` and `format-my-dissertation` repos into the modular ScholarPress ecosystem — catalog (data), check (validation), publish (generation), and cli (unified binary).

**Architecture:** Phase 1 creates `scholarpress-catalog` as a new, additive, zero-dependency data repo. Subsequent phases repoint existing repos to consume catalog, rename crates, and extract the CLI. No phase leaves any repo in a broken state.

**Tech Stack:** Git (repo creation, moves), Rust/Cargo (crate renaming, path updates), bash (directory moves)

## Global Constraints

- No breaking intermediate states — each phase must pass its own tests independently
- No symlinks between repos
- Catalog uses sibling-directory convention (`../scholarpress-catalog/`) in development; `CATALOG_PATH` env var resolves the path
- All test fixture PDFs (synthetic) live flat under `institutions/iu/tests/fixtures/` — no `synthetic/` subdirectory
- Real-world corpus PDFs live under `institutions/iu/tests/corpus/`
- Corpus PDFs never embedded; spec and template files embedded via `rust-embed` in production
- `scholarpress-check` builds as `[lib]` only (no `[[bin]]` target until CLI is extracted in Phase 5)
- CLI command: `scholarpress check --spec <path> <pdf>` mirrors current diss-check behavior

---

### Task 1: Create scholarpress-catalog repo + populate content

**Files:**
- Create: `scholarpress-catalog/` (new git repo, sibling to diss-check and format-my-dissertation)
- Create: `scholarpress-catalog/institutions/iu/spec.yaml` (copy from format-my-dissertation)
- Create: `scholarpress-catalog/institutions/iu/template/` (copy from format-my-dissertation)
- Create: `scholarpress-catalog/institutions/iu/tests/corpus/` (move from diss-check + deduplicate)
- Create: `scholarpress-catalog/institutions/iu/tests/fixtures/` (move from diss-check, flatten)
- Create: `scholarpress-catalog/institutions/iu/artifacts/` (copy from diss-check specs/artifacts/iu/)
- Create: `scholarpress-catalog/README.md`
- Create: `scholarpress-catalog/.gitignore`

**Interfaces:**
- Produces: `scholarpress-catalog/` directory at `../scholarpress-catalog/` relative to diss-check
- Later tasks consume paths like `../scholarpress-catalog/institutions/iu/spec.yaml`

- [ ] **Step 1: Initialize the repo**

```bash
mkdir scholarpress-catalog
cd scholarpress-catalog
git init
echo "# ScholarPress Catalog" > README.md
mkdir -p institutions/iu/tests/corpus
mkdir -p institutions/iu/tests/fixtures
mkdir -p institutions/iu/artifacts
```

- [ ] **Step 2: Copy spec and template from format-my-dissertation**

```bash
cp format-my-dissertation/institutions/iu/spec.yaml scholarpress-catalog/institutions/iu/
cp -r format-my-dissertation/institutions/iu/template/ scholarpress-catalog/institutions/iu/
```

- [ ] **Step 3: Copy artifacts from diss-check**

```bash
cp -r diss-check/specs/artifacts/iu/* scholarpress-catalog/institutions/iu/artifacts/
```

- [ ] **Step 4: Move and deduplicate corpus PDFs**

```bash
# Move all corpus PDFs (skip Zone.Identifier files, skip duplicates already in fixtures)
cp diss-check/tests/corpus/*.pdf scholarpress-catalog/institutions/iu/tests/corpus/
# Deduplicate: chambers.pdf and alexander.pdf exist in both corpus and fixtures — keep corpus copy
```

- [ ] **Step 5: Move synthetic fixtures (flatten, no subdirectory)**

```bash
# Flatten: tests/fixtures/synthetic/* → institutions/iu/tests/fixtures/
cp diss-check/tests/fixtures/synthetic/*.pdf scholarpress-catalog/institutions/iu/tests/fixtures/
cp diss-check/tests/fixtures/synthetic/*.typ scholarpress-catalog/institutions/iu/tests/fixtures/
cp diss-check/tests/fixtures/synthetic/compile.sh scholarpress-catalog/institutions/iu/tests/fixtures/
# Also move iu_template.pdf to corpus
cp diss-check/tests/fixtures/iu_template.pdf scholarpress-catalog/institutions/iu/tests/corpus/
```

- [ ] **Step 6: Verify catalog compiles tests (just existence check)**

```bash
cd scholarpress-catalog
test -f institutions/iu/spec.yaml && echo "spec.yaml present"
test -f institutions/iu/template/styles.typ && echo "template present"
ls institutions/iu/tests/corpus/*.pdf | wc -l
ls institutions/iu/tests/fixtures/*.pdf | wc -l
```

Expected: spec and template present, corpus has ~14 PDFs, fixtures has 10 PDFs.

- [ ] **Step 7: Create .gitignore**

```bash
cat > scholarpress-catalog/.gitignore << 'EOF'
*.Zone.Identifier
*.sec.endpointdlp
*.tmp-*
.DS_Store
EOF
```

- [ ] **Step 8: Commit catalog**

```bash
cd scholarpress-catalog
git add -A
git commit -m "feat: initial ScholarPress catalog — IU institution profile"
```

---

### Task 2: Repoint diss-check paths to catalog + clean up

**Files:**
- Modify: `diss-check/tests/integration_test.rs` (path updates + corpus sweep rewrite)
- Modify: `diss-check/tests/synthetic_margin_test.rs` (path updates)
- Modify: `diss-check/Cargo.toml` (remove `[[bin]]`, keep `[lib]`)
- Delete: `diss-check/tests/corpus/`
- Delete: `diss-check/tests/fixtures/`
- Delete: `diss-check/specs/`
- Delete: `diss-check/tests/checkers/`, `tests/extractors/`, `tests/rust_tests/`
- Delete: `diss-check/src/main.rs`

**Interfaces:**
- Consumes: `scholarpress-catalog/` at `../scholarpress-catalog/` (Task 1)
- Produces: `diss-check` as pure `[lib]` crate, tests pass against catalog

**Step 1: Set CATALOG_PATH convention and update test paths**

Add a test helper that resolves `CATALOG_PATH` env var or defaults to `../scholarpress-catalog/`:

```rust
fn catalog_path() -> PathBuf {
    std::env::var("CATALOG_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("../scholarpress-catalog"))
}
```

**Step 2: Rewrite integration_test.rs as corpus sweep**

Replace the two per-PDF assertion tests with a sweep:

```rust
use diss_check::checkers::Status;
use diss_check::engine::{run_checks, CheckOptions};
use diss_check::report::build_report;
use diss_check::spec::load_spec;
use std::path::PathBuf;

fn catalog_path() -> PathBuf { /* same helper */ }

#[test]
fn test_corpus_sweep() {
    let spec_path = catalog_path().join("institutions/iu/spec.yaml");
    let spec = load_spec(&spec_path).expect("Should load spec");
    let corpus_dir = catalog_path().join("institutions/iu/tests/corpus");

    let mut pdfs = 0usize;
    for entry in std::fs::read_dir(&corpus_dir).expect("corpus dir should exist") {
        let entry = entry.expect("should read entry");
        let path = entry.path();
        if path.extension().map_or(false, |e| e == "pdf") {
            pdfs += 1;
            let results = run_checks(&spec, &path, &CheckOptions::default())
                .expect(&format!("run_checks failed for {:?}", path));
            let report = build_report(results);
            assert_eq!(report.results.len(), spec.checks.len(),
                "{:?}: expected {} checks, got {}",
                path, spec.checks.len(), report.results.len()
            );
            // No PASS/FAIL assertions — real docs have unknown ground truth
            // assert that error count is reasonable
            assert!(report.summary.error <= 8,
                "{:?}: too many errors ({})",
                path, report.summary.error
            );
        }
    }
    assert!(pdfs > 0, "no PDFs found in corpus directory");
}
```

**Step 3: Update synthetic_margin_test.rs paths**

Replace all `"tests/fixtures/synthetic/"` with `catalog_path().join("institutions/iu/tests/fixtures/")`.

**Step 4: Remove [[bin]] target from Cargo.toml**

Check if there's a `[[bin]]` section and remove it. Ensure the crate builds as a library only.

**Step 5: Delete migrated + empty directories**

```bash
rm -rf diss-check/tests/corpus/
rm -rf diss-check/tests/fixtures/
rm -rf diss-check/specs/
rm -rf diss-check/tests/checkers/
rm -rf diss-check/tests/extractors/
rm -rf diss-check/tests/rust_tests/
rm diss-check/src/main.rs
```

**Step 6: Run tests**

```bash
cd diss-check
cargo test --package diss-check --no-fail-fast
```

Expected: all tests pass. Corpus sweep runs against catalog PDFs. Synthetic tests run against catalog fixtures.

**Step 7: Commit**

```bash
git add -A
git commit -m "refactor: repoint diss-check to scholarpress-catalog"
```

---

### Task 3: Rename diss-check → scholarpress-check

**Files:**
- Rename: `diss-check/` → `scholarpress-check/`
- Modify: `scholarpress-check/Cargo.toml` (name = "scholarpress-check")
- Modify: All `use diss_check::` imports → `use scholarpress_check::`

**Step 1: Rename directory**

```bash
mv diss-check scholarpress-check
```

**Step 2: Update Cargo.toml**

Change:
```toml
[package]
name = "diss-check"
```
to:
```toml
[package]
name = "scholarpress-check"
version = "0.1.0"
```

**Step 3: Update all internal imports**

```bash
cd scholarpress-check
rg -l "diss_check" --type rust | xargs sed -i 's/diss_check/scholarpress_check/g'
rg -l "diss-check" --type rust | xargs sed -i 's/diss-check/scholarpress-check/g'
```

**Step 4: Run tests**

```bash
cargo test --package scholarpress-check --no-fail-fast
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add -A
git commit -m "rename: diss-check → scholarpress-check"
```

---

### Task 4: Restructure format-my-dissertation → scholarpress-publish

**Files:**
- Rename: `format-my-dissertation/` → `scholarpress-publish/`
- Delete: `scholarpress-publish/institutions/`
- Delete: `scholarpress-publish/fixtures/`
- Delete: `scholarpress-publish/artifacts/`
- Modify: Internal path references (if any reference institutions/)

**Step 1: Rename directory**

```bash
mv format-my-dissertation scholarpress-publish
```

**Step 2: Remove migrated directories**

```bash
rm -rf scholarpress-publish/institutions/
rm -rf scholarpress-publish/fixtures/
rm -rf scholarpress-publish/artifacts/
```

**Step 3: Update anything that referenced institutions/ paths**

Search for `institutions/` references in the codebase and update to use `CATALOG_PATH` convention or updated paths.

**Step 4: Verify docker compose still works**

```bash
cd scholarpress-publish
docker compose config  # validates but doesn't run
```

**Step 5: Commit**

```bash
git add -A
git commit -m "rename: format-my-dissertation → scholarpress-publish; remove migrated dirs"
```

---

### Task 5: Extract CLI to scholarpress-cli

**Files:**
- Create: `scholarpress-cli/` (new crate, sibling to scholarpress-check)
- Create: `scholarpress-cli/Cargo.toml`
- Create: `scholarpress-cli/src/main.rs`
- Create: `scholarpress-cli/src/commands/check.rs`

**Step 1: Initialize scholarpress-cli crate**

```bash
cargo init scholarpress-cli
```

**Step 2: Write Cargo.toml**

```toml
[package]
name = "scholarpress-cli"
version = "0.1.0"
edition = "2021"

[dependencies]
scholarpress-check = { path = "../scholarpress-check" }
clap = { version = "4", features = ["derive"] }

# Future:
# scholarpress-publish = { path = "../scholarpress-publish" }
```

**Step 3: Write src/main.rs**

```rust
mod commands;

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "scholarpress")]
#[command(version = env!("CARGO_PKG_VERSION"))]
#[command(about = "ScholarPress: format and validate scholarly documents")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Run checks against a single dissertation PDF
    Check(commands::check::CheckArgs),
    /// Run checks across a corpus of PDFs for calibration
    Calibrate(commands::calibrate::CalibrateArgs),
}

fn main() {
    let cli = Cli::parse();
    match &cli.command {
        Commands::Check(args) => commands::check::run(args),
        Commands::Calibrate(args) => commands::calibrate::run(args),
    }
}
```

**Step 4: Write src/commands/check.rs**

```rust
use clap::Parser;
use std::path::PathBuf;
use std::process;

#[derive(Parser)]
pub struct CheckArgs {
    #[arg(short, long, help = "Path to institution spec YAML file")]
    pub spec: PathBuf,

    #[arg(short, long, help = "Output results as JSON")]
    pub json: bool,

    #[arg(short, long, help = "Show only FAIL and ERROR results")]
    pub quiet: bool,

    #[arg(long, help = "Run only this specific check (by check ID)")]
    pub check: Option<String>,

    #[arg(
        short = 'C',
        long,
        help = "Run only checks in this category (layout, typography, structure, content)"
    )]
    pub category: Option<String>,

    #[arg(
        long,
        help = "Dump extracted document intermediate representation as JSON and exit"
    )]
    pub dump_extract: bool,

    #[arg(help = "Path to dissertation PDF")]
    pub pdf: PathBuf,
}

pub fn run(args: &CheckArgs) {
    if !args.pdf.exists() {
        eprintln!("Error: PDF not found: {}", args.pdf.display());
        process::exit(2);
    }

    if args.dump_extract {
        match scholarpress_check::extractor::extract_document(&args.pdf) {
            Ok(doc) => {
                match serde_json::to_string_pretty(&doc) {
                    Ok(output) => {
                        println!("{}", output);
                        process::exit(0);
                    }
                    Err(e) => {
                        eprintln!("Error serializing document: {}", e);
                        process::exit(2);
                    }
                }
            }
            Err(e) => {
                eprintln!("Error extracting document: {}", e);
                process::exit(2);
            }
        }
    }

    let spec = match scholarpress_check::spec::load_spec(&args.spec) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Error loading spec: {}", e);
            process::exit(2);
        }
    };

    let options = scholarpress_check::engine::CheckOptions {
        check_id: args.check.clone(),
        category: args.category.clone(),
    };

    let results = match scholarpress_check::engine::run_checks(&spec, &args.pdf, &options) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Error running checks: {}", e);
            process::exit(2);
        }
    };

    let report = scholarpress_check::report::build_report(results);

    if args.json {
        match scholarpress_check::report::format_json(&report) {
            Ok(output) => println!("{}", output),
            Err(e) => {
                eprintln!("Error formatting JSON: {}", e);
                process::exit(2);
            }
        }
    } else if args.quiet {
        print!("{}", scholarpress_check::report::format_text_quiet(&report));
    } else {
        println!("{}", scholarpress_check::report::format_text(&report));
    }

    if report.summary.fail > 0 || report.summary.error > 0 {
        process::exit(1);
    }
}
```

**Step 5: Write src/commands/calibrate.rs**

```rust
use clap::Parser;
use std::path::PathBuf;
use std::process;

#[derive(Parser)]
pub struct CalibrateArgs {
    #[arg(short, long, help = "Path to institution spec YAML file")]
    pub spec: PathBuf,

    #[arg(short, long, help = "Path to corpus directory containing PDF files")]
    pub corpus: PathBuf,

    #[arg(short, long, help = "Output results as JSON")]
    pub json: bool,
}

pub fn run(args: &CalibrateArgs) {
    if !args.corpus.exists() {
        eprintln!("Error: corpus directory not found: {}", args.corpus.display());
        process::exit(2);
    }

    let cal_report = match scholarpress_check::calibration::run_calibration(&args.spec, &args.corpus) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Error: {}", e);
            process::exit(2);
        }
    };

    if args.json {
        match scholarpress_check::calibration::format_json(&cal_report) {
            Ok(output) => println!("{}", output),
            Err(e) => {
                eprintln!("Error: {}", e);
                process::exit(2);
            }
        }
    } else {
        println!("{}", scholarpress_check::calibration::format_text(&cal_report));
    }

    if cal_report.automated_fail_count() > 0 {
        process::exit(1);
    }
}
```

**Step 6: Also add `serde_json` dependency to Cargo.toml**

```toml
[dependencies]
scholarpress-check = { path = "../scholarpress-check" }
clap = { version = "4", features = ["derive"] }
serde_json = "1"
```

**Step 7: Build and test**

```bash
cd scholarpress-cli
cargo build
# Run a basic smoke test
cargo run -- check --spec ../scholarpress-catalog/institutions/iu/spec.yaml ../scholarpress-catalog/institutions/iu/tests/fixtures/baseline.pdf
```

Expected: prints formatted check report to stdout.

**Step 6: Commit**

```bash
git add scholarpress-cli/
git commit -m "feat: extract diss-check CLI to scholarpress check command"
```

---

### Task 6: Final verification and cleanup

**Step 1: Verify full ecosystem builds**

```bash
cd scholarpress-catalog && echo "catalog: OK (no build needed)"
cd scholarpress-check  && cargo test --no-fail-fast && echo "check: OK"
cd scholarpress-publish && docker compose config && echo "publish: OK"
cd scholarpress-cli    && cargo build && echo "cli: OK"
```

**Step 2: Run scholarpress check against template-test**

```bash
scholarpress-cli/target/debug/scholarpress check \
  --spec scholarpress-catalog/institutions/iu/spec.yaml \
  /tmp/template-test.pdf
```

Expected: 31 PASS, 2 FAIL, 7 MANUAL — matching current baseline.

**Step 3: Commit any final adjustments**
