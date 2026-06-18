import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'

const SESSION_SECRET = process.env.SESSION_SECRET || 'bill-secret-key-change-in-production-2024'
const SESSION_COOKIE_NAME = 'bill-session'
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export interface SessionUser {
  id: string
  email: string
  name: string
  role: string   // "superadmin", "admin", "user"
  tenantId: string
  permissions: string  // JSON array string e.g. '["entrada","registros"]'
}

interface SessionData extends SessionUser {
  exp: number // expiry timestamp
}

// ─── Password helpers ────────────────────────────────────────
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// ─── Simple HMAC signing ─────────────────────────────────────
async function hmacSign(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  return Buffer.from(signature).toString('base64url')
}

async function hmacVerify(data: string, signature: string): Promise<boolean> {
  const expected = await hmacSign(data)
  return expected === signature
}

// ─── Session create/verify ───────────────────────────────────
export async function createSession(user: SessionUser): Promise<string> {
  const sessionData: SessionData = {
    ...user,
    exp: Date.now() + SESSION_DURATION_MS,
  }
  const payload = Buffer.from(JSON.stringify(sessionData)).toString('base64url')
  const signature = await hmacSign(payload)
  return `${payload}.${signature}`
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const [payload, signature] = token.split('.')
    if (!payload || !signature) return null

    const valid = await hmacVerify(payload, signature)
    if (!valid) return null

    const data: SessionData = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf-8')
    )

    if (data.exp && Date.now() > data.exp) return null

    return {
      id: data.id,
      email: data.email,
      name: data.name,
      role: data.role,
      tenantId: data.tenantId,
      permissions: data.permissions || '',
    }
  } catch {
    return null
  }
}

// ─── Cookie helpers (server-side only) ───────────────────────
export async function setSessionCookie(token: string) {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_MS / 1000,
  })
}

export async function clearSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!token) return null
  return verifySession(token)
}

// Alias for backwards compatibility
export const getAuthUser = getSessionUser

// ─── Role-based access helpers ───────────────────────────────

// requireAdmin: Allows "admin" or "superadmin" roles
export async function requireAdmin(): Promise<SessionUser | null> {
  const user = await getSessionUser()
  if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) return null
  return user
}

// requireSuperadmin: Only allows "superadmin" role
export async function requireSuperadmin(): Promise<SessionUser | null> {
  const user = await getSessionUser()
  if (!user || user.role !== 'superadmin') return null
  return user
}

// Helper: check if user has admin-level access (admin or superadmin)
export function isAdminRole(role: string): boolean {
  return role === 'admin' || role === 'superadmin'
}

// Helper: check if user is superadmin
export function isSuperadminRole(role: string): boolean {
  return role === 'superadmin'
}
