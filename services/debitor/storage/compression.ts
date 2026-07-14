import { DebitorRawRow, DebitorCompressedRow } from "../../../types/debitor/index.ts";
import { DictionaryEngine } from "./dictionary.ts";

export class CompressionEngine {
  /**
   * Compress a raw row into a lightweight, dictionary-indexed structure
   */
  public static compressRow(row: DebitorRawRow): DebitorCompressedRow {
    // 1. Resolve values to dictionary IDs
    const cid = DictionaryEngine.getOrCreateId("customer", row.customerName);
    const pt = DictionaryEngine.getOrCreateId("payment_terms", row.paymentTerms);
    const ch = DictionaryEngine.getOrCreateId("credit_handling", row.creditHandling);
    const sp = DictionaryEngine.getOrCreateId("salesperson", row.salesperson);
    const lc = DictionaryEngine.getOrCreateId("location", row.location);
    const sl = DictionaryEngine.getOrCreateId("seller", row.seller || "Uspecificeret");

    // 2. Convert currency values (decimal Kroner) to integer øre
    const sb = Math.round((row.balance || 0) * 100);
    const ov = Math.round((row.overdueBalance || 0) * 100);

    // 3. Keep date clean or empty
    const li = (row.lastInvoice || "").trim();

    return {
      cn: (row.customerNumber || "").trim(),
      cid,
      sb,
      ov,
      pt,
      li,
      ch,
      sp,
      lc,
      sl,
    };
  }

  /**
   * Expand a compressed, lightweight row back into its full, human-readable representation
   */
  public static decompressRow(comp: DebitorCompressedRow): DebitorRawRow {
    // 1. Resolve dictionary IDs back to text values
    const customerName = DictionaryEngine.getValue("customer", comp.cid);
    const paymentTerms = DictionaryEngine.getValue("payment_terms", comp.pt);
    const creditHandling = DictionaryEngine.getValue("credit_handling", comp.ch);
    const salesperson = DictionaryEngine.getValue("salesperson", comp.sp);
    const location = DictionaryEngine.getValue("location", comp.lc);
    const seller = DictionaryEngine.getValue("seller", comp.sl || 0);

    // 2. Convert integer øre back to Kroner (float)
    const balance = comp.sb / 100;
    const overdueBalance = comp.ov / 100;

    return {
      customerNumber: comp.cn,
      customerName,
      balance,
      overdueBalance,
      paymentTerms,
      lastInvoice: comp.li,
      creditHandling,
      salesperson,
      location,
      seller,
    };
  }

  /**
   * Bulk compress rows
   */
  public static compressRows(rows: DebitorRawRow[]): DebitorCompressedRow[] {
    return rows.map((row) => this.compressRow(row));
  }

  /**
   * Bulk decompress rows
   */
  public static decompressRows(comps: DebitorCompressedRow[]): DebitorRawRow[] {
    return comps.map((comp) => this.decompressRow(comp));
  }
}
