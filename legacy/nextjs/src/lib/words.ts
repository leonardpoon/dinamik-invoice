/**
 * Amount in words in the style used on the existing debit notes:
 *   6123.60 -> "Six Thousand One Hundred Twenty Three and cents Sixty only"
 *   6000.00 -> "Six Thousand only"
 * The currency label ("Singapore Dollars") is printed separately by the PDF.
 */

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const SCALES = ["", "Thousand", "Million", "Billion", "Trillion"];

function chunkToWords(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest < 20) {
    if (rest) parts.push(ONES[rest]);
  } else {
    const t = Math.floor(rest / 10);
    const o = rest % 10;
    parts.push(o ? `${TENS[t]} ${ONES[o]}` : TENS[t]);
  }
  return parts.join(" ");
}

export function integerToWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "Zero";
  const chunks: string[] = [];
  let scale = 0;
  while (n > 0 && scale < SCALES.length) {
    const chunk = n % 1000;
    if (chunk) {
      const w = chunkToWords(chunk);
      chunks.unshift(scale ? `${w} ${SCALES[scale]}` : w);
    }
    n = Math.floor(n / 1000);
    scale++;
  }
  return chunks.join(" ");
}

export function amountToWords(amount: number): string {
  const abs = Math.abs(amount);
  const dollars = Math.floor(abs);
  const cents = Math.round((abs - dollars) * 100);
  const d = integerToWords(dollars);
  if (cents === 0) return `${d} only`;
  return `${d} and cents ${integerToWords(cents)} only`;
}
