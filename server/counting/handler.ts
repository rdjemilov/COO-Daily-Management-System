import { Request, Response } from "express";
import { getProductMaster, invalidateProductMasterCache } from "./productMaster.js";
import { generateCountingPDF } from "./pdfGenerator.js";

// Helper to sanitize the reason and generate the filename
function sanitizeFilename(reason: string, dateStr: string): string {
  const cleanReason = (reason || "Uspecificeret")
    .replace(/[^a-zA-Z0-9æøåÆØÅ\-_ ]/g, "") // Keep only alphanumeric, Danish letters, hyphens, underscores and spaces
    .trim()
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .substring(0, 40); // Limit length
  
  const datePart = dateStr ? dateStr.substring(0, 10) : new Date().toISOString().split("T")[0];
  return `DF-Cycle-Counting_${datePart}_${cleanReason}.pdf`;
}

// POST: Lookup a list of item numbers in the Product Master
export async function handleCountingProductsLookup(req: Request, res: Response) {
  try {
    const { itemNumbers, spreadsheetId } = req.body;
    if (!itemNumbers || !Array.isArray(itemNumbers)) {
      return res.status(400).json({ error: "Ugyldig anmodning. 'itemNumbers' skal være et array af varenumre." });
    }

    // Retrieve product master
    const { products, timestamp, source } = await getProductMaster(spreadsheetId);

    const matchedProducts: any[] = [];
    const notFound: string[] = [];

    // Normalize input item numbers
    const normalizedInputs = itemNumbers.map(item => String(item).trim());

    normalizedInputs.forEach(inputNum => {
      if (!inputNum) return;
      
      // 1. Try exact match
      let foundProduct = products.find(p => p.itemNumber === inputNum);

      // 2. Try flexible match with leading zero trimming
      if (!foundProduct) {
        const cleanInput = inputNum.replace(/^0+/, "");
        if (cleanInput) {
          foundProduct = products.find(p => p.itemNumber.replace(/^0+/, "") === cleanInput);
        }
      }

      if (foundProduct) {
        // Return with the input item number formatted as requested so frontend matches it exactly
        matchedProducts.push({
          ...foundProduct,
          itemNumber: inputNum
        });
      } else {
        if (!notFound.includes(inputNum)) {
          notFound.push(inputNum);
        }
      }
    });

    res.json({
      products: matchedProducts,
      notFound,
      sourceTimestamp: timestamp,
      source
    });
  } catch (error: any) {
    console.error("Error in product batch lookup:", error);
    res.status(500).json({ error: "Fejl under opslag af varenumre: " + error.message });
  }
}

// GET: Single or query-parameter-based product lookup
export async function handleCountingProductsQuery(req: Request, res: Response) {
  try {
    const itemsQuery = req.query.items as string;
    const spreadsheetId = req.query.spreadsheetId as string | undefined;
    if (!itemsQuery) {
      // Just return the full product master if no items are requested
      const { products, timestamp, source } = await getProductMaster(spreadsheetId);
      return res.json({ products, sourceTimestamp: timestamp, source });
    }

    const itemNumbers = itemsQuery.split(",").map(i => i.trim()).filter(Boolean);
    const { products, timestamp, source } = await getProductMaster(spreadsheetId);

    const matchedProducts = itemNumbers.map(num => {
      let found = products.find(p => p.itemNumber === num);
      if (!found) {
        const cleanInput = num.replace(/^0+/, "");
        if (cleanInput) {
          found = products.find(p => p.itemNumber.replace(/^0+/, "") === cleanInput);
        }
      }
      if (found) {
        return { ...found, itemNumber: num };
      }
      return null;
    }).filter(Boolean);

    const notFound = itemNumbers.filter(item => {
      const cleanItem = item.replace(/^0+/, "");
      return !products.some(p => p.itemNumber === item || (cleanItem && p.itemNumber.replace(/^0+/, "") === cleanItem));
    });

    res.json({
      products: matchedProducts,
      notFound,
      sourceTimestamp: timestamp,
      source
    });
  } catch (error: any) {
    console.error("Error in product query:", error);
    res.status(500).json({ error: "Fejl under hentning af varenumre: " + error.message });
  }
}

// POST: Invalidate cache and reload Product Master from Google Sheets
export async function handleCountingProductsRefresh(req: Request, res: Response) {
  try {
    const { spreadsheetId } = req.body;
    console.log("[Product Master] Manual cache invalidation triggered.");
    invalidateProductMasterCache();
    const { products, timestamp, source } = await getProductMaster(spreadsheetId);
    res.json({
      success: true,
      message: "Produktdata blev opdateret med succes fra Google Sheets.",
      sourceTimestamp: timestamp,
      source,
      totalCount: products.length
    });
  } catch (error: any) {
    console.error("Error refreshing product master:", error);
    res.status(500).json({ error: "Kunne ikke opdatere produktdata: " + error.message });
  }
}

// POST: Generate PDF from workspace data and return application/pdf
export async function handleCountingPdf(req: Request, res: Response) {
  try {
    const { workspace } = req.body;
    if (!workspace) {
      return res.status(400).json({ error: "Manglende workspace data til PDF generation." });
    }

    console.log(`[PDF Generator] Generating Cycle Counting PDF for workspace: "${workspace.title}"`);
    const pdfBuffer = await generateCountingPDF(workspace);

    const dateStr = workspace.createdAt ? workspace.createdAt.split("T")[0] : new Date().toISOString().split("T")[0];
    const filename = sanitizeFilename(workspace.reason, dateStr);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error("Error generating Counting PDF:", error);
    res.status(500).json({ error: "PDF-generering mislykkedes: " + error.message });
  }
}
