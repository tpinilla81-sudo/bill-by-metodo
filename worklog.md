---
Task ID: 1
Agent: main
Task: Restructure HUALSA PRO - Split Registro into Entrada + Registros, make Entrada mobile/iPhone optimized

Work Log:
- Created new EntradaView component with iPhone/mobile-first design: full-width stacked cards, 48px+ touch targets, large fonts, rounded-2xl cards, native iOS-style form fields
- Added Excel import functionality: file picker for .xlsx/.xls/.csv, column mapping (FECHA, CLIENTE, CONCEPTO 1, CONCEPTO 2, CANTIDAD, OBSERVACIONES), preview modal with validation, batch import API
- Added Excel export: current data export and template download
- Created RegistrosView component: read-only table combining entradas with catalog data (precio unitario, importe, mes, semana), filters, Excel export
- Updated API route /api/registros to support batch import (POST with {batch: [...]} body)
- Updated sidebar navigation: ENTRADA, REGISTROS, CLIENTES, CATALOGO, FACTURAS, SEGURIDAD
- Updated page.tsx with new view structure
- Installed xlsx package for Excel processing
- Verified with agent browser: all views render correctly, no errors, mobile layout works on iPhone viewport

Stage Summary:
- Entrada = input-only view (manual form + Excel import), optimized for iPhone
- Registros = read-only table with catalog pricing data joined
- All 6 navigation items working
- Batch import API endpoint functional
- Mobile-first design with large touch targets, card-based entries list, collapsible Excel tools section
