# Roadmap — format-my-dissertation

**Updated:** 2026-07-02

One round = one testable feature delivered end-to-end.

| Phase | Round | Feature | Status | Spec | Plan | Tests | Notes |
|---|---|---|---|---|---|---|---|
| 1 | 1 | Rust service scaffold + institution config loading | ✅ | [design](../superpowers/specs/2026-07-02-format-my-dissertation-design.md) | [plan](../superpowers/plans/2026-07-02-rust-document-service.md) | 2 | Tasks 1-2 |
| 1 | 2 | `/extract` endpoint (xberg) | ✅ | same | same | 1 | Task 3 — adapted to kreuzberg API, uses xberg re-export |
| 1 | 3 | `/compile` endpoint (typst) | ✅ | same | same | 2 | Task 4 — subprocess: `typst compile --format pdf - -` |
| 1 | 4 | `/validate` endpoint (diss-check) | ✅ | same | same | 1 | Task 5 — subprocess, accepts exit 1 (failures OK), exit 2 = error |
| 1 | 5 | Error handling + Docker | ✅ | same | same | - | Task 6 — tracing::error!, request ID, .dockerignore |
| 2 | 6 | Next.js scaffold + institution selector | ⬜ | same | [plan](../superpowers/plans/2026-07-02-nextjs-frontend.md) | - | Tasks 1-2 |
| 2 | 7 | Streaming chat UI (Vercel AI SDK) | ⬜ | same | same | - | Task 3 |
| 2 | 8 | Wire tools to Rust service | ⬜ | same | same | - | Task 4 |
| 2 | 9 | File upload flow | ⬜ | same | same | - | Task 5 |
| 2 | 10 | Right panel (preview + violations) | ⬜ | same | same | - | Task 6 |
| 2 | 11 | Session persistence (Postgres) | ⬜ | same | same | - | Task 7 |
| 2 | 12 | Deployment config + polish | ⬜ | same | same | - | Task 8 |
