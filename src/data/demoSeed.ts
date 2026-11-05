import type { Category, CreditCard, FinanceData, Series, Transaction } from "@/lib/types";
import { addMonths, currentMonth, dateInMonth, today } from "@/lib/dates";
import { buildEntry, type EntryInput } from "@/domain/operations";
import { uid } from "@/lib/utils";

/** Gera um conjunto de dados fictícios relativo ao mês atual. */
export function buildDemoData(): FinanceData {
  const now = today();
  const thisMonth = currentMonth();
  const start = addMonths(thisMonth, -5);

  let seed = 42;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const between = (min: number, max: number) => Math.round((min + rand() * (max - min)) * 100);

  const cat = (name: string, color: string, budget: number | null = null): Category => ({
    id: uid(),
    name,
    color,
    budget: budget != null ? budget * 100 : null,
  });
  const categories = {
    salario: cat("Salário", "#10b981"),
    freela: cat("Freelance", "#22c55e"),
    alimentacao: cat("Alimentação", "#f97316", 600),
    mercado: cat("Mercado", "#eab308", 1200),
    moradia: cat("Moradia", "#6366f1"),
    transporte: cat("Transporte", "#0ea5e9", 400),
    saude: cat("Saúde", "#ef4444"),
    lazer: cat("Lazer", "#ec4899", 350),
    educacao: cat("Educação", "#8b5cf6"),
    assinaturas: cat("Assinaturas", "#14b8a6"),
    compras: cat("Compras", "#f43f5e"),
  };

  const cards: CreditCard[] = [
    { id: uid(), name: "Roxinho", color: "#8b5cf6", credit_limit: 800000, closing_day: 3, due_day: 10, archived: false },
    { id: uid(), name: "Laranja", color: "#f97316", credit_limit: 450000, closing_day: 25, due_day: 5, archived: false },
  ];
  const [roxo, laranja] = cards;

  const series: Series[] = [];
  const transactions: Transaction[] = [];
  const data = { cards };

  const add = (input: Partial<EntryInput> & Pick<EntryInput, "name" | "amount" | "date">) => {
    const full: EntryInput = {
      kind: "expense",
      description: null,
      category_id: null,
      payment_method: "pix",
      card_id: null,
      paid: false,
      recurrence: "single",
      installments: 1,
      ...input,
    };
    const built = buildEntry(data, full);
    if (built.series) series.push(built.series);
    transactions.push(...built.transactions);
  };

  // Fixos mensais
  add({ kind: "income", name: "Salário", amount: 720000, date: dateInMonth(start, 5), category_id: categories.salario.id, recurrence: "fixed", description: "Salário líquido — empresa XPTO" });
  add({ name: "Aluguel", amount: 185000, date: dateInMonth(start, 10), category_id: categories.moradia.id, recurrence: "fixed", description: "Apartamento + condomínio" });
  add({ name: "Internet", amount: 11990, date: dateInMonth(start, 15), category_id: categories.moradia.id, payment_method: "debit", recurrence: "fixed" });
  add({ name: "Academia", amount: 9990, date: dateInMonth(start, 8), category_id: categories.saude.id, payment_method: "card", card_id: laranja.id, recurrence: "fixed" });
  add({ name: "Streaming de filmes", amount: 5590, date: dateInMonth(start, 12), category_id: categories.assinaturas.id, payment_method: "card", card_id: roxo.id, recurrence: "fixed" });
  add({ name: "Streaming de música", amount: 2190, date: dateInMonth(start, 18), category_id: categories.assinaturas.id, payment_method: "card", card_id: roxo.id, recurrence: "fixed" });

  // Parcelados
  add({ name: "Notebook", amount: 39900, date: dateInMonth(addMonths(thisMonth, -3), 14), category_id: categories.compras.id, payment_method: "card", card_id: roxo.id, recurrence: "installment", installments: 12, description: "Notebook para trabalho, 12x sem juros" });
  add({ name: "Geladeira", amount: 28000, date: dateInMonth(addMonths(thisMonth, -1), 20), category_id: categories.moradia.id, payment_method: "card", card_id: laranja.id, recurrence: "installment", installments: 10 });
  add({ name: "Curso de inglês", amount: 19900, date: dateInMonth(addMonths(thisMonth, -2), 6), category_id: categories.educacao.id, payment_method: "pix", recurrence: "installment", installments: 6 });
  add({ name: "Passagem aérea", amount: 32050, date: dateInMonth(thisMonth, 2), category_id: categories.lazer.id, payment_method: "card", card_id: roxo.id, recurrence: "installment", installments: 4, description: "Viagem de férias" });

  // Avulsos por mês
  for (let i = 0; i < 6; i++) {
    const m = addMonths(start, i);
    for (const d of [3, 11, 19, 26]) {
      const onCard = rand() > 0.5;
      add({ name: "Supermercado", amount: between(140, 380), date: dateInMonth(m, d), category_id: categories.mercado.id, payment_method: onCard ? "card" : "debit", card_id: onCard ? roxo.id : null });
    }
    add({ name: "Restaurante", amount: between(60, 180), date: dateInMonth(m, 7), category_id: categories.alimentacao.id, payment_method: "card", card_id: roxo.id });
    add({ name: "iFood", amount: between(40, 95), date: dateInMonth(m, 16), category_id: categories.alimentacao.id, payment_method: "card", card_id: laranja.id });
    add({ name: "Combustível", amount: between(180, 260), date: dateInMonth(m, 9), category_id: categories.transporte.id, payment_method: "debit" });
    add({ name: "Uber", amount: between(25, 70), date: dateInMonth(m, 22), category_id: categories.transporte.id, payment_method: "pix" });
    add({ name: "Cinema", amount: between(45, 90), date: dateInMonth(m, 24), category_id: categories.lazer.id, payment_method: "card", card_id: roxo.id });
    if (i % 2 === 0) add({ name: "Farmácia", amount: between(30, 120), date: dateInMonth(m, 13), category_id: categories.saude.id, payment_method: "debit" });
    if (i % 2 === 1) add({ kind: "income", name: "Projeto freelance", amount: between(800, 1800), date: dateInMonth(m, 20), category_id: categories.freela.id, payment_method: "pix", description: "Landing page para cliente" });
  }
  // Estorno no cartão
  add({ kind: "income", name: "Estorno compra online", amount: 8990, date: dateInMonth(addMonths(thisMonth, -1), 4), category_id: categories.compras.id, payment_method: "card", card_id: roxo.id });

  const fixed = transactions;

  // Status de pagamento: passado pago; deixa uma conta vencida de exemplo
  const cardsById = new Map(cards.map((c) => [c.id, c]));
  let leftOverdue = false;
  for (const t of fixed) {
    const due = t.payment_method === "card" && t.card_id ? dateInMonth(t.month, cardsById.get(t.card_id)!.due_day) : t.date;
    t.paid = due < now;
    if (t.paid && !leftOverdue && t.name === "Internet" && t.month === thisMonth) {
      t.paid = false;
      leftOverdue = true;
    }
  }

  return {
    profile: { id: "demo", name: "Visitante Demo", avatar_url: null, initial_balance: 350000, carry_balance: true },
    categories: Object.values(categories),
    cards,
    series,
    transactions: fixed,
  };
}
