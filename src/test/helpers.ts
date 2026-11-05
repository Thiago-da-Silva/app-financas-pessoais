import type { Repo, Row, Table } from "@/data/repo";
import type { Category, CreditCard, FinanceData, Profile, Transaction } from "@/lib/types";
import type { EntryInput } from "@/domain/operations";

/** Repositório em memória para testar as operações sem banco nem localStorage. */
export function memoryRepo(initial: FinanceData): Repo & { data: FinanceData } {
  const repo = {
    mode: "demo" as const,
    data: structuredClone(initial),
    async loadAll() {
      return structuredClone(repo.data);
    },
    async insert(table: Table, rows: object[]) {
      (repo.data[table] as object[]).push(...structuredClone(rows));
    },
    async update(table: Table, rows: Row[]) {
      const byId = new Map(rows.map((r) => [r.id, r]));
      repo.data[table] = (repo.data[table] as unknown as Row[]).map((it) =>
        byId.has(it.id) ? { ...it, ...byId.get(it.id) } : it,
      ) as never;
    },
    async remove(table: Table, ids: string[]) {
      const set = new Set(ids);
      repo.data[table] = (repo.data[table] as unknown as Row[]).filter((r) => !set.has(r.id)) as never;
      if (table === "series") repo.data.transactions = repo.data.transactions.filter((t) => !t.series_id || !set.has(t.series_id));
    },
    async updateProfile(patch: Partial<Profile>) {
      repo.data.profile = { ...repo.data.profile, ...patch };
    },
    async uploadAvatar() {
      return "";
    },
  };
  return repo;
}

export const card: CreditCard = {
  id: "card-1",
  name: "Roxinho",
  color: "#8b5cf6",
  credit_limit: 500_000, // R$ 5.000
  closing_day: 3,
  due_day: 10,
  archived: false,
};

export const categories: Category[] = [
  { id: "cat-food", name: "Alimentação", color: "#f97316", budget: 50_000 },
  { id: "cat-home", name: "Moradia", color: "#6366f1", budget: null },
  { id: "cat-salary", name: "Salário", color: "#10b981", budget: null },
];

export function emptyData(overrides: Partial<FinanceData> = {}): FinanceData {
  return {
    profile: { id: "u", name: "Teste", avatar_url: null, initial_balance: 0, carry_balance: true },
    categories,
    cards: [card],
    series: [],
    transactions: [],
    ...overrides,
  };
}

let seq = 0;
export function tx(partial: Partial<Transaction> & Pick<Transaction, "amount" | "date">): Transaction {
  const month = partial.month ?? `${partial.date.slice(0, 7)}-01`;
  return {
    id: `tx-${++seq}`,
    series_id: null,
    kind: "expense",
    name: "Item",
    description: null,
    category_id: null,
    payment_method: "pix",
    card_id: null,
    paid: false,
    ...partial,
    month,
  };
}

export function entry(partial: Partial<EntryInput> & Pick<EntryInput, "amount" | "date">): EntryInput {
  return {
    kind: "expense",
    name: "Compra",
    description: null,
    category_id: null,
    payment_method: "pix",
    card_id: null,
    paid: false,
    recurrence: "single",
    installments: 1,
    ...partial,
  };
}

/** Linhas de uma série ordenadas por mês, em formato compacto "YYYY-MM:valor". */
export function seriesRows(data: FinanceData, name: string) {
  return data.transactions
    .filter((t) => t.name === name)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((t) => `${t.month.slice(0, 7)}:${t.amount}`);
}
