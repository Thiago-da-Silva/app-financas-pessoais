const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatMoney(cents: number): string {
  return fmt.format(cents / 100);
}

/** Converte texto digitado ("1.234,56", "1234.5", "12") em centavos. */
export function parseMoney(text: string): number {
  const clean = text.replace(/[^\d,.-]/g, "");
  if (!clean) return 0;
  let normalized: string;
  if (clean.includes(",")) normalized = clean.replace(/\./g, "").replace(",", "."); // 1.234,56
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(clean)) normalized = clean.replace(/\./g, ""); // 1.000 (milhar)
  else normalized = clean; // 19.99
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function percent(part: number, total: number): number {
  if (!total) return 0;
  return (part / total) * 100;
}

export function formatPercent(p: number): string {
  return `${p.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: p > 0 && p < 10 ? 1 : 0 })}%`;
}
