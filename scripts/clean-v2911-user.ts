// Borra el usuario temporal de test de V29.11
import { Database } from 'bun:sqlite'
const db = new Database('/home/z/my-project/db/custom.db')
const r = db.prepare("DELETE FROM User WHERE email = 'test-v2911@hualsa.es'").run()
console.log('Usuario test eliminado, filas:', r.changes)
