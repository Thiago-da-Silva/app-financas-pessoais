// Utilitários de data baseados em strings (sem fuso horário).
// date  = "YYYY-MM-DD"
// month = "YYYY-MM-01"

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const pad = (n: number) => String(n).padStart(2, "0");

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

export function parts(d: string): { y: number; m: number; d: number } {
  const [y, m, dd] = d.split("-").map(Number);
  return { y, m, d: dd || 1 };
}

export function makeDate(y: number, m: number, d: number): string {
  // normaliza mês fora de faixa
  const total = y * 12 + (m - 1);
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const day = Math.min(Math.max(d, 1), daysInMonth(ny, nm));
  return `${ny}-${pad(nm)}-${pad(day)}`;
}

export function today(): string {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
}

export function monthOf(date: string): string {
  const { y, m } = parts(date);
  return `${y}-${pad(m)}-01`;
}

export function currentMonth(): string {
  return monthOf(today());
}

export function addMonths(date: string, n: number): string {
  const { y, m, d } = parts(date);
  return makeDate(y, m + n, d);
}

/** Data com o dia desejado dentro do mês informado (ajusta p/ meses curtos). */
export function dateInMonth(month: string, day: number): string {
  const { y, m } = parts(month);
  return makeDate(y, m, day);
}

export function monthDiff(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  return (pb.y - pa.y) * 12 + (pb.m - pa.m);
}

export function monthLabel(month: string, short = false): string {
  const { y, m } = parts(month);
  return short ? `${MONTHS_SHORT[m - 1]}/${String(y).slice(2)}` : `${MONTHS[m - 1]} ${y}`;
}

export function monthName(m1: number): string {
  return MONTHS[m1 - 1];
}

export function formatDate(date: string, withYear = false): string {
  const { y, m, d } = parts(date);
  return withYear ? `${pad(d)}/${pad(m)}/${y}` : `${pad(d)}/${pad(m)}`;
}
