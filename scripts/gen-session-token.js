// Generates a valid bill-session cookie for the tenant admin user.
// Usage: node scripts/gen-session-token.js
const crypto = require('crypto')

const SESSION_SECRET = process.env.SESSION_SECRET || 'bill-secret-key-change-in-production-2024'

// Find tenant admin user from the DB
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const user = await db.user.findFirst({ where: { role: 'admin' } })
  if (!user) {
    console.error('No admin user found')
    process.exit(1)
  }
  const session = {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId,
    permissions: user.permissions || '',
  }
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url')
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url')
  const token = `${payload}.${sig}`
  console.log(token)
  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
