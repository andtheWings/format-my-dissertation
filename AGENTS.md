# Project: format-my-dissertation

App that takes a student's dissertation in any form (docx, pdf, latex), uses inference to map into a Typst template that fits University specifications, then uses diss-check iteratively to refine the document.

## Dependencies

### diss-check (`../diss-check`)

Rust CLI that checks PDFs against institution specs. Use it as an external validation pass — run it on generated PDFs to find violations, then feed findings back into template refinement.

Key commands:
- `cargo run --release -- check --spec specs/iu.yaml <pdf>` — check a PDF
- `cargo run --release -- check --spec specs/iu.yaml --json <pdf>` — JSON output
- `cargo run --release -- check --spec specs/iu.yaml --quiet <pdf>` — failures only
- `cargo run --release -- check --spec specs/iu.yaml --check <id> <pdf>` — single checker
- `cargo run --release -- check --spec specs/iu.yaml --category <name> <pdf>` — category filter

For architecture, checker list, and details: **always reference `mem:diss-check/*` Serena memories in the diss-check project.**

## Memory discipline

- **Before planning or implementing**: read `mem:format-my-dissertation/*` Serena memories.
- **When finishing a phase or feature**: update `mem:format-my-dissertation/project-status` and any changed architecture/workflow memories.
- **Before or after running compaction**: update Serena memories with latest state.

## Development preferences

- Use `rtk` prefix for all shell commands (reduces token usage).
- Prefer working in isolated git worktrees for feature branches.
- Use TDD: write tests before implementation.
- Verify with lint/typecheck/build before claiming work is done.
- Never commit unless explicitly asked.

<!-- headroom:rtk-instructions -->
# RTK (Rust Token Killer) - Token-Optimized Commands

When running shell commands, **always prefix with `rtk`**. This reduces context
usage by 60-90% with zero behavior change. If rtk has no filter for a command,
it passes through unchanged — so it is always safe to use.

## Key Commands
```bash
# Git (59-80% savings)
rtk git status          rtk git diff            rtk git log

# Files & Search (60-75% savings)
rtk ls <path>           rtk read <file>         rtk grep <pattern>
rtk find <pattern>      rtk diff <file>

# Test (90-99% savings) — shows failures only
rtk pytest tests/       rtk cargo test          rtk test <cmd>

# Build & Lint (80-90% savings) — shows errors only
rtk tsc                 rtk lint                rtk cargo build
rtk prettier --check    rtk mypy                rtk ruff check

# Analysis (70-90% savings)
rtk err <cmd>           rtk log <file>          rtk json <file>
rtk summary <cmd>       rtk deps                rtk env

# GitHub (26-87% savings)
rtk gh pr view <n>      rtk gh run list         rtk gh issue list

# Infrastructure (85% savings)
rtk docker ps           rtk kubectl get         rtk docker logs <c>

# Package managers (70-90% savings)
rtk pip list            rtk pnpm install        rtk npm run <script>
```

## Rules
- In command chains, prefix each segment: `rtk git add . && rtk git commit -m "msg"`
- For debugging, use raw command without rtk prefix
- `rtk proxy <cmd>` runs command without filtering but tracks usage
<!-- /headroom:rtk-instructions -->
