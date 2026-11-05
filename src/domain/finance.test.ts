import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  budgetProgress,
  cardUsage,
  categoryBreakdown,
  evolution,
  installmentMap,
  invoiceMonth,
  invoicesForMonth,
  isOverdue,
  monthSummary,
  previousBalance,
} from "./finance";
import type { CreditCard, Series } from "@/lib/types";
import { card, categories, emptyData, tx } from "@/test/helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 4, 12)); // 04/11/2026
});
afterEach(() => vi.useRealTimers());

const fixedSeries = (id: string): Series => ({
  id,
  type: "fixed",
  kind: "expense",
  name: "Assinatura",
  description: null,
  amount: 5_000,
  category_id: null,
  payment_method: "card",
  card_id: card.id,
  day: 1,
  start_month: "2026-11-01",
  end_month: null,
  generated_until: "2027-11-01",
});

describe("invoiceMonth (fechamento e vencimento)", () => {
  it("compra antes do fechamento entra na fatura do mês", () => {
    expect(invoiceMonth("2026-11-02", card)).toBe("2026-11-01");
  });

  it("compra no dia do fechamento ou depois vai para a fatura seguinte", () => {
    expect(invoiceMonth("2026-11-03", card)).toBe("2026-12-01");
    expect(invoiceMonth("2026-11-28", card)).toBe("2026-12-01");
  });

  it("vencimento antes do fechamento joga a fatura para o mês seguinte ao fechamento", () => {
    const c: CreditCard = { ...card, closing_day: 25, due_day: 5 };
    expect(invoiceMonth("2026-11-10", c)).toBe("2026-12-01"); // fecha 25/11, vence 05/12
    expect(invoiceMonth("2026-11-26", c)).toBe("2027-01-01"); // fecha 25/12, vence 05/01
  });

  it("vira o ano corretamente", () => {
    expect(invoiceMonth("2026-12-20", card)).toBe("2027-01-01");
  });
});

describe("monthSummary (cards de saldo)", () => {
  const data = emptyData({
    profile: { id: "u", name: "", avatar_url: null, initial_balance: 100_000, carry_balance: true },
    transactions: [
      // meses anteriores
      tx({ kind: "income", amount: 500_000, date: "2026-10-05", paid: true }),
      tx({ amount: 20_000, date: "2026-10-15", paid: false }), // vencida, não entra no saldo anterior
      tx({ amount: 30_000, date: "2026-10-20", paid: true }),
      // mês atual
      tx({ kind: "income", amount: 300_000, date: "2026-11-05", paid: true }),
      tx({ amount: 100_000, date: "2026-11-10", paid: false }),
      tx({ amount: 50_000, date: "2026-10-20", month: "2026-11-01", payment_method: "card", card_id: card.id, paid: true }),
      tx({ kind: "income", amount: 10_000, date: "2026-10-22", month: "2026-11-01", payment_method: "card", card_id: card.id }),
    ],
  });

  it("saldo anterior = saldo inicial + tudo que foi pago antes do mês", () => {
    expect(previousBalance(data, "2026-11-01")).toBe(100_000 + 500_000 - 30_000);
  });

  it("estorno no cartão abate as saídas em vez de contar como entrada", () => {
    const s = monthSummary(data, "2026-11-01");
    expect(s.income).toBe(300_000);
    expect(s.expense).toBe(100_000 + 50_000 - 10_000);
  });

  it("realizado considera só o pago e previsto considera tudo", () => {
    const s = monthSummary(data, "2026-11-01");
    expect(s.realized).toBe(570_000 + 300_000 - 50_000);
    expect(s.predicted).toBe(570_000 + 300_000 - 140_000);
  });

  it("conta contas vencidas de meses anteriores", () => {
    const s = monthSummary(data, "2026-11-01");
    expect(s.overdueCount).toBe(1);
    expect(s.overdueTotal).toBe(20_000);
  });

  it("sem acúmulo, o saldo anterior é zero", () => {
    const off = { ...data, profile: { ...data.profile, carry_balance: false } };
    const s = monthSummary(off, "2026-11-01");
    expect(s.previous).toBe(0);
    expect(s.predicted).toBe(300_000 - 140_000);
  });
});

describe("isOverdue", () => {
  const cards = new Map([[card.id, card]]);
  it("despesa não paga com data passada está vencida", () => {
    expect(isOverdue(tx({ amount: 1, date: "2026-11-03" }), cards)).toBe(true);
    expect(isOverdue(tx({ amount: 1, date: "2026-11-04" }), cards)).toBe(false);
    expect(isOverdue(tx({ amount: 1, date: "2026-11-01", paid: true }), cards)).toBe(false);
    expect(isOverdue(tx({ kind: "income", amount: 1, date: "2026-11-01" }), cards)).toBe(false);
  });

  it("no cartão, vale o vencimento da fatura e não a data da compra", () => {
    const t = tx({ amount: 1, date: "2026-10-20", month: "2026-11-01", payment_method: "card", card_id: card.id });
    expect(isOverdue(t, cards)).toBe(false); // vence 10/11
    const old = tx({ amount: 1, date: "2026-09-20", month: "2026-10-01", payment_method: "card", card_id: card.id });
    expect(isOverdue(old, cards)).toBe(true); // venceu 10/10
  });
});

describe("faturas e limite do cartão", () => {
  const onCard = { payment_method: "card" as const, card_id: card.id };
  const data = emptyData({
    series: [{ ...fixedSeries("s-fixed") }, { ...fixedSeries("s-inst"), type: "installment", generated_until: "2027-01-01" }],
    transactions: [
      tx({ ...onCard, amount: 30_000, date: "2026-09-20", month: "2026-10-01", paid: true }),
      tx({ ...onCard, series_id: "s-inst", amount: 10_000, date: "2026-10-20", month: "2026-11-01" }),
      tx({ ...onCard, series_id: "s-inst", amount: 10_000, date: "2026-11-20", month: "2026-12-01" }),
      tx({ ...onCard, series_id: "s-inst", amount: 10_000, date: "2026-12-20", month: "2027-01-01" }),
      tx({ ...onCard, series_id: "s-fixed", amount: 5_000, date: "2026-11-01", month: "2026-11-01" }),
      tx({ ...onCard, series_id: "s-fixed", amount: 5_000, date: "2026-12-01", month: "2026-12-01" }),
      tx({ ...onCard, series_id: "s-fixed", amount: 5_000, date: "2027-01-01", month: "2027-01-01" }),
    ],
  });

  it("limite comprometido inclui parcelas futuras, mas não assinaturas ainda não cobradas", () => {
    const u = cardUsage(data, card, "2026-11-01");
    expect(u.used).toBe(30_000 + 5_000);
    expect(u.available).toBe(500_000 - 35_000);
    expect(u.usedPct).toBeCloseTo(7);
    expect(u.freePct).toBeCloseTo(93);
  });

  it("separa fatura do mês e parcelas futuras", () => {
    const u = cardUsage(data, card, "2026-11-01");
    expect(u.currentInvoice).toBe(15_000);
    expect(u.future).toBe(20_000);
  });

  it("cartão sem limite não calcula disponível", () => {
    const u = cardUsage(data, { ...card, credit_limit: null }, "2026-11-01");
    expect(u.available).toBeNull();
    expect(u.usedPct).toBe(0);
  });

  it("agrupa a fatura do mês com total, vencimento e status", () => {
    const [inv] = invoicesForMonth(data, "2026-11-01");
    expect(inv.card.id).toBe(card.id);
    expect(inv.dueDate).toBe("2026-11-10");
    expect(inv.items).toHaveLength(2);
    expect(inv.total).toBe(15_000);
    expect(inv.allPaid).toBe(false);
    expect(inv.somePaid).toBe(false);

    const [paid] = invoicesForMonth(data, "2026-10-01");
    expect(paid.allPaid).toBe(true);
    expect(paid.paidTotal).toBe(30_000);
  });

  it("estorno diminui o total da fatura", () => {
    const d = { ...data, transactions: [...data.transactions, tx({ ...onCard, kind: "income", amount: 2_000, date: "2026-10-25", month: "2026-11-01" })] };
    expect(invoicesForMonth(d, "2026-11-01")[0].total).toBe(13_000);
  });
});

describe("installmentMap (numeração das parcelas)", () => {
  const series: Series = { ...fixedSeries("s1"), type: "installment" };

  it("numera pela ordem dos meses, independentemente da ordem de inserção", () => {
    const rows = [
      tx({ id: "c", series_id: "s1", amount: 1, date: "2027-01-05" }),
      tx({ id: "a", series_id: "s1", amount: 1, date: "2026-11-05" }),
      tx({ id: "b", series_id: "s1", amount: 1, date: "2026-12-05" }),
    ];
    const map = installmentMap(emptyData({ series: [series], transactions: rows }));
    expect(map.get("a")).toEqual({ n: 1, total: 3 });
    expect(map.get("b")).toEqual({ n: 2, total: 3 });
    expect(map.get("c")).toEqual({ n: 3, total: 3 });
  });

  it("renumera quando uma parcela do meio é removida", () => {
    const rows = [tx({ id: "a", series_id: "s1", amount: 1, date: "2026-11-05" }), tx({ id: "c", series_id: "s1", amount: 1, date: "2027-01-05" })];
    const map = installmentMap(emptyData({ series: [series], transactions: rows }));
    expect(map.get("c")).toEqual({ n: 2, total: 2 });
  });

  it("não numera lançamentos fixos", () => {
    const rows = [tx({ id: "f", series_id: "sf", amount: 1, date: "2026-11-05" })];
    const map = installmentMap(emptyData({ series: [fixedSeries("sf")], transactions: rows }));
    expect(map.has("f")).toBe(false);
  });
});

describe("gráficos e orçamentos", () => {
  const rows = [
    tx({ amount: 30_000, date: "2026-11-02", category_id: "cat-food" }),
    tx({ amount: 10_000, date: "2026-11-03", category_id: "cat-food", payment_method: "card", card_id: card.id }),
    tx({ amount: 60_000, date: "2026-11-04", category_id: "cat-home" }),
    tx({ amount: 5_000, date: "2026-11-05" }),
    tx({ kind: "income", amount: 5_000, date: "2026-11-05", category_id: "cat-food", payment_method: "card", card_id: card.id }),
    tx({ kind: "income", amount: 400_000, date: "2026-11-05", category_id: "cat-salary" }),
  ];

  it("soma despesas por categoria com percentual, ordenado do maior para o menor", () => {
    const slices = categoryBreakdown(rows, categories, "expense");
    expect(slices.map((s) => [s.name, s.value])).toEqual([
      ["Moradia", 60_000],
      ["Alimentação", 40_000],
      ["Sem categoria", 5_000],
    ]);
    expect(slices.reduce((a, s) => a + s.pct, 0)).toBeCloseTo(100);
  });

  it("entradas por categoria ignoram estornos de cartão", () => {
    const slices = categoryBreakdown(rows, categories, "income");
    expect(slices).toHaveLength(1);
    expect(slices[0].value).toBe(400_000);
  });

  it("orçamento desconta estorno da categoria", () => {
    const [food] = budgetProgress(emptyData({ transactions: rows }), "2026-11-01");
    expect(food.category.id).toBe("cat-food");
    expect(food.spent).toBe(35_000);
    expect(food.pct).toBe(70);
  });

  it("evolução retorna os últimos N meses em ordem", () => {
    const ev = evolution(emptyData({ transactions: rows }), "2026-11-01", 6);
    expect(ev.map((e) => e.month)).toEqual(["2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01"]);
    expect(ev[5].income).toBe(400_000);
  });
});
