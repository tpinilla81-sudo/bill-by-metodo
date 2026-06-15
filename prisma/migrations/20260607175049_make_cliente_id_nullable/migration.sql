-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Catalogo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "clienteId" TEXT,
    "c1" TEXT NOT NULL,
    "c2" TEXT NOT NULL,
    "coste" REAL NOT NULL DEFAULT 0,
    "inc" REAL NOT NULL DEFAULT 0,
    "final" REAL NOT NULL DEFAULT 0,
    "customData" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Catalogo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Catalogo_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Catalogo" ("c1", "c2", "clienteId", "coste", "createdAt", "customData", "final", "id", "inc", "tenantId", "updatedAt") SELECT "c1", "c2", "clienteId", "coste", "createdAt", "customData", "final", "id", "inc", "tenantId", "updatedAt" FROM "Catalogo";
DROP TABLE "Catalogo";
ALTER TABLE "new_Catalogo" RENAME TO "Catalogo";
CREATE TABLE "new_Registro" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "fecha" TEXT NOT NULL,
    "clienteId" TEXT,
    "cliente" TEXT NOT NULL DEFAULT '',
    "c1" TEXT NOT NULL,
    "c2" TEXT NOT NULL,
    "cant" INTEGER NOT NULL DEFAULT 1,
    "obs" TEXT NOT NULL DEFAULT '',
    "pasadoRegistro" BOOLEAN NOT NULL DEFAULT false,
    "customData" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Registro_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Registro_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
INSERT INTO "new_Registro" ("c1", "c2", "cant", "cliente", "clienteId", "createdAt", "customData", "fecha", "id", "obs", "pasadoRegistro", "tenantId", "updatedAt") SELECT "c1", "c2", "cant", "cliente", "clienteId", "createdAt", "customData", "fecha", "id", "obs", "pasadoRegistro", "tenantId", "updatedAt" FROM "Registro";
DROP TABLE "Registro";
ALTER TABLE "new_Registro" RENAME TO "Registro";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
