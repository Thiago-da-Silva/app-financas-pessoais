import type { Category, CreditCard, FinanceData, Kind, Transaction } from "@/lib/types";
import { isBenefitCard, isCreditCard, PAYMENT_LABELS } from "@/lib/types";
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

/** Mês de competência: fatura para cartão de crédito; mês da data para o resto (inclusive benefício). */
export function competenceMonth(date: string, card: CreditCard | undefined | null): string {
  return card && isCreditCard(card) ? invoiceMonth(date, card) : monthOf(date);
}

export function invoiceDueDate(month: string, card: CreditCard): string {
  return dateInMonth(month, card.due_day);
}

// ---------------------------------------------------------------------
// Básico
// ---------------------------------------------------------------------

export const signed = (t: Pick<Transaction, "kind" | "amount">) => (t.kind === "income" ? t.amount : -t.amount);

export function paymentLabel(t: Pick<Transaction, "payment_method" | "card_id">, cards: CreditCard[]): string {
  if (t.payment_method === "card" || t.payment_method === "benefit")
    return cards.find((c) => c.id === t.card_id)?.name ?? (t.payment_method === "card" ? "Cartão" : "Benefício");
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

export const isBenefitTx = (t: Pick<Transaction, "payment_method">) => t.payment_method === "benefit";

export function isOverdue(t: Transaction, cardsById: Map<string, CreditCard>, now = today()): boolean {
  // gastos no cartão benefício são debitados na hora: nunca ficam "vencidos"
  if (isBenefitTx(t)) return false;
  if (t.amount === 0) return false; // "A definir" não é conta vencida
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
  /** Saldo dos cartões benefício somado aos saldos (null quando não somado). */
  benefits: number | null;
  /** Lançamentos do mês ainda sem valor (R$ 0,00 e não pagos): "A definir". */
  undefinedCount: number;
}

/** Lançamento pendente com valor zerado: mostrado como "A definir". */
export const isUndefinedAmount = (t: Pick<Transaction, "amount" | "paid">) => t.amount === 0 && !t.paid;

/** Saldo anterior do dinheiro "comum" (sem cartões benefício). */
export function previousBalance(data: FinanceData, month: string): number {
  if (!data.profile.carry_balance) return 0;
  let total = data.profile.initial_balance;
  for (const t of data.transactions) if (t.paid && t.month < month && !isBenefitTx(t) && !t.ignored) total += signed(t);
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
  let undefinedCount = 0;
  const now = today();

  for (const t of data.transactions) {
    if (isBenefitTx(t)) continue; // benefícios têm saldo próprio
    if (t.ignored) continue; // marcado como "desconsiderar dos saldos"
    if (t.month === month && isUndefinedAmount(t)) undefinedCount++;
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

  const summary: MonthSummary = {
    previous,
    income,
    expense,
    incomePaid,
    expensePaid,
    realized: previous + incomePaid - expensePaid,
    predicted: previous + income - expense,
    overdueCount,
    overdueTotal,
    benefits: null,
    undefinedCount,
  };

  // Opção do perfil: somar o saldo dos benefícios aos saldos (entradas/saídas continuam sem eles)
  if (data.profile.sum_benefits) {
    const b = benefitSummary(data, month);
    summary.previous += b.previous;
    summary.realized += b.realized;
    summary.predicted += b.balance;
    summary.benefits = b.balance;
  }
  return summary;
}

// ---------------------------------------------------------------------
// Cartões benefício (VR/VA): saldo próprio que acumula indefinidamente
// ---------------------------------------------------------------------

export interface BenefitSummary {
  previous: number; // saldo acumulado de todos os meses anteriores
  income: number; // recargas do mês
  expense: number; // gastos do mês
  balance: number; // saldo ao final do mês
  realized: number; // saldo considerando só o que já aconteceu (data <= hoje)
}

/**
 * Saldo de um cartão benefício (ou de todos, sem `cardId`).
 * O status "pago" é ignorado: recargas e gastos no benefício acontecem automaticamente.
 */
export function benefitSummary(data: FinanceData, month: string, cardId?: string): BenefitSummary {
  const now = today();
  let previous = 0;
  let income = 0;
  let expense = 0;
  let happened = 0;
  for (const t of data.transactions) {
    if (!isBenefitTx(t) || t.ignored || (cardId && t.card_id !== cardId)) continue;
    if (t.month < month) previous += signed(t);
    else if (t.month === month) {
      if (t.kind === "income") income += t.amount;
      else expense += t.amount;
      if (t.date <= now) happened += signed(t);
    }
  }
  return { previous, income, expense, balance: previous + income - expense, realized: previous + happened };
}

export interface BenefitGroup {
  card: CreditCard;
  items: Transaction[];
  income: number;
  expense: number;
  /** Saldo do cartão ao final do mês (acumulado). */
  balance: number;
  firstDate: string;
}

/** Agrupa os lançamentos de cada cartão benefício no mês (para a lista). */
export function benefitGroups(data: FinanceData, month: string, items?: Transaction[]): BenefitGroup[] {
  const source = items ?? data.transactions.filter((t) => t.month === month);
  const out: BenefitGroup[] = [];
  for (const card of data.cards) {
    if (!isBenefitCard(card)) continue;
    const list = source.filter((t) => isBenefitTx(t) && t.card_id === card.id);
    if (!list.length) continue;
    list.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    out.push({
      card,
      items: list,
      income: list.filter((t) => t.kind === "income").reduce((s, t) => s + t.amount, 0),
      expense: list.filter((t) => t.kind === "expense").reduce((s, t) => s + t.amount, 0),
      balance: benefitSummary(data, month, card.id).balance,
      firstDate: list[0].date,
    });
  }
  return out;
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
    if (kind === "income" && (t.payment_method === "card" || isBenefitTx(t))) continue;
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
