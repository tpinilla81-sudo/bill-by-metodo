// Crea (o resetea) un usuario temporal de TEST en el tenant Hualsa para
// validar la UI de STOCK ALMACÉN en V29.16 (nueva config P1+P2). BORRAR al terminar:
//   bun scripts/clean-v2916-user.ts
import { Database } from 'bun:sqlite'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

const db = new Database('/home/z/my-project/db/custom.db')
const TENANT_ID = 'cmq6uwub10000n9qluafni88m'
const EMAIL = 'test-v2916@hualsa.es'
const PASSWORD = 'test2916'

const perms = JSON.stringify(['stock', 'registros', 'entrada'])
const hash = await bcrypt.hash(PASSWORD, 12)
const existing = db.prepare('SELECT id FROM User WHERE email = ?').get(EMAIL) as { id: string } | undefined
if (existing) {
  db.prepare('UPDATE User SET password = ?, permissions = ?, active = 1 WHERE email = ?').run(hash, perms, EMAIL)
  console.log('Usuario test actualizado:', EMAIL)
} else {
  const id = 'cmq' + crypto.randomBytes(8).toString('hex')
  db.prepare(`INSERT INTO User (id, email, name, password, role, permissions, tenantId, active, createdAt, updatedAt)
    VALUES (?, ?, 'Test V29.16', ?, 'user', ?, ?, 1, ?, ?)`)
    .run(id, EMAIL, hash, perms, TENANT_ID, new Date().toISOString(), new Date().toISOString())
  console.log('Usuario test creado:', EMAIL)
}
