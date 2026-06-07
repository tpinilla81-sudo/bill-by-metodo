---
Task ID: 1
Agent: Main
Task: Make the HUALSA PRO app configurable for any company - logo upload, company data, configurable labels for all sections

Work Log:
- Added Config model to Prisma schema with 23 fields (company data, labels JSON, section names)
- Ran prisma db push and created initial config record
- Created /api/config API route (GET/PUT) with auto-creation of default config
- Created /src/lib/config.tsx with: default label sets for all 5 sections, AppConfig type, ResolvedConfig type with parsed labels, ConfigProvider context, useConfig hook
- Created /src/components/hualsa/configuracion-view.tsx with 3 tabs: Empresa (logo upload, company data, currency, IVA), Secciones (section name customization), Etiquetas (column label customization for all 5 sections)
- Updated Sidebar: dynamic company name, logo (base64 or default), section labels from config, new CONFIGURACIÓN nav item
- Updated page.tsx: added ConfigProvider wrapper, dynamic document title, new config view
- Updated EntradaView: all form labels, Excel column names, error messages use config labels
- Updated CatalogoView: all form/table labels, Excel column names use config labels
- Updated RegistrosView: all table headers, Excel export columns use config labels
- Updated FacturasView: invoice preview uses dynamic company name/address/logo, all labels configurable, default IVA from config
- Updated ClientesView: all form/table labels use config labels
- Updated BackupView: dynamic app name in backup filename
- Updated hualsa-utils.ts: fmtCurrency accepts optional currency parameter
- Build succeeds, API tested and working

Stage Summary:
- App is now fully configurable for any company
- New CONFIGURACIÓN section in sidebar with 3 tabs (Empresa, Secciones, Etiquetas)
- Logo upload (base64, max 2MB) stored in DB
- All section names, column labels, and company data configurable
- Invoice preview uses dynamic company data and logo
- All Excel imports/exports use configurable column names
- Production build passes successfully
