---
Task ID: 1
Agent: Main
Task: Reconstruct and verify the complete BILL app with auth, admin, and all improvements

Work Log:
- Verified all project files exist and are complete
- Auth system: JWT-based (lib/auth.ts), auth-context.tsx, login page, API routes (login/logout/me) - ALL WORKING
- Tenant model in Prisma with logo, fullName, address, CIF, city, province - COMPLETE
- User model linked to Tenant with roles (superadmin, admin, user) - COMPLETE
- Admin panel with TenantsTab and UsersTab (admin-view.tsx) - COMPLETE
- Login page with BILL branding - COMPLETE
- Auto-seed: first login creates default admin@bill.es/admin123 user - COMPLETE
- Facturas: company data + logo on invoice, A4 PDF print, Excel XLSX export, facturado indicator - COMPLETE
- Sidebar: tenant logo with fallback chain (tenant → config → default) - COMPLETE
- Configuración: REMOVED Transfer, Secciones, Etiquetas tabs (only Empresa, Conceptos, Campos remain)
- Moved section names into Empresa tab as a sub-card
- Prisma generate + db push - DB is in sync
- Next.js build succeeds (18 routes, all compiled)
- Dev server starts and login API works (returns superadmin user with BILL tenant)

Stage Summary:
- All features from the original BILL app are present and functional
- Login: admin@bill.es / admin123 (superadmin)
- Configuración now has 3 tabs: Empresa, Conceptos, Campos
- Facturas has: logo, company data, A4 print, Excel export, facturado badges
- Admin panel: create/manage tenants + users with auto-generated credentials
- Server runs on port 3000
