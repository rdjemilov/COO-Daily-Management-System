# Adding New Modules & Registrations

The Daily Management System (DMS) uses a configuration-driven module registration architecture. This document guides future developers through adding a new business module (e.g., Inventory, Purchase, Debitor) to both the front-end sidebar and the back-end spreadsheets database layers without breaking the existing framework.

---

## 1. Step 1: Register front-end Sidebar navigation

All main modules are registered in `/src/shared/components/layout/Shell.tsx` using the `SIDEBAR_ITEMS` configuration array.

To add a new module (e.g., Inventory):
1. Import the desired Lucide icon in `Shell.tsx`.
2. Add your module config to the `SIDEBAR_ITEMS` array:

```typescript
// /src/shared/components/layout/Shell.tsx
import { LayoutDashboard, BarChart3, Database, Package } from "lucide-react";

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "sales", label: "Sales & Rentabilitet", icon: BarChart3 },
  { id: "database", label: "Database Management", icon: Database },
  { id: "inventory", label: "Inventory (Lager)", icon: Package }, // NEW MODULE
];
```

3. Update `/src/App.tsx` to handle rendering your new module views when `activeModule === "inventory"`.

---

## 2. Step 2: Define New Import Schema

Create your schemas, canonical models, and column mapping inside the validator or in a new module folder `/src/modules/inventory/types.ts`.

Create a column map in `/server/validator.ts` similar to `COLUMN_MAPS` for mapping the inventory NAV Excel headers to your typed canonical model.

---

## 3. Step 3: Set Up a Dedicated Spreadsheet Database

Every module must use its own Google Spreadsheet to maintain separation of concerns.

1. Create a new Google Spreadsheet in your Google Drive (e.g., `DMS - Inventory`).
2. Add the sheet ID as a new environment variable inside `.env.example` and your production hosting configuration (e.g., `GOOGLE_INVENTORY_SPREADSHEET_ID`).
3. Update `server/dbService.ts` to route inventory writes to the inventory spreadsheet ID when `businessModule === "Inventory"`.

---

## 4. Step 4: Implement Calculations & Dashboard Panels

1. Create the module calculations logic in `/src/modules/inventory/calculations.ts` using strict TypeScript.
2. Build responsive dashboards and interactive tables under `/src/modules/inventory/components/`.
3. Render your new dashboards safely in the orchestrator file `/src/App.tsx`.
