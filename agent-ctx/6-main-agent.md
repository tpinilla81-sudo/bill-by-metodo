# Task 6 - Screen-based User Permissions & Subscription Plans

## Summary
Implemented two major features for the BILL app:

### Feature 1: Screen-based permissions for users
- Added `permissions` field to User model (JSON array of screen keys)
- Admin/superadmin always see all screens
- Regular users only see screens in their permissions array
- Empty permissions = all screens accessible (backwards compat)
- Permission checkboxes in user create/edit dialog (only for "user" role)
- Sidebar filters navigation based on permissions
- Page.tsx checks permissions before rendering views

### Feature 2: Subscription plans for tenants
- Added plan, planStatus, planExpiresAt, maxUsers, maxRegistros to Tenant model
- 4 plan tiers: Gratuito, Mensual, Trimestral, Anual
- Admin panel Suscripciones tab for managing tenant plans
- Plans view with pricing cards for admin users
- Plan limits enforced in users and registros APIs
- Plan changes auto-update limits

## Files Modified
- `prisma/schema.prisma` - Added permissions to User, subscription fields to Tenant
- `src/lib/auth.ts` - Added permissions to SessionUser
- `src/lib/auth-context.tsx` - Added permissions to AuthUser
- `src/app/api/auth/login/route.ts` - Include permissions in session/response
- `src/app/api/auth/me/route.ts` - Fetch fresh permissions from DB
- `src/app/api/users/route.ts` - Accept/save permissions, enforce plan limits
- `src/app/api/tenants/route.ts` - Default plan, subscription fields, plan changes
- `src/app/api/registros/route.ts` - Check maxRegistros limit
- `src/components/hualsa/sidebar.tsx` - Filter nav based on permissions
- `src/components/hualsa/admin-view.tsx` - Permissions checkboxes + Suscripciones tab
- `src/components/hualsa/plans-view.tsx` (NEW) - Pricing cards
- `src/app/page.tsx` - Permission checks, suscripcion view

## Database Changes
- User: added `permissions String @default("")`
- Tenant: added `plan String @default("gratuito")`, `planStatus String @default("activo")`, `planExpiresAt DateTime?`, `maxUsers Int @default(1)`, `maxRegistros Int @default(100)`
- Existing tenants updated to "mensual" plan (they had 2 users, exceeding gratuito limit of 1)
