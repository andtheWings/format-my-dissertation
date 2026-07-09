# Synthetic Margin Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create 10 synthetic Typst PDFs with deliberate margin variations and an integration test asserting correct checker behavior (PASS/FAIL per variant).

**Architecture:** Two Typst source documents in `tests/fixtures/synthetic/`. `synthetic-body.typ` defines a reusable body function. Nine wrapper `.typ` files import it with margin overrides. `synthetic-messy.typ` is standalone with mixed content. A `compile.sh` script generates all 10 PDFs. A new `tests/synthetic_margin_test.rs` asserts expected statuses.

**Tech Stack:** Typst 0.15.0 (compile only, not a CI dep), Rust (diss-check test framework), bash (compile script)

## Global Constraints

- All files under `diss-check/tests/fixtures/synthetic/`
- Integration test at `diss-check/tests/synthetic_margin_test.rs`
- No changes to `src/` (sparse-page skip guard already in place)
- 10 PDFs committed to repo (no Typst in CI)
- Uses existing `diss_check::engine::run_checks` and `diss_check::report::build_report`
- Follows existing integration test pattern from `tests/integration_test.rs`
- Wide variants use symmetric margins (L=R=1.75) to isolate checkers

---

### Task 1: Create Typst source documents

**Files:**
- Create: `tests/fixtures/synthetic/synthetic-body.typ`
- Create: `tests/fixtures/synthetic/synthetic-messy.typ`

**Step 1: Create `tests/fixtures/synthetic/synthetic-body.typ`**

```typst
#let body() = {
  show: rest => {
    set text(size: 12pt)
    rest
  }
  lorem(paragraphs: 200)
}
```

**Step 2: Create `tests/fixtures/synthetic/synthetic-messy.typ`**

```typst
#set page(paper: "us-letter", margin: (left: 1.25in, right: 1.25in, top: 1in, bottom: 1in))
#set text(size: 12pt)
#set par(justify: false)

// Page 1: centered heading + body text
#align(center, text(size: 14pt)[CHAPTER ONE])
#align(center, text(size: 14pt)[INTRODUCTION AND BACKGROUND])
#v(1in)
#lorem(30)
#lorem(30)

// Page 2: body + figure + table
#pagebreak()
#lorem(30)
#v(0.5in)

#align(center, rect(width: 60%, height: 2in, stroke: black)[
  Figure 1: A synthetic test figure
])

#v(0.3in)

#align(center, table(
  columns: 3,
  [Column A], [Column B], [Column C],
  [Data 1], [Data 2], [Data 3],
  [Data 4], [Data 5], [Data 6],
))

// Page 3: sparse dedication-style page
#pagebreak()
#v(2in)
#align(center, text(weight: "regular")[
  To my family and friends,\
  for their unwavering support.
])
```

**Step 3: Verify Typst compiles**

```bash
typst compile --root tests/fixtures/synthetic tests/fixtures/synthetic/synthetic-messy.typ /tmp/test-messy.pdf
```

Expected: compiles without errors.

**Step 4: Commit**

```bash
git add tests/fixtures/synthetic/synthetic-body.typ tests/fixtures/synthetic/synthetic-messy.typ
git commit -m "feat: add Typst source documents for synthetic margin test suite"
```

---

### Task 2: Create variant wrappers and compile script

**Files:**
- Create: `tests/fixtures/synthetic/compile.sh`
- Create: 9 wrapper `.typ` files (see below)

**Step 1: Create `tests/fixtures/synthetic/compile.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$DIR"

compile_variant() {
  local name="$1"
  local left="${2:-1.25in}"
  local right="${3:-1.25in}"
  local top="${4:-1in}"
  local bottom="${5:-1in}"

  local tmpfile
  tmpfile=$(mktemp /tmp/diss-check-synthetic-XXXXXX.typ)
  cat > "$tmpfile" <<TYPTEMPLATE
#import "synthetic-body.typ": body
#set page(paper: "us-letter", margin: (left: $left, right: $right, top: $top, bottom: $bottom))
#set text(size: 12pt)
#body
TYPTEMPLATE

  echo "Compiling $name.pdf (L=$left R=$right T=$top B=$bottom)..."
  typst compile --root "$ROOT" "$tmpfile" "$DIR/$name.pdf"
  rm -f "$tmpfile"
}

echo "=== Synthetic margin test suite ==="
echo

compile_variant "baseline"          "1.25in" "1.25in" "1in"   "1in"
compile_variant "left-narrow"      "0.75in" "1.25in" "1in"   "1in"
compile_variant "right-narrow"     "1.25in" "0.75in" "1in"   "1in"
compile_variant "left-wide"        "1.75in" "1.75in" "1in"   "1in"
compile_variant "right-wide"       "1.75in" "1.75in" "1in"   "1in"
compile_variant "top-narrow"       "1.25in" "1.25in" "0.5in" "1in"
compile_variant "bottom-narrow"    "1.25in" "1.25in" "1in"   "0.5in"
compile_variant "top-wide"         "1.25in" "1.25in" "2in"   "1in"
compile_variant "asymmetric"       "1.50in" "1.00in" "1in"   "1in"

echo
echo "=== Compiling messy.pdf ==="
typst compile --root "$ROOT" "$DIR/synthetic-messy.typ" "$DIR/messy.pdf"

echo
echo "Done. All PDFs in $DIR/"
ls -la "$DIR"/*.pdf
```

**Step 2: Make compile.sh executable**

```bash
chmod +x tests/fixtures/synthetic/compile.sh
```

**Step 3: Run compile.sh to generate all 10 PDFs**

```bash
bash tests/fixtures/synthetic/compile.sh
```

Expected: 10 PDFs generated without errors.

**Step 4: Verify PDFs exist and are non-empty**

```bash
ls -la tests/fixtures/synthetic/*.pdf
```

Expected: 10 PDF files, each > 1KB.

**Step 5: Commit**

```bash
git add tests/fixtures/synthetic/
git commit -m "feat: add synthetic margin variant PDFs + compile script"
```

---

### Task 3: Write integration test

**Files:**
- Create: `tests/synthetic_margin_test.rs`

**Step 1: Create `tests/synthetic_margin_test.rs`**

```rust
use diss_check::checkers::Status;
use diss_check::engine::{run_checks, CheckOptions};
use diss_check::report::build_report;
use diss_check::spec::load_spec;
use std::path::PathBuf;

fn check_variant(name: &str) -> (Status, Status) {
    let spec_path = PathBuf::from("specs/iu.yaml");
    let pdf_path = PathBuf::from(format!("tests/fixtures/synthetic/{}.pdf", name));

    if !pdf_path.exists() {
        eprintln!("Test PDF {} not found, skipping", name);
        return (Status::Error, Status::Error);
    }

    let spec = load_spec(&spec_path).expect("Should load spec");
    let results =
        run_checks(&spec, &pdf_path, &CheckOptions::default()).expect("Should run checks");
    let report = build_report(results);

    let margins = report
        .results
        .iter()
        .find(|r| r.check_id == "global_margins")
        .unwrap_or_else(|| panic!("{}: global_margins not found", name));

    let symmetry = report
        .results
        .iter()
        .find(|r| r.check_id == "margin_symmetry")
        .unwrap_or_else(|| panic!("{}: margin_symmetry not found", name));

    (margins.status.clone(), symmetry.status.clone())
}

#[test]
fn test_synthetic_margin_variants() {
    let spec_path = PathBuf::from("specs/iu.yaml");
    let spec = load_spec(&spec_path).expect("Should load spec");

    let variants: Vec<(&str, Status, Status)> = vec![
        ("baseline",      Status::Pass, Status::Pass),
        ("left-narrow",   Status::Fail, Status::Pass),
        ("right-narrow",  Status::Fail, Status::Pass),
        ("left-wide",     Status::Fail, Status::Pass),
        ("right-wide",    Status::Fail, Status::Pass),
        ("top-narrow",    Status::Fail, Status::Pass),
        ("bottom-narrow", Status::Fail, Status::Pass),
        ("top-wide",      Status::Fail, Status::Pass),
        ("asymmetric",    Status::Fail, Status::Fail),
        ("messy",         Status::Pass, Status::Pass),
    ];

    for (name, expected_margins, expected_symmetry) in &variants {
        let pdf_path = PathBuf::from(format!("tests/fixtures/synthetic/{}.pdf", name));
        if !pdf_path.exists() {
            eprintln!("Test PDF {} not found, skipping", name);
            continue;
        }

        let results = run_checks(&spec, &pdf_path, &CheckOptions::default())
            .unwrap_or_else(|e| panic!("{}: run_checks failed: {}", name, e));
        let report = build_report(results);

        let margins = report
            .results
            .iter()
            .find(|r| r.check_id == "global_margins")
            .unwrap_or_else(|| panic!("{}: global_margins not found", name));

        let symmetry = report
            .results
            .iter()
            .find(|r| r.check_id == "margin_symmetry")
            .unwrap_or_else(|| panic!("{}: margin_symmetry not found", name));

        assert_eq!(
            margins.status, *expected_margins,
            "{}: global_margins expected {:?}, got {:?}. detail: {}",
            name, expected_margins, margins.status, margins.detail
        );
        assert_eq!(
            symmetry.status, *expected_symmetry,
            "{}: margin_symmetry expected {:?}, got {:?}. detail: {}",
            name, expected_symmetry, symmetry.status, symmetry.detail
        );
    }
}
```

**Step 2: Run the new test**

```bash
cargo test --package diss-check -- test_synthetic_margin_variants --nocapture
```

Expected: 1 test PASS, all 10 variants match expected statuses.

**Step 3: Commit**

```bash
git add tests/synthetic_margin_test.rs
git commit -m "test: synthetic margin variant integration test"
```

---

### Task 4: Run full test suite and verify

**Step 1: Run ALL diss-check tests**

```bash
cargo test --package diss-check --no-fail-fast
```

Expected: all tests pass (unit + existing integration + new synthetic).

**Step 2: Run release build**

```bash
cargo build --release
```

Expected: clean build, no warnings.

**Step 3: Commit if any changes needed**

Only if something failed and needed fixing.
