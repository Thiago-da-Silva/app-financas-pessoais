import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildEntry,
  cardInUse,
  createEntry,
  deleteCategory,
  deleteEntry,
  editEntry,
  ensureFixed,
  FIXED_AHEAD,
  setPaid,
  undoDelete,
} from "./operations";
import { installmentMap } from "./finance";
import type { FinanceData, Transaction } from "@/lib/types";
import { card, emptyData, entry, memoryRepo, seriesRows, tx } from "@/test/helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 4, 12)); // 04/11/2026
});
afterEach(() => vi.useRealTimers());

const onCard = { payment_method: "card" as const, card_id: card.id };

async function setup(input: Parameters<typeof entry>[0]) {
  const repo = memoryRepo(emptyData());
  await createEntry(repo, repo.data, entry(input));
  return repo;
}

const rowOf = (data: FinanceData, name: string, month: string): Transaction =>
  data.transactions.find((t) => t.name === name && t.month === month)!;

describe("buildEntry (novo lançamento)", () => {
  it("único: competência = mês da data", () => {
    const { series, transactions } = buildEntry(emptyData(), entry({ amount: 1000, date: "2026-11-20" }));
    expect(series).toBeNull();
    expect(transactions).toHaveLength(1);
    expect(transactions[0].month).toBe("2026-11-01");
  });

  it("único no cartão: competência = mês da fatura", () => {
    const { transactions } = buildEntry(emptyData(), entry({ ...onCard, amount: 1000, date: "2026-11-04" }));
    expect(transactions[0].month).toBe("2026-12-01");
  });

  it("parcelado repete o valor da parcela por N meses a partir do mês da compra", () => {
    const { series, transactions } = buildEntry(emptyData(), entry({ amount: 10_000, date: "2026-11-15", recurrence: "installment", installments: 12 }));
    expect(transactions).toHaveLength(12);
    expect(transactions.every((t) => t.amount === 10_000)).toBe(true);
    expect(transactions[0].month).toBe("2026-11-01");
    expect(transactions[11].month).toBe("2027-10-01");
    expect(series?.generated_until).toBe("2027-10-01");
  });

  it("parcelado no cartão segue as faturas e mantém o dia da compra", () => {
    const { transactions } = buildEntry(emptyData(), entry({ ...onCard, amount: 5000, date: "2026-11-04", recurrence: "installment", installments: 3 }));
    expect(transactions.map((t) => [t.date, t.month])).toEqual([
      ["2026-11-04", "2026-12-01"],
      ["2026-12-04", "2027-01-01"],
      ["2027-01-04", "2027-02-01"],
    ]);
  });

  it("mantém o dia 31 depois de passar por fevereiro", () => {
    const { transactions } = buildEntry(emptyData(), entry({ amount: 1, date: "2027-01-31", recurrence: "installment", installments: 3 }));
    expect(transactions.map((t) => t.date)).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
  });

  it("'já pago' vale só para a primeira ocorrência", () => {
    const { transactions } = buildEntry(emptyData(), entry({ amount: 1, date: "2026-11-01", paid: true, recurrence: "installment", installments: 3 }));
    expect(transactions.map((t) => t.paid)).toEqual([true, false, false]);
  });

  it("fixo mensal gera pelo menos 12 meses à frente", () => {
    const { series, transactions } = buildEntry(emptyData(), entry({ amount: 1, date: "2026-11-05", recurrence: "fixed" }));
    expect(series?.type).toBe("fixed");
    expect(transactions.length).toBeGreaterThanOrEqual(FIXED_AHEAD);
    expect(series?.generated_until).toBe(transactions[transactions.length - 1].month);
  });
});

describe("editEntry", () => {
  it("'este e os próximos' altera o valor sem mexer nos meses anteriores", async () => {
    const repo = await setup({ name: "Celular", amount: 50_000, date: "2026-11-10", recurrence: "installment", installments: 4 });
    const second = rowOf(repo.data, "Celular", "2026-12-01");
    await editEntry(repo, repo.data, second, entry({ name: "Celular", amount: 45_000, date: second.date, recurrence: "installment", installments: 4 }), "following");
    expect(seriesRows(repo.data, "Celular")).toEqual(["2026-11:50000", "2026-12:45000", "2027-01:45000", "2027-02:45000"]);
  });

  it("'somente este mês' altera apenas a ocorrência escolhida", async () => {
    const repo = await setup({ name: "Aluguel", amount: 150_000, date: "2026-11-10", recurrence: "installment", installments: 3 });
    const second = rowOf(repo.data, "Aluguel", "2026-12-01");
    await editEntry(repo, repo.data, second, entry({ name: "Aluguel", amount: 160_000, date: second.date, recurrence: "installment", installments: 3 }), "one");
    expect(seriesRows(repo.data, "Aluguel")).toEqual(["2026-11:150000", "2026-12:160000", "2027-01:150000"]);
  });

  it("trocar para cartão em 'este e os próximos' recalcula os meses das faturas", async () => {
    const repo = await setup({ name: "Curso", amount: 1000, date: "2026-11-05", recurrence: "installment", installments: 3 });
    const first = rowOf(repo.data, "Curso", "2026-11-01");
    await editEntry(repo, repo.data, first, entry({ ...onCard, name: "Curso", amount: 1000, date: first.date, recurrence: "installment", installments: 3 }), "following");
    expect(seriesRows(repo.data, "Curso")).toEqual(["2026-12:1000", "2027-01:1000", "2027-02:1000"]);
  });

  it("diminuir a quantidade de parcelas remove as últimas", async () => {
    const repo = await setup({ name: "TV", amount: 1000, date: "2026-11-05", recurrence: "installment", installments: 6 });
    const first = rowOf(repo.data, "TV", "2026-11-01");
    await editEntry(repo, repo.data, first, entry({ name: "TV", amount: 1000, date: first.date, recurrence: "installment", installments: 4 }), "one");
    expect(seriesRows(repo.data, "TV")).toEqual(["2026-11:1000", "2026-12:1000", "2027-01:1000", "2027-02:1000"]);
  });

  it("aumentar a quantidade de parcelas adiciona novas no final", async () => {
    const repo = await setup({ name: "TV", amount: 1000, date: "2026-11-05", recurrence: "installment", installments: 2 });
    const first = rowOf(repo.data, "TV", "2026-11-01");
    await editEntry(repo, repo.data, first, entry({ name: "TV", amount: 1000, date: first.date, recurrence: "installment", installments: 4 }), "one");
    expect(seriesRows(repo.data, "TV")).toEqual(["2026-11:1000", "2026-12:1000", "2027-01:1000", "2027-02:1000"]);
    const map = installmentMap(repo.data);
    const last = rowOf(repo.data, "TV", "2027-02-01");
    expect(map.get(last.id)).toEqual({ n: 4, total: 4 });
    expect(last.paid).toBe(false);
  });

  it("lançamento único pode virar parcelado mantendo o id original", async () => {
    const repo = await setup({ name: "Sofá", amount: 1000, date: "2026-11-05" });
    const original = repo.data.transactions[0];
    await editEntry(repo, repo.data, original, entry({ name: "Sofá", amount: 1000, date: original.date, recurrence: "installment", installments: 3 }), "one");
    expect(seriesRows(repo.data, "Sofá")).toHaveLength(3);
    expect(rowOf(repo.data, "Sofá", "2026-11-01").id).toBe(original.id);
  });
});

describe("deleteEntry e desfazer", () => {
  it("'somente este' remove uma parcela e renumera as demais", async () => {
    const repo = await setup({ name: "Notebook", amount: 1000, date: "2026-11-05", recurrence: "installment", installments: 3 });
    const before = structuredClone(repo.data);
    await deleteEntry(repo, before, rowOf(before, "Notebook", "2026-12-01"), "one");
    expect(seriesRows(repo.data, "Notebook")).toEqual(["2026-11:1000", "2027-01:1000"]);
    expect(installmentMap(repo.data).get(rowOf(repo.data, "Notebook", "2027-01-01").id)).toEqual({ n: 2, total: 2 });
  });

  it("'este e os próximos' mantém o histórico anterior", async () => {
    const repo = await setup({ name: "Notebook", amount: 1000, date: "2026-11-05", recurrence: "installment", installments: 4 });
    await deleteEntry(repo, structuredClone(repo.data), rowOf(repo.data, "Notebook", "2027-01-01"), "following");
    expect(seriesRows(repo.data, "Notebook")).toEqual(["2026-11:1000", "2026-12:1000"]);
    expect(repo.data.series).toHaveLength(1);
  });

  it("'toda a série' remove todos os meses e a série", async () => {
    const repo = await setup({ name: "Notebook", amount: 1000, date: "2026-11-05", recurrence: "installment", installments: 4 });
    await deleteEntry(repo, structuredClone(repo.data), rowOf(repo.data, "Notebook", "2027-01-01"), "all");
    expect(repo.data.transactions).toHaveLength(0);
    expect(repo.data.series).toHaveLength(0);
  });

  it("desfazer restaura exatamente o que foi excluído", async () => {
    const repo = await setup({ name: "Notebook", amount: 1000, date: "2026-11-05", recurrence: "installment", installments: 4 });
    const snapshot = structuredClone(repo.data);
    const undo = await deleteEntry(repo, snapshot, rowOf(snapshot, "Notebook", "2026-12-01"), "all");
    await undoDelete(repo, undo);
    expect(seriesRows(repo.data, "Notebook")).toEqual(seriesRows(snapshot, "Notebook"));
    expect(repo.data.series).toEqual(snapshot.series);
  });

  it("encerrar fixo ('este e os próximos') não volta a gerar meses", async () => {
    const repo = await setup({ name: "Academia", amount: 9990, date: "2026-11-08", recurrence: "fixed" });
    await deleteEntry(repo, structuredClone(repo.data), rowOf(repo.data, "Academia", "2027-02-01"), "following");
    expect(repo.data.series[0].end_month).toBe("2027-01-01");
    const generated = await ensureFixed(repo, structuredClone(repo.data), "2028-12-01");
    expect(generated).toBe(false);
    expect(seriesRows(repo.data, "Academia").at(-1)).toBe("2027-01:9990");
  });

  it("desfazer o encerramento de um fixo reativa a série", async () => {
    const repo = await setup({ name: "Academia", amount: 9990, date: "2026-11-08", recurrence: "fixed" });
    const snapshot = structuredClone(repo.data);
    const undo = await deleteEntry(repo, snapshot, rowOf(snapshot, "Academia", "2027-02-01"), "following");
    await undoDelete(repo, undo);
    expect(repo.data.series[0].end_month).toBeNull();
    expect(seriesRows(repo.data, "Academia")).toHaveLength(snapshot.transactions.length);
  });
});

describe("ensureFixed (geração automática dos fixos)", () => {
  it("estende o fixo até o mês pedido, uma ocorrência por mês", async () => {
    const repo = await setup({ name: "Salário", kind: "income", amount: 700_000, date: "2026-11-05", recurrence: "fixed" });
    const before = repo.data.transactions.length;
    await ensureFixed(repo, structuredClone(repo.data), "2028-12-01");
    const months = repo.data.transactions.map((t) => t.month);
    expect(new Set(months).size).toBe(months.length);
    expect(months.at(-1)).toBe("2028-12-01");
    expect(repo.data.transactions.length).toBeGreaterThan(before);
    expect(repo.data.series[0].generated_until).toBe("2028-12-01");
  });

  it("novos meses usam o valor atualizado por 'este e os próximos'", async () => {
    const repo = await setup({ name: "Internet", amount: 10_000, date: "2026-11-15", recurrence: "fixed" });
    const row = rowOf(repo.data, "Internet", "2027-03-01");
    await editEntry(repo, structuredClone(repo.data), row, entry({ name: "Internet", amount: 12_000, date: row.date, recurrence: "fixed" }), "following");
    await ensureFixed(repo, structuredClone(repo.data), "2028-06-01");
    expect(rowOf(repo.data, "Internet", "2027-02-01").amount).toBe(10_000);
    expect(rowOf(repo.data, "Internet", "2028-06-01").amount).toBe(12_000);
  });

  it("não recria um mês que o usuário excluiu individualmente", async () => {
    const repo = await setup({ name: "Streaming", amount: 5590, date: "2026-11-12", recurrence: "fixed" });
    const last = repo.data.transactions.at(-1)!;
    await deleteEntry(repo, structuredClone(repo.data), last, "one");
    await ensureFixed(repo, structuredClone(repo.data), last.month);
    expect(repo.data.transactions.some((t) => t.month === last.month)).toBe(false);
  });
});

describe("outras operações", () => {
  it("marca e desmarca vários lançamentos como pagos (fatura inteira)", async () => {
    const repo = memoryRepo(emptyData({ transactions: [tx({ id: "a", amount: 1, date: "2026-11-01" }), tx({ id: "b", amount: 1, date: "2026-11-02" })] }));
    await setPaid(repo, ["a", "b"], true);
    expect(repo.data.transactions.every((t) => t.paid)).toBe(true);
    await setPaid(repo, ["a"], false);
    expect(repo.data.transactions.map((t) => t.paid)).toEqual([false, true]);
  });

  it("excluir categoria move os lançamentos para outra", async () => {
    const repo = memoryRepo(emptyData({ transactions: [tx({ id: "a", amount: 1, date: "2026-11-01", category_id: "cat-food" })] }));
    await deleteCategory(repo, repo.data, "cat-food", "cat-home");
    expect(repo.data.transactions[0].category_id).toBe("cat-home");
    expect(repo.data.categories.some((c) => c.id === "cat-food")).toBe(false);
  });

  it("identifica cartão em uso", () => {
    const data = emptyData({ transactions: [tx({ amount: 1, date: "2026-11-01", ...onCard })] });
    expect(cardInUse(data, card.id)).toBe(true);
    expect(cardInUse(emptyData(), card.id)).toBe(false);
  });
});
