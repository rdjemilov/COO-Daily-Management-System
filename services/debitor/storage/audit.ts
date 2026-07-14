import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const AUDIT_FILE = path.join(DATA_DIR, "debitor_audit_log.json");

export interface AuditLogEntry {
  timestamp: string;
  actionType: "IMPORT" | "ACTION" | "NOTE" | "PDF_EXPORT" | "REFRESH";
  user: string;
  details: any;
  durationMs?: number;
  isSlowQuery?: boolean;
}

export class DebitorAuditService {
  private static ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      } catch (e) {
        console.warn("[Vercel/ReadOnly Fallback] Kunne ikke oprette data-mappe til audit log.", e);
      }
    }
  }

  /**
   * Log an event with high accuracy and trace tracking.
   */
  public static async logEvent(
    actionType: "IMPORT" | "ACTION" | "NOTE" | "PDF_EXPORT" | "REFRESH",
    details: any,
    startTime?: number,
    user: string = "rb@danfoods.dk"
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const durationMs = startTime ? Date.now() - startTime : undefined;

    // A query or operation is flagged as a "Slow Query" if it takes:
    // - Refresh/Load: > 3000ms
    // - Customer Card fetch: > 1000ms
    // - General API operations: > 2000ms
    let isSlowQuery = false;
    if (durationMs) {
      if (actionType === "REFRESH" && durationMs > 3000) {
        isSlowQuery = true;
      } else if (actionType === "PDF_EXPORT" && durationMs > 2000) {
        isSlowQuery = true;
      } else if (durationMs > 1000) {
        isSlowQuery = true;
      }
    }

    const entry: AuditLogEntry = {
      timestamp,
      actionType,
      user,
      details,
      durationMs,
      isSlowQuery,
    };

    // 1. Log to Cloud Console in structured JSON format (extremely useful for Cloud Run / GCL logging)
    if (isSlowQuery) {
      console.warn(
        `[SLOW OPERATION DETECTED] [${actionType}] Operationen tog ${durationMs}ms (grænse overskredet). Detaljer:`,
        JSON.stringify(entry)
      );
    } else {
      console.log(`[AUDIT] [${actionType}] Logged event:`, JSON.stringify(entry));
    }

    // 2. Persist locally to json file for persistence audits (safely caught for serverless read-only contexts)
    this.ensureDataDir();
    try {
      let existingLogs: AuditLogEntry[] = [];
      if (fs.existsSync(AUDIT_FILE)) {
        try {
          const raw = fs.readFileSync(AUDIT_FILE, "utf-8");
          existingLogs = JSON.parse(raw);
        } catch {
          existingLogs = [];
        }
      }

      // Limit in-memory/in-file log size to 1000 latest entries to prevent file bloat
      existingLogs.push(entry);
      if (existingLogs.length > 1000) {
        existingLogs = existingLogs.slice(-1000);
      }

      fs.writeFileSync(AUDIT_FILE, JSON.stringify(existingLogs, null, 2), "utf-8");
    } catch (err) {
      // Ignore write errors silently in strictly read-only serverless environments (console log still captures it)
      console.warn("[Vercel/ReadOnly Fallback] Kunne ikke skrive til audit logfil.", err);
    }
  }

  /**
   * Fetch all log entries (for auditing views or testing validation)
   */
  public static getLogs(): AuditLogEntry[] {
    try {
      if (fs.existsSync(AUDIT_FILE)) {
        return JSON.parse(fs.readFileSync(AUDIT_FILE, "utf-8"));
      }
    } catch {
      // Silently catch
    }
    return [];
  }
}
