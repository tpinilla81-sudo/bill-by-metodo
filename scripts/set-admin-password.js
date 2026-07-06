// Set a known password for the existing admin user so we can demo the full workflow.
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const db = new Database('/home/z/my-project/db/custom.db');

const EMAIL = 'transporteshualsa@gmail.com';
const PASSWORD = 'hualsa2024';

(async () => {
  const hash = await bcrypt.hash(PASSWORD, 12);
  const r = db.prepare('UPDATE User SET password = ?, active = 1, updatedAt = ? WHERE email = ?').run(
    hash,
    new Date().toISOString(),
    EMAIL
  );
  console.log('Filas actualizadas:', r.changes);
  const u = db.prepare('SELECT id, email, name, role, tenantId FROM User WHERE email = ?').get(EMAIL);
  console.log(JSON.stringify(u, null, 2));
  db.close();
})().catch(e => { console.error(e); process.exit(1); });
