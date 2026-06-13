# BILL App — Vercel Deployment Guide

This guide covers deploying the BILL application to Vercel with PostgreSQL.

## Prerequisites

- A [Vercel](https://vercel.com) account
- A PostgreSQL database (see options below)
- The BILL project code in a Git repository

---

## Step 1: Set Up PostgreSQL

Choose one of these PostgreSQL providers:

### Option A: Vercel Postgres (Recommended)
1. Go to your Vercel project → **Storage** tab
2. Click **Create Database** → select **Postgres**
3. Choose a region close to your users
4. Once created, click **Connect to Project** — this auto-sets the `DATABASE_URL` env var

### Option B: Supabase
1. Create a project at [supabase.com](https://supabase.com)
2. Go to **Settings** → **Database** → copy the connection string (URI format)
3. Use the connection string as your `DATABASE_URL`

### Option C: Neon
1. Create a project at [neon.tech](https://neon.tech)
2. Copy the connection string from the dashboard
3. Use it as your `DATABASE_URL`

---

## Step 2: Switch Schema to PostgreSQL

The project includes a PostgreSQL-ready schema at `prisma/schema.prisma.pg`. Before deploying:

```bash
# Replace the SQLite schema with the PostgreSQL version
cp prisma/schema.prisma.pg prisma/schema.prisma
```

The only difference is the datasource provider:
- **SQLite** (local dev): `provider = "sqlite"`
- **PostgreSQL** (production): `provider = "postgresql"`

---

## Step 3: Create Prisma Migration

Once you've switched to the PostgreSQL schema, create an initial migration:

```bash
# Set your production DATABASE_URL temporarily
export DATABASE_URL="postgresql://user:password@host:5432/database?schema=public"

# Create the migration
npx prisma migrate dev --name init

# This creates the prisma/migrations/ folder
```

Commit the `prisma/migrations/` folder to your repository — Vercel needs it.

---

## Step 4: Configure Vercel Environment Variables

In your Vercel project dashboard → **Settings** → **Environment Variables**, add:

| Variable | Value | Required |
|----------|-------|----------|
| `DATABASE_URL` | `postgresql://user:password@host:5432/database?schema=public` | ✅ Yes |
| `SESSION_SECRET` | A strong random string (min 32 chars) | ✅ Yes |
| `NODE_ENV` | `production` | ✅ Yes |

### Generating a secure SESSION_SECRET

```bash
# Option 1: Using OpenSSL
openssl rand -base64 32

# Option 2: Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**⚠️ IMPORTANT:** Never use the default `bill-secret-key-change-in-production-2024` in production!

---

## Step 5: Deploy to Vercel

### Option A: Via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy (first time — follow prompts)
vercel

# Subsequent deployments
vercel --prod
```

### Option B: Via Git Integration

1. Push your code to GitHub/GitLab/Bitbucket
2. Go to [vercel.com/new](https://vercel.com/new)
3. Import your repository
4. Vercel auto-detects Next.js — click **Deploy**

The `vercel.json` file ensures:
- `prisma generate` runs before build
- PostgreSQL provider is set as an env var

---

## Step 6: Run Migrations on Production DB

After the first deployment, apply migrations to your production database:

```bash
# Set DATABASE_URL to your production PostgreSQL
export DATABASE_URL="postgresql://user:password@host:5432/database?schema=public"

# Apply pending migrations
npx prisma migrate deploy
```

Alternatively, you can run this via the Vercel CLI:

```bash
vercel env pull .env.production.local
npx prisma migrate deploy
```

---

## Step 7: Seed the Database (Optional)

To create the default superadmin user:

```bash
# Ensure DATABASE_URL points to production
export DATABASE_URL="postgresql://user:password@host:5432/database?schema=public"

# Run the seed script
npm run db:seed
```

Default credentials: `admin@bill.es` / `admin123`

**⚠️ Change the default password immediately after first login!**

---

## Local Development (SQLite)

Local development still uses SQLite. No changes needed:

```bash
# .env file (already configured for local dev)
DATABASE_URL="file:./dev.db"
SESSION_SECRET="bill-secret-key-change-in-production-2024"
NODE_ENV="development"

# Start dev server
npm run dev
```

The SQLite schema (`prisma/schema.prisma`) remains unchanged for local development.

---

## Switching Between Local and Production Schemas

| Environment | Schema File | Provider | DATABASE_URL |
|-------------|-------------|----------|--------------|
| Local Dev | `prisma/schema.prisma` | `sqlite` | `file:./dev.db` |
| Production | `prisma/schema.prisma.pg` | `postgresql` | `postgresql://...` |

To switch for deployment:
```bash
cp prisma/schema.prisma.pg prisma/schema.prisma
```

To switch back for local dev:
```bash
git checkout prisma/schema.prisma
npx prisma generate
```

---

## Security Checklist

- [ ] `SESSION_SECRET` is a strong, unique random string (not the default)
- [ ] Default admin password (`admin123`) has been changed
- [ ] `DATABASE_URL` is not committed to the repository
- [ ] `.env` and `.env.local` are in `.gitignore`
- [ ] Security headers are active (configured in `next.config.ts`):
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-XSS-Protection: 1; mode=block`
- [ ] `poweredByHeader` is disabled (no `X-Powered-By: Next.js` header)

---

## Troubleshooting

### Build fails with Prisma errors
- Ensure `prisma generate` runs during build (the `postinstall` script handles this)
- Verify `prisma/schema.prisma` uses `provider = "postgresql"` for Vercel
- Check that `DATABASE_URL` is set in Vercel environment variables

### Database connection errors
- Verify the PostgreSQL connection string format
- Ensure the database is accessible from Vercel's servers (check IP allowlist / VPC settings)
- For Vercel Postgres: ensure the database is linked to the project

### Migrations not applied
- Run `npx prisma migrate deploy` manually with the production `DATABASE_URL`
- Check that the `prisma/migrations/` folder is committed to the repository

### "P1001: Can't reach database server"
- The PostgreSQL server may be paused (Neon auto-pauses after inactivity)
- Wake it up by visiting the provider's dashboard or making a test query
