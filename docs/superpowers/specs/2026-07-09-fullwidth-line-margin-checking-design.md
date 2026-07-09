# Design Spec: Full-Width Line Margin Checking

## Motivation

Round 40 replaced percentile-based margin heuristics with cluster-based
dominant-alignment detection. It made things worse: on sparse-content pages
(chapter headings, abstract, TOC), centered text outnumbers body text, so the
dominant cluster picks the wrong position. The 5th percentile was more robust
specifically because it always picks from the leftmost side.

The real defect was never the statistic. It was feeding the statistic a mixed
population (body lines + centered headings + TOC entries + captions) and hoping
it separates them implicitly. This spec fixes the root cause: separate body
content from non-body content geometrically, before any measurement runs.

## Strategy: Full-width line filtering

A full-width line is one that spans nearly the entire text block — its right
edge extends close to the expected right page margin. Body paragraphs are
full-width; centered headings, TOC entries, signature blocks, and captions are
not. By reconstructing lines from span bounding boxes and filtering to only
full-width lines, we isolate the body text before measuring margins.

### Line reconstruction (`group_spans_into_lines`)

Sort spans on a page by `top`. Greedy grouping: if a span's `top` overlaps the
current line's vertical bounds (±3pt tolerance for superscripts and baseline
noise), it joins the line. The line's `x0`, `x1`, `top`, and `bottom` are the
min/max of all member spans.

Produces `Vec<Line>` per page, where `Line { x0, x1, top, bottom }`.

### Full-width line filter

A line qualifies as full-width if:

- `x1 >= page_width - (expected_right_margin - tolerance)`, AND
- `x0 <= expected_left_margin + tolerance`

For IU: expected right = 1.25in (90pt), tolerance = 0.125in (9pt).
Threshold: x1 >= 612 - (90 - 9) = 531pt.
Left guard: x0 <= 99pt.

This rejects centered headings (x0 too large), short captions (x1 too small),
TOC dot leaders and page numbers, and signature blocks. It naturally handles
any content type without needing to enumerate them.

**Ragged-right note:** With left-aligned/ragged-right text, fewer lines reach
the x1 threshold, but as long as >= 3 lines per page qualify, the fallback
doesn't trigger and the longest lines still correctly identify the margin.

### Margin measurement

**`global_margins`**:
- Left edge: collect all `x0` values from full-width lines across all
  non-excluded pages into a global vector. Compute 5th percentile. Pass if
  within [required ± tolerance].
- Right margin: collect all `(page_width - x1)` from full-width lines into a
  global vector. 5th percentile. Same pass criteria.
- Top edge: existing logic — min `bbox.0` of all raw spans per page (after
  header/footer filter). Full-width filter does NOT apply to top/bottom.
  A chapter heading 2in down the page IS the top boundary.
- Bottom margin: existing logic — max `(page_height - bbox.1)` of all raw
  spans per page. Same rationale.

**`margin_symmetry`**: per page, compute mean of `x0` and `(page_width - x1)`
from that page's full-width lines. Flag if |diff| > threshold. Per-page
fidelity preserved.

### Page-level exclusions

Extend existing exclusion list (title pg1, acceptance, copyright, dedication)
with abstract, TOC, and CV pages. These produce dotted leaders and unusual
layouts that could generate spuriously full-width lines. Uses existing
`find_section_pages` keyword matching (already `pub(crate)` from Round 40).

### Graceful fallback

If a page has < 3 full-width lines after filtering, skip it entirely. Don't
measure, don't fail. Prevents sparse pages from corrupting the aggregate.

## Testing strategy

| Test | Scenario |
|------|----------|
| `test_line_grouping` | 10 spans at same Y ±2pt → one line; spans with 20pt gap → separate lines |
| `test_full_width_filter_body` | Body text (x0=90, x1=522) passes; centered heading (x0=180, x1=350) discarded |
| `test_full_width_filter_padded_heading` | Padded heading (x0=180, x1=550) still discarded because x0 > left guard |
| `test_chapter_heading_top_margin` | Page with centered heading at 144pt then body. Top measured from heading, not body |
| `test_ragged_right_tolerance` | 5 of 20 lines reach x1 threshold; filter passes, margin from qualifying lines |
| `test_sparse_page_skip` | Page with 1 full-width line → skipped, not failed |
| `test_margins_pass` | Multi-page, body filtered correctly → PASS |
| `test_margins_fail` | Multi-page, wrong margins → FAIL |
| `test_margins_page_exclusions` | Title/acceptance/copyright/dedication/abstract/TOC/CV excluded |
| `test_symmetry_pass` | Balanced L/R from full-width lines → PASS |
| `test_symmetry_fail` | Asymmetric → FAIL |
| `test_synthetic_bad_margins` | Typst template with 0.75in margins → must FAIL |

Integration tests: chambers + alexander preserved (both correctly FAIL).

## Changes

| File | Change |
|------|--------|
| `src/checkers/layout.rs` | Revert clustering. Add `Line` struct, `group_spans_into_lines()`, full-width filter. Rewrite `MarginsChecker` and `MarginSymmetryChecker` `check()` methods. Replace test module. |
| `src/checkers/sections.rs` | Unchanged (already `pub(crate) fn find_section_pages`) |
| `specs/iu.yaml` | Unchanged |
| `src/document.rs` | Unchanged |

Revert 6 clustering commits, apply ~150 net lines in `layout.rs`.
