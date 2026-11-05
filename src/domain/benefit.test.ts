import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { benefitGroups, benefitSummary, budgetProgress, categoryBreakdown, competenceMonth, isOverdue, monthSummary } from "./finance";
import { buildEntry, createEntry, ensureFixed } from "./operations";
import type { CreditCard } from "@/lib/types";
import { card, categories, emptyData, entry, memoryRepo, tx } from "@/test/helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 4, 12)); // 04/11/2026
});
afterEach(() => vi.useRealTimers());

const vr: CreditCard = { id: "vr", type: "benefit", name: "VR", color: "#ef4444", credit_limit: null, closing_day: 1, due_day: 1, archived: false };
const onVr = { payment_method: "benefit" as const, card_id: vr.id };

/** Recarga de R$ 800 por mês e gastos que deixam sobra. */
function vrData(sum_benefits = false) {
  return emptyData({
    profile: { id: "u", name: "", avatar_url: null, initial_balance: 100_000, carry_balance: true, sum_benefits },
    cards: [card, vr],
    transactions: [
      tx({ ...onVr, kind: "income", amount: 80_000, date: "2026-09-01" }),
      tx({ ...onVr, amount: 50_000, date: "2026-09-15", category_id: "cat-food" }),
      tx({ ...onVr, kind: "income", amount: 80_000, date: "2026-10-01" }),
      tx({ ...onVr, amount: 60_000, date: "2026-10-15", category_id: "cat-food" }),
      tx({ ...onVr, kind: "income", amount: 80_000, date: "2026-11-01" }),
      tx({ ...onVr, amount: 20_000, date: "2026-11-03", category_id: "cat-food" }),
      tx({ ...onVr, amount: 30_000, date: "2026-11-20", category_id: "cat-food" }), // ainda não aconteceu
      // dinheiro comum
      tx({ kind: "income", amount: 500_000, date: "2026-11-05", paid: true }),
      tx({ amount: 100_000, date: "2026-11-10", paid: true }),
    ],
  });
}

describe("cartão benefício (VR)", () => {
  it("acumula a sobra de todos os meses anteriores, sem depender do status pago", () => {
    const b = benefitSummary(vrData(), "2026-11-01", vr.id);
    expect(b.previous).toBe(30_000 + 20_000);
    expect(b.income).toBe(80_000);
    expect(b.expense).toBe(50_000);
    expect(b.balance).toBe(50_000 + 80_000 - 50_000);
  });

  it("saldo realizado considera só o que já aconteceu até hoje", () => {
    const b = benefitSummary(vrData(), "2026-11-01", vr.id);
    expect(b.realized).toBe(50_000 + 80_000 - 20_000);
  });

  it("o acúmulo continua mesmo com o saldo geral sem acumular", () => {
    const d = vrData();
    d.profile.carry_balance = false;
    expect(benefitSummary(d, "2026-12-01", vr.id).previous).toBe(80_000);
  });

  it("por padrão o VR fica fora das entradas, saídas e saldos gerais", () => {
    const s = monthSummary(vrData(), "2026-11-01");
    expect(s.income).toBe(500_000);
    expect(s.expense).toBe(100_000);
    expect(s.previous).toBe(100_000);
    expect(s.predicted).toBe(100_000 + 400_000);
    expect(s.benefits).toBeNull();
  });

  it("com a opção ligada, soma o saldo do VR aos saldos, mas não às entradas/saídas", () => {
    const s = monthSummary(vrData(true), "2026-11-01");
    expect(s.income).toBe(500_000);
    expect(s.expense).toBe(100_000);
    expect(s.previous).toBe(100_000 + 50_000);
    expect(s.realized).toBe(100_000 + 400_000 + 110_000);
    expect(s.predicted).toBe(100_000 + 400_000 + 80_000);
    expect(s.benefits).toBe(80_000);
  });

  it("gasto no VR nunca aparece como conta vencida", () => {
    const old = tx({ ...onVr, amount: 1_000, date: "2026-10-01" });
    expect(isOverdue(old, new Map([[vr.id, vr]]))).toBe(false);
    expect(monthSummary(vrData(), "2026-11-01").overdueCount).toBe(0);
  });

  it("gastos entram no gráfico por categoria e no orçamento; recargas não entram como entrada", () => {
    const d = vrData();
    const monthTx = d.transactions.filter((t) => t.month === "2026-11-01");
    expect(categoryBreakdown(monthTx, categories, "expense").find((x) => x.id === "cat-food")?.value).toBe(50_000);
    expect(categoryBreakdown(monthTx, categories, "income").every((x) => x.value !== 80_000)).toBe(true);
    expect(budgetProgress(d, "2026-11-01")[0].spent).toBe(50_000);
  });

  it("agrupa os lançamentos do mês por cartão benefício com o saldo acumulado", () => {
    const [g] = benefitGroups(vrData(), "2026-11-01");
    expect(g.card.id).toBe(vr.id);
    expect(g.items).toHaveLength(3);
    expect(g.income).toBe(80_000);
    expect(g.expense).toBe(50_000);
    expect(g.balance).toBe(80_000);
    expect(g.firstDate).toBe("2026-11-01");
  });

  it("competência do VR é o mês da data (não existe fatura)", () => {
    expect(competenceMonth("2026-11-28", vr)).toBe("2026-11-01");
    expect(competenceMonth("2026-11-28", { ...card, type: undefined })).toBe("2026-12-01"); // dado antigo = crédito
  });

  it("lançamento no VR guarda o cartão e a recarga fixa é gerada todo mês", async () => {
    const { transactions } = buildEntry({ cards: [vr] }, entry({ ...onVr, amount: 1, date: "2026-11-28" }));
    expect(transactions[0].card_id).toBe(vr.id);
    expect(transactions[0].month).toBe("2026-11-01");

    const repo = memoryRepo(emptyData({ cards: [vr] }));
    await createEntry(repo, repo.data, entry({ ...onVr, kind: "income", name: "Recarga VR", amount: 80_000, date: "2026-11-01", recurrence: "fixed" }));
    await ensureFixed(repo, structuredClone(repo.data), "2028-01-01");
    const months = repo.data.transactions.map((t) => t.month);
    expect(new Set(months).size).toBe(months.length);
    expect(repo.data.transactions.every((t) => t.payment_method === "benefit" && t.card_id === vr.id)).toBe(true);
    expect(benefitSummary(repo.data, "2027-11-01", vr.id).previous).toBe(12 * 80_000);
  });
});
