# Application Architecture - Daily Management System (DMS)

This document describes the high-level architecture of the Daily Management System, replacing the previous Excel-based reporting logic with a production-ready, modular full-stack Web Application.

---

## 1. System Design Goals

- **Durable Persistence via Google Sheets**: Real daily data exports are stored server-side inside Google Sheets worksheets, maintaining an immutable audit history logs sheet (`_System`) and dynamic daily fans.
- **Strict Business Logic Isolation**: Calculations and normalizations are written in strict TypeScript and centralized in the `/src/modules/sales/calculations.ts` files. UI components do not compute core KPIs.
- **Scalability and Extension Ready**: The navigation sidebar, layouts, and backend are driven by central configs so future modules (like Inventory, Purchases, Finance) can be registered without rewriting the core framework.
- **Fast Executive UX**: Data is fetched selectively and cached in-memory, allowing instant sorting, pagination, search, and charts without full-page reloads.

---

## 2. Layered Architecture Flow

The system operates in a unidirectional five-layer workflow:

```text
1. Microsoft Dynamics NAV Excel Export (.xlsx / .xlsm)
        ↓
2. Base64 Upload & Validation (server/validator.ts, server/dbService.ts)
        ↓
3. Google Sheets Worksheet Storage (Immutable daily worksheets named YYYY-MM-DD)
        ↓
4. Server-Side / Client-Side TypeScript Business Calculations (src/modules/sales/calculations.ts)
        ↓
5. Executive Presentation UI Dashboard (React, Tailwind, Recharts)
```

### Core Architecture Components

#### 1. Presentation Layer (Vite + React)
- Extensively styled with Tailwind CSS, utilizing a clean display typography pairing (Inter for UI, Space Grotesk for headings, JetBrains Mono for numbers).
- Driven by a single main shell container (`Shell.tsx`) supporting collapsed sidebar layouts and mobile responsiveness.

#### 2. Business Logic Layer (TypeScript Calculations)
- Normalizes all Excel headers, handles Danish numbers (converting `,` to `.`), handles Danish/Turkish mixed columns.
- Excludes special items (`PANT*`, `Kasse med`, `Kortgebyr`, `Indbetaling`) and filters out cash customer aggregated lines from top rankings.

#### 3. Storage & Integration Layer (Google Sheets Mock/Real Proxy)
- Operates a local database simulator when `USE_MOCK_DATA=true` to provide instant, zero-setup developer previews of the last 14 business days.
- Designed to communicate server-side with Google Sheets API when credential environments are defined, ensuring no private keys or secrets are exposed to client bundles.
