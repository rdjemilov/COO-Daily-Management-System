import { PDFDocument, rgb, StandardFonts, PDFPage } from "pdf-lib";
import { RefreshDebitorDataResult } from "../refreshOrchestrator.ts";
import { formatCurrency, formatDate } from "../../../src/shared/utils/format.ts";

class PageContext {
  public page: PDFPage;
  public y: number;
  public pageNumber: number = 1;

  constructor(
    private doc: PDFDocument,
    private width: number,
    private height: number,
    private isLandscape: boolean = false
  ) {
    this.page = this.doc.addPage(isLandscape ? [height, width] : [width, height]);
    this.y = height - 50;
  }

  public addPage() {
    this.pageNumber++;
    this.page = this.doc.addPage(this.isLandscape ? [this.height, this.width] : [this.width, this.height]);
    this.y = this.height - 50;
  }
}

export class DebitorPdfGenerator {
  // Shared Color Palette for Danfoods Branding
  private static colors = {
    navy: rgb(15 / 255, 23 / 255, 42 / 255),       // Primary Navy/Slate-900
    slate: rgb(71 / 255, 85 / 255, 105 / 255),    // Secondary Slate-600
    crimson: rgb(185 / 255, 28 / 255, 28 / 255),   // Danfoods Crimson/Accent
    lightBg: rgb(248 / 255, 250 / 255, 252 / 255), // Backgrounds Slate-50
    border: rgb(226 / 255, 232 / 255, 240 / 255),  // Borders Slate-200
    white: rgb(1, 1, 1),
    black: rgb(0, 0, 0),
    redAlert: rgb(220 / 255, 38 / 255, 38 / 255),  // Danger / High Risk
    orangeAlert: rgb(245 / 255, 158 / 255, 11 / 255), // Warning / Med Risk
    greenSafe: rgb(16 / 255, 185 / 255, 129 / 255)  // Healthy / Low Risk
  };

  /**
   * Helper: Wrap text into multiple lines based on maximum width in points.
   */
  private static wrapText(text: string, maxWidth: number, font: any, fontSize: number): string[] {
    if (!text) return [];
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, fontSize);
      if (width <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    return lines;
  }

  /**
   * Helper: Draw dynamic header on a page.
   */
  private static drawHeader(
    ctx: PageContext,
    title: string,
    subtitle: string,
    fontBold: any,
    fontRegular: any,
    snapshotDate: string,
    isLandscape: boolean = false
  ) {
    const pageWidth = isLandscape ? 842 : 595;
    const pageHeight = isLandscape ? 595 : 842;

    // 1. Decorative Brand Bar (Crimson Red)
    ctx.page.drawRectangle({
      x: 50,
      y: ctx.y,
      width: pageWidth - 100,
      height: 4,
      color: this.colors.crimson,
    });
    ctx.y -= 18;

    // 2. Danfoods Brand Logo Placeholder Text
    ctx.page.drawText("DANFOODS DMS", {
      x: 50,
      y: ctx.y,
      size: 10,
      font: fontBold,
      color: this.colors.crimson,
    });

    // 3. Document Date info (right aligned)
    const dateText = `Rapportdato: ${formatDate(snapshotDate)}`;
    const dateWidth = fontRegular.widthOfTextAtSize(dateText, 8);
    ctx.page.drawText(dateText, {
      x: pageWidth - 50 - dateWidth,
      y: ctx.y,
      size: 8,
      font: fontRegular,
      color: this.colors.slate,
    });

    ctx.y -= 18;

    // 4. Report Title
    ctx.page.drawText(title.toUpperCase(), {
      x: 50,
      y: ctx.y,
      size: 15,
      font: fontBold,
      color: this.colors.navy,
    });

    // 5. Version Badge
    const badgeText = "V1.0 Enterprise";
    const badgeWidth = fontBold.widthOfTextAtSize(badgeText, 7);
    ctx.page.drawRectangle({
      x: 50 + fontBold.widthOfTextAtSize(title, 15) + 12,
      y: ctx.y - 1,
      width: badgeWidth + 10,
      height: 14,
      color: this.colors.navy,
    });
    ctx.page.drawText(badgeText, {
      x: 50 + fontBold.widthOfTextAtSize(title, 15) + 17,
      y: ctx.y + 3,
      size: 7,
      font: fontBold,
      color: this.colors.white,
    });

    ctx.y -= 12;

    // 6. Subtitle
    ctx.page.drawText(subtitle, {
      x: 50,
      y: ctx.y,
      size: 9,
      font: fontRegular,
      color: this.colors.slate,
    });

    ctx.y -= 16;

    // 7. Dividing Line
    ctx.page.drawLine({
      start: { x: 50, y: ctx.y },
      end: { x: pageWidth - 50, y: ctx.y },
      thickness: 0.5,
      color: this.colors.border,
    });

    ctx.y -= 25;
  }

  /**
   * Helper: Draw dynamic footer on a page.
   */
  private static drawFooter(
    ctx: PageContext,
    fontRegular: any,
    snapshotDate: string,
    isLandscape: boolean = false
  ) {
    const pageWidth = isLandscape ? 842 : 595;
    const footerY = 35;

    // Line separator
    ctx.page.drawLine({
      start: { x: 50, y: footerY + 12 },
      end: { x: pageWidth - 50, y: footerY + 12 },
      thickness: 0.5,
      color: this.colors.border,
    });

    // Metadata left side
    const metadataStr = `Genereret af: rb@danfoods.dk  |  Snapshot: ${snapshotDate}  |  DMS Ver: 1.0.0`;
    ctx.page.drawText(metadataStr, {
      x: 50,
      y: footerY,
      size: 7,
      font: fontRegular,
      color: this.colors.slate,
    });

    // Page number right side
    const pageNumStr = `Side ${ctx.pageNumber}`;
    const pageNumWidth = fontRegular.widthOfTextAtSize(pageNumStr, 7);
    ctx.page.drawText(pageNumStr, {
      x: pageWidth - 50 - pageNumWidth,
      y: footerY,
      size: 7,
      font: fontRegular,
      color: this.colors.slate,
    });
  }

  /**
   * Helper: Draw a metric card box.
   */
  private static drawMetricCard(
    ctx: PageContext,
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    value: string,
    fontBold: any,
    fontRegular: any,
    valueColor = this.colors.navy
  ) {
    // Background Card with light grey border
    ctx.page.drawRectangle({
      x,
      y,
      width,
      height,
      color: this.colors.lightBg,
      borderColor: this.colors.border,
      borderWidth: 1,
    });

    // Title label
    ctx.page.drawText(label.toUpperCase(), {
      x: x + 10,
      y: y + height - 16,
      size: 7,
      font: fontBold,
      color: this.colors.slate,
    });

    // Value
    ctx.page.drawText(value, {
      x: x + 10,
      y: y + 12,
      size: 13,
      font: fontBold,
      color: valueColor,
    });
  }

  /**
   * Helper: Draw a progress bar vector chart.
   */
  private static drawProgressBar(
    ctx: PageContext,
    x: number,
    y: number,
    width: number,
    height: number,
    percentage: number,
    color = this.colors.navy
  ) {
    const cappedPct = Math.max(0, Math.min(100, percentage)) / 100;

    // Track Background
    ctx.page.drawRectangle({
      x,
      y,
      width,
      height,
      color: rgb(0.92, 0.94, 0.96),
    });

    // Filled Bar
    if (cappedPct > 0) {
      ctx.page.drawRectangle({
        x,
        y,
        width: width * cappedPct,
        height,
        color,
      });
    }
  }

  /**
   * Helper: Draw a fully aligned and formatted table.
   */
  private static drawTable(
    ctx: PageContext,
    headers: string[],
    rows: string[][],
    colWidths: number[],
    fontBold: any,
    fontRegular: any,
    isLandscape: boolean = false
  ) {
    const startX = 50;
    const rowHeight = 16;
    const padding = 6;
    const pageHeight = isLandscape ? 595 : 842;

    // --- DRAW HEADERS ---
    ctx.page.drawRectangle({
      x: startX,
      y: ctx.y - rowHeight,
      width: colWidths.reduce((a, b) => a + b, 0),
      height: rowHeight,
      color: this.colors.navy,
    });

    let currentX = startX;
    headers.forEach((h, colIdx) => {
      ctx.page.drawText(h, {
        x: currentX + padding,
        y: ctx.y - rowHeight + 4,
        size: 7.5,
        font: fontBold,
        color: this.colors.white,
      });
      currentX += colWidths[colIdx];
    });

    ctx.y -= rowHeight;

    // --- DRAW ROWS ---
    rows.forEach((row, rowIdx) => {
      // Automatic Page Budget Check
      if (ctx.y < 80) {
        this.drawFooter(ctx, fontRegular, "", isLandscape);
        ctx.addPage();
        this.drawHeader(ctx, "Fortsat tabel", "Systemfortsat oversigtstabeller", fontBold, fontRegular, "", isLandscape);
        
        // Redraw Header inside new page
        ctx.page.drawRectangle({
          x: startX,
          y: ctx.y - rowHeight,
          width: colWidths.reduce((a, b) => a + b, 0),
          height: rowHeight,
          color: this.colors.navy,
        });

        let newX = startX;
        headers.forEach((h, colIdx) => {
          ctx.page.drawText(h, {
            x: newX + padding,
            y: ctx.y - rowHeight + 4,
            size: 7.5,
            font: fontBold,
            color: this.colors.white,
          });
          newX += colWidths[colIdx];
        });
        ctx.y -= rowHeight;
      }

      const isEven = rowIdx % 2 === 0;
      const rowColor = isEven ? this.colors.lightBg : this.colors.white;

      ctx.page.drawRectangle({
        x: startX,
        y: ctx.y - rowHeight,
        width: colWidths.reduce((a, b) => a + b, 0),
        height: rowHeight,
        color: rowColor,
        borderColor: this.colors.border,
        borderWidth: 0.3,
      });

      let cellX = startX;
      row.forEach((cell, colIdx) => {
        // String truncation to avoid cell overflow
        const maxCellWidth = colWidths[colIdx] - (padding * 2);
        let textToDraw = cell || "";
        let textWidth = fontRegular.widthOfTextAtSize(textToDraw, 7);

        if (textWidth > maxCellWidth) {
          while (textToDraw.length > 3 && textWidth > maxCellWidth) {
            textToDraw = textToDraw.substring(0, textToDraw.length - 2);
            textWidth = fontRegular.widthOfTextAtSize(textToDraw + "..", 7);
          }
          textToDraw = textToDraw + "..";
        }

        ctx.page.drawText(textToDraw, {
          x: cellX + padding,
          y: ctx.y - rowHeight + 5,
          size: 7,
          font: fontRegular,
          color: this.colors.navy,
        });
        cellX += colWidths[colIdx];
      });

      ctx.y -= rowHeight;
    });

    ctx.y -= 12; // Bottom space
  }

  // ==========================================
  // EXPORT 1: DASHBOARD SUMMARY PDF
  // ==========================================
  public static async generateDashboardPdf(result: RefreshDebitorDataResult): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Landscape Mode for dynamic charts & KPI distribution
    const ctx = new PageContext(pdfDoc, 595, 842, true); // Width 842, Height 595
    const snapshotDate = result.snapshotMetadata?.businessDate || result.refreshedAt.split("T")[0];

    // Page 1 Header
    this.drawHeader(
      ctx,
      "DMS Debitor Dashboard Summary",
      "Overordnet sundhedstilstand, eksponering og vigtige portfolio-KPI'er for udestående debitorbalancer",
      fontBold,
      fontRegular,
      snapshotDate,
      true
    );

    // Metrics Row (6 metrics in total)
    const metricsWidth = 112;
    const metricsGap = 14;
    const startX = 50;
    const cardsY = ctx.y - 40;

    const exec = result.executiveSummary;
    this.drawMetricCard(ctx, startX, cardsY, metricsWidth, 40, "Total Eksponering", formatCurrency(exec.totalExposure), fontBold, fontRegular);
    this.drawMetricCard(ctx, startX + (metricsWidth + metricsGap), cardsY, metricsWidth, 40, "Total Forfalden", formatCurrency(exec.totalOverdue), fontBold, fontRegular, this.colors.redAlert);
    this.drawMetricCard(ctx, startX + (metricsWidth + metricsGap) * 2, cardsY, metricsWidth, 40, "Indbetaling 14d", formatCurrency(exec.payments14DaysTotal), fontBold, fontRegular, this.colors.greenSafe);
    this.drawMetricCard(ctx, startX + (metricsWidth + metricsGap) * 3, cardsY, metricsWidth, 40, "Kritiske Kunder", `${exec.criticalCustomersCount}`, fontBold, fontRegular, this.colors.redAlert);
    this.drawMetricCard(ctx, startX + (metricsWidth + metricsGap) * 4, cardsY, metricsWidth, 40, "Kunder m/ Forfald", `${result.kpis.summary.debtorsWithOverdueCount}`, fontBold, fontRegular, this.colors.orangeAlert);
    this.drawMetricCard(ctx, startX + (metricsWidth + metricsGap) * 5, cardsY, metricsWidth, 40, "Gns Risikoscore", `${exec.averageRiskScore.toFixed(1)} / 100`, fontBold, fontRegular);

    ctx.y -= 60;

    // Top Exposure & Top Overdue Lists (2 Column Layout)
    const colWidth = 355;
    const secondColX = 50 + colWidth + 30;
    const tablesY = ctx.y;

    // --- Left Column: Top 5 Exposure ---
    ctx.page.drawText("TOP 5 STØRSTE EKSPONERINGER", {
      x: 50,
      y: tablesY,
      size: 10,
      font: fontBold,
      color: this.colors.navy,
    });
    ctx.y -= 15;

    const sortedByExposure = [...result.kpis.customers]
      .sort((a, b) => (b.balance || 0) - (a.balance || 0))
      .slice(0, 5);

    sortedByExposure.forEach((c, idx) => {
      const rowY = ctx.y - (idx * 22);
      ctx.page.drawText(`${c.customerNo}  ${c.customerName}`, {
        x: 50,
        y: rowY,
        size: 7.5,
        font: fontBold,
        color: this.colors.navy,
      });
      ctx.page.drawText(formatCurrency(c.balance), {
        x: 50 + colWidth - 80,
        y: rowY,
        size: 7.5,
        font: fontBold,
        color: this.colors.navy,
      });

      // Horizontal progress bar representing share of total exposure
      const pct = exec.totalExposure > 0 ? (c.balance / exec.totalExposure) * 100 : 0;
      this.drawProgressBar(ctx, 50, rowY - 8, colWidth, 4, pct, this.colors.navy);
    });

    // --- Right Column: Top 5 Overdue ---
    ctx.page.drawText("TOP 5 STØRSTE OVERFORFALDNE", {
      x: secondColX,
      y: tablesY,
      size: 10,
      font: fontBold,
      color: this.colors.navy,
    });

    const sortedByOverdue = [...result.kpis.customers]
      .sort((a, b) => (b.overdue || 0) - (a.overdue || 0))
      .slice(0, 5);

    sortedByOverdue.forEach((c, idx) => {
      const rowY = ctx.y - (idx * 22);
      ctx.page.drawText(`${c.customerNo}  ${c.customerName}`, {
        x: secondColX,
        y: rowY,
        size: 7.5,
        font: fontBold,
        color: this.colors.redAlert,
      });
      ctx.page.drawText(formatCurrency(c.overdue), {
        x: secondColX + colWidth - 80,
        y: rowY,
        size: 7.5,
        font: fontBold,
        color: this.colors.redAlert,
      });

      const pct = exec.totalOverdue > 0 ? (c.overdue / exec.totalOverdue) * 100 : 0;
      this.drawProgressBar(ctx, secondColX, rowY - 8, colWidth, 4, pct, this.colors.redAlert);
    });

    ctx.y -= 5 * 22 + 20;

    // Section: Active Portfolio Alerts & Warnings
    ctx.page.drawText("AKTIVE ALARMER OG SYSTEMVARNINGER", {
      x: 50,
      y: ctx.y,
      size: 10,
      font: fontBold,
      color: this.colors.navy,
    });
    ctx.y -= 15;

    // Draw up to 3 highest priority alerts in a bordered box
    const activeAlerts = exec.alerts.slice(0, 3);
    if (activeAlerts.length === 0) {
      ctx.page.drawRectangle({
        x: 50,
        y: ctx.y - 25,
        width: 742,
        height: 25,
        color: this.colors.lightBg,
        borderColor: this.colors.border,
        borderWidth: 0.5,
      });
      ctx.page.drawText("Ingen kritiske alarmer fundet. Hele porteføljen opererer under normale risikoniveauer.", {
        x: 60,
        y: ctx.y - 16,
        size: 8,
        font: fontRegular,
        color: this.colors.greenSafe,
      });
      ctx.y -= 35;
    } else {
      activeAlerts.forEach((alert) => {
        ctx.page.drawRectangle({
          x: 50,
          y: ctx.y - 20,
          width: 742,
          height: 20,
          color: alert.priority === "Critical" ? rgb(254 / 255, 242 / 255, 242 / 255) : this.colors.lightBg,
          borderColor: this.colors.border,
          borderWidth: 0.5,
        });

        const alertText = `[${alert.priority.toUpperCase()}] ${alert.title}: ${alert.message} (Kunde ${alert.customerNo || "N/A"})`;
        ctx.page.drawText(alertText, {
          x: 60,
          y: ctx.y - 13,
          size: 7.5,
          font: fontBold,
          color: alert.priority === "Critical" ? this.colors.redAlert : this.colors.navy,
        });
        ctx.y -= 24;
      });
    }

    this.drawFooter(ctx, fontRegular, snapshotDate, true);
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  // ==========================================
  // EXPORT 2: CUSTOMER CARD PDF
  // ==========================================
  public static async generateCustomerPdf(
    result: RefreshDebitorDataResult,
    customerNo: string
  ): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Portrait Mode is best for vertical dossiers/fact sheets
    const ctx = new PageContext(pdfDoc, 595, 842, false);
    const snapshotDate = result.snapshotMetadata?.businessDate || result.refreshedAt.split("T")[0];

    const customer = result.kpis.customers.find((c) => c.customerNo === customerNo);
    if (!customer) {
      throw new Error(`Kunde med nummer ${customerNo} blev ikke fundet i systemet.`);
    }

    const risk = result.riskResults.find((r) => r.customerNo === customerNo);

    // Page 1 Header
    this.drawHeader(
      ctx,
      `KUNDEKORT DOSSIER: ${customer.customerName}`,
      `Detaljeret CRM, finansiel oversigt, udestående transaktioner, og risikovurdering for kunde #${customerNo}`,
      fontBold,
      fontRegular,
      snapshotDate,
      false
    );

    // Profile Grid (2x2 Box structure)
    const gridWidth = 238;
    const gridHeight = 35;
    const gridY = ctx.y - 40;

    this.drawMetricCard(ctx, 50, gridY, gridWidth, gridHeight, "ANSVARLIG SÆLGER", customer.salesperson || "Ikke angivet", fontBold, fontRegular);
    this.drawMetricCard(ctx, 50 + gridWidth + 19, gridY, gridWidth, gridHeight, "LOKATION (REGION)", customer.location || "Indland", fontBold, fontRegular);
    this.drawMetricCard(ctx, 50, gridY - 45, gridWidth, gridHeight, "BETALINGSBETINGELSER", customer.paymentTerms || "Netto 14 dage", fontBold, fontRegular);

    const stopColor = customer.creditHandling.toLowerCase().includes("stop") ? this.colors.redAlert : this.colors.greenSafe;
    this.drawMetricCard(ctx, 50 + gridWidth + 19, gridY - 45, gridWidth, gridHeight, "KREDITSTYRING STATUS", customer.creditHandling || "Normal", fontBold, fontRegular, stopColor);

    ctx.y -= 100;

    // Financial Overview Callout Box
    ctx.page.drawText("FINANSIEL STATUS (SALDO)", {
      x: 50,
      y: ctx.y,
      size: 10,
      font: fontBold,
      color: this.colors.navy,
    });
    ctx.y -= 15;

    ctx.page.drawRectangle({
      x: 50,
      y: ctx.y - 45,
      width: 495,
      height: 45,
      color: this.colors.lightBg,
      borderColor: this.colors.border,
      borderWidth: 1,
    });

    ctx.page.drawText("Aktuel Saldo:", { x: 65, y: ctx.y - 18, size: 8, font: fontRegular, color: this.colors.slate });
    ctx.page.drawText(formatCurrency(customer.balance), { x: 65, y: ctx.y - 32, size: 11, font: fontBold, color: this.colors.navy });

    ctx.page.drawText("Heraf Forfaldent:", { x: 185, y: ctx.y - 18, size: 8, font: fontRegular, color: this.colors.slate });
    ctx.page.drawText(formatCurrency(customer.overdue), { x: 185, y: ctx.y - 32, size: 11, font: fontBold, color: customer.overdue > 0 ? this.colors.redAlert : this.colors.greenSafe });

    ctx.page.drawText("Betalt Seneste 14d:", { x: 305, y: ctx.y - 18, size: 8, font: fontRegular, color: this.colors.slate });
    ctx.page.drawText(formatCurrency(customer.payment14Days), { x: 305, y: ctx.y - 32, size: 11, font: fontBold, color: this.colors.greenSafe });

    ctx.page.drawText("Saldoændring 7d:", { x: 425, y: ctx.y - 18, size: 8, font: fontRegular, color: this.colors.slate });
    const delta = customer.balanceDelta7 || 0;
    ctx.page.drawText(formatCurrency(delta), { x: 425, y: ctx.y - 32, size: 11, font: fontBold, color: delta > 0 ? this.colors.redAlert : delta < 0 ? this.colors.greenSafe : this.colors.slate });

    ctx.y -= 60;

    // Risk Evaluation Section
    if (risk) {
      ctx.page.drawText("RISIKO OG ANBEFALINGER", {
        x: 50,
        y: ctx.y,
        size: 10,
        font: fontBold,
        color: this.colors.navy,
      });
      ctx.y -= 15;

      ctx.page.drawRectangle({
        x: 50,
        y: ctx.y - 50,
        width: 495,
        height: 50,
        color: risk.riskLevel === "Critical" || risk.riskLevel === "VeryHigh" ? rgb(254 / 255, 242 / 255, 242 / 255) : this.colors.lightBg,
        borderColor: this.colors.border,
        borderWidth: 0.5,
      });

      const riskLvlText = `${risk.riskLevel.toUpperCase()} RISIKO  (Score: ${risk.riskScore}/100)`;
      ctx.page.drawText(riskLvlText, {
        x: 65,
        y: ctx.y - 16,
        size: 8.5,
        font: fontBold,
        color: risk.riskLevel === "Critical" || risk.riskLevel === "VeryHigh" ? this.colors.redAlert : this.colors.navy,
      });

      const wrappedRec = this.wrapText(`Anbefaling: ${risk.recommendation}`, 465, fontRegular, 8);
      wrappedRec.forEach((line, idx) => {
        ctx.page.drawText(line, {
          x: 65,
          y: ctx.y - 28 - (idx * 10),
          size: 7.5,
          font: fontRegular,
          color: this.colors.slate,
        });
      });

      ctx.y -= 65;
    }

    // Recent Transactions Table (Ledger lines)
    ctx.page.drawText("SENESTE DEBITORPOSTERINGER OG TRANSAKTIONER", {
      x: 50,
      y: ctx.y,
      size: 10,
      font: fontBold,
      color: this.colors.navy,
    });
    ctx.y -= 15;

    const txRows = (result.transactionResult.validRecords || [])
      .filter((t) => t.customerNumber === customerNo)
      .sort((a, b) => b.postingDate.localeCompare(a.postingDate))
      .slice(0, 8); // Top 8 ledger lines

    if (txRows.length === 0) {
      ctx.page.drawText("Ingen registrerede posteringslinjer fundet i SaldoPosterRAW for denne kunde.", {
        x: 50,
        y: ctx.y - 10,
        size: 8,
        font: fontRegular,
        color: this.colors.slate,
      });
      ctx.y -= 25;
    } else {
      const headers = ["Dato", "Type", "Bilagsnr", "Beløb", "Beskrivelse"];
      const colWidths = [70, 80, 80, 85, 180];
      const rows = txRows.map((t) => [
        formatDate(t.postingDate),
        t.documentType,
        t.documentNumber,
        formatCurrency(t.amountOre / 100),
        t.description,
      ]);
      this.drawTable(ctx, headers, rows, colWidths, fontBold, fontRegular, false);
    }

    // Active CRM Actions Section
    ctx.y -= 5;
    if (ctx.y < 120) {
      this.drawFooter(ctx, fontRegular, snapshotDate, false);
      ctx.addPage();
      this.drawHeader(ctx, `Målrettet Opfølgningsaktivitet: ${customer.customerName}`, `Kunde #${customerNo}`, fontBold, fontRegular, snapshotDate, false);
    }

    ctx.page.drawText("AKTIVE OG LUKKEDE OPFØLGNINGSAKTIVITETER", {
      x: 50,
      y: ctx.y,
      size: 10,
      font: fontBold,
      color: this.colors.navy,
    });
    ctx.y -= 15;

    const customerActions = (result.actions || [])
      .filter((a) => a.customerNumber === customerNo)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5);

    if (customerActions.length === 0) {
      ctx.page.drawText("Der er ikke logført nogen opfølgningsaktiviteter eller betalingsaftaler.", {
        x: 50,
        y: ctx.y - 10,
        size: 8,
        font: fontRegular,
        color: this.colors.slate,
      });
      ctx.y -= 25;
    } else {
      const headers = ["Oprettet", "Type", "Status", "Prioritet", "Kommentar"];
      const colWidths = [65, 80, 60, 60, 230];
      const rows = customerActions.map((a) => [
        formatDate(a.createdAt.split("T")[0]),
        a.type.toUpperCase(),
        a.status.toUpperCase(),
        a.priority.toUpperCase(),
        a.comment,
      ]);
      this.drawTable(ctx, headers, rows, colWidths, fontBold, fontRegular, false);
    }

    this.drawFooter(ctx, fontRegular, snapshotDate, false);
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  // ==========================================
  // EXPORT 3: COLLECTION QUEUE PDF
  // ==========================================
  public static async generateCollectionPdf(result: RefreshDebitorDataResult): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const ctx = new PageContext(pdfDoc, 595, 842, false);
    const snapshotDate = result.snapshotMetadata?.businessDate || result.refreshedAt.split("T")[0];

    // Page 1 Header
    this.drawHeader(
      ctx,
      "DF Rykkere & Collection Pipeline",
      "Prioriteret opfølgningskø med udestående forfaldne saldi og aktive betalingsløfter",
      fontBold,
      fontRegular,
      snapshotDate,
      false
    );

    // Summary of priority distribution
    ctx.page.drawText("SAMLET STATUS FOR RYKKERPORTNING", {
      x: 50,
      y: ctx.y,
      size: 10,
      font: fontBold,
      color: this.colors.navy,
    });
    ctx.y -= 15;

    const exec = result.executiveSummary;
    ctx.page.drawRectangle({
      x: 50,
      y: ctx.y - 40,
      width: 495,
      height: 40,
      color: this.colors.lightBg,
      borderColor: this.colors.border,
      borderWidth: 0.5,
    });

    ctx.page.drawText("Inkasso/Retskandidater:", { x: 65, y: ctx.y - 16, size: 8, font: fontRegular, color: this.colors.slate });
    ctx.page.drawText(`${exec.legalCandidatesCount} kunder`, { x: 65, y: ctx.y - 30, size: 9.5, font: fontBold, color: this.colors.redAlert });

    ctx.page.drawText("Aktive Kreditstop:", { x: 195, y: ctx.y - 16, size: 8, font: fontRegular, color: this.colors.slate });
    ctx.page.drawText(`${exec.creditStopsCount} leveringsspærrede`, { x: 195, y: ctx.y - 30, size: 9.5, font: fontBold, color: this.colors.redAlert });

    ctx.page.drawText("Udestående Rykkeropgaver:", { x: 345, y: ctx.y - 16, size: 8, font: fontRegular, color: this.colors.slate });
    ctx.page.drawText(`${exec.collectionRequiredCount} debitorer`, { x: 345, y: ctx.y - 30, size: 9.5, font: fontBold, color: this.colors.orangeAlert });

    ctx.y -= 55;

    // Priority Groups Overview Table
    ctx.page.drawText("PRIORITEREDE GRUPPER OG KØER", {
      x: 50,
      y: ctx.y,
      size: 10,
      font: fontBold,
      color: this.colors.navy,
    });
    ctx.y -= 15;

    const priorityGroups = [
      { key: "Priority1", label: "P1: Kritisk Retslig (Inkasso)" },
      { key: "Priority2", label: "P2: Aktiv Inkassovarsel" },
      { key: "Priority3", label: "P3: Telefonisk rykkerproces" },
      { key: "Priority4", label: "P4: Skriftlig e-mail rykker" },
      { key: "Priority5", label: "P5: Risikomonitorering" },
      { key: "Priority6", label: "P6: Rutinemæssig kontrol" },
    ];

    const pgRows = priorityGroups.map((g) => {
      const matchedRisk = result.riskResults.filter((r) => r.collectionPriority === g.key);
      const matchedNos = matchedRisk.map((r) => r.customerNo);
      const matchedCustomers = result.kpis.customers.filter((c) => matchedNos.includes(c.customerNo));

      const count = matchedCustomers.length;
      const totalExposure = matchedCustomers.reduce((s, c) => s + (c.balance || 0), 0);
      const totalOverdue = matchedCustomers.reduce((s, c) => s + (c.overdue || 0), 0);

      return [
        g.label,
        `${count} kunder`,
        formatCurrency(totalExposure),
        formatCurrency(totalOverdue),
      ];
    });

    const headersPG = ["Opfølgningskø", "Volumen", "Total Saldo", "Overforfalden"];
    const colWidthsPG = [185, 80, 115, 115];
    this.drawTable(ctx, headersPG, pgRows, colWidthsPG, fontBold, fontRegular, false);

    // Active Payment Promises
    if (ctx.y < 150) {
      this.drawFooter(ctx, fontRegular, snapshotDate, false);
      ctx.addPage();
      this.drawHeader(ctx, "Betalingsløfter & Retskandidater", "Pipeline-detaljer", fontBold, fontRegular, snapshotDate, false);
    }

    ctx.page.drawText("BRUDTE OG KOMMENDE BETALINGSLØFTER", {
      x: 50,
      y: ctx.y,
      size: 10,
      font: fontBold,
      color: this.colors.navy,
    });
    ctx.y -= 15;

    const promises = (result.actions || [])
      .filter((a) => a.type === "promise" && a.status === "promised")
      .slice(0, 6);

    if (promises.length === 0) {
      ctx.page.drawText("Der er ingen registrerede aktive betalingsløfter i denne periode.", {
        x: 50,
        y: ctx.y - 10,
        size: 8,
        font: fontRegular,
        color: this.colors.slate,
      });
      ctx.y -= 25;
    } else {
      const headersPromises = ["Kunde", "Dato Oprettet", "Betalingsfrist", "Kommentar"];
      const colWidthsPromises = [70, 95, 95, 235];
      const rowsPromises = promises.map((p) => [
        p.customerNumber,
        formatDate(p.createdAt.split("T")[0]),
        p.promisedPaymentDate ? formatDate(p.promisedPaymentDate) : "-",
        p.comment,
      ]);
      this.drawTable(ctx, headersPromises, rowsPromises, colWidthsPromises, fontBold, fontRegular, false);
    }

    this.drawFooter(ctx, fontRegular, snapshotDate, false);
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  // ==========================================
  // EXPORT 4: EXECUTIVE REPORT PDF
  // ==========================================
  public static async generateExecutivePdf(result: RefreshDebitorDataResult): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const ctx = new PageContext(pdfDoc, 595, 842, false);
    const snapshotDate = result.snapshotMetadata?.businessDate || result.refreshedAt.split("T")[0];

    // Page 1 Header
    this.drawHeader(
      ctx,
      "Danfoods Portefølje Analyse",
      "Executive Briefing: Strategisk risikovurdering og sundhedsstatus for Danfoods koncernens samlede debitorbog",
      fontBold,
      fontRegular,
      snapshotDate,
      false
    );

    // Section 1: Executive Summary Context
    ctx.page.drawText("OVERORDNET PORTEFØLJESTATUS", {
      x: 50,
      y: ctx.y,
      size: 10,
      font: fontBold,
      color: this.colors.navy,
    });
    ctx.y -= 15;

    const exec = result.executiveSummary;
    const descText = `Denne rapport præsenterer den strategiske risikofordeling for Danfoods debitorudestående på snapshot-datoen ${formatDate(snapshotDate)}. Den samlede eksponering er opgjort til ${formatCurrency(exec.totalExposure)}, hvoraf ${formatCurrency(exec.totalOverdue)} er klassificeret som overforfalden balance, hvilket udgør en reel likviditetsrisiko. Det gennemsnitlige risikoniveau for porteføljen er beregnet til en risikoscore på ${exec.averageRiskScore.toFixed(1)} ud af 100 mulige. Der er identificeret ${exec.criticalCustomersCount} kritiske højrisiko-debitorer, som kræver øjeblikkelig juridisk eller ledelsesmæssig opfølgning.`;

    const wrappedDesc = this.wrapText(descText, 495, fontRegular, 8.5);
    wrappedDesc.forEach((line) => {
      ctx.page.drawText(line, {
        x: 50,
        y: ctx.y,
        size: 8.5,
        font: fontRegular,
        color: this.colors.navy,
      });
      ctx.y -= 11;
    });

    ctx.y -= 15;

    // Section 2: Health Breakdown Table
    ctx.page.drawText("SUNDHEDSFORVENTNINGER OG PORTFOLIO-KATEGORIER", {
      x: 50,
      y: ctx.y,
      size: 10,
      font: fontBold,
      color: this.colors.navy,
    });
    ctx.y -= 15;

    // Group customers by status (Healthy, Monitor, Attention, Danger)
    const statusGroups = ["Healthy", "Monitor", "Attention", "Danger"];
    const statusLabels = ["Sunde debitorer (Healthy)", "Monitoreringskrævende (Monitor)", "Advarselssignal (Attention)", "Kritiske udeståender (Danger)"];
    
    const healthRows = statusGroups.map((status, idx) => {
      const matchedRisk = result.riskResults.filter((r) => r.customerStatus === status);
      const matchedNos = matchedRisk.map((r) => r.customerNo);
      const matchedCustomers = result.kpis.customers.filter((c) => matchedNos.includes(c.customerNo));

      const count = matchedCustomers.length;
      const totalExposure = matchedCustomers.reduce((sum, c) => sum + (c.balance || 0), 0);
      const overdueShare = matchedCustomers.reduce((sum, c) => sum + (c.overdue || 0), 0);

      return [
        statusLabels[idx],
        `${count} debitorer`,
        formatCurrency(totalExposure),
        formatCurrency(overdueShare),
      ];
    });

    const headersHealth = ["Porteføljekategori", "Volumen", "Eksponering", "Heraf Forfaldet"];
    const colWidthsHealth = [190, 80, 115, 110];
    this.drawTable(ctx, headersHealth, healthRows, colWidthsHealth, fontBold, fontRegular, false);

    // Section 3: Key Portfolio Action Plan
    if (ctx.y < 160) {
      this.drawFooter(ctx, fontRegular, snapshotDate, false);
      ctx.addPage();
      this.drawHeader(ctx, "Koncernanbefalinger", "Strategiske handlinger", fontBold, fontRegular, snapshotDate, false);
    }

    ctx.page.drawText("STRATEGISKE LEDELSESANBEFALINGER", {
      x: 50,
      y: ctx.y,
      size: 10,
      font: fontBold,
      color: this.colors.navy,
    });
    ctx.y -= 15;

    const recommendations = [
      { t: "1. Likviditetsstyring & Kreditstop", d: "Aktiver omgående automatiske kreditstop for de 5 største overforfaldne debitorer. Levering bør tilbageholdes indtil der foreligger skriftlig bekræftelse på bankoverførsel." },
      { t: "2. Juridisk Overdragelse", d: "Oversend de registrerede retskandidater (P1) til retslig inkasso hos Danfoods koncernadvokat. Vent ikke på yderligere betalingstilsagn." },
      { t: "3. Koncern-Kreditkontrol", d: "Nedsæt ugentlige debitor-opfølgningsmøder mellem salgsledelsen og kreditkontoret for at mindske 'Attention' gruppen og styrke opfølgningen på brudte betalingsløfter." }
    ];

    recommendations.forEach((rec) => {
      ctx.page.drawText(rec.t, {
        x: 50,
        y: ctx.y,
        size: 8.5,
        font: fontBold,
        color: this.colors.crimson,
      });
      ctx.y -= 11;

      const wrappedD = this.wrapText(rec.d, 495, fontRegular, 8);
      wrappedD.forEach((line) => {
        ctx.page.drawText(line, {
          x: 50,
          y: ctx.y,
          size: 8,
          font: fontRegular,
          color: this.colors.navy,
        });
        ctx.y -= 10;
      });
      ctx.y -= 8;
    });

    this.drawFooter(ctx, fontRegular, snapshotDate, false);
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }
}
