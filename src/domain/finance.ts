import type { Category, CreditCard, FinanceData, Kind, Transaction } from "@/lib/types";
import { PAYMENT_LABELS } from "@/lib/types";
import { addMonths, dateInMonth, monthOf, today } from "@/lib/dates";

// ---------------------------------------------------------------------
// Cartão: fechamento e vencimento
// ---------------------------------------------------------------------

/**
 * Mês da fatura (mês do vencimento) em que uma compra feita em `date` cai.
 * Compras feitas no dia do fechamento ou depois entram na fatura seguinte.
 */
export function invoiceMonth(date: string, card: Pick<CreditCard, "closing_day" | "due_day">): string {
  const day = Number(date.slice(8, 10));
  const closeMonth = day >= card.closing_day ? addMonths(monthOf(date), 1) : monthOf(date);
  return card.due_day > card.closing_day ? closeMonth : addMonths(closeMonth, 1);
}

export function competenceMonth(date: string, card: CreditCard | undefined | null): string {
  return card ? invoiceMonth(date, card) : monthOf(date);
}

export function invoiceDueDate(month: string, card: CreditCard): string {
  return dateInMonth(month, card.due_day);
}

// ---------------------------------------------------------------------
// Básico
// ---------------------------------------------------------------------

export const signed = (t: Pick<Transaction, "kind" | "amount">) => (t.kind === "income" ? t.amount : -t.amount);

export function paymentLabel(t: Pick<Transaction, "payment_method" | "card_id">, cards: CreditCard[]): string {
  if (t.payment_method === "card") return cards.find((c) => c.id === t.card_id)?.name ?? "Cartão";
  return PAYMENT_LABELS[t.payment_method];
}

/** Data efetiva para atraso: para cartão é o vencimento da fatura. */
export function effectiveDueDate(t: Transaction, cardsById: Map<string, CreditCard>): string {
  if (t.payment_method === "card" && t.card_id) {
    const card = cardsById.get(t.card_id);
    if (card) return invoiceDueDate(t.month, card);
  }
  return t.date;
}

export function isOverdue(t: Transaction, cardsById: Map<string, CreditCard>, now = today()): boolean {
  return !t.paid && t.kind === "expense" && effectiveDueDate(t, cardsById) < now;
}

/** Numeração das parcelas: "(n/total)" calculado pela ordem dos meses na série. */
export function installmentMap(data: FinanceData): Map<string, { n: number; total: number }> {
  const installmentSeries = new Set(data.series.filter((s) => s.type === "installment").map((s) => s.id));
  const bySeries = new Map<string, Transaction[]>();
  for (const t of data.transactions) {
    if (t.series_id && installmentSeries.has(t.series_id)) {
      const list = bySeries.get(t.series_id) ?? [];
      list.push(t);
      bySeries.set(t.series_id, list);
    }
  }
  const map = new Map<string, { n: number; total: number }>();
  for (const list of bySeries.values()) {
    list.sort((a, b) => a.month.localeCompare(b.month) || a.date.localeCompare(b.date));
    list.forEach((t, i) => map.set(t.id, { n: i + 1, total: list.length }));
  }
  return map;
}

// ---------------------------------------------------------------------
// Resumo do mês
// ---------------------------------------------------------------------

export interface MonthSummary {
  previous: number; // saldo anterior acumulado
  income: number;
  expense: number;
  incomePaid: number;
  expensePaid: number;
  realized: number; // saldo realizado
  predicted: number; // saldo previsto
  overdueCount: number;
  overdueTotal: number;
}

export function previousBalance(data: FinanceData, month: string): number {
  if (!data.profile.carry_balance) return 0;
  let total = data.profile.initial_balance;
  for (const t of data.transactions) if (t.paid && t.month < month) total += signed(t);
  return total;
}

export function monthSummary(data: FinanceData, month: string): MonthSummary {
  const cardsById = new Map(data.cards.map((c) => [c.id, c]));
  const previous = previousBalance(data, month);
  let income = 0;
  let expense = 0;
  let incomePaid = 0;
  let expensePaid = 0;
  let overdueCount = 0;
  let overdueTotal = 0;
  const now = today();

  for (const t of data.transactions) {
    if (t.month === month) {
      // crédito/estorno no cartão abate as saídas (não é uma "entrada" de dinheiro)
      const isCardCredit = t.kind === "income" && t.payment_method === "card";
      if (t.kind === "income" && !isCardCredit) {
        income += t.amount;
        if (t.paid) incomePaid += t.amount;
      } else {
        const v = isCardCredit ? -t.amount : t.amount;
        expense += v;
        if (t.paid) expensePaid += v;
      }
    }
    if (t.month <= month && isOverdue(t, cardsById, now)) {
      overdueCount++;
      overdueTotal += t.amount;
    }
  }

  return {
    previous,
    income,
    expense,
    incomePaid,
    expensePaid,
    realized: previous + incomePaid - expensePaid,
    predicted: previous + income - expense,
    overdueCount,
    overdueTotal,
  };
}

// ---------------------------------------------------------------------
// Cartões: fatura e limite
// ---------------------------------------------------------------------

export interface Invoice {
  card: CreditCard;
  month: string;
  dueDate: string;
  items: Transaction[];
  total: number;
  paidTotal: number;
  allPaid: boolean;
  somePaid: boolean;
}

export function invoicesForMonth(data: FinanceData, month: string, items?: Transaction[]): Invoice[] {
  const source = items ?? data.transactions.filter((t) => t.month === month);
  const byCard = new Map<string, Transaction[]>();
  for (const t of source) {
    if (t.payment_method !== "card" || !t.card_id) continue;
    const list = byCard.get(t.card_id) ?? [];
    list.push(t);
    byCard.set(t.card_id, list);
  }
  const out: Invoice[] = [];
  for (const card of data.cards) {
    const list = byCard.get(card.id);
    if (!list?.length) continue;
    list.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    const total = list.reduce((s, t) => s - signed(t), 0);
    const paidTotal = list.filter((t) => t.paid).reduce((s, t) => s - signed(t), 0);
    out.push({
      card,
      month,
      dueDate: invoiceDueDate(month, card),
      items: list,
      total,
      paidTotal,
      allPaid: list.every((t) => t.paid),
      somePaid: list.some((t) => t.paid),
    });
  }
  return out;
}

export interface CardUsage {
  limit: number | null;
  used: number; // comprometido (todas as parcelas em aberto)
  currentInvoice: number; // fatura do mês selecionado
  future: number; // parcelas/compras em faturas futuras
  available: number | null;
  usedPct: number;
  freePct: number;
}

export function cardUsage(data: FinanceData, card: CreditCard, month: string): CardUsage {
  let used = 0;
  let currentInvoice = 0;
  let future = 0;
  // Lançamentos fixos (assinaturas) só ocupam limite quando a cobrança acontece;
  // parcelas comprometem o limite desde a compra.
  const fixedSeries = new Set(data.series.filter((s) => s.type === "fixed").map((s) => s.id));
  const now = today();
  for (const t of data.transactions) {
    if (t.card_id !== card.id) continue;
    const v = -signed(t);
    if (t.month === month) currentInvoice += v;
    const notChargedYet = t.series_id != null && fixedSeries.has(t.series_id) && t.date > now;
    if (!t.paid && !notChargedYet) {
      used += v;
      if (t.month > month) future += v;
    }
  }
  used = Math.max(used, 0);
  const limit = card.credit_limit;
  const usedPct = limit ? Math.min((used / limit) * 100, 100) : 0;
  return {
    limit,
    used,
    currentInvoice,
    future,
    available: limit != null ? limit - used : null,
    usedPct,
    freePct: limit ? 100 - usedPct : 0,
  };
}

// ---------------------------------------------------------------------
// Gráficos
// ---------------------------------------------------------------------

export interface CategorySlice {
  id: string;
  name: string;
  color: string;
  value: number;
  pct: number;
}

export function categoryBreakdown(transactions: Transaction[], categories: Category[], kind: Kind): CategorySlice[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const sums = new Map<string, number>();
  for (const t of transactions) {
    if (t.kind !== kind) continue;
    if (kind === "income" && t.payment_method === "card") continue;
    const key = t.category_id && byId.has(t.category_id) ? t.category_id : "none";
    sums.set(key, (sums.get(key) ?? 0) + t.amount);
  }
  const total = [...sums.values()].reduce((a, b) => a + b, 0);
  return [...sums.entries()]
    .map(([id, value]) => {
      const c = byId.get(id);
      return {
        id,
        name: c?.name ?? "Sem categoria",
        color: c?.color ?? "#94a3b8",
        value,
        pct: total ? (value / total) * 100 : 0,
      };
    })
    .sort((a, b) => b.value - a.value);
}

export function evolution(data: FinanceData, endMonth: string, count = 6) {
  const months = Array.from({ length: count }, (_, i) => addMonths(endMonth, i - count + 1));
  return months.map((m) => {
    const s = monthSummary(data, m);
    return { month: m, income: s.income, expense: s.expense, balance: s.income - s.expense };
  });
}

export function budgetProgress(data: FinanceData, month: string) {
  const spent = new Map<string, number>();
  for (const t of data.transactions) {
    if (t.month !== month || !t.category_id) continue;
    if (t.kind === "expense") spent.set(t.category_id, (spent.get(t.category_id) ?? 0) + t.amount);
    else if (t.payment_method === "card") spent.set(t.category_id, (spent.get(t.category_id) ?? 0) - t.amount);
  }
  return data.categories
    .filter((c) => c.budget && c.budget > 0)
    .map((c) => {
      const value = Math.max(spent.get(c.id) ?? 0, 0);
      return { category: c, spent: value, budget: c.budget!, pct: (value / c.budget!) * 100 };
    })
    .sort((a, b) => b.pct - a.pct);
}
