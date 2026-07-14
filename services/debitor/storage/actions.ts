import fs from "fs";
import path from "path";
import { z } from "zod";
import crypto from "crypto";

const DATA_DIR = path.join(process.cwd(), "data");
const ACTIONS_FILE = path.join(DATA_DIR, "debitor_actions.json");

export const ActionTypeEnum = z.enum([
  "call", "email", "statement", "reminder", "promise", "plan", "credit_stop", "collection", "legal", "investigation", "other"
]);

export const ActionStatusEnum = z.enum([
  "open", "planned", "in_progress", "waiting", "promised", "completed", "cancelled", "overdue"
]);

export const ActionPriorityEnum = z.enum([
  "low", "medium", "high", "critical"
]);

export const CreateActionSchema = z.object({
  customerNumber: z.string().min(1, "Kundenummer er påkrævet"),
  type: ActionTypeEnum,
  status: ActionStatusEnum,
  priority: ActionPriorityEnum,
  owner: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  comment: z.string().min(1, "Kommentar er påkrævet"),
  createdBy: z.string().nullable().optional(),
  promisedPaymentDate: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
});

export const UpdateActionSchema = z.object({
  type: ActionTypeEnum.optional(),
  status: ActionStatusEnum.optional(),
  priority: ActionPriorityEnum.optional(),
  owner: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  comment: z.string().min(1, "Kommentar kan ikke være tom").optional(),
  updatedBy: z.string().nullable().optional(),
  promisedPaymentDate: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
});

export type DebtorAction = {
  id: string;
  customerNumber: string;
  type: string;
  status: string;
  priority: string;
  owner: string | null;
  dueDate: string | null;
  comment: string;
  createdBy: string | null;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
  closedAt: string | null;
  promisedPaymentDate: string | null;
  reference: string | null;
};

// Help escape Formula Injection in Google Sheets
export function escapeFormula(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.startsWith("=") || trimmed.startsWith("+") || trimmed.startsWith("-") || trimmed.startsWith("@")) {
    return "'" + trimmed;
  }
  return value;
}

export class DebtorActionEngine {
  private static actions: DebtorAction[] = [];
  private static isLoaded = false;

  private static ensureDirectories() {
    if (!fs.existsSync(DATA_DIR)) {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      } catch {}
    }
  }

  // Load local actions fallback
  public static loadLocal(): DebtorAction[] {
    if (this.isLoaded) return this.actions;
    this.ensureDirectories();
    if (fs.existsSync(ACTIONS_FILE)) {
      try {
        const content = fs.readFileSync(ACTIONS_FILE, "utf-8");
        this.actions = JSON.parse(content) as DebtorAction[];
        this.isLoaded = true;
      } catch (err) {
        console.error("Failed to read local debitor actions:", err);
      }
    }
    return this.actions;
  }

  // Save local actions fallback
  public static saveLocal(): void {
    this.ensureDirectories();
    try {
      fs.writeFileSync(ACTIONS_FILE, JSON.stringify(this.actions, null, 2), "utf-8");
    } catch (err) {
      console.warn("Failed to write local debitor actions:", err);
    }
  }

  // Set actions from Google Sheets
  public static setActions(actions: DebtorAction[]): void {
    this.actions = [...actions];
    this.isLoaded = true;
    this.saveLocal();
  }

  // In-memory indexes as requested in Section 32
  public static getActionsByCustomer(customerNumber: string): DebtorAction[] {
    const norm = customerNumber.trim();
    return this.actions.filter((a) => a.customerNumber.trim() === norm);
  }

  public static getOpenActionsByCustomer(customerNumber: string): DebtorAction[] {
    const norm = customerNumber.trim();
    const openStatuses = ["open", "planned", "in_progress", "waiting", "promised", "overdue"];
    return this.actions.filter(
      (a) => a.customerNumber.trim() === norm && openStatuses.includes(a.status)
    );
  }

  public static getOverdueActionsByCustomer(customerNumber: string): DebtorAction[] {
    const norm = customerNumber.trim();
    const todayStr = new Date().toISOString().split("T")[0];
    const openStatuses = ["open", "planned", "in_progress", "waiting", "promised", "overdue"];
    return this.actions.filter(
      (a) =>
        a.customerNumber.trim() === norm &&
        openStatuses.includes(a.status) &&
        a.dueDate &&
        a.dueDate < todayStr
    );
  }

  public static getLatestActionByCustomer(customerNumber: string): DebtorAction | null {
    const customerActions = this.getActionsByCustomer(customerNumber);
    if (customerActions.length === 0) return null;
    return customerActions.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }

  public static getPromisedPaymentActionsByCustomer(customerNumber: string): DebtorAction[] {
    const norm = customerNumber.trim();
    return this.actions.filter(
      (a) => a.customerNumber.trim() === norm && a.status === "promised"
    );
  }

  // GetAll Actions
  public static getAllActions(): DebtorAction[] {
    return this.actions;
  }
}
