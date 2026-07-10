# Sales Business Rules & KPIs

This document details the exact mathematical formulas, normalizations, and exclusion logic implemented inside the Daily Management System (DMS) for calculating Sales KPIs.

---

## 1. Core Revenue and Margin Calculations

### Sales Amount
Uses the raw field:
```text
Salgsbeløb (faktisk)
```
Represents actual net invoiced revenue before VAT, but after general lines discounts. Excluded items are completely ignored from this sum.

### Normalised Cost
Uses the raw field:
```text
Kostbeløb (faktisk)
```
Dynamics NAV stores costs as negative values for credit notes or depending on database configurations. To calculate gross profit reliably across all invoice lines, the system normalizes costs consistently:
```text
Normalised Cost = absolute value of Kostbeløb (faktisk)
```

### Gross Profit
Calculated strictly at transaction-line level:
```text
Gross Profit = Sales Amount - Normalised Cost
```

### Gross Margin %
Weighted gross margin is used for all dashboard aggregations. Row-level averages are never computed:
```text
Gross Margin % = (Total Gross Profit / Total Sales Amount) * 100
```
*Safeguard: If Total Sales is zero, return 0% to prevent division-by-zero crashes.*

---

## 2. Invoices & Document Counting

- **Unique Invoice Count**: Count of unique `Bilagsnr.` (documentNumber) matching standard sales document types (excluding blank document numbers).
- **Average Invoice Value**:
  ```text
  Average Invoice Value = Total Sales Amount / Unique Invoice Count
  ```

---

## 3. Customer & Delivery KPIs

- **Unique Customer Count**: Count of unique customer IDs (`Kildenr.` / customerNumber), excluding empty fields.
- **Delivery Customer Count**: Uniquely counts customers matching delivery documents, represented by the NAV document type:
  ```text
  Salgsleverance
  ```

---

## 4. Exclusion Standards

To keep executive figures clean and focused strictly on trade goods, the system automatically filters out non-trade items based on the following rules:

1. **Pant Items**: Excludes item codes starting with `PANT` (case-insensitive).
2. **Plast Cases**: Excludes description starting with `Kasse med` (case-insensitive).
3. **Card Fees**: Excludes exact descriptions matching `Kortgebyr` (case-insensitive).
4. **Cash Deposits**: Excludes description starting with `Indbetaling` (case-insensitive).

---

## 5. Cash Customer Handling

Aggegated cash sales can heavily distort customer rankings. The system identifies cash accounts using:
- Customer name or customer number starting with `Kontant` (e.g. `Kontant Salg - Aarhus`).
- The dashboard provides a checkbox to **Exclude Cash Customers** from Top Customer lists, so management can focus purely on B2B accounts.
