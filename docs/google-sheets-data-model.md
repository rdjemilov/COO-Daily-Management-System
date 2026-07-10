# Google Sheets Data Model - Daily Management System

This document outlines the schema, worksheet structure, and metadata standards for using Google Sheets as the system database.

---

## 1. Spreadsheet Layout

The system persistent storage is divided module-by-module into separate Google Spreadsheets. This prevents data lockups, avoids hitting single-document size limit quotas, and ensures clear security access control.

For this phase, only the **Sales Database** Spreadsheet is active:

```text
Google Drive / Workspaces
  └── Sales Database
        Spreadsheet: DMS - Sales
              ├── Worksheet: _System (Central Metadata Audit Log)
              ├── Worksheet: 2026-07-10 (Rå data for 10. Juli)
              ├── Worksheet: 2026-07-09 (Rå data for 9. Juli)
              └── Worksheet: 2026-07-08 (Rå data for 8. Juli)
```

---

## 2. System Worksheet Schema (`_System`)

The `_System` sheet tracks import versions, upload metadata, and verifies data integrity. It is used as the single source of truth for import histories and worksheet discoveries.

### Column Specification

| Column Header | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| **Import ID** | String | Unique UUID representing the import run | `IMP-20260710-01` |
| **Business Module** | String | Module identifier | `Sales` |
| **Business Date** | String | Normalized business date (YYYY-MM-DD) | `2026-07-10` |
| **Worksheet Name** | String | The exact name of the created raw worksheet | `2026-07-10` |
| **Uploaded File Name**| String | Name of the uploaded Excel file | `NAV_Export_10_07.xlsx` |
| **Original File Size**| Number | File size in bytes | `47312` |
| **Imported Row Count**| Number | Number of sales rows imported | `42` |
| **Imported At** | String | ISO Timestamp of upload completion | `2026-07-10T09:12:00.000Z` |
| **Uploaded By** | String | User identity email of importer | `studiorasim@gmail.com` |
| **Import Status** | String | Import status enum | `success` |
| **File Hash** | String | MD5 hash of original binary contents | `a1b2c3d4e5...` |

---

## 3. Daily Raw Data Worksheets (`YYYY-MM-DD`)

Raw sheets contain original transactions exported directly from Microsoft Dynamics NAV. They are uforanderlige (immutable). No manual entries or calculations are written here.

### Schema Fields

- `Bogføringsdato` (postingDate)
- `Posttype` (entryType)
- `Bilagstype` (documentType)
- `Bilagsnr.` (documentNumber)
- `Varenr.` (itemNumber)
- `Beskrivelse` (description)
- `Lokationskode` (locationCode)
- `Antal` (quantity)
- `Salgsbeløb (faktisk)` (salesAmount)
- `Kostbeløb (faktisk)` (costAmount)
- `Kildenr.` (customerNumber)
- `Source Name` (customerName)
- `Isım` (employeeName)
