# Daily Management System (DMS)

Daily Management System is a professional web-based executive dashboard for a food wholesale company, built to replace traditional Excel-based reporting sheets with a modern, high-performance, and secure full-stack web application.

The system allows uploading daily raw Excel exports from Microsoft Dynamics NAV, validates and maps the columns, stores the clean worksheets inside Google Sheets (maintaining an audit logs worksheet named `_System`), and calculates real-time Sales KPIs, interactive trends, top customers, top products, and profitability exception analysis (Salg uden fortjeneste).

---

## 🚀 Key Features Implemented

1. **Core Application Foundation**: Elegant minimalist layout with responsive left Sidebar and top Header, configured for fluid layouts, visual typography, and custom loading/error metrics.
2. **Database Management**: Complete Excel file uploader supporting drag-and-drop, automated column mapping (supporting Danish and Turkish names), structural validation previews (up to 50 rows), duplicate checks, and metadata logging.
3. **Executive Sales Dashboard**: KPIs for Sales, Gross Profit, Gross Margin, Invoice Count, Customer Count, Delivery Customer Count, and Average Invoices.
4. **Historical Comparisons**: Auto-discovery of historical daily worksheets to calculate comparisons "vs. previous business day" and "vs. same weekday last week".
5. **Interactive Recharts Visuals**: High-fidelity responsive trend line and area graphs for Revenue, Fortjeneste, and Margin perkembangan.
6. **Top Rankings with Detail Drawer**: Dynamic searchable tables for Customers and Products with detailed transaction line popups and customer purchase histories.
7. **Salg uden fortjeneste (Sales Without Profit)**: Transaction line-level margin exception tracking with critical loss severity color coding and fully searchable, paginated tabular view supporting Excel-ready CSV downloads.
8. **Built-in Mock Database Simulator**: Fully functional simulation mode pre-seeded with 14 days of realistic food wholesale data, allowing zero-config instant launches out of the box!

---

## 🛠️ Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide Icons, Framer Motion
- **Visualizations**: Recharts, D3
- **Backend Service**: Node.js, Express, tsx, esbuild
- **Excel Parsing**: SheetJS / xlsx
- **Database Model**: Google Sheets REST API / Local filesystem JSON backup sheets

---

## 📁 Folder Structure

```text
├── data/                             # Local database simulator files
├── docs/                             # Advanced technical architecture guides
│   ├── architecture.md
│   ├── google-sheets-data-model.md
│   ├── sales-business-rules.md
│   └── adding-new-modules.md
├── server/                           # Backend services
│   ├── dbService.ts                  # Google Sheets write/read simulator
│   └── validator.ts                  # Excel structure parser and validator
├── src/
│   ├── App.tsx                       # Main React orchestrator & state manager
│   ├── shared/
│   │   ├── types.ts                  # Shared data models and interfaces
│   │   ├── utils/
│   │   │   └── format.ts             # Danish locales & DKK currency formatter
│   │   └── components/
│   │       ├── filters/
│   │       │   └── SalesFilterBar.tsx # Multi-select, date-range, & keyword query search bar
│   │       └── layout/
│   │           ├── Shell.tsx         # Permanent collapsible desktop & mobile responsive sidebar shell
│   │           └── DashboardHome.tsx # Dashboard welcome hub
│   ├── modules/
│   │   ├── database/
│   │   │   └── components/
│   │   │       └── DatabaseManagement.tsx # Drag & Drop Excel parser, validator & import logs table
│   │   └── sales/
│   │       ├── calculations.ts       # Centralized business rule calculations
│   │       └── components/
│   │           ├── SalesOverview.tsx # KPI summary, Recharts trends, rankings, and details popups
│   │           └── SalesWithoutProfit.tsx # Paginated loss-making transactions exception list with CSV export
│   └── index.css                     # Tailwind @import base styles
├── server.ts                         # Custom Express full-stack entry point
├── package.json                      # Build & scripts manager
└── vite.config.ts                    # Vite server configurations
```

---

## ⚙️ Environment Variables (`.env.example`)

Copy `.env.example` into `.env`:

```env
# Google Private Credentials (server-side only, hidden from client bundlers)
GOOGLE_PROJECT_ID=
GOOGLE_CLIENT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_DRIVE_FOLDER_ID=
GOOGLE_SALES_SPREADSHEET_ID=

# Locale Configuration
NEXT_PUBLIC_DEFAULT_LOCALE=da-DK
NEXT_PUBLIC_DEFAULT_CURRENCY=DKK

# Mock Mode Configuration (Defaults to true for zero-setup local preview)
USE_MOCK_DATA=true
```

### 🔐 How to configure private multiline keys in Vercel:
When deploying to Vercel, copy the `GOOGLE_PRIVATE_KEY` with actual newlines in quotes directly into the environment variable dashboard, or wrap it inside quotes:
`"-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7...\n-----END PRIVATE KEY-----\n"`

---

## 🏃 Local Installation & Development

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run Dev Full-stack Server**:
   This boots Express on port `3000` with the Vite SPA middleware, and auto-generates 14 days of realistic food wholesale data if the database is empty:
   ```bash
   npm run dev
   ```

3. **Production Compilation**:
   This bundles client static files inside `dist/` and compiles the backend TS server into a single bundled ES-Module-safe CommonJS file `dist/server.cjs` via `esbuild`:
   ```bash
   npm run build
   ```

4. **Production Run**:
   ```bash
   npm run start
   ```
