-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cif" TEXT NOT NULL DEFAULT '',
    "dir" TEXT NOT NULL DEFAULT '',
    "cp" TEXT NOT NULL DEFAULT '',
    "ciudad" TEXT NOT NULL DEFAULT '',
    "prov" TEXT NOT NULL DEFAULT '',
    "mail" TEXT NOT NULL DEFAULT '',
    "tel" TEXT NOT NULL DEFAULT '',
    "customData" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Catalogo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL DEFAULT '',
    "c1" TEXT NOT NULL,
    "c2" TEXT NOT NULL,
    "coste" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "final" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "customData" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Catalogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Registro" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "cliente" TEXT NOT NULL DEFAULT '',
    "c1" TEXT NOT NULL,
    "c2" TEXT NOT NULL,
    "cant" INTEGER NOT NULL DEFAULT 1,
    "obs" TEXT NOT NULL DEFAULT '',
    "pasadoRegistro" BOOLEAN NOT NULL DEFAULT false,
    "facturado" BOOLEAN NOT NULL DEFAULT false,
    "customData" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Registro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT NOT NULL DEFAULT '',
    "fullName" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "province" TEXT NOT NULL DEFAULT '',
    "cif" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "plan" TEXT NOT NULL DEFAULT 'gratuito',
    "planStatus" TEXT NOT NULL DEFAULT 'activo',
    "planExpiresAt" TIMESTAMP(3),
    "maxUsers" INTEGER NOT NULL DEFAULT 1,
    "maxRegistros" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'user',
    "permissions" TEXT NOT NULL DEFAULT '',
    "tenantId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacturaSeq" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "FacturaSeq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Config" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL DEFAULT 'BILL by Metodo',
    "companyFullName" TEXT NOT NULL DEFAULT '',
    "companyAddress" TEXT NOT NULL DEFAULT '',
    "companyCity" TEXT NOT NULL DEFAULT '',
    "companyProvince" TEXT NOT NULL DEFAULT '',
    "companyCif" TEXT NOT NULL DEFAULT '',
    "logo" TEXT NOT NULL DEFAULT '',
    "currency" TEXT NOT NULL DEFAULT '€',
    "defaultIva" DOUBLE PRECISION NOT NULL DEFAULT 21,
    "appName" TEXT NOT NULL DEFAULT 'BILL by Metodo',
    "appVersion" TEXT NOT NULL DEFAULT 'v3.0',
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "FacturaSeq_tenantId_key" ON "FacturaSeq"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Config_tenantId_key" ON "Config"("tenantId");

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Catalogo" ADD CONSTRAINT "Catalogo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Catalogo" ADD CONSTRAINT "Catalogo_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registro" ADD CONSTRAINT "Registro_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registro" ADD CONSTRAINT "Registro_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaSeq" ADD CONSTRAINT "FacturaSeq_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Config" ADD CONSTRAINT "Config_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

