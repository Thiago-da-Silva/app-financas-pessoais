import { Fragment, useMemo, useState } from "react";
import { ChevronDown, Copy, CreditCard as CardIcon, Ellipsis, Info, Pencil, Receipt, Repeat, Trash2 } from "lucide-react";
import type { Category, CreditCard, FinanceData, Transaction } from "@/lib/types";
import { PAYMENT_LABELS } from "@/lib/types";
import { installmentMap, invoicesForMonth, isOverdue, type Invoice } from "@/domain/finance";
import { usePrefs } from "@/hooks/prefs";
import { Button } from "@/components/ui/button";
import { Checkbox, Dot, EmptyState } from "@/components/ui/misc";
import { InfoPopover, Menu, MenuItem, MenuSeparator } from "@/components/ui/overlay";
import { CardChip } from "@/components/CardInfo";
import { formatDate, today } from "@/lib/dates";
import { cn } from "@/lib/utils";

export interface RowActions {
  onEdit(t: Transaction): void;
  onDuplicate(t: Transaction): void;
  onDelete(t: Transaction): void;
  onTogglePaid(ids: string[], paid: boolean): void;
}

type Item = { type: "tx"; date: string; tx: Transaction } | { type: "invoice"; date: string; invoice: Invoice };

interface Ctx {
  data: FinanceData;
  month: string;
  categories: Map<string, Category>;
  cards: Map<string, CreditCard>;
  inst: Map<string, { n: number; total: number }>;
  fixedSeries: Set<string>;
  now: string;
  actions: RowActions;
}

export function TransactionList({
  data,
  month,
  transactions,
  actions,
}: {
  data: FinanceData;
  month: string;
  transactions: Transaction[];
  actions: RowActions;
}) {
  const ctx: Ctx = useMemo(
    () => ({
      data,
      month,
      categories: new Map(data.categories.map((c) => [c.id, c])),
      cards: new Map(data.cards.map((c) => [c.id, c])),
      inst: installmentMap(data),
      fixedSeries: new Set(data.series.filter((s) => s.type === "fixed").map((s) => s.id)),
      now: today(),
      actions,
    }),
    [data, month, actions],
  );

  const items: Item[] = useMemo(() => {
    const out: Item[] = transactions.filter((t) => t.payment_method !== "card").map((tx) => ({ type: "tx", date: tx.date, tx }));
    for (const invoice of invoicesForMonth(data, month, transactions)) out.push({ type: "invoice", date: invoice.dueDate, invoice });
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [transactions, data, month]);

  if (!items.length) {
    return (
      <EmptyState icon={<Receipt />} title="Nenhum lançamento encontrado">
        Adicione uma entrada ou saída para este mês.
      </EmptyState>
    );
  }

  return (
    <>
      {/* Desktop: tabela */}
      <table className="hidden w-full text-sm md:table">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="w-20 py-2.5 pl-4 font-medium">Data</th>
            <th className="py-2.5 font-medium">Nome</th>
            <th className="w-40 py-2.5 font-medium">Categoria</th>
            <th className="w-36 py-2.5 font-medium">Pagamento</th>
            <th className="w-32 py-2.5 pr-4 text-right font-medium">Valor</th>
            <th className="w-16 py-2.5 text-center font-medium">Pago</th>
            <th className="w-28 py-2.5 pr-4 text-right font-medium">Ações</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) =>
            it.type === "tx" ? (
              <DesktopRow key={it.tx.id} tx={it.tx} ctx={ctx} />
            ) : (
              <DesktopInvoice key={`inv-${it.invoice.card.id}`} invoice={it.invoice} ctx={ctx} />
            ),
          )}
        </tbody>
      </table>

      {/* Celular: lista compacta */}
      <ul className="divide-y divide-border md:hidden">
        {items.map((it) =>
          it.type === "tx" ? (
            <MobileRow key={it.tx.id} tx={it.tx} ctx={ctx} />
          ) : (
            <MobileInvoice key={`inv-${it.invoice.card.id}`} invoice={it.invoice} ctx={ctx} />
          ),
        )}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------
// Peças compartilhadas
// ---------------------------------------------------------------------

function NameCell({ tx, ctx, className }: { tx: Transaction; ctx: Ctx; className?: string }) {
  const inst = ctx.inst.get(tx.id);
  const fixed = tx.series_id && ctx.fixedSeries.has(tx.series_id);
  const content = (
    <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <span className="truncate font-medium">{tx.name}</span>
      {inst && <span className="shrink-0 text-xs text-muted-foreground tabular">({inst.n}/{inst.total})</span>}
      {fixed && <Repeat className="size-3.5 shrink-0 text-muted-foreground" aria-label="Fixo mensal" />}
      {tx.description && <Info className="size-3.5 shrink-0 text-muted-foreground" />}
    </span>
  );
  if (!tx.description) return content;
  return (
    <InfoPopover
      trigger={
        <button type="button" onClick={(e) => e.stopPropagation()} className="min-w-0 max-w-full cursor-pointer rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {content}
        </button>
      }
    >
      <p className="text-xs font-medium text-muted-foreground">Descrição</p>
      <p className="mt-1 whitespace-pre-wrap">{tx.description}</p>
    </InfoPopover>
  );
}

function CategoryTag({ tx, ctx }: { tx: Transaction; ctx: Ctx }) {
  const c = tx.category_id ? ctx.categories.get(tx.category_id) : undefined;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full px-2 py-0.5 text-xs" style={{ background: `${c?.color ?? "#94a3b8"}1f` }}>
      <Dot color={c?.color ?? "#94a3b8"} className="size-2" />
      <span className="truncate">{c?.name ?? "Sem categoria"}</span>
    </span>
  );
}

function Amount({ tx, className }: { tx: Transaction; className?: string }) {
  const { money } = usePrefs();
  const income = tx.kind === "income";
  return (
    <span className={cn("font-semibold tabular whitespace-nowrap", income ? "text-income" : "text-foreground", className)}>
      {income ? "+ " : "− "}
      {money(tx.amount)}
    </span>
  );
}

function RowMenu({ tx, ctx }: { tx: Transaction; ctx: Ctx }) {
  return (
    <Menu
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label="Ações" onClick={(e) => e.stopPropagation()}>
          <Ellipsis />
        </Button>
      }
    >
      <MenuItem icon={<Pencil />} onSelect={() => ctx.actions.onEdit(tx)}>
        Editar
      </MenuItem>
      <MenuItem icon={<Copy />} onSelect={() => ctx.actions.onDuplicate(tx)}>
        Duplicar
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={<Trash2 />} destructive onSelect={() => ctx.actions.onDelete(tx)}>
        Excluir
      </MenuItem>
    </Menu>
  );
}

function OverdueTag() {
  return <span className="rounded-full bg-expense-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-expense">Vencido</span>;
}

// ---------------------------------------------------------------------
// Desktop
// ---------------------------------------------------------------------

function DesktopRow({ tx, ctx, nested }: { tx: Transaction; ctx: Ctx; nested?: boolean }) {
  const overdue = isOverdue(tx, ctx.cards, ctx.now);
  const card = tx.card_id ? ctx.cards.get(tx.card_id) : undefined;
  return (
    <tr
      className={cn(
        "group border-b border-border/70 transition-colors last:border-0 hover:bg-accent/40",
        nested && "bg-muted/30",
        tx.paid && "text-muted-foreground",
      )}
    >
      <td className={cn("py-2.5 pl-4 tabular", nested && "pl-10", overdue && "font-medium text-expense")}>{formatDate(tx.date)}</td>
      <td className="max-w-0 py-2.5 pr-3">
        <div className="flex items-center gap-2">
          <NameCell tx={tx} ctx={ctx} className={cn(tx.paid && "[&>span:first-child]:text-muted-foreground")} />
          {overdue && !nested && <OverdueTag />}
        </div>
      </td>
      <td className="max-w-0 py-2.5 pr-3">
        <CategoryTag tx={tx} ctx={ctx} />
      </td>
      <td className="max-w-0 truncate py-2.5 pr-3 text-muted-foreground">
        {card ? <CardChip data={ctx.data} card={card} month={ctx.month} /> : PAYMENT_LABELS[tx.payment_method as "pix"]}
      </td>
      <td className="py-2.5 pr-4 text-right">
        <Amount tx={tx} className={cn(tx.paid && "opacity-70")} />
      </td>
      <td className="py-2.5 text-center">
        <Checkbox
          checked={tx.paid}
          onCheckedChange={(v) => ctx.actions.onTogglePaid([tx.id], v)}
          label={tx.paid ? "Marcar como não pago" : "Marcar como pago"}
        />
      </td>
      <td className="py-2.5 pr-3">
        <div className="flex justify-end gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
          <Button variant="ghost" size="icon-sm" onClick={() => ctx.actions.onEdit(tx)} aria-label="Editar" title="Editar">
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => ctx.actions.onDuplicate(tx)} aria-label="Duplicar" title="Duplicar">
            <Copy />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="hover:bg-expense-soft hover:text-expense"
            onClick={() => ctx.actions.onDelete(tx)}
            aria-label="Excluir"
            title="Excluir"
          >
            <Trash2 />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function useInvoiceState(invoice: Invoice) {
  const [open, setOpen] = useState(false);
  const checked: boolean | "indeterminate" = invoice.allPaid ? true : invoice.somePaid ? "indeterminate" : false;
  return { open, setOpen, checked };
}

function DesktopInvoice({ invoice, ctx }: { invoice: Invoice; ctx: Ctx }) {
  const { money } = usePrefs();
  const { open, setOpen, checked } = useInvoiceState(invoice);
  const overdue = !invoice.allPaid && invoice.dueDate < ctx.now;
  return (
    <Fragment>
      <tr className="cursor-pointer border-b border-border/70 transition-colors hover:bg-accent/40" onClick={() => setOpen(!open)}>
        <td className={cn("py-3 pl-4 tabular", overdue && "font-medium text-expense")}>{formatDate(invoice.dueDate)}</td>
        <td className="py-3 pr-3">
          <div className="flex items-center gap-2">
            <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", !open && "-rotate-90")} />
            <span className="grid size-6 place-items-center rounded-md text-white" style={{ background: invoice.card.color }}>
              <CardIcon className="size-3.5" />
            </span>
            <span className="font-semibold">Fatura:</span>
            <CardChip data={ctx.data} card={invoice.card} month={ctx.month}>
              <span className="font-semibold">{invoice.card.name}</span>
            </CardChip>
            <span className="text-xs text-muted-foreground">
              {invoice.items.length} {invoice.items.length === 1 ? "item" : "itens"}
            </span>
            {overdue && <OverdueTag />}
          </div>
        </td>
        <td className="py-3 text-xs text-muted-foreground">{invoice.somePaid && !invoice.allPaid ? `${money(invoice.paidTotal)} pago` : ""}</td>
        <td className="py-3 text-muted-foreground">Cartão de crédito</td>
        <td className="py-3 pr-4 text-right font-semibold tabular">− {money(invoice.total)}</td>
        <td className="py-3 text-center">
          <Checkbox
            checked={checked}
            label="Pagar fatura inteira"
            onCheckedChange={() =>
              ctx.actions.onTogglePaid(
                invoice.items.map((t) => t.id),
                !invoice.allPaid,
              )
            }
          />
        </td>
        <td className="py-3 pr-4 text-right">
          <Button variant="ghost" size="sm" onClick={(e) => (e.stopPropagation(), setOpen(!open))}>
            {open ? "Ocultar" : "Ver itens"}
          </Button>
        </td>
      </tr>
      {open && invoice.items.map((t) => <DesktopRow key={t.id} tx={t} ctx={ctx} nested />)}
    </Fragment>
  );
}

// ---------------------------------------------------------------------
// Celular
// ---------------------------------------------------------------------

function MobileRow({ tx, ctx, nested }: { tx: Transaction; ctx: Ctx; nested?: boolean }) {
  const overdue = isOverdue(tx, ctx.cards, ctx.now);
  const card = tx.card_id ? ctx.cards.get(tx.card_id) : undefined;
  const c = tx.category_id ? ctx.categories.get(tx.category_id) : undefined;
  return (
    <li className={cn("flex items-center gap-3 py-3 pr-1", nested ? "pl-6" : "pl-3")}>
      <Checkbox
        checked={tx.paid}
        onCheckedChange={(v) => ctx.actions.onTogglePaid([tx.id], v)}
        label={tx.paid ? "Marcar como não pago" : "Marcar como pago"}
      />
      <div className="min-w-0 flex-1" onClick={() => ctx.actions.onEdit(tx)}>
        <NameCell tx={tx} ctx={ctx} className={cn(tx.paid && "[&>span:first-child]:text-muted-foreground [&>span:first-child]:line-through decoration-muted-foreground/40")} />
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn("tabular", overdue && "font-medium text-expense")}>{formatDate(tx.date)}</span>
          <span>·</span>
          <Dot color={c?.color ?? "#94a3b8"} className="size-2" />
          <span className="truncate">{c?.name ?? "Sem categoria"}</span>
          {!nested && (
            <>
              <span>·</span>
              <span className="truncate">{card ? card.name : PAYMENT_LABELS[tx.payment_method as "pix"]}</span>
            </>
          )}
          {overdue && <OverdueTag />}
        </div>
      </div>
      <Amount tx={tx} className={cn("text-sm", tx.paid && "opacity-70")} />
      <RowMenu tx={tx} ctx={ctx} />
    </li>
  );
}

function MobileInvoice({ invoice, ctx }: { invoice: Invoice; ctx: Ctx }) {
  const { money } = usePrefs();
  const { open, setOpen, checked } = useInvoiceState(invoice);
  const overdue = !invoice.allPaid && invoice.dueDate < ctx.now;
  return (
    <li>
      <div className="flex items-center gap-3 py-3 pl-3 pr-1">
        <Checkbox
          checked={checked}
          label="Pagar fatura inteira"
          onCheckedChange={() =>
            ctx.actions.onTogglePaid(
              invoice.items.map((t) => t.id),
              !invoice.allPaid,
            )
          }
        />
        <button type="button" className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left" onClick={() => setOpen(!open)}>
          <span className="grid size-8 shrink-0 place-items-center rounded-lg text-white" style={{ background: invoice.card.color }}>
            <CardIcon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">Fatura: {invoice.card.name}</p>
            <p className="text-xs text-muted-foreground">
              <span className={cn(overdue && "font-medium text-expense")}>Vence {formatDate(invoice.dueDate)}</span> · {invoice.items.length}{" "}
              {invoice.items.length === 1 ? "item" : "itens"}
            </p>
          </div>
          <span className="text-sm font-semibold tabular">− {money(invoice.total)}</span>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
        <div className="w-8 shrink-0">
          <CardChip data={ctx.data} card={invoice.card} month={ctx.month}>
            <Info className="size-4 text-muted-foreground" />
          </CardChip>
        </div>
      </div>
      {open && (
        <ul className="mb-2 ml-3 divide-y divide-border rounded-xl border-l-2 bg-muted/30" style={{ borderLeftColor: invoice.card.color }}>
          {invoice.items.map((t) => (
            <MobileRow key={t.id} tx={t} ctx={ctx} nested />
          ))}
        </ul>
      )}
    </li>
  );
}
