import fs from "fs";
import path from "path";
import { DictionaryEntry, DictionaryCategory } from "../../../types/debitor/index.ts";
import { DebitorCache } from "./cache.ts";

const DATA_DIR = path.join(process.cwd(), "data");
const DICTIONARY_FILE = path.join(DATA_DIR, "debitor_dictionary.json");

export class DictionaryEngine {
  private static entries: DictionaryEntry[] = [];
  private static isLoaded = false;

  private static ensureDirectories() {
    if (!fs.existsSync(DATA_DIR)) {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      } catch (e) {
        console.warn("[Vercel/ReadOnly Fallback] Could not create data directory", e);
      }
    }
  }

  // Load dictionaries from local file (fallback/mock) or set directly from Google Sheets
  public static async load(): Promise<DictionaryEntry[]> {
    if (this.isLoaded) {
      return this.entries;
    }

    // Try cache first
    const cached = DebitorCache.getDictionaries();
    if (cached) {
      this.entries = cached;
      this.isLoaded = true;
      return this.entries;
    }

    this.ensureDirectories();
    if (fs.existsSync(DICTIONARY_FILE)) {
      try {
        const content = fs.readFileSync(DICTIONARY_FILE, "utf-8");
        this.entries = JSON.parse(content) as DictionaryEntry[];
        this.isLoaded = true;
        DebitorCache.setDictionaries(this.entries);
        return this.entries;
      } catch (err) {
        console.error("Failed to read local debitor dictionary:", err);
      }
    }

    this.entries = [];
    this.isLoaded = true;
    return this.entries;
  }

  // Set entries from external source (e.g. Google Sheets) and cache them
  public static setEntries(entries: DictionaryEntry[]): void {
    this.entries = [...entries];
    this.isLoaded = true;
    DebitorCache.setDictionaries(this.entries);
    this.saveLocal();
  }

  // Save dictionaries to local file
  public static saveLocal(): void {
    this.ensureDirectories();
    try {
      fs.writeFileSync(DICTIONARY_FILE, JSON.stringify(this.entries, null, 2), "utf-8");
    } catch (err) {
      console.warn("[Vercel/ReadOnly Fallback] Failed to save local debitor dictionary:", err);
    }
  }

  // Get or create ID for a text value in a category
  public static getOrCreateId(category: DictionaryCategory, value: string): number {
    const cleanValue = (value || "").trim();
    const existing = this.entries.find(
      (e) => e.category === category && e.value.toLowerCase() === cleanValue.toLowerCase()
    );

    if (existing) {
      return existing.id;
    }

    // Calculate next ID
    const categoryEntries = this.entries.filter((e) => e.category === category);
    const nextId = categoryEntries.reduce((max, e) => (e.id > max ? e.id : max), 0) + 1;

    const newEntry: DictionaryEntry = {
      category,
      id: nextId,
      value: cleanValue,
    };

    this.entries.push(newEntry);
    DebitorCache.setDictionaries(this.entries);
    this.saveLocal();

    return nextId;
  }

  // Resolve ID to its string value
  public static getValue(category: DictionaryCategory, id: number): string {
    const entry = this.entries.find((e) => e.category === category && e.id === id);
    return entry ? entry.value : `Unresolved (${category} #${id})`;
  }

  // Export full dictionary
  public static getAllEntries(): DictionaryEntry[] {
    return this.entries;
  }

  // Reset in-memory (useful for testing or full re-imports)
  public static clear(): void {
    this.entries = [];
    this.isLoaded = false;
    DebitorCache.clearDictionaries();
    if (fs.existsSync(DICTIONARY_FILE)) {
      try {
        fs.unlinkSync(DICTIONARY_FILE);
      } catch {}
    }
  }
}
