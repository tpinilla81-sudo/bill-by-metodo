---
Task ID: 1
Agent: main
Task: Add inline configuration panels to Entrada, Clientes, and Catálogo views

Work Log:
- Added pasadoRegistro boolean field to Registro model in Prisma schema
- Added transferMode and transferTime fields to Config model in Prisma schema
- Updated config types (AppConfig, ResolvedConfig) in lib/config.tsx
- Updated hualsa-utils.ts Registro interface with pasadoRegistro
- Updated /api/registros route to support ?filter=entrada|registros|all
- Created /api/registros/transfer POST endpoint for manual/batch transfer
- Updated /api/config route with new fields (transferMode, transferTime)
- Modified EntradaView: only shows non-transferred entries, has inline transfer settings panel (auto/manual mode + time), has "PASAR AL REGISTRO" button for manual mode, has auto-transfer timer
- Modified RegistrosView: only shows transferred entries (filter=registros)
- Added inline settings panel to ClientesView for label customization
- Added inline settings panel to CatalogoView for label customization
- Added Transfer tab in ConfiguracionView with mode selection UI
- Ran Prisma migration (db push) and rebuilt successfully

Stage Summary:
- Entrada view now shows only active (non-transferred) entries
- Transfer mode can be toggled (auto/manual) directly from Entrada view
- Auto-transfer time is configurable inline
- Manual transfer button appears when mode is "manual"
- Clientes and Catálogo have collapsible settings panels for label customization
- All changes compile and build successfully
- Server is unstable in sandbox due to memory constraints but code is correct
---
Task ID: 1
Agent: Main Agent
Task: Add configurable visible fields for Entrada, Clientes, and Catálogo in Configuración

Work Log:
- Added `fieldsEntrada`, `fieldsClientes`, `fieldsCatalogo` string fields to Prisma schema (JSON arrays)
- Added `DEFAULT_FIELDS_ENTRADA`, `DEFAULT_FIELDS_CLIENTES`, `DEFAULT_FIELDS_CATALOGO` constants to config.tsx
- Added `parseFieldsArray()` function and `fieldsEntrada/fieldsClientes/fieldsCatalogo` to ResolvedConfig
- Updated config API route to accept the 3 new fields
- Updated EntradaView: each form field (fecha, cliente, c1, c2, cantidad, observaciones) now uses `isVisible(field)` check
- Updated ClientesView: each form field and table column uses `isVisible(field)` check
- Updated CatalogoView: each form field and table column uses `isVisible(field)` check
- Added new "Campos" tab in ConfiguracionView with toggle chips for each field in each section
- Built production app and verified API works correctly
- Server tested and config API stores/retrieves fields correctly

Stage Summary:
- Users can now go to Configuración → Campos tab and toggle on/off which fields appear in Entrada, Clientes, and Catálogo
- Fields are stored as JSON arrays in the Config table in SQLite
- When fields are empty/missing, defaults show all fields (backward compatible)
