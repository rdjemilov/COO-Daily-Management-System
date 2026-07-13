import { jsPDF } from "jspdf";

// Danish number and currency formatting helpers
function formatDanishQty(val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  return val.toLocaleString("da-DK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  });
}

function formatDanishDiff(val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  const formatted = val.toLocaleString("da-DK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  });
  return val > 0 ? `+${formatted}` : formatted;
}

export async function generateCountingPDF(workspace: any): Promise<Buffer> {
  // A4 Landscape dimensions in points (pt)
  // Width: 841.89 pt, Height: 595.28 pt
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "a4"
  });

  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2; // 762 pt

  let currentPage = 1;
  let currentY = margin;

  // Gather unique locations present in workspace
  const locations: { id: string; label: string }[] = [];
  if (workspace.items && workspace.items.length > 0) {
    const item = workspace.items[0];
    if (item.locations) {
      item.locations.forEach((loc: any) => {
        locations.push({
          id: loc.locationId,
          label: loc.locationLabel
        });
      });
    }
  }

  // Location-specific pastel colors for PDF (RGB representation)
  const LOCATION_PDF_COLORS: Record<string, {
    headerBg: [number, number, number];
    headerText: [number, number, number];
    colBg: [number, number, number];
    border: [number, number, number];
  }> = {
    herning: {
      headerBg: [30, 58, 138], // Deep blue
      headerText: [255, 255, 255],
      colBg: [248, 250, 252], // Ambient slate/blue light
      border: [191, 219, 254]
    },
    aarhus: {
      headerBg: [88, 28, 135], // Deep purple
      headerText: [255, 255, 255],
      colBg: [253, 244, 255], // Soft purple
      border: [233, 213, 255]
    },
    aalborg: {
      headerBg: [19, 78, 74], // Deep teal
      headerText: [255, 255, 255],
      colBg: [240, 253, 250], // Soft teal
      border: [153, 246, 228]
    },
    odense: {
      headerBg: [120, 53, 4], // Deep amber
      headerText: [255, 255, 255],
      colBg: [254, 243, 199], // Soft amber
      border: [253, 230, 138]
    }
  };

  // Calculate dynamic column widths
  // Left fixed columns: Varenr (65pt), Beskrivelse (190pt), Enhed (40pt) = 295 pt
  // Remaining space: 762 - 295 = 467 pt
  // Divide among locations: 467 / numLocations
  const fixedColsWidth = 295;
  const numLocations = locations.length || 1;
  const locGroupWidth = Math.floor((contentWidth - fixedColsWidth) / numLocations);
  const locColWidth = Math.floor(locGroupWidth / 3);

  // Column definitions
  const colVarenrWidth = 65;
  const colDescWidth = 190;
  const colUnitWidth = 40;

  // Header and footer helper
  const drawPageBorderAndFooter = (pageNum: number) => {
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(1);
    // Draw subtle border around page content
    doc.rect(margin - 10, margin - 10, contentWidth + 20, pageHeight - margin * 2 + 20);

    // Footer
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);

    const leftText = "DF – CYCLE COUNTING REPORT • Danfoods";
    const centerText = `Dato: ${new Date(workspace.createdAt).toLocaleDateString("da-DK")} • Årsag: ${workspace.reason}${workspace.customReason ? " (" + workspace.customReason + ")" : ""}`;
    const rightText = `Side ${pageNum}`;

    doc.text(leftText, margin, pageHeight - margin + 15);
    doc.text(centerText, pageWidth / 2, pageHeight - margin + 15, { align: "center" });
    doc.text(rightText, pageWidth - margin, pageHeight - margin + 15, { align: "right" });
  };

  const checkPageOverflow = (neededHeight: number) => {
    if (currentY + neededHeight > pageHeight - margin - 20) {
      drawPageBorderAndFooter(currentPage);
      doc.addPage();
      currentPage++;
      currentY = margin;
      drawTableHeader();
    }
  };

  const drawTableHeader = () => {
    doc.setFillColor(15, 23, 42); // slate-900 for product info headers
    doc.rect(margin, currentY, fixedColsWidth, 32, "F");

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);

    // Fixed product headers
    doc.text("Varenr.", margin + 8, currentY + 14);
    doc.text("Beskrivelse", margin + colVarenrWidth + 8, currentY + 14);
    doc.text("Enhed", margin + colVarenrWidth + colDescWidth + 8, currentY + 14);

    // Location Group Headers (Double decker header)
    locations.forEach((loc, idx) => {
      const groupX = margin + fixedColsWidth + (idx * locGroupWidth);
      const colorSet = LOCATION_PDF_COLORS[loc.id] || {
        headerBg: [51, 65, 85],
        headerText: [255, 255, 255],
        border: [100, 116, 139]
      };

      // Custom background color for this location group's header
      doc.setFillColor(colorSet.headerBg[0], colorSet.headerBg[1], colorSet.headerBg[2]);
      doc.rect(groupX, currentY, locGroupWidth, 32, "F");

      // Location Title
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(colorSet.headerText[0], colorSet.headerText[1], colorSet.headerText[2]);
      doc.text(loc.label.toUpperCase(), groupX + (locGroupWidth / 2), currentY + 12, { align: "center" });

      // Secondary headers (System, Optalt, Forskel)
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(7.5);
      doc.text("Sys", groupX + 10, currentY + 24);
      doc.text("Opt", groupX + locColWidth + 10, currentY + 24);
      doc.text("Diff", groupX + locColWidth * 2 + 10, currentY + 24);

      // Thick right-border separator for location distinction
      doc.setDrawColor(colorSet.border[0], colorSet.border[1], colorSet.border[2]);
      doc.setLineWidth(1.5);
      doc.line(groupX + locGroupWidth, currentY, groupX + locGroupWidth, currentY + 32);
    });

    currentY += 32;
  };

  // --- PAGE 1 HEADER & METADATA ---
  // Logo
  doc.setFillColor(15, 23, 42); // slate-900 background for top title
  doc.rect(margin, currentY, contentWidth, 50, "F");

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text("DANFOODS", margin + 15, currentY + 30);

  doc.setFont("Helvetica", "light");
  doc.setFontSize(12);
  doc.text("CYCLE COUNTING REPORT", margin + 130, currentY + 30);

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(`ID: ${workspace.id}`, pageWidth - margin - 15, currentY + 30, { align: "right" });

  currentY += 60;

  // Metadata Grid
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, currentY, contentWidth, 55, "FD");

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);

  doc.text("Optællingsårsag:", margin + 15, currentY + 18);
  doc.text("Dato og Tid:", margin + 200, currentY + 18);
  doc.text("Status:", margin + 380, currentY + 18);
  doc.text("Total Rækker:", margin + 520, currentY + 18);
  doc.text("Optalte / Mangler:", margin + 640, currentY + 18);

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);

  const finalReason = workspace.reason === "Andet" && workspace.customReason ? workspace.customReason : workspace.reason;
  doc.text(finalReason || "Uspecificeret", margin + 15, currentY + 32);
  
  const createdTimeStr = new Date(workspace.createdAt).toLocaleString("da-DK", {
    dateStyle: "medium",
    timeStyle: "short"
  });
  doc.text(createdTimeStr, margin + 200, currentY + 32);

  const statusLabel = workspace.status === "draft" ? "Kladde" :
                      workspace.status === "in-progress" ? "I gang" :
                      workspace.status === "completed" ? "Afsluttet" : "Kasseret";
  doc.text(statusLabel, margin + 380, currentY + 32);

  const totalProducts = workspace.items?.length || 0;
  doc.text(String(totalProducts), margin + 520, currentY + 32);

  // Calculate counted vs remaining
  let fullyCounted = 0;
  let hasDifferencesCount = 0;
  let totalAbsDiff = 0;
  let positiveDiffs = 0;
  let negativeDiffs = 0;

  workspace.items?.forEach((item: any) => {
    let itemHasCount = false;
    let itemHasDiff = false;
    item.locations?.forEach((loc: any) => {
      if (loc.countedQuantity !== null) {
        itemHasCount = true;
      }
      if (loc.difference !== null && loc.difference !== 0) {
        itemHasDiff = true;
        totalAbsDiff += Math.abs(loc.difference);
        if (loc.difference > 0) positiveDiffs++;
        if (loc.difference < 0) negativeDiffs++;
      }
    });
    if (itemHasCount) fullyCounted++;
    if (itemHasDiff) hasDifferencesCount++;
  });

  doc.text(`${fullyCounted} optalt / ${totalProducts - fullyCounted} mangler`, margin + 640, currentY + 32);

  if (workspace.note) {
    currentY += 65;
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, currentY, contentWidth, 25, "F");
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text("Note:", margin + 10, currentY + 15);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(workspace.note.slice(0, 160), margin + 45, currentY + 15);
    currentY += 35;
  } else {
    currentY += 65;
  }

  // Summary Metrics Section (Second row)
  doc.setFillColor(239, 246, 255); // soft blue background
  doc.setDrawColor(191, 219, 254);
  doc.rect(margin, currentY, contentWidth, 35, "FD");

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(30, 58, 138);

  doc.text("Rækker m. afvigelser:", margin + 15, currentY + 20);
  doc.text("Positive afvigelser (+):", margin + 180, currentY + 20);
  doc.text("Negative afvigelser (-):", margin + 350, currentY + 20);
  doc.text("Total Absolut Kvantum Difference:", margin + 520, currentY + 20);

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(String(hasDifferencesCount), margin + 120, currentY + 20);
  doc.text(String(positiveDiffs), margin + 290, currentY + 20);
  doc.text(String(negativeDiffs), margin + 460, currentY + 20);
  doc.text(`${totalAbsDiff.toLocaleString("da-DK")} enheder`, margin + 685, currentY + 20);

  currentY += 45;

  // DRAW MAIN DATA TABLE
  drawTableHeader();

  // Draw product rows
  workspace.items?.forEach((item: any) => {
    checkPageOverflow(16);

    // Draw background block color for the product details part (Alternating slate rows)
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, currentY, fixedColsWidth, 16, "F");

    // Color the background blocks of location columns
    locations.forEach((loc, idx) => {
      const groupX = margin + fixedColsWidth + (idx * locGroupWidth);
      const colorSet = LOCATION_PDF_COLORS[loc.id];
      if (colorSet) {
        doc.setFillColor(colorSet.colBg[0], colorSet.colBg[1], colorSet.colBg[2]);
        doc.rect(groupX, currentY, locGroupWidth, 16, "F");
      }
    });

    // Draw a bottom horizontal line border
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(1);
    doc.line(margin, currentY + 16, margin + contentWidth, currentY + 16);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);

    // Product identity values
    doc.text(item.itemNumber, margin + 8, currentY + 11);
    
    // Description text wrap
    const descText = item.description || "Uden beskrivelse";
    const shortDesc = descText.length > 40 ? descText.substring(0, 38) + "..." : descText;
    doc.text(shortDesc, margin + colVarenrWidth + 8, currentY + 11);

    doc.text(item.baseUnit || "STK", margin + colVarenrWidth + colDescWidth + 8, currentY + 11);

    // Location specific values
    locations.forEach((loc, idx) => {
      const groupX = margin + fixedColsWidth + (idx * locGroupWidth);
      const locEntry = item.locations?.find((l: any) => l.locationId === loc.id);

      const sysQty = locEntry ? locEntry.systemQuantity : null;
      const countQty = locEntry ? locEntry.countedQuantity : null;
      const diffQty = locEntry ? locEntry.difference : null;

      // Draw values
      doc.setTextColor(71, 85, 105); // sys is muted
      doc.setFont("Helvetica", "normal");
      doc.text(formatDanishQty(sysQty), groupX + 10, currentY + 11);

      doc.setTextColor(15, 23, 42); // counted is normal
      doc.setFont("Helvetica", "bold"); // Bold active counted quantity like the web table
      doc.text(formatDanishQty(countQty), groupX + locColWidth + 10, currentY + 11);

      // Color difference column
      if (diffQty !== null && diffQty !== 0) {
        if (diffQty < 0) {
          doc.setTextColor(220, 38, 38); // Red for negative difference
        } else {
          doc.setTextColor(22, 163, 74); // Green for positive difference
        }
      } else {
        doc.setTextColor(148, 163, 184); // neutral grey for zero or empty
      }
      doc.setFont("Helvetica", "bold");
      doc.text(formatDanishDiff(diffQty), groupX + locColWidth * 2 + 10, currentY + 11);

      // Draw vertical separation line on the right of this location group
      const colorSet = LOCATION_PDF_COLORS[loc.id];
      if (colorSet) {
        doc.setDrawColor(colorSet.border[0], colorSet.border[1], colorSet.border[2]);
        doc.setLineWidth(1);
        doc.line(groupX + locGroupWidth, currentY, groupX + locGroupWidth, currentY + 16);
      }
    });

    currentY += 16;
  });

  // Finish current and final page layout
  drawPageBorderAndFooter(currentPage);

  // Return the PDF as a Node Buffer
  const pdfArrayBuffer = doc.output("arraybuffer");
  return Buffer.from(pdfArrayBuffer);
}
