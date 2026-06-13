---
Task ID: 1
Agent: Main Agent
Task: Fix Entrada save issue for superadmin - add tenant selector

Work Log:
- Investigated the Entrada save failure
- Discovered the root cause: superadmin belongs to "Sistema" tenant which has 0 clientes, 0 catalogo, 0 registros
- The required fields (clienteId, c1, c2) couldn't be populated because there was no data
- This was NOT a permissions issue - it was a tenant data context issue
- Added tenant selector for superadmin in the sidebar
- Made effectiveTenantId configurable in auth-context.tsx with localStorage persistence
- Fixed undefined precioUnit function in entrada-view.tsx (replaced with autoPrice)
- Added React key={effectiveTenantId} to force view remount on tenant switch
- ConfigProvider already re-fetches when effectiveTenantId changes
- Tested all API endpoints with curl - tenant switching works correctly

Stage Summary:
- Root cause: Sistema tenant has no data for Entrada form
- Fix: Superadmin can now switch between tenants via sidebar selector
- Also fixed: precioUnit undefined reference in entrada-view.tsx
- Files modified: auth-context.tsx, sidebar.tsx, page.tsx, entrada-view.tsx
