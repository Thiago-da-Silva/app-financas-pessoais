import type { Repo } from "@/data/repo";
import type { CreditCard, FinanceData, Kind, PaymentMethod, Recurrence, Series, Transaction } from "@/lib/types";
import { addMonths, currentMonth, dateInMonth, monthDiff, monthOf, parts } from "@/lib/dates";
import { uid } from "@/lib/utils";
import { competenceMonth } from "./finance";

/** Quantos meses à frente os lançamentos fixos ficam gerados. */
export const FIXED_AHEAD = 12;

export interface EntryInput {
  kind: Kind;
  name: string;
  description: string | null;
  amount: number;
  category_id: string | null;
  payment_method: PaymentMethod;
  card_id: string | null;
  date: string;
  paid: boolean;
  recurrence: Recurrence;
  installments: number;
}

export type EditScope = "one" | "following";
export type DeleteScope = "one" | "following" | "all";

type Common = Pick<
  Transaction,
  "kind" | "name" | "description" | "amount" | "category_id" | "payment_method" | "card_id"
>;

function common(input: EntryInput | Series): Common {
  const isCard = input.payment_method === "card";
  return {
    kind: input.kind,
    name: input.name.trim(),
    description: input.description?.trim() ? input.description.trim() : null,
    amount: input.amount,
    category_id: input.category_id || null,
    payment_method: input.payment_method,
    card_id: isCard ? input.card_id : null,
  };
}

function findCard(data: Pick<FinanceData, "cards">, id: string | null): CreditCard | undefined {
  return id ? data.cards.find((c) => c.id === id) : undefined;
}

/** k-ésima ocorrência a partir de uma data/mês base, mantendo o dia escolhido. */
function occurrence(baseDate: string, baseMonth: string, k: number, day = parts(baseDate).d) {
  return { date: dateInMonth(addMonths(monthOf(baseDate), k), day), month: addMonths(baseMonth, k) };
}

/** Gera as linhas (sem gravar) de um novo lançamento. Usado também pelos dados de demonstração. */
export function buildEntry(
  data: Pick<FinanceData, "cards">,
  input: EntryInput,
  opts: { firstId?: string; horizon?: string } = {},
): { series: Series | null; transactions: Transaction[] } {
  const base = common(input);
  const card = findCard(data, base.card_id);
  const month0 = competenceMonth(input.date, card);

  if (input.recurrence === "single") {
    return {
      series: null,
      transactions: [
        { id: opts.firstId ?? uid(), series_id: null, ...base, date: input.date, month: month0, paid: input.paid },
      ],
    };
  }

  let count: number;
  if (input.recurrence === "installment") {
    count = Math.max(1, Math.min(input.installments, 120));
  } else {
    const horizon = opts.horizon ?? addMonths(currentMonth(), FIXED_AHEAD);
    count = Math.max(monthDiff(month0, horizon) + 1, FIXED_AHEAD);
  }

  const seriesId = uid();
  const transactions: Transaction[] = Array.from({ length: count }, (_, k) => ({
    id: k === 0 && opts.firstId ? opts.firstId : uid(),
    series_id: seriesId,
    ...base,
    ...occurrence(input.date, month0, k),
    paid: k === 0 ? input.paid : false,
  }));

  const series: Series = {
    id: seriesId,
    type: input.recurrence,
    ...base,
    day: parts(input.date).d,
    start_month: month0,
    end_month: null,
    generated_until: transactions[transactions.length - 1].month,
  };
  return { series, transactions };
}

export async function createEntry(repo: Repo, data: FinanceData, input: EntryInput, firstId?: string) {
  const { series, transactions } = buildEntry(data, input, { firstId });
  if (series) await repo.insert("series", [series]);
  await repo.insert("transactions", transactions);
}

/** Garante que os lançamentos fixos estejam gerados até `untilMonth`. Retorna true se gerou algo. */
export async function ensureFixed(repo: Repo, data: FinanceData, untilMonth: string): Promise<boolean> {
  const newRows: Transaction[] = [];
  const seriesUpdates: { id: string; generated_until: string }[] = [];

  for (const s of data.series) {
    if (s.type !== "fixed") continue;
    const target = s.end_month && s.end_month < untilMonth ? s.end_month : untilMonth;
    const last = s.generated_until ?? s.start_month;
    if (last >= target) continue;

    const rows = data.transactions
      .filter((t) => t.series_id === s.id)
      .sort((a, b) => a.month.localeCompare(b.month));
    const ref = rows[rows.length - 1];
    // referência de data: última ocorrência existente, ou o último mês gerado
    const refMonth = ref?.month ?? last;
    const refDate = ref?.date ?? dateInMonth(last, s.day);

    const steps = monthDiff(last, target);
    for (let i = 1; i <= steps; i++) {
      const month = addMonths(last, i);
      const k = monthDiff(refMonth, month);
      newRows.push({
        id: uid(),
        series_id: s.id,
        ...common(s),
        date: dateInMonth(addMonths(monthOf(refDate), k), s.day),
        month,
        paid: false,
      });
    }
    seriesUpdates.push({ id: s.id, generated_until: target });
  }

  if (!newRows.length && !seriesUpdates.length) return false;
  await repo.insert("transactions", newRows);
  await repo.update("series", seriesUpdates);
  return true;
}

export async function editEntry(repo: Repo, data: FinanceData, tx: Transaction, input: EntryInput, scope: EditScope) {
  const base = common(input);
  const card = findCard(data, base.card_id);
  const month0 = competenceMonth(input.date, card);
  const series = tx.series_id ? data.series.find((s) => s.id === tx.series_id) : undefined;

  // Lançamento único que virou parcelado/fixo
  if (!series) {
    if (input.recurrence === "single") {
      await repo.update("transactions", [{ id: tx.id, ...base, date: input.date, month: month0, paid: input.paid }]);
    } else {
      await repo.remove("transactions", [tx.id]);
      await createEntry(repo, data, input, tx.id);
    }
    return;
  }

  if (scope === "one") {
    await repo.update("transactions", [{ id: tx.id, ...base, date: input.date, month: month0, paid: input.paid }]);
  } else {
    // este e os próximos (o histórico anterior não muda)
    const day = parts(input.date).d;
    const rows = data.transactions.filter((t) => t.series_id === series.id && t.month >= tx.month);
    await repo.update(
      "transactions",
      rows.map((r) => ({
        id: r.id,
        ...base,
        ...occurrence(input.date, month0, monthDiff(tx.month, r.month), day),
        paid: r.id === tx.id ? input.paid : r.paid,
      })),
    );
    await repo.update("series", [{ id: series.id, ...base, day }]);
  }

  // Alteração da quantidade de parcelas
  if (series.type === "installment") {
    const fresh = await repo.loadAll();
    const rows = fresh.transactions
      .filter((t) => t.series_id === series.id)
      .sort((a, b) => a.month.localeCompare(b.month) || a.date.localeCompare(b.date));
    const target = Math.max(1, Math.min(input.installments, 120));
    if (target < rows.length) {
      await repo.remove(
        "transactions",
        rows.slice(target).map((r) => r.id),
      );
    } else if (target > rows.length && rows.length) {
      const last = rows[rows.length - 1];
      const tmpl = fresh.series.find((s) => s.id === series.id) ?? series;
      const extra: Transaction[] = [];
      for (let k = 1; k <= target - rows.length; k++) {
        extra.push({
          id: uid(),
          series_id: series.id,
          ...common(tmpl),
          ...occurrence(last.date, last.month, k, tmpl.day),
          paid: false,
        });
      }
      await repo.insert("transactions", extra);
    }
  }
}

// ---------------------------------------------------------------------
// Exclusão (com desfazer)
// ---------------------------------------------------------------------

export interface UndoSnapshot {
  transactions: Transaction[];
  series?: Series;
  seriesRemoved?: boolean;
}

export async function deleteEntry(
  repo: Repo,
  data: FinanceData,
  tx: Transaction,
  scope: DeleteScope,
): Promise<UndoSnapshot> {
  const series = tx.series_id ? data.series.find((s) => s.id === tx.series_id) : undefined;
  if (!series || scope === "one") {
    await repo.remove("transactions", [tx.id]);
    return { transactions: [tx] };
  }

  const all = data.transactions.filter((t) => t.series_id === series.id);
  const hasEarlier = all.some((t) => t.month < tx.month);

  if (scope === "all" || !hasEarlier) {
    await repo.remove("series", [series.id]); // cascade remove as linhas
    return { transactions: all, series, seriesRemoved: true };
  }

  const following = all.filter((t) => t.month >= tx.month);
  await repo.remove(
    "transactions",
    following.map((t) => t.id),
  );
  if (series.type === "fixed") {
    const end = addMonths(tx.month, -1);
    await repo.update("series", [{ id: series.id, end_month: end, generated_until: end }]);
  }
  return { transactions: following, series };
}

export async function undoDelete(repo: Repo, snap: UndoSnapshot) {
  if (snap.series) {
    if (snap.seriesRemoved) await repo.insert("series", [snap.series]);
    else {
      const { id, end_month, generated_until } = snap.series;
      await repo.update("series", [{ id, end_month, generated_until }]);
    }
  }
  await repo.insert("transactions", snap.transactions);
}

export async function setPaid(repo: Repo, ids: string[], paid: boolean) {
  await repo.update(
    "transactions",
    ids.map((id) => ({ id, paid })),
  );
}

// ---------------------------------------------------------------------
// Categorias e cartões
// ---------------------------------------------------------------------

export async function deleteCategory(repo: Repo, data: FinanceData, id: string, moveTo: string | null) {
  const txs = data.transactions.filter((t) => t.category_id === id);
  const series = data.series.filter((s) => s.category_id === id);
  await repo.update(
    "transactions",
    txs.map((t) => ({ id: t.id, category_id: moveTo })),
  );
  await repo.update(
    "series",
    series.map((s) => ({ id: s.id, category_id: moveTo })),
  );
  await repo.remove("categories", [id]);
}

export function cardInUse(data: FinanceData, id: string) {
  return data.transactions.some((t) => t.card_id === id) || data.series.some((s) => s.card_id === id);
}
