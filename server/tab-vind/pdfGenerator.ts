import { jsPDF } from "jspdf";
import { TabVindAnalysisResult, TabVindMatchGroup } from "../../src/modules/tab-vind/types.js";

// Helper to format Danish numbers and currency
function formatDanishCurrency(val: number): string {
  const formatted = Math.abs(val).toLocaleString("da-DK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const sign = val < 0 ? "-" : "";
  return `${sign}${formatted} kr.`;
}

function formatDanishQty(val: number): string {
  return val.toLocaleString("da-DK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  });
}

function formatDanishPercent(val: number): string {
  return `${val.toLocaleString("da-DK", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })}%`;
}

// Generate simple alerts on the server to match UI rules
function generateAlerts(analysis: TabVindAnalysisResult) {
  const alerts: { title: string; message: string; severity: "Low" | "Medium" | "High" | "Critical"; impact: number }[] = [];
  
  // 1. Unmatched NED values
  const largeUnmatchedNed = analysis.groups.filter(g => g.status === "Unmatched NED" && g.nedCostTotal > 2000);
  largeUnmatchedNed.forEach(g => {
    alerts.push({
      title: "Stor uafstemt nedregulering",
      message: `En uafstemt nedregulering for bilag ${g.nedRows[0]?.documentNumber || g.id} har et finansielt tabspotentiale.`,
      severity: "High",
      impact: g.nedCostTotal
    });
  });

  // 2. Unmatched OP values
  const largeUnmatchedOp = analysis.groups.filter(g => g.status === "Unmatched OP" && g.opCostTotal > 2000);
  largeUnmatchedOp.forEach(g => {
    alerts.push({
      title: "Stor uafstemt opregulering",
      message: `En uafstemt opregulering for bilag ${g.opRows[0]?.documentNumber || g.id} indikerer uforklaret lagertilgang.`,
      severity: "Medium",
      impact: g.opCostTotal
    });
  });

  // 3. Missing reason code
  const missingReasonRows = analysis.rawRows.filter(r => !r.reasonCode);
  if (missingReasonRows.length > 0) {
    alerts.push({
      title: "Manglende årsagskode på poster",
      message: `${missingReasonRows.length} post(er) mangler årsagskode (Årsagskode er blank), hvilket svækker data-analysen.`,
      severity: "High",
      impact: missingReasonRows.reduce((sum, r) => sum + r.normCost, 0)
    });
  }

  // 4. Conflicting documents or partial matches
  const partialGroups = analysis.groups.filter(g => g.status === "Partially Matched" || g.status === "Ambiguous");
  partialGroups.forEach(g => {
    if (Math.abs(g.costDifference) > 100) {
      alerts.push({
        title: `Værdiafvigelse på afstemt gruppe (${g.id})`,
        message: `Bilagsgruppen dækker over en uoverensstemmelse på ${formatDanishCurrency(g.costDifference)} efter matching.`,
        severity: "High",
        impact: Math.abs(g.costDifference)
      });
    }
  });

  return alerts;
}

export async function generateTabVindPDF(
  analysis: TabVindAnalysisResult,
  filters: any = {},
  options: any = {}
): Promise<Buffer> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4"
  });

  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2; // 515 pt

  let currentPage = 1;

  // Add standard footer to all pages
  const addFooter = (pNum: number) => {
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.line(margin, pageHeight - 35, pageWidth - margin, pageHeight - 35);
    doc.text(`TAB/VIND Afstemningsrapport | Kørselsdato: ${analysis.detectedBusinessDate}`, margin, pageHeight - 22);
    doc.text(`Side ${pNum}`, pageWidth - margin, pageHeight - 22, { align: "right" });
  };

  // Helper to manage page height and add pages automatically
  let currentY = margin;
  const checkPageOverflow = (neededHeight: number) => {
    if (currentY + neededHeight > pageHeight - 50) {
      addFooter(currentPage);
      doc.addPage();
      currentPage++;
      currentY = margin + 20; // reset to top with spacing
    }
  };

  // 1. COVER HEADER & GENERAL INFO
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text("DANFOODS DMS", margin, currentY + 10);
  
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139); // slate-500
  const generatedTime = new Date().toLocaleString("da-DK", { timeZone: "Europe/Copenhagen" });
  doc.text(`Genereret: ${generatedTime} | Af: rb@danfoods.dk`, pageWidth - margin, currentY + 8, { align: "right" });

  currentY += 25;
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 20;

  // Title block
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text("TAB / VIND RECONCILIATION RAPPORT", margin, currentY);
  currentY += 15;

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text(`Kilde fil: ${analysis.fileName || "Manuel upload"} (${(analysis.fileSize / 1024).toFixed(1)} KB)`, margin, currentY);
  currentY += 12;
  doc.text(`Forretningsdato / Periode: ${analysis.detectedBusinessDate}`, margin, currentY);
  currentY += 25;

  // 2. EXECUTIVE SUMMARY BOX
  checkPageOverflow(140);
  doc.setFillColor(248, 250, 252); // slate-50 (light off-white background)
  doc.rect(margin, currentY, contentWidth, 110, "F");
  
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("EXECUTIVE RESUMÉ", margin + 15, currentY + 20);

  // Divide the resume box into columns
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);

  // Col 1: Financial totals
  doc.text("Nedreguleret kost (NED):", margin + 15, currentY + 40);
  doc.text("Opreguleret kost (OP):", margin + 15, currentY + 55);
  doc.text("Netto lagerafvigelse:", margin + 15, currentY + 70);
  doc.text("Uforklaret difference:", margin + 15, currentY + 85);

  doc.setFont("Helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(formatDanishCurrency(analysis.summary.nedCostTotal), margin + 145, currentY + 40);
  doc.text(formatDanishCurrency(analysis.summary.opCostTotal), margin + 145, currentY + 55);
  
  const netDiff = analysis.summary.netCostDifference;
  if (netDiff < 0) {
    doc.setTextColor(220, 38, 38);
  } else {
    doc.setTextColor(22, 163, 74);
  }
  doc.text(formatDanishCurrency(netDiff), margin + 145, currentY + 70);
  
  const unexplained = analysis.summary.absoluteUnexplainedDifference;
  if (unexplained > 1000) {
    doc.setTextColor(220, 38, 38);
  } else {
    doc.setTextColor(15, 23, 42);
  }
  doc.text(formatDanishCurrency(unexplained), margin + 145, currentY + 85);

  // Col 2: Match rates & rows
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("Matchprocent (grupper):", margin + 270, currentY + 40);
  doc.text("Værdimatchprocent:", margin + 270, currentY + 55);
  doc.text("Antal rækker totalt:", margin + 270, currentY + 70);
  doc.text("Matchede / Umatchede:", margin + 270, currentY + 85);

  doc.setFont("Helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(formatDanishPercent(analysis.summary.groupMatchRate), margin + 395, currentY + 40);
  doc.text(formatDanishPercent(analysis.summary.valueMatchRate), margin + 395, currentY + 55);
  doc.text(`${analysis.rowCount} linjer`, margin + 395, currentY + 70);
  doc.text(`${analysis.summary.matchedGroupsCount} / ${analysis.summary.unmatchedNedCount + analysis.summary.unmatchedOpCount}`, margin + 395, currentY + 85);

  currentY += 130;

  // 3. MANAGEMENT CONCLUSION
  checkPageOverflow(70);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("LEDELSESKONKLUSION", margin, currentY);
  currentY += 12;

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85); // slate-700
  
  let conclusionText = "";
  if (unexplained < 1.0) {
    conclusionText = `TAB/VIND-rapporten for ${analysis.detectedBusinessDate} balancerer fuldstændigt indenfor de konfigurerede tolerancer. Alle ${analysis.rowCount} reguleringer er matchet mod modgående poster, og der er ingen uforklarlig lagerdifference.`;
  } else if (unexplained <= 1000) {
    conclusionText = `Rapporten viser mindre uforklarede differencer på i alt ${formatDanishCurrency(unexplained)}, svarende til en dækningsgrad baseret på værdi på ${formatDanishPercent(analysis.summary.valueMatchRate)}. Differencen er begrænset og kræver som udgangspunkt ikke yderligere revision.`;
  } else {
    conclusionText = `Rapporten viser væsentlige uafstemte reguleringer på samlet ${formatDanishCurrency(unexplained)}. Dette indikerer uafstemte svinds- eller nedreguleringsbilag, som ikke er modsvaret af opreguleringer på tværs af de registrerede lokationer. Undersøgelse bør iværksættes baseret på de listede uafstemte poster under operationalle advarsler.`;
  }
  
  // Wrap text
  const splitConclusion = doc.splitTextToSize(conclusionText, contentWidth);
  doc.text(splitConclusion, margin, currentY);
  currentY += splitConclusion.length * 12 + 20;

  // Dynamic grouping logic for tables
  // Group by reason codes
  const reasonCodeMap: Record<string, { nedCost: number; opCost: number; count: number }> = {};
  analysis.rawRows.forEach(r => {
    const rc = r.reasonCode || "MANGLENDE ÅRSAGSKODE";
    if (!reasonCodeMap[rc]) {
      reasonCodeMap[rc] = { nedCost: 0, opCost: 0, count: 0 };
    }
    reasonCodeMap[rc].count++;
    if (r.entryType === "Nedregulering") {
      reasonCodeMap[rc].nedCost += r.normCost;
    } else {
      reasonCodeMap[rc].opCost += r.normCost;
    }
  });

  // Group by locations
  const locationMap: Record<string, { nedCost: number; opCost: number; count: number }> = {};
  analysis.rawRows.forEach(r => {
    const loc = r.locationCode || "UKENDT LOKATION";
    if (!locationMap[loc]) {
      locationMap[loc] = { nedCost: 0, opCost: 0, count: 0 };
    }
    locationMap[loc].count++;
    if (r.entryType === "Nedregulering") {
      locationMap[loc].nedCost += r.normCost;
    } else {
      locationMap[loc].opCost += r.normCost;
    }
  });

  // 4. REASON-CODE SUMMARY TABLE
  checkPageOverflow(100);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("AFSTEMNING PR. ÅRSAGSKODE", margin, currentY);
  currentY += 15;

  // Table header
  const drawTableHeader = (headers: { label: string; width: number; align?: "left" | "right" }[]) => {
    doc.setFillColor(15, 23, 42); // deep slate background
    doc.rect(margin, currentY, contentWidth, 18, "F");
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    
    let tempX = margin + 8;
    headers.forEach(h => {
      const align = h.align || "left";
      if (align === "right") {
        doc.text(h.label, tempX + h.width - 16, currentY + 12, { align: "right" });
      } else {
        doc.text(h.label, tempX, currentY + 12);
      }
      tempX += h.width;
    });
    currentY += 18;
  };

  const rcHeaders = [
    { label: "Årsagskode", width: 140 },
    { label: "Nedregulering (NED)", width: 120, align: "right" as const },
    { label: "Opregulering (OP)", width: 120, align: "right" as const },
    { label: "Netto Difference", width: 135, align: "right" as const }
  ];

  drawTableHeader(rcHeaders);

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);

  Object.entries(reasonCodeMap).forEach(([rc, stats]) => {
    checkPageOverflow(20);
    doc.setFillColor(255, 255, 255);
    doc.rect(margin, currentY, contentWidth, 16, "F");
    
    doc.text(rc, margin + 8, currentY + 11);
    doc.text(formatDanishCurrency(stats.nedCost), margin + 140 + 120 - 16, currentY + 11, { align: "right" });
    doc.text(formatDanishCurrency(stats.opCost), margin + 140 + 120 + 120 - 16, currentY + 11, { align: "right" });
    
    const diff = stats.opCost - stats.nedCost;
    if (diff < -0.1) {
      doc.setTextColor(220, 38, 38);
    } else if (diff > 0.1) {
      doc.setTextColor(22, 163, 74);
    } else {
      doc.setTextColor(15, 23, 42);
    }
    doc.text(formatDanishCurrency(diff), margin + 140 + 120 + 120 + 135 - 16, currentY + 11, { align: "right" });
    doc.setTextColor(51, 65, 85);

    doc.setDrawColor(241, 245, 249); // slate-100 line
    doc.line(margin, currentY + 16, pageWidth - margin, currentY + 16);
    currentY += 16;
  });
  currentY += 20;

  // 5. LOCATION SUMMARY TABLE
  checkPageOverflow(100);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("AFSTEMNING PR. LOKATION", margin, currentY);
  currentY += 15;

  const locHeaders = [
    { label: "Lokation", width: 140 },
    { label: "Nedregulering (NED)", width: 120, align: "right" as const },
    { label: "Opregulering (OP)", width: 120, align: "right" as const },
    { label: "Netto Difference", width: 135, align: "right" as const }
  ];

  drawTableHeader(locHeaders);
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);

  Object.entries(locationMap).forEach(([loc, stats]) => {
    checkPageOverflow(20);
    doc.text(loc, margin + 8, currentY + 11);
    doc.text(formatDanishCurrency(stats.nedCost), margin + 140 + 120 - 16, currentY + 11, { align: "right" });
    doc.text(formatDanishCurrency(stats.opCost), margin + 140 + 120 + 120 - 16, currentY + 11, { align: "right" });
    
    const diff = stats.opCost - stats.nedCost;
    if (diff < -0.1) {
      doc.setTextColor(220, 38, 38);
    } else if (diff > 0.1) {
      doc.setTextColor(22, 163, 74);
    } else {
      doc.setTextColor(15, 23, 42);
    }
    doc.text(formatDanishCurrency(diff), margin + 140 + 120 + 120 + 135 - 16, currentY + 11, { align: "right" });
    doc.setTextColor(51, 65, 85);

    doc.setDrawColor(241, 245, 249);
    doc.line(margin, currentY + 16, pageWidth - margin, currentY + 16);
    currentY += 16;
  });
  currentY += 20;

  // 6. OPERATIONAL ALERTS SECTION
  const alerts = generateAlerts(analysis);
  if (alerts.length > 0) {
    checkPageOverflow(120);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text("OPERATIONELLE ADVARSLER & OBS-PUNKTER", margin, currentY);
    currentY += 15;

    alerts.forEach((alert) => {
      checkPageOverflow(45);
      
      // Draw alert severity badge
      doc.setFillColor(alert.severity === "Critical" || alert.severity === "High" ? 254 : 248, alert.severity === "Critical" || alert.severity === "High" ? 226 : 250, alert.severity === "Critical" || alert.severity === "High" ? 226 : 252);
      doc.rect(margin, currentY, contentWidth, 32, "F");

      // Draw left border accent based on severity
      doc.setFillColor(alert.severity === "Critical" || alert.severity === "High" ? 220 : 234, alert.severity === "Critical" || alert.severity === "High" ? 38 : 179, alert.severity === "Critical" || alert.severity === "High" ? 38 : 8);
      doc.rect(margin, currentY, 3, 32, "F");

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(`${alert.title.toUpperCase()} (${alert.severity}) - Værdi impact: ${formatDanishCurrency(alert.impact)}`, margin + 10, currentY + 12);
      
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(alert.message, margin + 10, currentY + 23);

      currentY += 38;
    });
    currentY += 10;
  }

  // 7. VARE-SPECIFIKKE DIFFERENCER (PRODUKTER DER SKABER DIFFERENCEN)
  interface ProductDiff {
    itemNumber: string;
    description: string;
    locationCode: string;
    reasonCode: string;
    netQty: number;
    netCost: number;
  }

  const productDiffMap: Record<string, ProductDiff> = {};

  analysis.groups.forEach(g => {
    if (g.status === "Matched") return;
    
    g.nedRows.forEach(row => {
      const key = `${row.itemNumber}_${row.locationCode}_${row.reasonCode || "BLANK"}`;
      if (!productDiffMap[key]) {
        productDiffMap[key] = {
          itemNumber: row.itemNumber,
          description: row.description,
          locationCode: row.locationCode,
          reasonCode: row.reasonCode || "BLANK",
          netQty: 0,
          netCost: 0
        };
      }
      productDiffMap[key].netQty += row.quantity;
      productDiffMap[key].netCost -= row.normCost;
    });

    g.opRows.forEach(row => {
      const key = `${row.itemNumber}_${row.locationCode}_${row.reasonCode || "BLANK"}`;
      if (!productDiffMap[key]) {
        productDiffMap[key] = {
          itemNumber: row.itemNumber,
          description: row.description,
          locationCode: row.locationCode,
          reasonCode: row.reasonCode || "BLANK",
          netQty: 0,
          netCost: 0
        };
      }
      productDiffMap[key].netQty += row.quantity;
      productDiffMap[key].netCost += row.normCost;
    });
  });

  const productDiffs = Object.values(productDiffMap)
    .filter(p => Math.abs(p.netCost) > 0.01)
    .sort((a, b) => Math.abs(b.netCost) - Math.abs(a.netCost));

  if (productDiffs.length > 0) {
    checkPageOverflow(100);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text("VARE-SPECIFIKKE DIFFERENCER (PRODUKTAFVIGELSER)", margin, currentY);
    currentY += 15;

    const prodHeaders = [
      { label: "Varenr.", width: 60 },
      { label: "Beskrivelse", width: 140 },
      { label: "Lokation", width: 70 },
      { label: "Årsag", width: 60 },
      { label: "Netto Antal", width: 85, align: "right" as const },
      { label: "Kost-difference", width: 100, align: "right" as const }
    ];

    drawTableHeader(prodHeaders);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);

    productDiffs.slice(0, 30).forEach(p => {
      checkPageOverflow(20);

      doc.text(p.itemNumber, margin + 8, currentY + 11);
      doc.text(p.description.slice(0, 28), margin + 60, currentY + 11);
      doc.text(p.locationCode, margin + 60 + 140, currentY + 11);
      doc.text(p.reasonCode, margin + 60 + 140 + 70, currentY + 11);
      
      const qtyText = formatDanishQty(p.netQty);
      doc.text(qtyText, margin + 60 + 140 + 70 + 60 + 85 - 16, currentY + 11, { align: "right" });

      doc.setTextColor(p.netCost < 0 ? 220 : 22, p.netCost < 0 ? 38 : 163, p.netCost < 0 ? 38 : 74);
      doc.text(formatDanishCurrency(p.netCost), margin + 60 + 140 + 70 + 60 + 85 + 100 - 16, currentY + 11, { align: "right" });
      doc.setTextColor(51, 65, 85);

      doc.setDrawColor(241, 245, 249);
      doc.line(margin, currentY + 16, pageWidth - margin, currentY + 16);
      currentY += 16;
    });

    if (productDiffs.length > 30) {
      checkPageOverflow(20);
      doc.setFont("Helvetica", "italic");
      doc.text(`... og ${productDiffs.length - 30} yderligere produktafvigelser udeladt for rapport-kompakthed.`, margin + 8, currentY + 11);
      currentY += 20;
    }
    
    currentY += 20;
  }

  // 8. UNMATCHED DETAIL TABLE
  const unmatchedGroups = analysis.groups.filter(g => g.status.startsWith("Unmatched") || g.status === "Partially Matched");
  if (unmatchedGroups.length > 0) {
    checkPageOverflow(100);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text("DETALJERET UMATCHEREDE & DELVIST MATCHEDE GRUPPER", margin, currentY);
    currentY += 15;

    const umHeaders = [
      { label: "ID / Status", width: 90 },
      { label: "Bilagsnummer", width: 95 },
      { label: "Lokation", width: 70 },
      { label: "Årsag", width: 60 },
      { label: "Vare(r)", width: 100 },
      { label: "Delta værdi", width: 100, align: "right" as const }
    ];

    drawTableHeader(umHeaders);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);

    unmatchedGroups.slice(0, 40).forEach(g => { // cap at 40 rows to prevent excessively giant PDF
      checkPageOverflow(20);
      
      let badgeText = g.status;
      let docText = g.nedRows.map(r => r.documentNumber).concat(g.opRows.map(r => r.documentNumber)).filter((v, idx, arr) => arr.indexOf(v) === idx).join(", ");
      let itemText = g.nedRows.map(r => r.itemNumber).concat(g.opRows.map(r => r.itemNumber)).filter((v, idx, arr) => arr.indexOf(v) === idx).slice(0, 3).join(", ");
      if (g.nedRows.length + g.opRows.length > 3) itemText += "...";

      doc.text(`${g.id} (${badgeText})`, margin + 8, currentY + 11);
      doc.text(docText.slice(0, 18), margin + 90, currentY + 11);
      doc.text(g.locationCode, margin + 90 + 95, currentY + 11);
      doc.text(g.reasonCode, margin + 90 + 95 + 70, currentY + 11);
      doc.text(itemText, margin + 90 + 95 + 70 + 60, currentY + 11);
      
      doc.setTextColor(g.costDifference < 0 ? 220 : 22, g.costDifference < 0 ? 38 : 163, g.costDifference < 0 ? 38 : 74);
      doc.text(formatDanishCurrency(g.costDifference), margin + 90 + 95 + 70 + 60 + 100 + 100 - 16, currentY + 11, { align: "right" });
      doc.setTextColor(51, 65, 85);

      doc.setDrawColor(241, 245, 249);
      doc.line(margin, currentY + 16, pageWidth - margin, currentY + 16);
      currentY += 16;
    });

    if (unmatchedGroups.length > 40) {
      checkPageOverflow(20);
      doc.setFont("Helvetica", "italic");
      doc.text(`... og ${unmatchedGroups.length - 40} yderligere uafstemte grupper udeladt for rapport-kompakthed.`, margin + 8, currentY + 11);
      currentY += 20;
    }
  }

  // Final footer attachment to the last page
  addFooter(currentPage);

  // Output as array buffer
  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
