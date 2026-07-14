import { DebitorRawRow } from "../../../types/debitor/index.ts";

export * from "./kpiEngine.ts";

export interface DebitorStats {
  totalBalance: number;
  totalOverdue: number;
  overduePercentage: number;
  activeDebtorsCount: number;
  overdueDebtorsCount: number;
}

export class DebitorCalculationEngine {
  /**
   * Calculate high-level financial metrics from a list of raw debitor rows
   */
  public static calculateStats(rows: DebitorRawRow[]): DebitorStats {
    let totalBalance = 0;
    let totalOverdue = 0;
    let activeDebtorsCount = 0;
    let overdueDebtorsCount = 0;

    rows.forEach((row) => {
      const bal = row.balance || 0;
      const ov = row.overdueBalance || 0;

      if (bal !== 0 || ov !== 0) {
        activeDebtorsCount++;
      }

      if (ov > 0) {
        overdueDebtorsCount++;
      }

      totalBalance += bal;
      totalOverdue += ov;
    });

    const overduePercentage = totalBalance > 0 ? (totalOverdue / totalBalance) * 100 : 0;

    return {
      totalBalance,
      totalOverdue,
      overduePercentage,
      activeDebtorsCount,
      overdueDebtorsCount,
    };
  }

  /**
   * Get top debtors by outstanding balance
   */
  public static getTopDebtorsByBalance(rows: DebitorRawRow[], limit = 10): DebitorRawRow[] {
    return [...rows]
      .sort((a, b) => b.balance - a.balance)
      .slice(0, limit);
  }

  /**
   * Get top debtors by overdue balance
   */
  public static getTopDebtorsByOverdue(rows: DebitorRawRow[], limit = 10): DebitorRawRow[] {
    return [...rows]
      .sort((a, b) => b.overdueBalance - a.overdueBalance)
      .slice(0, limit);
  }
}

