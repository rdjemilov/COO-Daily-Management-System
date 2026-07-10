import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

interface PDFExportOptions {
  orientation?: "portrait" | "landscape";
  title?: string;
  subtitle?: string;
}

// --- OKLCH & OKLAB Color Conversion Math ---

function parseVal(valStr: string): number {
  const clean = valStr.trim();
  const val = parseFloat(clean);
  if (isNaN(val)) return 0;
  if (clean.endsWith("%")) {
    return val / 100;
  }
  return val;
}

function oklabToRgb(l: number, aCoord: number, bCoord: number): [number, number, number] {
  const l_ = l + 0.3963377774 * aCoord + 0.2158037573 * bCoord;
  const m_ = l - 0.1055613458 * aCoord - 0.0638541728 * bCoord;
  const s_ = l - 0.0894841775 * aCoord - 1.2914855480 * bCoord;
  
  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;
  
  const r_l = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const g_l = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const b_l = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;
  
  const r = r_l <= 0.0031308 ? 12.92 * r_l : 1.055 * Math.pow(r_l, 1 / 2.4) - 0.055;
  const g = g_l <= 0.0031308 ? 12.92 * g_l : 1.055 * Math.pow(g_l, 1 / 2.4) - 0.055;
  const b = b_l <= 0.0031308 ? 12.92 * b_l : 1.055 * Math.pow(b_l, 1 / 2.4) - 0.055;
  
  return [
    Math.round(Math.max(0, Math.min(1, r)) * 255),
    Math.round(Math.max(0, Math.min(1, g)) * 255),
    Math.round(Math.max(0, Math.min(1, b)) * 255),
  ];
}

function oklchToRgb(l: number, c: number, h: number): [number, number, number] {
  const hRad = (isNaN(h) ? 0 : h * Math.PI) / 180;
  const aCoord = c * Math.cos(hRad);
  const bCoord = c * Math.sin(hRad);
  return oklabToRgb(l, aCoord, bCoord);
}

function replaceColorFunction(cssText: string, functionName: "oklch" | "oklab"): string {
  const lowerName = functionName.toLowerCase();
  const regex = new RegExp(`${lowerName}\\s*\\(`, 'gi');
  let match;
  
  // Find all matches
  const matches: { start: number; contentStart: number }[] = [];
  while ((match = regex.exec(cssText)) !== null) {
    matches.push({
      start: match.index,
      contentStart: match.index + match[0].length
    });
  }
  
  // Process backwards so indices remain correct
  for (let i = matches.length - 1; i >= 0; i--) {
    const { start, contentStart } = matches[i];
    let openParens = 1;
    let closingIndex = -1;
    
    for (let j = contentStart; j < cssText.length; j++) {
      if (cssText[j] === "(") {
        openParens++;
      } else if (cssText[j] === ")") {
        openParens--;
        if (openParens === 0) {
          closingIndex = j;
          break;
        }
      }
    }
    
    if (closingIndex === -1) continue;
    
    const fullMatch = cssText.substring(start, closingIndex + 1);
    const innerContent = cssText.substring(contentStart, closingIndex);
    
    let replacement = "rgba(128, 128, 128, 0.5)"; // Safe fallback
    try {
      if (innerContent.includes("var(") || innerContent.includes("calc(")) {
        replacement = "rgba(128, 128, 128, 0.5)";
      } else {
        const normalized = innerContent.replace(/[\/,]/g, " ").trim();
        const parts = normalized.split(/\s+/);
        if (parts.length >= 3) {
          const l = parseVal(parts[0]);
          if (lowerName === "oklch") {
            const c = parseVal(parts[1]);
            const h = parseVal(parts[2]);
            const a = parts[3] ? parseVal(parts[3]) : 1;
            const [r, g, b] = oklchToRgb(l, c, h);
            replacement = `rgba(${r}, ${g}, ${b}, ${a})`;
          } else {
            const aVal = parseVal(parts[1]);
            const bVal = parseVal(parts[2]);
            const a = parts[3] ? parseVal(parts[3]) : 1;
            const [r, g, b] = oklabToRgb(l, aVal, bVal);
            replacement = `rgba(${r}, ${g}, ${b}, ${a})`;
          }
        }
      }
    } catch (e) {
      console.warn("Failed to parse color", fullMatch, e);
    }
    
    cssText = cssText.substring(0, start) + replacement + cssText.substring(closingIndex + 1);
  }
  
  return cssText;
}

function convertOklchAndOklabText(text: string): string {
  let result = text;
  result = replaceColorFunction(result, "oklch");
  result = replaceColorFunction(result, "oklab");
  return result;
}

async function replaceOklchAndOklabInStylesAsync() {
  const styles = Array.from(document.querySelectorAll("style, link[rel='stylesheet']"));
  const newStylesheets: HTMLStyleElement[] = [];
  const removedElements: { element: Element; parent: Node; nextSibling: Node | null }[] = [];
  
  // Save original adopted style sheets
  const originalAdopted = (document as any).adoptedStyleSheets;
  if (originalAdopted && originalAdopted.length > 0) {
    try {
      const newAdopted = originalAdopted.map((sheet: any) => {
        try {
          const cssText = Array.from(sheet.cssRules).map((r: any) => r.cssText).join("\n");
          if (cssText.toLowerCase().includes("oklch") || cssText.toLowerCase().includes("oklab")) {
            const processedCss = convertOklchAndOklabText(cssText);
            const newSheet = new (window as any).CSSStyleSheet();
            newSheet.replaceSync(processedCss);
            return newSheet;
          }
        } catch (innerE) {
          console.warn("Could not sanitize adopted stylesheet rules", innerE);
        }
        return sheet;
      });
      (document as any).adoptedStyleSheets = newAdopted;
    } catch (e) {
      console.warn("Could not sanitize adopted style sheets", e);
    }
  }
  
  for (const styleEl of styles) {
    try {
      let cssText = "";
      if (styleEl.tagName === "STYLE") {
        cssText = styleEl.textContent || "";
      } else if (styleEl.tagName === "LINK") {
        const linkEl = styleEl as HTMLLinkElement;
        const href = linkEl.href;
        const isSameOrigin = !href || href.startsWith(window.location.origin) || href.startsWith("/") || !href.includes("://");
        
        if (isSameOrigin && href) {
          try {
            const response = await fetch(href);
            if (response.ok) {
              cssText = await response.text();
            }
          } catch (e) {
            console.warn("Could not fetch external stylesheet via fetch", href, e);
          }
        }
        
        // If fetch failed or wasn't same origin, try reading sheet.cssRules as a fallback
        if (!cssText) {
          const sheet = linkEl.sheet;
          if (sheet) {
            try {
              cssText = Array.from(sheet.cssRules).map(r => r.cssText).join("\n");
            } catch (e) {
              console.warn("Could not read stylesheet rules", href, e);
            }
          }
        }
      }
      
      const lowerCss = cssText.toLowerCase();
      if (!cssText || (!lowerCss.includes("oklch") && !lowerCss.includes("oklab"))) {
        continue;
      }
      
      const processedCss = convertOklchAndOklabText(cssText);
      
      const newStyle = document.createElement("style");
      newStyle.textContent = processedCss;
      newStyle.setAttribute("data-pdf-fallback", "true");
      document.head.appendChild(newStyle);
      newStylesheets.push(newStyle);
      
      // Temporarily remove/detach the original element from the DOM so html2canvas never sees it!
      const parent = styleEl.parentNode;
      if (parent) {
        removedElements.push({
          element: styleEl,
          parent,
          nextSibling: styleEl.nextSibling
        });
        parent.removeChild(styleEl);
      }
    } catch (e) {
      console.warn("Error processing stylesheet", e);
    }
  }
  
  return () => {
    // Restore original adopted style sheets
    if (originalAdopted) {
      try {
        (document as any).adoptedStyleSheets = originalAdopted;
      } catch (e) {
        console.warn("Could not restore adopted style sheets", e);
      }
    }
    
    for (const newStyle of newStylesheets) {
      newStyle.remove();
    }
    for (const item of removedElements) {
      try {
        item.parent.insertBefore(item.element, item.nextSibling);
      } catch (e) {
        console.warn("Error restoring stylesheet element", e);
      }
    }
  };
}

function replaceInlineStyles(el: HTMLElement) {
  const originalInlineStyles = new Map<HTMLElement, string>();
  
  const traverse = (node: HTMLElement) => {
    const styleAttr = node.getAttribute("style");
    if (styleAttr && (styleAttr.toLowerCase().includes("oklch") || styleAttr.toLowerCase().includes("oklab"))) {
      originalInlineStyles.set(node, styleAttr);
      node.setAttribute("style", convertOklchAndOklabText(styleAttr));
    }
    
    Array.from(node.children).forEach((child) => {
      traverse(child as HTMLElement);
    });
  };
  
  traverse(el);
  
  return () => {
    originalInlineStyles.forEach((styleAttr, node) => {
      node.setAttribute("style", styleAttr);
    });
  };
}

function patchGetComputedStyleGlobally(): () => void {
  const cleanups: (() => void)[] = [];

  function patchWindow(win: Window) {
    try {
      const proto = (win as any).CSSStyleDeclaration?.prototype || CSSStyleDeclaration.prototype;
      const originalGetPropertyValue = proto.getPropertyValue;
      proto.getPropertyValue = function (this: any, prop: string) {
        const val = originalGetPropertyValue.call(this, prop);
        if (typeof val === "string" && (val.toLowerCase().includes("oklch") || val.toLowerCase().includes("oklab"))) {
          return convertOklchAndOklabText(val);
        }
        return val;
      };

      const originalGetComputedStyle = win.getComputedStyle;
      win.getComputedStyle = function (this: any, elt: Element, pseudoElt?: string) {
        const style = originalGetComputedStyle.call(this, elt, pseudoElt);
        return new Proxy(style, {
          get(target, prop, receiver) {
            const val = Reflect.get(target, prop, receiver);
            if (typeof val === "string" && (val.toLowerCase().includes("oklch") || val.toLowerCase().includes("oklab"))) {
              return convertOklchAndOklabText(val);
            }
            if (typeof val === "function") {
              return val.bind(target);
            }
            return val;
          }
        });
      };

      cleanups.push(() => {
        proto.getPropertyValue = originalGetPropertyValue;
        win.getComputedStyle = originalGetComputedStyle;
      });
    } catch (e) {
      console.warn("Failed to patch window computed style", e);
    }
  }

  // Patch main window
  patchWindow(window);

  // Hook document.createElement to intercept iframe creation
  try {
    const originalCreateElement = document.createElement;
    document.createElement = function (this: Document, tagName: string, options?: any) {
      const el = originalCreateElement.call(this, tagName, options);
      if (tagName.toLowerCase() === "iframe") {
        const iframe = el as HTMLIFrameElement;
        let patched = false;
        Object.defineProperty(iframe, "contentWindow", {
          get() {
            const win = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow")?.get?.call(iframe);
            if (win && !patched) {
              patched = true;
              patchWindow(win);
            }
            return win;
          },
          configurable: true
        });
      }
      return el;
    };

    cleanups.push(() => {
      document.createElement = originalCreateElement;
    });
  } catch (e) {
    console.warn("Failed to hook document.createElement for oklch patch", e);
  }

  return () => {
    cleanups.forEach((cleanup) => {
      try {
        cleanup();
      } catch (err) {
        console.warn("Error running cleanup in getComputedStyle patch", err);
      }
    });
  };
}

// --- Main PDF Export Function ---

export async function exportElementToPDF(
  element: HTMLElement,
  filename: string,
  options: PDFExportOptions = {},
  onProgress?: (status: string) => void
) {
  const { orientation = "landscape", title, subtitle } = options;

  let restoreStylesheets: (() => void) | null = null;
  let restoreInlineStyles: (() => void) | null = null;
  let restoreGetComputedStyle: (() => void) | null = null;

  try {
    if (onProgress) onProgress("Forbereder rapport...");

    // Monkey patch getComputedStyle to intercept html2canvas style resolution
    restoreGetComputedStyle = patchGetComputedStyleGlobally();

    // Pre-process stylesheets and inline styles to replace oklch/oklab
    restoreStylesheets = await replaceOklchAndOklabInStylesAsync();
    restoreInlineStyles = replaceInlineStyles(element);

    // Temporarily hide scrollbars and elements with .no-print class
    const noPrintElements = element.querySelectorAll(".no-print");
    const originalStyles = new Map<HTMLElement, string>();
    
    noPrintElements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      originalStyles.set(htmlEl, htmlEl.style.display);
      htmlEl.style.display = "none";
    });

    // Store original height/width/overflow to avoid scroll truncation
    const originalOverflow = element.style.overflow;
    const originalMaxHeight = element.style.maxHeight;
    element.style.overflow = "visible";
    element.style.maxHeight = "none";

    if (onProgress) onProgress("Konverterer layout til billeder...");

    // Capture the DOM with high scale for high resolution
    const canvas = await html2canvas(element, {
      scale: 2, // Retinal display level resolution
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
    });

    // Restore original CSS styles immediately
    element.style.overflow = originalOverflow;
    element.style.maxHeight = originalMaxHeight;
    noPrintElements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      htmlEl.style.display = originalStyles.get(htmlEl) || "";
    });

    // Restore oklch colors for standard interactive browser display
    if (restoreInlineStyles) {
      restoreInlineStyles();
      restoreInlineStyles = null;
    }
    if (restoreStylesheets) {
      restoreStylesheets();
      restoreStylesheets = null;
    }
    if (restoreGetComputedStyle) {
      restoreGetComputedStyle();
      restoreGetComputedStyle = null;
    }

    if (onProgress) onProgress("Opretter PDF-sider...");

    // PDF size calculations
    const isLandscape = orientation === "landscape";
    const pageWidth = isLandscape ? 297 : 210; // mm
    const pageHeight = isLandscape ? 210 : 297; // mm
    
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    
    // Scale image to match page width
    const imgHeightInPdfUnits = (imgHeight * pageWidth) / imgWidth;

    const pdf = new jsPDF(orientation, "mm", "a4");
    
    let heightLeft = imgHeightInPdfUnits;
    let position = 0;
    const imgData = canvas.toDataURL("image/jpeg", 0.95);

    // Page 1
    pdf.addImage(imgData, "JPEG", 0, position, pageWidth, imgHeightInPdfUnits, undefined, "FAST");
    
    // Add page numbers
    let pageCount = 1;
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text(
      `Side ${pageCount} - Danfoods DMS`, 
      pageWidth - 40, 
      pageHeight - 8
    );

    heightLeft -= pageHeight;

    // Handle subsequent pages
    while (heightLeft > 0) {
      position = heightLeft - imgHeightInPdfUnits; // shift image upwards
      pdf.addPage();
      pageCount++;
      
      pdf.addImage(imgData, "JPEG", 0, position, pageWidth, imgHeightInPdfUnits, undefined, "FAST");
      
      // Page numbers on additional pages
      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);
      pdf.text(
        `Side ${pageCount} - Danfoods DMS`, 
        pageWidth - 40, 
        pageHeight - 8
      );

      heightLeft -= pageHeight;
    }

    if (onProgress) onProgress("Færdiggør fil...");
    pdf.save(`${filename}.pdf`);
  } catch (error) {
    console.error("PDF generation failed:", error);
    throw error;
  } finally {
    // Ensure styles are restored even if generation crashes
    if (restoreInlineStyles) restoreInlineStyles();
    if (restoreStylesheets) restoreStylesheets();
    if (restoreGetComputedStyle) restoreGetComputedStyle();
  }
}
