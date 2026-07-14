import fs from "fs";
import path from "path";
import { z } from "zod";

const DATA_DIR = path.join(process.cwd(), "data");
const NOTES_FILE = path.join(DATA_DIR, "debitor_notes.json");

export const NoteCategoryEnum = z.enum([
  "general", "credit", "collection", "promise", "dispute", "other"
]);

export const CreateNoteSchema = z.object({
  customerNumber: z.string().min(1, "Kundenummer er påkrævet"),
  category: NoteCategoryEnum,
  text: z.string().min(1, "Tekst kan ikke være tom"),
  author: z.string().nullable().optional(),
  isPinned: z.boolean().default(false),
});

export const UpdateNoteSchema = z.object({
  category: NoteCategoryEnum.optional(),
  text: z.string().min(1, "Tekst kan ikke være tom").optional(),
  isPinned: z.boolean().optional(),
  updatedBy: z.string().nullable().optional(),
});

export type DebtorNote = {
  id: string;
  customerNumber: string;
  category: string;
  text: string;
  author: string;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
  isPinned: boolean;
};

export class DebtorNoteEngine {
  private static notes: DebtorNote[] = [];
  private static isLoaded = false;

  private static ensureDirectories() {
    if (!fs.existsSync(DATA_DIR)) {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      } catch {}
    }
  }

  // Load local notes fallback
  public static loadLocal(): DebtorNote[] {
    if (this.isLoaded) return this.notes;
    this.ensureDirectories();
    if (fs.existsSync(NOTES_FILE)) {
      try {
        const content = fs.readFileSync(NOTES_FILE, "utf-8");
        this.notes = JSON.parse(content) as DebtorNote[];
        this.isLoaded = true;
      } catch (err) {
        console.error("Failed to read local debitor notes:", err);
      }
    }
    return this.notes;
  }

  // Save local notes fallback
  public static saveLocal(): void {
    this.ensureDirectories();
    try {
      fs.writeFileSync(NOTES_FILE, JSON.stringify(this.notes, null, 2), "utf-8");
    } catch (err) {
      console.warn("Failed to write local debitor notes:", err);
    }
  }

  // Set notes from Google Sheets
  public static setNotes(notes: DebtorNote[]): void {
    this.notes = [...notes];
    this.isLoaded = true;
    this.saveLocal();
  }

  // Get notes by customer (sorted: pinned first, then newest first)
  public static getNotesByCustomer(customerNumber: string): DebtorNote[] {
    const norm = customerNumber.trim();
    return this.notes
      .filter((n) => n.customerNumber.trim() === norm)
      .sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }

  // GetAll Notes
  public static getAllNotes(): DebtorNote[] {
    return this.notes;
  }
}
