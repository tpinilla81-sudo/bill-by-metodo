-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "nombre" TEXT NOT NULL,
    "cif" TEXT NOT NULL DEFAULT '',
    "dir" TEXT NOT NULL DEFAULT '',
    "cp" TEXT NOT NULL DEFAULT '',
    "ciudad" TEXT NOT NULL DEFAULT '',
    "prov" TEXT NOT NULL DEFAULT '',
    "mail" TEXT NOT NULL DEFAULT '',
    "tel" TEXT NOT NULL DEFAULT '',
    "customData" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Cliente_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Catalogo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "clienteId" TEXT NOT NULL DEFAULT '',
    "c1" TEXT NOT NULL,
    "c2" TEXT NOT NULL,
    "coste" REAL NOT NULL DEFAULT 0,
    "inc" REAL NOT NULL DEFAULT 0,
    "final" REAL NOT NULL DEFAULT 0,
    "customData" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Catalogo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Catalogo_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Registro" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "fecha" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL DEFAULT '',
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

-- CreateTable
CREATE TABLE "FacturaSeq" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "seq" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "FacturaSeq_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Config" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'main',
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "companyName" TEXT NOT NULL DEFAULT 'METODO',
    "companyFullName" TEXT NOT NULL DEFAULT 'METODO',
    "companyAddress" TEXT NOT NULL DEFAULT '',
    "companyCity" TEXT NOT NULL DEFAULT '',
    "companyProvince" TEXT NOT NULL DEFAULT '',
    "companyCif" TEXT NOT NULL DEFAULT '',
    "logo" TEXT NOT NULL DEFAULT '',
    "currency" TEXT NOT NULL DEFAULT '€',
    "defaultIva" REAL NOT NULL DEFAULT 21,
    "appName" TEXT NOT NULL DEFAULT 'BILL',
    "appVersion" TEXT NOT NULL DEFAULT 'v1.0',
    "labelEntrada" TEXT NOT NULL DEFAULT '',
    "labelCatalogo" TEXT NOT NULL DEFAULT '',
    "labelRegistros" TEXT NOT NULL DEFAULT '',
    "labelFacturas" TEXT NOT NULL DEFAULT '',
    "labelClientes" TEXT NOT NULL DEFAULT '',
    "sectionEntrada" TEXT NOT NULL DEFAULT 'ENTRADA',
    "sectionRegistros" TEXT NOT NULL DEFAULT 'REGISTROS',
    "sectionClientes" TEXT NOT NULL DEFAULT 'CLIENTES',
    "sectionCatalogo" TEXT NOT NULL DEFAULT 'CATÁLOGO',
    "sectionFacturas" TEXT NOT NULL DEFAULT 'FACTURAS',
    "sectionBackup" TEXT NOT NULL DEFAULT 'SEGURIDAD',
    "transferMode" TEXT NOT NULL DEFAULT 'auto',
    "transferTime" TEXT NOT NULL DEFAULT '00:00',
    "fieldsEntrada" TEXT NOT NULL DEFAULT '',
    "fieldsClientes" TEXT NOT NULL DEFAULT '',
    "fieldsCatalogo" TEXT NOT NULL DEFAULT '',
    "fieldsRegistros" TEXT NOT NULL DEFAULT '',
    "fieldsFacturas" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Config_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
