import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { benefitSummary, categoryBreakdown, invoicesForMonth, monthSummary } from "./finance";
import { buildEntry, createEntry, editEntry, ensureFixed } from "./operations";
import type { CreditCard } from "@/lib/types";
import { card, categories, emptyData, entry, memoryRepo, tx } from "@/test/helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 4, 12)); // 04/11/2026
});
afterEach(() => vi.useRealTimers());

describe("desconsiderar dos saldos", () => {
  const data = emptyData({
    profile: { id: "u", name: "", avatar_url: null, initial_balance: 0, carry_balance: true },
    transactions: [
      tx({ kind: "income", amount: 100_000, date: "2026-10-05", paid: true }),
      tx({ kind: "income", amount: 50_000, date: "2026-10-06", paid: true, ignored: true }), // ex.: reembolso
      tx({ kind: "income", amount: 300_000, date: "2026-11-05", paid: true }),
      tx({ amount: 80_000, date: "2026-11-08", paid: true, ignored: true, category_id: "cat-food" }),
      tx({ amount: 20_000, date: "2026-11-01", ignored: true }), // vencido, mas desconsiderado
      tx({ amount: 0, date: "2026-11-20", ignored: true }), // "a definir", mas desconsiderado
      tx({ amount: 30_000, date: "2026-11-02", payment_method: "card", card_id: card.id, month: "2026-11-01", ignored: true }),
    ],
  });

  it("fica fora de entradas, saídas, realizado, previsto e saldo anterior", () => {
    const s = monthSummary(data, "2026-11-01");
    expect(s.previous).toBe(100_000);
    expect(s.income).toBe(300_000);
    expect(s.expense).toBe(0);
    expect(s.realized).toBe(400_000);
    expect(s.predicted).toBe(400_000);
  });

  it("não conta como vencido nem como 'a definir' nos avisos", () => {
    const s = monthSummary(data, "2026-11-01");
    expect(s.overdueCount).toBe(0);
    expect(s.undefinedCount).toBe(0);
  });

  it("continua no gráfico por categoria e na fatura do cartão", () => {
    const nov = data.transactions.filter((t) => t.month === "2026-11-01");
    expect(categoryBreakdown(nov, categories, "expense").find((x) => x.id === "cat-food")?.value).toBe(80_000);
    expect(invoicesForMonth(data, "2026-11-01")[0].total).toBe(30_000);
  });

  it("também fica fora do saldo do cartão benefício", () => {
    const vr: CreditCard = { ...card, id: "vr", type: "benefit", credit_limit: null };
    const d = emptyData({
      cards: [vr],
      transactions: [
        tx({ kind: "income", amount: 80_000, date: "2026-11-01", payment_method: "benefit", card_id: vr.id }),
        tx({ amount: 10_000, date: "2026-11-02", payment_method: "benefit", card_id: vr.id, ignored: true }),
      ],
    });
    expect(benefitSummary(d, "2026-11-01", vr.id).balance).toBe(80_000);
  });
});

describe("opção ao criar e editar", () => {
  it("só grava o campo quando marcado (funciona mesmo antes da migration)", () => {
    const normal = buildEntry(emptyData(), entry({ amount: 1, date: "2026-11-01" }));
    expect("ignored" in normal.transactions[0]).toBe(false);
    const ignored = buildEntry(emptyData(), entry({ amount: 1, date: "2026-11-01", ignored: true }));
    expect(ignored.transactions[0].ignored).toBe(true);
  });

  it("marcar em 'este e os próximos' afeta só daquele mês em diante, inclusive meses gerados depois", async () => {
    const repo = memoryRepo(emptyData());
    await createEntry(repo, repo.data, entry({ name: "Reembolso", amount: 5000, date: "2026-11-10", recurrence: "fixed" }));
    const jan = repo.data.transactions.find((t) => t.month === "2027-01-01")!;
    await editEntry(repo, structuredClone(repo.data), jan, entry({ name: "Reembolso", amount: 5000, date: jan.date, recurrence: "fixed", ignored: true }), "following");
    await ensureFixed(repo, structuredClone(repo.data), "2028-06-01");

    const byMonth = (m: string) => repo.data.transactions.find((t) => t.month === m)!;
    expect(byMonth("2026-12-01").ignored).toBeFalsy();
    expect(byMonth("2027-01-01").ignored).toBe(true);
    expect(byMonth("2028-06-01").ignored).toBe(true);
  });

  it("desmarcar volta a considerar o lançamento nos saldos", async () => {
    const repo = memoryRepo(emptyData());
    await createEntry(repo, repo.data, entry({ name: "Item", amount: 1000, date: "2026-11-10", ignored: true }));
    const t = repo.data.transactions[0];
    expect(monthSummary(repo.data, "2026-11-01").expense).toBe(0);
    await editEntry(repo, structuredClone(repo.data), t, entry({ name: "Item", amount: 1000, date: t.date, ignored: false }), "one");
    expect(repo.data.transactions[0].ignored).toBe(false);
    expect(monthSummary(repo.data, "2026-11-01").expense).toBe(1000);
  });
});
