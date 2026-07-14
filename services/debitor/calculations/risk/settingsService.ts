import fs from "fs";
import path from "path";
import { google } from "googleapis";

const DATA_DIR = path.join(process.cwd(), "data");
const SETTINGS_FILE = path.join(DATA_DIR, "debitor_settings.json");

export interface DebitorSettings {
  weightOverdue: number;          // Default: 0.35
  weightBalance: number;          // Default: 0.15
  weightPayment: number;          // Default: 0.20
  weightPurchase: number;         // Default: 0.10
  weightHistory: number;          // Default: 0.10
  weightActions: number;          // Default: 0.05
  weightCredit: number;           // Default: 0.05
  
  thresholdBalanceScale: number;  // Default: 1000000 (1M DKK)
  thresholdNoPaymentDays: number; // Default: 30 days
  thresholdUnder50k: number;      // Default: 50000
}

export const DEFAULT_SETTINGS: DebitorSettings = {
  weightOverdue: 0.35,
  weightBalance: 0.15,
  weightPayment: 0.20,
  weightPurchase: 0.10,
  weightHistory: 0.10,
  weightActions: 0.05,
  weightCredit: 0.05,
  thresholdBalanceScale: 1000000,
  thresholdNoPaymentDays: 30,
  thresholdUnder50k: 50000,
};

let cachedSettings: DebitorSettings | null = null;

export class DebitorSettingsService {
  private static ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      } catch {}
    }
  }

  // Load settings with fallback to local file and Google Sheets
  public static async loadSettings(): Promise<DebitorSettings> {
    if (cachedSettings) return cachedSettings;

    // 1. Try local JSON file
    this.ensureDataDir();
    let settings = { ...DEFAULT_SETTINGS };

    if (fs.existsSync(SETTINGS_FILE)) {
      try {
        const content = fs.readFileSync(SETTINGS_FILE, "utf-8");
        const parsed = JSON.parse(content);
        settings = { ...settings, ...parsed };
      } catch (err) {
        console.error("Failed to parse local debitor settings:", err);
      }
    }

    // 2. Try Google Sheets if credentials are configured
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    const spreadsheetId = process.env.GOOGLE_DEBITOR_SPREADSHEET_ID;

    if (clientEmail && privateKey && spreadsheetId) {
      try {
        const auth = new google.auth.JWT({
          email: clientEmail,
          key: privateKey,
          scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });
        const sheets = google.sheets({ version: "v4", auth });

        // Check if tab "_Settings" exists
        const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
        const hasSettings = spreadsheet.data.sheets?.some((s) => s.properties?.title === "_Settings");

        if (hasSettings) {
          const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: "_Settings!A2:C100",
          });

          const rows = response.data.values;
          if (rows && rows.length > 0) {
            const updates: Partial<DebitorSettings> = {};
            rows.forEach((r) => {
              const key = r[0]?.trim();
              const val = parseFloat(r[1]);
              if (key && !isNaN(val)) {
                if (key === "weight_overdue") updates.weightOverdue = val;
                else if (key === "weight_balance") updates.weightBalance = val;
                else if (key === "weight_payment") updates.weightPayment = val;
                else if (key === "weight_purchase") updates.weightPurchase = val;
                else if (key === "weight_history") updates.weightHistory = val;
                else if (key === "weight_actions") updates.weightActions = val;
                else if (key === "weight_credit") updates.weightCredit = val;
                else if (key === "threshold_balance_scale") updates.thresholdBalanceScale = val;
                else if (key === "threshold_no_payment_days") updates.thresholdNoPaymentDays = val;
                else if (key === "threshold_under_50k") updates.thresholdUnder50k = val;
              }
            });
            settings = { ...settings, ...updates };
            
            // Save updated settings locally for resilience
            try {
              fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
            } catch {}
          }
        } else {
          // Create settings sheet and seed default settings (Section 32 / Settings section)
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: [{ addSheet: { properties: { title: "_Settings" } } }],
            },
          });

          const headers = ["Key", "Value", "Description"];
          const values = [
            headers,
            ["weight_overdue", "0.35", "Overdue weight (0.0 - 1.0)"],
            ["weight_balance", "0.15", "Balance weight (0.0 - 1.0)"],
            ["weight_payment", "0.20", "Payment behaviour weight (0.0 - 1.0)"],
            ["weight_purchase", "0.10", "Purchase behaviour weight (0.0 - 1.0)"],
            ["weight_history", "0.10", "Historical trend weight (0.0 - 1.0)"],
            ["weight_actions", "0.05", "Open actions weight (0.0 - 1.0)"],
            ["weight_credit", "0.05", "Credit handling weight (0.0 - 1.0)"],
            ["threshold_balance_scale", "1000000", "Balance to scale to max points (DKK)"],
            ["threshold_no_payment_days", "30", "Days since last payment threshold"],
            ["threshold_under_50k", "50000", "Threshold for under 50k KPI (DKK)"],
          ];

          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `_Settings!A1`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values },
          });
          console.log("[Google Sheets API] Seeded _Settings worksheet with defaults.");
        }
      } catch (err: any) {
        console.error("[Google Sheets API] Failed to load/seed settings from Google Sheets:", err.message || err);
      }
    }

    cachedSettings = settings;
    return settings;
  }

  // Save / update settings
  public static async saveSettings(settings: DebitorSettings): Promise<void> {
    cachedSettings = settings;
    this.ensureDataDir();
    try {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
    } catch {}

    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    const spreadsheetId = process.env.GOOGLE_DEBITOR_SPREADSHEET_ID;

    if (clientEmail && privateKey && spreadsheetId) {
      try {
        const auth = new google.auth.JWT({
          email: clientEmail,
          key: privateKey,
          scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });
        const sheets = google.sheets({ version: "v4", auth });

        const values = [
          ["Key", "Value", "Description"],
          ["weight_overdue", settings.weightOverdue.toString(), "Overdue weight (0.0 - 1.0)"],
          ["weight_balance", settings.weightBalance.toString(), "Balance weight (0.0 - 1.0)"],
          ["weight_payment", settings.weightPayment.toString(), "Payment behaviour weight (0.0 - 1.0)"],
          ["weight_purchase", settings.weightPurchase.toString(), "Purchase behaviour weight (0.0 - 1.0)"],
          ["weight_history", settings.weightHistory.toString(), "Historical trend weight (0.0 - 1.0)"],
          ["weight_actions", settings.weightActions.toString(), "Open actions weight (0.0 - 1.0)"],
          ["weight_credit", settings.weightCredit.toString(), "Credit handling weight (0.0 - 1.0)"],
          ["threshold_balance_scale", settings.thresholdBalanceScale.toString(), "Balance to scale to max points (DKK)"],
          ["threshold_no_payment_days", settings.thresholdNoPaymentDays.toString(), "Days since last payment threshold"],
          ["threshold_under_50k", settings.thresholdUnder50k.toString(), "Threshold for under 50k KPI (DKK)"],
        ];

        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `_Settings!A1`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values },
        });
      } catch (err) {
        console.error("[Google Sheets API] Failed to update settings in Google Sheets:", err);
      }
    }
  }

  public static clearCache() {
    cachedSettings = null;
  }
}
