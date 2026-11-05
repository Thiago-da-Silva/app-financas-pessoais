import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isOverdue, isUndefinedAmount, monthSummary } from "./finance";
import { createEntry, editEntry } from "./operations";
import { card, emptyData, entry, memoryRepo, seriesRows, tx } from "@/test/helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 4, 12)); // 04/11/2026
});
afterEach(() => vi.useRealTimers());

describe("lançamentos com valor zerado (\"A definir\")", () => {
  it("pendente com R$ 0,00 é 'a definir'; pago com R$ 0,00 não é", () => {
    expect(isUndefinedAmount(tx({ amount: 0, date: "2026-11-10" }))).toBe(true);
    expect(isUndefinedAmount(tx({ amount: 0, date: "2026-11-10", paid: true }))).toBe(false);
    expect(isUndefinedAmount(tx({ amount: 100, date: "2026-11-10" }))).toBe(false);
  });

  it("valor zerado não vira conta vencida", () => {
    const cards = new Map([[card.id, card]]);
    expect(isOverdue(tx({ amount: 0, date: "2026-10-01" }), cards)).toBe(false);
  });

  it("o resumo conta quantos lançamentos do mês estão sem valor", () => {
    const data = emptyData({
      transactions: [
        tx({ kind: "income", name: "Contas (colega)", amount: 0, date: "2026-11-05" }),
        tx({ name: "Luz", amount: 0, date: "2026-11-12" }),
        tx({ name: "Água", amount: 0, date: "2026-11-12", paid: true }), // pago com zero: não conta
        tx({ name: "Luz", amount: 0, date: "2026-12-12" }), // outro mês
        tx({ name: "Aluguel", amount: 150_000, date: "2026-11-10" }),
      ],
    });
    const s = monthSummary(data, "2026-11-01");
    expect(s.undefinedCount).toBe(2);
    expect(s.predicted).toBe(-150_000);
  });

  it("fixo mensal zerado pode ter o valor definido mês a mês sem afetar os outros", async () => {
    const repo = memoryRepo(emptyData());
    await createEntry(repo, repo.data, entry({ kind: "income", name: "Contas (colega)", amount: 0, date: "2026-11-05", recurrence: "fixed" }));
    expect(repo.data.transactions.every((t) => t.amount === 0)).toBe(true);

    const nov = repo.data.transactions.find((t) => t.month === "2026-11-01")!;
    await editEntry(repo, structuredClone(repo.data), nov, entry({ kind: "income", name: "Contas (colega)", amount: 85_000, date: nov.date, recurrence: "fixed" }), "one");
    expect(seriesRows(repo.data, "Contas (colega)").slice(0, 3)).toEqual(["2026-11:85000", "2026-12:0", "2027-01:0"]);
    expect(monthSummary(repo.data, "2026-11-01").undefinedCount).toBe(0);
    expect(monthSummary(repo.data, "2026-12-01").undefinedCount).toBe(1);
  });
});
