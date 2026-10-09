// Borra el usuario temporal de test de V29.16
import { Database } from 'bun:sqlite'
const db = new Database('/home/z/my-project/db/custom.db')
const del = db.prepare(`DELETE FROM User WHERE email = 'test-v2916@hualsa.es'`).run()
console.log(`Usuario test-v2916@hualsa.es eliminado: ${del.changes} fila(s)`)
