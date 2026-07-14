import { DebitorRawRow, DictionaryEntry, DebitorSnapshot } from "../../../types/debitor/index.ts";
import { ImportMetadata } from "../../../src/shared/types.ts";

export class DebitorCache {
  private static snapshotCache: Record<string, DebitorSnapshot> = {};
  private static dictionaryCache: DictionaryEntry[] | null = null;
  private static metadataCache: ImportMetadata[] | null = null;
  private static lastMetadataFetchTime = 0;
  private static CACHE_TTL_MS = 60000; // 1 minute Cache TTL
  private static riskCache: Record<string, any> = {};

  // Risk Cache
  public static getRisk(key: string): any {
    return this.riskCache[key] || null;
  }

  public static setRisk(key: string, data: any): void {
    this.riskCache[key] = data;
  }

  public static clearRisk(): void {
    this.riskCache = {};
  }

  // Snapshot Cache
  public static getSnapshot(date: string): DebitorSnapshot | null {
    return this.snapshotCache[date] || null;
  }

  public static setSnapshot(date: string, snapshot: DebitorSnapshot): void {
    this.snapshotCache[date] = snapshot;
  }

  public static clearSnapshots(): void {
    this.snapshotCache = {};
  }

  // Dictionary Cache
  public static getDictionaries(): DictionaryEntry[] | null {
    return this.dictionaryCache;
  }

  public static setDictionaries(entries: DictionaryEntry[]): void {
    this.dictionaryCache = [...entries];
  }

  public static clearDictionaries(): void {
    this.dictionaryCache = null;
  }

  // Metadata Cache
  public static getMetadata(): ImportMetadata[] | null {
    const now = Date.now();
    if (this.metadataCache && (now - this.lastMetadataFetchTime < this.CACHE_TTL_MS)) {
      return this.metadataCache;
    }
    return null;
  }

  public static setMetadata(meta: ImportMetadata[]): void {
    this.metadataCache = [...meta];
    this.lastMetadataFetchTime = Date.now();
  }

  public static clearMetadata(): void {
    this.metadataCache = null;
    this.lastMetadataFetchTime = 0;
  }

  // Clear everything
  public static invalidateAll(): void {
    this.clearSnapshots();
    this.clearDictionaries();
    this.clearMetadata();
    this.clearRisk();
  }
}
