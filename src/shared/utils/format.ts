const DEFAULT_LOCALE = "da-DK";
const DEFAULT_CURRENCY = "DKK";

export function formatCurrency(
  value: number,
  locale: string = DEFAULT_LOCALE,
  currency: string = DEFAULT_CURRENCY
): string {
  try {
    const formatted = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

    // Format fix: ensure it ends with "kr." for da-DK if required, or let browser Intl handle it
    // Under da-DK standard, Intl usually outputs "1.234.567,89 kr." or "kr. 1.234.567,89".
    // We can clean and ensure standard Danish food wholesale display
    return formatted;
  } catch (e) {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function formatNumber(
  value: number,
  decimals: number = 0,
  locale: string = DEFAULT_LOCALE
): string {
  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch (e) {
    return value.toFixed(decimals);
  }
}

export function formatPercentage(
  value: number,
  decimals: number = 1,
  locale: string = DEFAULT_LOCALE
): string {
  try {
    const formattedNum = new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
    return `${formattedNum} %`;
  } catch (e) {
    return `${value.toFixed(decimals)} %`;
  }
}

export function formatDate(
  isoDateStr: string,
  locale: string = DEFAULT_LOCALE
): string {
  if (!isoDateStr) return "";
  try {
    const parts = isoDateStr.split("-");
    if (parts.length === 3) {
      // YYYY-MM-DD to DD-MM-YYYY
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    const d = new Date(isoDateStr);
    if (isNaN(d.getTime())) return isoDateStr;
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  } catch (e) {
    return isoDateStr;
  }
}

export function getWeekdayLabel(isoDateStr: string): string {
  if (!isoDateStr) return "";
  try {
    const parts = isoDateStr.split("-");
    let d: Date;
    if (parts.length === 3) {
      d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    } else {
      d = new Date(isoDateStr);
    }
    if (isNaN(d.getTime())) return "";
    const weekdays = [
      { da: "Søndag", tr: "Pazar" },
      { da: "Mandag", tr: "Pazartesi" },
      { da: "Tirsdag", tr: "Salı" },
      { da: "Onsdag", tr: "Çarşamba" },
      { da: "Torsdag", tr: "Perşembe" },
      { da: "Fredag", tr: "Cuma" },
      { da: "Lørdag", tr: "Cumartesi" }
    ];
    const dayInfo = weekdays[d.getDay()];
    return `${dayInfo.da} (${dayInfo.tr})`;
  } catch (e) {
    return "";
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
