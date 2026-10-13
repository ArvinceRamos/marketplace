# Marketplace

Original PH classifieds marketplace (Carousell-inspired, nothing copied).
Stack: Next.js App Router + TypeScript + Tailwind (`frontend/`), FastAPI + Pydantic + SQLAlchemy 2
(`backend/`), Supabase Postgres/Auth/Storage with RLS (`supabase/`), pytest, Ruff, Docker (API only),
GitHub Actions.

Before each task, read `docs/IMPLEMENTATION_ROADMAP.md` and the docs for the area you touch
(`ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `API_SPECIFICATION.md`, `SECURITY_PLAN.md`).

## Rules
- ₱0 budget. No paid APIs, libraries, plans, or anything that needs a payment method without my approval.
- Do not deploy or change hosted/production resources unless I say exactly "Deploy now."
- Never commit secrets. Real values live in untracked `.env` files. `.env.example` has placeholders only.
- Never expose the Supabase secret/service-role key to the frontend. Never trust a user ID sent by the browser.
- Keep RLS on for every app table. Do not bypass RLS without a documented reason in `SECURITY_PLAN.md`.
- Do only the phase/task requested. No unplanned features or dependencies.
- Never claim something works unless it was implemented and tested; otherwise label it unverified.
- Never run destructive tests against hosted data. Tests use the local Supabase stack.
- Ask before decisions that affect cost, security, data integrity, or architecture.

## Working style
- Short, plain sentences. Explain unusual things in one or two lines.
- Before a phase: objective, files to change, risks — 3–5 lines — then ask "Want me to start Phase N?".
  My yes approves that plan; do not ask again.
- After a phase: what changed, checks run and results, what to check by hand, next phase with
  suggested model and effort. Then stop.
- Update `docs/IMPLEMENTATION_ROADMAP.md` only after checks pass.
- If context runs low, write current state and the exact next step into the roadmap.

## Next.js note
This uses a recent Next.js (16.x). APIs may differ from training data. Read the guide in
`frontend/node_modules/next/dist/docs/` before writing Next.js code, and heed deprecation notices.
