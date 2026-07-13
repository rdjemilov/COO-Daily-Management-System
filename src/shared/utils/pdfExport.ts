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
        if (item.nextSibling && item.nextSibling.parentNode === item.parent) {
          item.parent.insertBefore(item.element, item.nextSibling);
        } else {
          item.parent.appendChild(item.element);
        }
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
  const patchedWindows = new Set<Window>();

  function patchWindow(win: Window) {
    if (patchedWindows.has(win)) return;
    patchedWindows.add(win);

    try {
      const proto = (win as any).CSSStyleDeclaration?.prototype || CSSStyleDeclaration.prototype;
      const originalGetPropertyValue = proto.getPropertyValue;
      proto.getPropertyValue = function (this: any, prop: string) {
        if (!this || typeof originalGetPropertyValue !== "function") {
          return "";
        }
        try {
          const val = originalGetPropertyValue.call(this, prop);
          if (typeof val === "string" && (val.toLowerCase().includes("oklch") || val.toLowerCase().includes("oklab"))) {
            return convertOklchAndOklabText(val);
          }
          return val;
        } catch (err) {
          return "";
        }
      };

      cleanups.push(() => {
        try {
          proto.getPropertyValue = originalGetPropertyValue;
        } catch (e) {}
      });
    } catch (e) {
      console.warn("Failed to patch CSSStyleDeclaration prototype", e);
    }

    try {
      const originalGetComputedStyle = win.getComputedStyle;
      win.getComputedStyle = function (this: any, elt: Element, pseudoElt?: string) {
        try {
          // Bind call to `win` context directly to prevent "Illegal invocation" errors in strict mode
          const style = originalGetComputedStyle.call(win, elt, pseudoElt);
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
        } catch (err) {
          try {
            return originalGetComputedStyle(elt, pseudoElt);
          } catch (innerErr) {
            console.error("Failed getComputedStyle fallback:", innerErr);
            throw innerErr;
          }
        }
      };

      cleanups.push(() => {
        try {
          win.getComputedStyle = originalGetComputedStyle;
        } catch (e) {}
      });
    } catch (e) {
      console.warn("Failed to patch getComputedStyle on window", e);
    }
  }

  // Patch main window
  patchWindow(window);

  // Monitor DOM insertions to dynamically patch any child iframes created by html2canvas
  let observer: MutationObserver | null = null;
  try {
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeName === "IFRAME" || node instanceof HTMLIFrameElement) {
            try {
              const iframe = node as HTMLIFrameElement;
              const win = iframe.contentWindow;
              if (win) {
                patchWindow(win);
              }
              iframe.addEventListener("load", () => {
                try {
                  const loadedWin = iframe.contentWindow;
                  if (loadedWin) {
                    patchWindow(loadedWin);
                  }
                } catch (loadErr) {}
              });
            } catch (iframeErr) {
              // Ignore potential cross-origin access issues
            }
          }
        });
      }
    });

    observer.observe(document.documentElement || document.body || document, {
      childList: true,
      subtree: true,
    });

    cleanups.push(() => {
      if (observer) {
        try {
          observer.disconnect();
        } catch (e) {}
      }
    });
  } catch (e) {
    console.warn("Failed to start MutationObserver for iframe style patching", e);
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
  // Use portrait by default as requested by user
  const { orientation = "portrait", title = "Danfoods DMS", subtitle } = options;

  let restoreGetComputedStyle: (() => void) | null = null;
  let restoreStylesheets: (() => void) | null = null;
  let restoreInlineStyles: (() => void) | null = null;

  try {
    if (onProgress) onProgress("Forbereder rapport...");

    // Monkey patch getComputedStyle to intercept html2canvas style resolution
    restoreGetComputedStyle = patchGetComputedStyleGlobally();

    // Pre-process stylesheets and inline styles to replace oklch/oklab
    restoreStylesheets = await replaceOklchAndOklabInStylesAsync();
    restoreInlineStyles = replaceInlineStyles(element);

    if (onProgress) onProgress("Konverterer layout til billeder...");

    // Capture the DOM with high scale for high resolution
    const canvas = await html2canvas(element, {
      scale: 2, // Retinal display level resolution
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: orientation === "portrait" ? 1024 : 1440, // standard width to fit A4 layout nicely
      onclone: (clonedDoc, clonedElement) => {
        const targetElement = clonedElement as HTMLElement;
        // Make the cloned element have a fixed standard width so it formats beautifully for A4 Portrait/Landscape
        if (orientation === "portrait") {
          targetElement.style.width = "1024px";
          targetElement.style.maxWidth = "1024px";
        } else {
          targetElement.style.width = "1440px";
          targetElement.style.maxWidth = "1440px";
        }
        targetElement.style.minWidth = "0px";

        // 1. Process style elements in clonedDoc synchronously
        const styles = Array.from(clonedDoc.querySelectorAll("style"));
        for (const styleEl of styles) {
          try {
            let cssText = styleEl.textContent || "";
            if (!cssText) {
              const sheet = styleEl.sheet;
              if (sheet) {
                try {
                  cssText = Array.from(sheet.cssRules).map(r => r.cssText).join("\n");
                } catch (e) {
                  // ignore
                }
              }
            }

            const lowerCss = cssText.toLowerCase();
            if (cssText && (lowerCss.includes("oklch") || lowerCss.includes("oklab"))) {
              const processedCss = convertOklchAndOklabText(cssText);
              
              // Create a new style element in clonedDoc
              const newStyle = clonedDoc.createElement("style");
              newStyle.textContent = processedCss;
              clonedDoc.head.appendChild(newStyle);
              
              // Remove the old style element from clonedDoc
              styleEl.remove();
            }
          } catch (err) {
            console.warn("Error processing cloned style", err);
          }
        }

        // 2. Process adoptedStyleSheets in clonedDoc if they exist
        const clonedAdopted = (clonedDoc as any).adoptedStyleSheets;
        if (clonedAdopted && clonedAdopted.length > 0) {
          try {
            const newAdopted = clonedAdopted.map((sheet: any) => {
              try {
                const cssText = Array.from(sheet.cssRules).map((r: any) => r.cssText).join("\n");
                if (cssText.toLowerCase().includes("oklch") || cssText.toLowerCase().includes("oklab")) {
                  const processedCss = convertOklchAndOklabText(cssText);
                  const newSheet = new (clonedDoc.defaultView as any).CSSStyleSheet();
                  newSheet.replaceSync(processedCss);
                  return newSheet;
                }
              } catch (innerE) {
                // ignore
              }
              return sheet;
            });
            (clonedDoc as any).adoptedStyleSheets = newAdopted;
          } catch (e) {
            console.warn("Could not sanitize adopted style sheets on cloned doc", e);
          }
        }

        // 3. Process inline styles on clonedElement and its descendants
        const replaceInlineStylesOnElement = (el: HTMLElement) => {
          const styleAttr = el.getAttribute("style");
          if (styleAttr && (styleAttr.toLowerCase().includes("oklch") || styleAttr.toLowerCase().includes("oklab"))) {
            el.setAttribute("style", convertOklchAndOklabText(styleAttr));
          }
          Array.from(el.children).forEach((child) => {
            replaceInlineStylesOnElement(child as HTMLElement);
          });
        };
        replaceInlineStylesOnElement(targetElement);

        // 4. Hide scrollbars and elements with .no-print class
        const noPrintElements = targetElement.querySelectorAll(".no-print");
        noPrintElements.forEach((el) => {
          (el as HTMLElement).style.setProperty("display", "none", "important");
        });

        // 5. Ensure visible layout without scroll truncation
        targetElement.style.overflow = "visible";
        targetElement.style.maxHeight = "none";
      }
    });

    if (onProgress) onProgress("Opretter PDF-sider...");

    // PDF size calculations
    const isLandscape = orientation === "landscape";
    const pageWidth = isLandscape ? 297 : 210; // mm
    const pageHeight = isLandscape ? 210 : 297; // mm
    const margin = 10; // mm
    const printableWidth = pageWidth - 2 * margin; // 190 mm
    const printableHeight = pageHeight - 2 * margin; // 277 mm
    
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    
    // Scale image to match printable width exactly
    const imgHeightInPdfUnits = (imgHeight * printableWidth) / imgWidth;

    const pdf = new jsPDF(orientation, "mm", "a4");
    
    // Calculate total pages
    const totalPages = Math.max(1, Math.ceil(imgHeightInPdfUnits / printableHeight));
    const imgData = canvas.toDataURL("image/jpeg", 0.95);

    for (let p = 0; p < totalPages; p++) {
      if (p > 0) {
        pdf.addPage();
      }

      // 1. Add image with correct y-offset inside the printable boundary
      // Position shifts upwards by p * printableHeight
      const yPosition = margin - p * printableHeight;
      pdf.addImage(imgData, "JPEG", margin, yPosition, printableWidth, imgHeightInPdfUnits, undefined, "FAST");

      // 2. Draw white mask rectangles on all four sides to cover any overflow outside the printable area
      pdf.setFillColor(255, 255, 255);
      
      // Top mask
      pdf.rect(0, 0, pageWidth, margin, "F");
      // Bottom mask
      pdf.rect(0, pageHeight - margin, pageWidth, margin, "F");
      // Left mask
      pdf.rect(0, 0, margin, pageHeight, "F");
      // Right mask
      pdf.rect(pageWidth - margin, 0, margin, pageHeight, "F");

      // 3. Add Header inside the top margin (y ~ 7mm)
      pdf.setFont("Helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139); // Slate-500
      pdf.text(title.toUpperCase(), margin, 7);

      if (subtitle) {
        pdf.setFont("Helvetica", "normal");
        pdf.setTextColor(148, 163, 184); // Slate-400
        pdf.text(subtitle, margin + 40, 7);
      }

      // Add a thin separator line under header
      pdf.setDrawColor(241, 245, 249); // Slate-100
      pdf.setLineWidth(0.2);
      pdf.line(margin, 8.5, pageWidth - margin, 8.5);

      // 4. Add Footer inside the bottom margin (y ~ pageHeight - 4mm)
      pdf.setFont("Helvetica", "normal");
      pdf.setFontSize(7);
      pdf.setTextColor(148, 163, 184); // Slate-400
      pdf.text(`Side ${p + 1} af ${totalPages}`, margin, pageHeight - 4);
      pdf.text(
        "Danfoods DMS • Genereret: " + new Date().toLocaleDateString("da-DK") + " " + new Date().toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" }),
        pageWidth - margin,
        pageHeight - 4,
        { align: "right" }
      );
    }

    if (onProgress) onProgress("Åbner PDF...");

    let opened = false;
    try {
      const blob = pdf.output("blob");
      const blobUrl = URL.createObjectURL(blob);
      const newWindow = window.open(blobUrl, "_blank");
      if (newWindow && !newWindow.closed && typeof newWindow.closed !== "undefined") {
        opened = true;
      }
    } catch (err) {
      console.warn("Failed to open PDF in a new tab, falling back to direct download:", err);
    }

    if (!opened) {
      pdf.save(`${filename}.pdf`);
    }

    if (onProgress) onProgress("Eksport fuldført!");
  } catch (error) {
    console.error("PDF generation failed:", error);
    throw error;
  } finally {
    if (restoreGetComputedStyle) {
      try { restoreGetComputedStyle(); } catch (err) { console.warn(err); }
    }
    if (restoreStylesheets) {
      try { restoreStylesheets(); } catch (err) { console.warn(err); }
    }
    if (restoreInlineStyles) {
      try { restoreInlineStyles(); } catch (err) { console.warn(err); }
    }
  }
}
