---
Task ID: 1
Agent: main
Task: Build HUALSA PRO Next.js web application

Work Log:
- Initialized fullstack project with Next.js 16 + TypeScript + Tailwind CSS 4 + shadcn/ui
- Created Prisma schema with Cliente, Catalogo, Registro, FacturaSeq models
- Pushed schema to SQLite database
- Created API routes for CRUD operations: /api/clientes, /api/catalogo, /api/registros, /api/backup, /api/factura-seq
- Built Sidebar component with responsive mobile support (hamburger menu)
- Built RegistroView component with form, filters, and table
- Built ClientesView component with form and table
- Built CatalogoView component with form, filters, and table
- Built FacturasView component with filters, checkbox selection, invoice generation, modal preview
- Built BackupView component with export/import JSON and wipe functionality
- Built InvoicePreview component with professional invoice layout
- Generated Hualsa logo image and favicon
- Fixed lint errors (set-state-in-effect rule)
- Fixed __all__/__none__ placeholder value handling in filters and forms
- Verified with Agent Browser - all views functional, CRUD operations working, data persisting

Stage Summary:
- Complete HUALSA PRO application converted from HTML/Firebase to Next.js 16 with Prisma/SQLite
- All 5 views working: REGISTRO, CLIENTES, CATÁLOGO, FACTURAS, SEGURIDAD
- API routes support full CRUD for all entities
- Invoice generation with modal preview, print, and CSV export
- Backup/restore via JSON import/export
- Responsive design with mobile sidebar toggle
