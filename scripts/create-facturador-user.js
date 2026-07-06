// Create a "facturador" user (role=user) with permissions only on facturas + facturas.editarNumero
// for the Hualsa tenant, so we can demo the new PRE-FACTURA → FACTURAS workflow.
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const db = new Database('home/z/my-project/db/custom.db'.replace('home/z/my-project/', '/home/z/my-project/'));

const TENANT_ID = 'cmq6uwub10000n9qluafni88m'; // Transportes Hualsa 2021 SL.
const EMAIL = 'facturador@hualsa.es';
const NAME = 'Facturador Hualsa';
const PASSWORD = 'factura123';

(async () => {
  const existing = db.prepare('SELECT id FROM User WHERE email = ?').get(EMAIL);
  if (existing) {
    console.log('Usuario ya existe, actualizando...');
    const hash = await bcrypt.hash(PASSWORD, 12);
    db.prepare(`
      UPDATE User
      SET password = ?, name = ?, role = 'user',
          permissions = ?, tenantId = ?, active = 1, updatedAt = ?
      WHERE email = ?
    `).run(
      hash,
      NAME,
      JSON.stringify(['facturas', 'facturas.editarNumero']),
      TENANT_ID,
      new Date().toISOString(),
      EMAIL
    );
    console.log('Usuario actualizado.');
  } else {
    const id = 'cmq' + crypto.randomBytes(8).toString('hex');
    const hash = await bcrypt.hash(PASSWORD, 12);
    db.prepare(`
      INSERT INTO User (id, email, name, password, role, permissions, tenantId, active, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, 'user', ?, ?, 1, ?, ?)
    `).run(
      id,
      EMAIL,
      NAME,
      hash,
      JSON.stringify(['facturas', 'facturas.editarNumero']),
      TENANT_ID,
      new Date().toISOString(),
      new Date().toISOString()
    );
    console.log('Usuario creado con id:', id);
  }

  // Verify
  const u = db.prepare('SELECT id, email, name, role, tenantId, permissions FROM User WHERE email = ?').get(EMAIL);
  console.log('--- USUARIO FACTURADOR ---');
  console.log(JSON.stringify(u, null, 2));
  db.close();
})().catch(e => { console.error(e); process.exit(1); });
