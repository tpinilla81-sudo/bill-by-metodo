# Task 3 — Prepare BILL app for Vercel deployment with PostgreSQL

## Agent
Main Agent

## Task
Prepare the BILL app for production deployment on Vercel with PostgreSQL, keeping local SQLite development working.

## Work Completed

### Files Created
1. **`vercel.json`** — Vercel configuration with build command, framework, and DATABASE_PROVIDER env var
2. **`.env.example`** — Documented environment variables for SQLite (local) and PostgreSQL (production)
3. **`prisma/schema.prisma.pg`** — PostgreSQL version of the Prisma schema (identical models, `provider = "postgresql"`)
4. **`DEPLOY.md`** — Comprehensive Vercel deployment guide (7 steps, security checklist, troubleshooting)

### Files Modified
1. **`package.json`** — Added `postinstall`, `vercel-build`, `db:migrate:prod` scripts; changed `start` to `next start`
2. **`next.config.ts`** — Added security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, X-XSS-Protection), enabled `poweredByHeader: false`, set `reactStrictMode: true`
3. **`.gitignore`** — Added `*.db`, `*.db-journal`, `backups/` entries
4. **`worklog.md`** — Appended task record

### Verification
- `npx next build` succeeds (20 routes, all compiled)
- Dev server running on port 3000
- All existing functionality preserved (SQLite unchanged)

## Key Decisions
- Kept SQLite schema untouched for local dev
- Created separate `.pg` schema file for production (avoids breaking local dev)
- `postinstall: prisma generate` ensures Vercel generates client on deploy
- Security headers applied globally to all routes
