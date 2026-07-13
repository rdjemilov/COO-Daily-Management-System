import { google } from "googleapis";

export interface ProductMasterItem {
  itemNumber: string;
  description: string;
  baseUnit?: string;
  blocked?: boolean;
  placementNumber?: string;
  stockByLocation: Record<string, number | null>;
}

export interface CountingLocationConfig {
  id: string;
  label: string;
  aliases: string[];
  order: number;
  enabled: boolean;
}

export const CANONICAL_LOCATIONS: CountingLocationConfig[] = [
  { id: "herning", label: "Herning", aliases: ["herning"], order: 1, enabled: true },
  { id: "aarhus", label: "Aarhus", aliases: ["aarhus", "århus"], order: 2, enabled: true },
  { id: "aalborg", label: "Aalborg", aliases: ["aalborg", "ålborg"], order: 3, enabled: true },
  { id: "odense", label: "Odense", aliases: ["odense"], order: 4, enabled: true }
];

// Helper to parse numeric values securely
function parseNumeric(val: any): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === "number") return val;
  let str = String(val).trim();
  if (!str) return 0;
  let isNegative = false;
  if (str.startsWith("-")) {
    isNegative = true;
    str = str.substring(1).trim();
  } else if (str.endsWith("-")) {
    isNegative = true;
    str = str.substring(0, str.length - 1).trim();
  }
  // Convert Danish comma decimal separator and dot thousand separators
  if (str.includes(",") && !str.includes(".")) {
    str = str.replace(/,/g, ".");
  } else if (str.includes(",") && str.includes(".")) {
    str = str.replace(/\./g, "").replace(/,/g, ".");
  }
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : (isNegative ? -parsed : parsed);
}

// Memory cache layer for product master
let cachedProductMaster: {
  products: ProductMasterItem[];
  timestamp: string;
  source: "google-sheets" | "mock";
} | null = null;

let cachedSpreadsheetId: string | null = null;
let lastFetchTime = 0;
const CACHE_TTL = 300000; // 5 minutes cache TTL

export function invalidateProductMasterCache() {
  cachedProductMaster = null;
  cachedSpreadsheetId = null;
  lastFetchTime = 0;
}

// Generate fallback mock data
export function getMockProductMaster(): ProductMasterItem[] {
  const products: ProductMasterItem[] = [
    {
      itemNumber: "00101",
      description: "Sønderjysk Rugbrød 800g",
      baseUnit: "STK",
      blocked: false,
      placementNumber: "A-12-04",
      stockByLocation: { herning: 120, aarhus: 45, aalborg: 10, odense: 5 }
    },
    {
      itemNumber: "00102",
      description: "Danbo Ost 45+ Mellemlagret",
      baseUnit: "KG",
      blocked: false,
      placementNumber: "B-02-11",
      stockByLocation: { herning: 34, aarhus: 12, aalborg: null, odense: 8 }
    },
    {
      itemNumber: "00201",
      description: "Letmælk 1L Danmælk",
      baseUnit: "KRT",
      blocked: false,
      placementNumber: "K-01-02",
      stockByLocation: { herning: 500, aarhus: 250, aalborg: 150, odense: 100 }
    },
    {
      itemNumber: "00202",
      description: "Piskefløde 38% 0.5L",
      baseUnit: "KRT",
      blocked: false,
      placementNumber: "K-01-03",
      stockByLocation: { herning: 150, aarhus: 75, aalborg: 30, odense: 20 }
    },
    {
      itemNumber: "00301",
      description: "Kyllingebrystfilet 2kg (Frost)",
      baseUnit: "POS",
      blocked: true,
      placementNumber: "F-04-12",
      stockByLocation: { herning: 80, aarhus: 40, aalborg: 25, odense: 15 }
    },
    {
      itemNumber: "00302",
      description: "Hakket Oksekød 8-12% 500g",
      baseUnit: "BAK",
      blocked: false,
      placementNumber: "K-03-01",
      stockByLocation: { herning: 200, aarhus: 95, aalborg: 50, odense: 40 }
    },
    {
      itemNumber: "00401",
      description: "Hvedemel 2kg",
      baseUnit: "STK",
      blocked: false,
      placementNumber: "T-02-01",
      stockByLocation: { herning: 350, aarhus: 120, aalborg: 80, odense: 60 }
    },
    {
      itemNumber: "00402",
      description: "Sukker 1kg",
      baseUnit: "STK",
      blocked: false,
      placementNumber: "T-02-02",
      stockByLocation: { herning: 400, aarhus: 150, aalborg: 90, odense: 75 }
    },
    {
      itemNumber: "00501",
      description: "Økologisk Smør 250g",
      baseUnit: "STK",
      blocked: false,
      placementNumber: "K-02-05",
      stockByLocation: { herning: 180, aarhus: 90, aalborg: 40, odense: 30 }
    },
    {
      itemNumber: "00502",
      description: "Kærgården Original 350g",
      baseUnit: "STK",
      blocked: false,
      placementNumber: "K-02-06",
      stockByLocation: { herning: 220, aarhus: 110, aalborg: 60, odense: 45 }
    }
  ];

  // Add more mock items up to 100+ items to make search rich and satisfy specifications
  for (let i = 1; i <= 100; i++) {
    const itemNumStr = String(10000 + i);
    products.push({
      itemNumber: itemNumStr,
      description: `Test Vare ${itemNumStr} - Beskrivelse`,
      baseUnit: i % 3 === 0 ? "STK" : i % 3 === 1 ? "KG" : "KRT",
      blocked: i === 13 || i === 47,
      placementNumber: `P-${String(Math.floor(i / 10)).padStart(2, "0")}-${String(i % 10).padStart(2, "0")}`,
      stockByLocation: {
        herning: Math.floor(Math.random() * 200),
        aarhus: Math.floor(Math.random() * 150),
        aalborg: i % 4 === 0 ? null : Math.floor(Math.random() * 100),
        odense: Math.floor(Math.random() * 80)
      }
    });
  }

  return products;
}

// Normalize location names based on canonical config
export function getCanonicalLocationId(rawLoc: string): string | null {
  if (!rawLoc) return null;
  const cleaned = rawLoc.trim().toLowerCase();
  for (const loc of CANONICAL_LOCATIONS) {
    if (loc.id === cleaned || loc.aliases.includes(cleaned)) {
      return loc.id;
    }
  }
  return cleaned; // Allow custom locations as raw string if they don't match canonical list
}

// Fetch and parse Google Sheet data
export async function getProductMaster(customSpreadsheetId?: string): Promise<{
  products: ProductMasterItem[];
  timestamp: string;
  source: "google-sheets" | "mock";
}> {
  const spreadsheetId = (customSpreadsheetId && customSpreadsheetId.trim()) || process.env.GOOGLE_PRODUCT_MASTER_SPREADSHEET_ID || "1BqUfl2UZAXNLsiTInlVa_x7P4kA48_jQ6CwAe350Kqg";
  const now = Date.now();
  if (cachedProductMaster && cachedSpreadsheetId === spreadsheetId && (now - lastFetchTime < CACHE_TTL)) {
    return cachedProductMaster;
  }

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const configuredWorksheetName = process.env.GOOGLE_PRODUCT_MASTER_WORKSHEET_NAME;

  const hasCreds = !!(clientEmail && privateKey && spreadsheetId);

  if (!hasCreds) {
    console.log("[Product Master] Credentials or sheet ID not fully set up. Using high-quality mock data fallback.");
    cachedProductMaster = {
      products: getMockProductMaster(),
      timestamp: new Date().toISOString(),
      source: "mock"
    };
    lastFetchTime = now;
    return cachedProductMaster;
  }

  try {
    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
    });

    const sheets = google.sheets({ version: "v4", auth });

    // 1. Fetch spreadsheet metadata to find the correct sheet tab
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetTabs = spreadsheet.data.sheets || [];

    if (sheetTabs.length === 0) {
      throw new Error("Spreadsheet has no worksheets/tabs.");
    }

    // Determine worksheet name
    let targetSheetName = "";
    if (configuredWorksheetName) {
      const match = sheetTabs.some(s => s.properties?.title === configuredWorksheetName);
      if (match) {
        targetSheetName = configuredWorksheetName;
      }
    }

    if (!targetSheetName) {
      // Fallback: use first visible worksheet
      const firstVisible = sheetTabs.find(s => !s.properties?.hidden);
      targetSheetName = firstVisible?.properties?.title || sheetTabs[0].properties?.title || "";
    }

    if (!targetSheetName) {
      throw new Error("Could not identify a target worksheet.");
    }

    console.log(`[Product Master] Reading data from sheet: "${targetSheetName}"`);

    // Fetch all values from Column A to Z without a hardcoded row limit (e.g., A1:Z)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${targetSheetName}!A1:Z`
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      throw new Error("Worksheet is empty.");
    }

    const headers = rows[0].map(h => String(h || "").trim().toLowerCase());
    
    // Strictly map Item Number to Column A (index 0) and Description to Column B (index 1)
    const itemNumberColIdx = 0;
    const descriptionColIdx = 1;

    let unitColIdx = -1;
    let blockedColIdx = -1;
    let placementColIdx = -1;
    let locationCodeColIdx = -1;
    let quantityColIdx = -1;

    // Scan the rest of the columns (starting from index 2) for standard metadata headers
    headers.forEach((h, idx) => {
      if (idx < 2) return; // Column A and B are strictly reserved for Item Number and Description

      if (["basisenhed", "unit", "enhed", "base unit"].includes(h)) {
        unitColIdx = idx;
      } else if (["spærret", "spaerret", "blocked", "status"].includes(h)) {
        blockedColIdx = idx;
      } else if (["placeringsnr", "placement", "placering", "bin", "bin number", "placeringsnummer"].includes(h)) {
        placementColIdx = idx;
      } else if (["lokationskode", "location", "lokation", "location code"].includes(h)) {
        locationCodeColIdx = idx;
      } else if (["lager", "stock", "qty", "antal", "quantity", "on hand"].includes(h)) {
        quantityColIdx = idx;
      }
    });

    // Robust header detection: Check if the first row contains any common header keywords
    let startRowIdx = 1;
    const firstRowItemVal = String(rows[0][itemNumberColIdx] || "").trim().toLowerCase();
    const firstRowDescVal = String(rows[0][descriptionColIdx] || "").trim().toLowerCase();
    const isHeaderRow = 
      ["varenr", "item number", "item no.", "varenummer", "sku", "product number", "id", "varenr."].includes(firstRowItemVal) ||
      ["beskrivelse", "description", "varenavn", "product name", "name"].includes(firstRowDescVal);

    if (!isHeaderRow) {
      startRowIdx = 0;
      console.log("[Product Master] No header row identified in first row. Parsing from index 0.");
    } else {
      console.log("[Product Master] Header row identified. Parsing from index 1.");
    }

    const productsMap: Record<string, ProductMasterItem> = {};

    // Determine Scenario A or Scenario B
    // If we have a dedicated "Location Code" AND "Quantity" column, it's SCENARIO B
    const isScenarioB = locationCodeColIdx !== -1 && quantityColIdx !== -1;

    // For Scenario A, let's identify column headers matching any of our canonical location IDs/aliases
    const locationColumns: { colIdx: number; locationId: string }[] = [];
    if (!isScenarioB && startRowIdx === 1) {
      headers.forEach((h, idx) => {
        const locId = getCanonicalLocationId(h);
        if (locId && idx !== itemNumberColIdx && idx !== descriptionColIdx) {
          locationColumns.push({ colIdx: idx, locationId: locId });
        }
      });
    }

    // Parse data rows
    for (let r = startRowIdx; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      const rawItemNum = String(row[itemNumberColIdx] || "").trim();
      if (!rawItemNum) continue;

      const itemNumber = rawItemNum; // Keep string with leading zeroes intact
      const description = String(row[descriptionColIdx] || "").trim();
      const baseUnit = unitColIdx !== -1 && row[unitColIdx] ? String(row[unitColIdx]).trim() : "STK";
      const placementNumber = placementColIdx !== -1 && row[placementColIdx] ? String(row[placementColIdx]).trim() : undefined;
      
      let blocked = false;
      if (blockedColIdx !== -1 && row[blockedColIdx]) {
        const bVal = String(row[blockedColIdx]).trim().toLowerCase();
        blocked = ["ja", "yes", "true", "1", "y", "x"].includes(bVal);
      }

      if (isScenarioB) {
        // Scenario B: One row per location, merge into existing product if already seen
        const rawLoc = locationCodeColIdx !== -1 ? String(row[locationCodeColIdx] || "") : "";
        const locId = getCanonicalLocationId(rawLoc) || "unknown";
        const qty = quantityColIdx !== -1 ? parseNumeric(row[quantityColIdx]) : 0;

        if (!productsMap[itemNumber]) {
          productsMap[itemNumber] = {
            itemNumber,
            description,
            baseUnit,
            blocked,
            placementNumber,
            stockByLocation: {}
          };
        }

        // Add or update the stock for this location
        productsMap[itemNumber].stockByLocation[locId] = qty;
      } else {
        // Scenario A: Separate columns for locations in the same row
        const stockByLocation: Record<string, number | null> = {};
        
        // Initialize standard canonical locations to null
        CANONICAL_LOCATIONS.forEach(l => {
          stockByLocation[l.id] = null;
        });

        // Fill in stock values from matching column indices
        locationColumns.forEach(lc => {
          stockByLocation[lc.locationId] = parseNumeric(row[lc.colIdx]);
        });

        productsMap[itemNumber] = {
          itemNumber,
          description,
          baseUnit,
          blocked,
          placementNumber,
          stockByLocation
        };
      }
    }

    const productsList = Object.values(productsMap);

    cachedProductMaster = {
      products: productsList,
      timestamp: new Date().toISOString(),
      source: "google-sheets"
    };
    cachedSpreadsheetId = spreadsheetId;
    lastFetchTime = now;
    return cachedProductMaster;

  } catch (err: any) {
    console.error("[Product Master] Error connecting to Google Sheets Spreadsheet:", err.message);
    // Silent failover to mock data to prevent application 500 crashes
    cachedProductMaster = {
      products: getMockProductMaster(),
      timestamp: new Date().toISOString(),
      source: "mock"
    };
    cachedSpreadsheetId = spreadsheetId;
    lastFetchTime = now;
    return cachedProductMaster;
  }
}
