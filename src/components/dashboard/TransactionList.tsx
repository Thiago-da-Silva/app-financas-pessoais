import { Fragment, useMemo, useState } from "react";
import { ChevronDown, Copy, CreditCard as CardIcon, Ellipsis, Info, Pencil, Receipt, Repeat, Trash2, Utensils } from "lucide-react";
import type { Category, CreditCard, FinanceData, Transaction } from "@/lib/types";
import { PAYMENT_LABELS } from "@/lib/types";
import { installmentMap, isBenefitTx, isOverdue, isUndefinedAmount, type BenefitGroup, type Invoice } from "@/domain/finance";
import { orderListItems, type ListItem, type ListSection } from "@/domain/listOrder";
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

  // Cartões no topo, depois pendentes e por fim os já pagos
  const sections: ListSection[] = useMemo(() => orderListItems(data, month, transactions), [transactions, data, month]);
  // Seções recolhidas pelo usuário. Não é salvo: ao abrir o app, todas começam abertas.
  const [collapsed, setCollapsed] = useState<Set<ListSection["key"]>>(() => new Set());
  const toggleSection = (key: ListSection["key"]) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (!sections.length) {
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
          {sections.map((section) => (
            <Fragment key={section.key}>
              <tr>
                <td colSpan={7} className="bg-muted/40 p-0">
                  <SectionTitle section={section} open={!collapsed.has(section.key)} onToggle={() => toggleSection(section.key)} className="px-4" />
                </td>
              </tr>
              {!collapsed.has(section.key) && section.items.map((it) => <DesktopItem key={itemKey(it)} it={it} ctx={ctx} />)}
            </Fragment>
          ))}
        </tbody>
      </table>

      {/* Celular: lista compacta */}
      <ul className="divide-y divide-border pb-16 md:hidden">
        {sections.map((section) => (
          <Fragment key={section.key}>
            <li className="bg-muted/40">
              <SectionTitle section={section} open={!collapsed.has(section.key)} onToggle={() => toggleSection(section.key)} className="px-3" />
            </li>
            {!collapsed.has(section.key) && section.items.map((it) => <MobileItem key={itemKey(it)} it={it} ctx={ctx} />)}
          </Fragment>
        ))}
      </ul>
    </>
  );
}

const itemKey = (it: ListItem) =>
  it.type === "tx" ? it.tx.id : it.type === "invoice" ? `inv-${it.invoice.card.id}` : `ben-${it.group.card.id}`;

function SectionTitle({
  section,
  open,
  onToggle,
  className,
}: {
  section: ListSection;
  open: boolean;
  onToggle(): void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      title={open ? `Recolher ${section.title.toLowerCase()}` : `Expandir ${section.title.toLowerCase()}`}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition hover:text-foreground",
        className,
      )}
    >
      <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", !open && "-rotate-90")} />
      {section.title}
      <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium normal-case tracking-normal">{section.items.length}</span>
      {!open && <span className="ml-auto text-[10px] font-medium normal-case tracking-normal">recolhido</span>}
    </button>
  );
}

function DesktopItem({ it, ctx }: { it: ListItem; ctx: Ctx }) {
  if (it.type === "tx") return <DesktopRow tx={it.tx} ctx={ctx} />;
  if (it.type === "invoice") return <DesktopInvoice invoice={it.invoice} ctx={ctx} />;
  return <DesktopBenefit group={it.group} ctx={ctx} />;
}

function MobileItem({ it, ctx }: { it: ListItem; ctx: Ctx }) {
  if (it.type === "tx") return <MobileRow tx={it.tx} ctx={ctx} />;
  if (it.type === "invoice") return <MobileInvoice invoice={it.invoice} ctx={ctx} />;
  return <MobileBenefit group={it.group} ctx={ctx} />;
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
  if (isUndefinedAmount(tx))
    return (
      <span
        className={cn("whitespace-nowrap rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning", className)}
        title="Valor ainda não definido: edite o lançamento para informar"
      >
        A definir
      </span>
    );
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
  const benefit = isBenefitTx(tx);
  const done = tx.paid && !benefit;
  const overdue = isOverdue(tx, ctx.cards, ctx.now);
  const card = tx.card_id ? ctx.cards.get(tx.card_id) : undefined;
  return (
    <tr
      className={cn(
        "group border-b border-border/70 transition-colors last:border-0 hover:bg-accent/40",
        nested && "bg-muted/30",
        done && "text-muted-foreground",
      )}
    >
      <td className={cn("py-2.5 pl-4 tabular", nested && "text-muted-foreground", overdue && "font-medium text-expense")}>{formatDate(tx.date)}</td>
      <td className={cn("max-w-0 py-2.5 pr-3", nested && "pl-6")}>
        <div className={cn("flex items-center gap-2", nested && "border-l-2 pl-3")} style={nested && card ? { borderColor: card.color } : undefined}>
          <NameCell tx={tx} ctx={ctx} className={cn(done && "[&>span:first-child]:text-muted-foreground")} />
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
        <Amount tx={tx} className={cn(done && "opacity-70")} />
      </td>
      <td className="py-2.5 text-center">
        {benefit ? (
          <span className="text-xs text-muted-foreground" title="Débito automático no cartão benefício">auto</span>
        ) : (
          <Checkbox
            checked={tx.paid}
            onCheckedChange={(v) => ctx.actions.onTogglePaid([tx.id], v)}
            label={tx.paid ? "Marcar como não pago" : "Marcar como pago"}
          />
        )}
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
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {invoice.items.length} {invoice.items.length === 1 ? "item" : "itens"}
            </span>
            {overdue && <OverdueTag />}
          </div>
        </td>
        <td className="py-3 text-xs text-muted-foreground">{invoice.somePaid && !invoice.allPaid ? `${money(invoice.paidTotal)} pago` : ""}</td>
        <td className="py-3 text-muted-foreground">Crédito</td>
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
  const benefit = isBenefitTx(tx);
  const done = tx.paid && !benefit;
  const overdue = isOverdue(tx, ctx.cards, ctx.now);
  const card = tx.card_id ? ctx.cards.get(tx.card_id) : undefined;
  const c = tx.category_id ? ctx.categories.get(tx.category_id) : undefined;
  return (
    <li className="flex items-center gap-3 py-3 pl-3 pr-1">
      {benefit ? (
        <span className="size-5 shrink-0" aria-hidden />
      ) : (
        <Checkbox
          checked={tx.paid}
          onCheckedChange={(v) => ctx.actions.onTogglePaid([tx.id], v)}
          label={tx.paid ? "Marcar como não pago" : "Marcar como pago"}
        />
      )}
      <div className="min-w-0 flex-1" onClick={() => ctx.actions.onEdit(tx)}>
        <NameCell tx={tx} ctx={ctx} className={cn(done && "[&>span:first-child]:text-muted-foreground [&>span:first-child]:line-through decoration-muted-foreground/40")} />
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn("tabular", overdue && "font-medium text-expense")}>{formatDate(tx.date)}</span>
          <span>·</span>
          <Dot color={c?.color ?? "#94a3b8"} className="size-2" />
          <span className="truncate">{c?.name ?? "Sem categoria"}</span>
          {!nested && !card && (
            <>
              <span>·</span>
              <span className="shrink-0">{PAYMENT_LABELS[tx.payment_method as "pix"]}</span>
            </>
          )}
          {overdue && <OverdueTag />}
        </div>
      </div>
      <Amount tx={tx} className={cn("text-sm", done && "opacity-70")} />
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
          <span className="whitespace-nowrap text-sm font-semibold tabular">− {money(invoice.total)}</span>
          <ChevronDown className={cn("mr-2 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {open && (
        <div className="mb-3 ml-3 mr-1 overflow-hidden rounded-xl border-l-2 bg-muted/40" style={{ borderLeftColor: invoice.card.color }}>
          <div className="flex items-center justify-between px-3 pt-2.5 text-xs text-muted-foreground">
            <CardChip data={ctx.data} card={invoice.card} month={ctx.month}>
              Ver limite do cartão
            </CardChip>
            {invoice.somePaid && !invoice.allPaid && <span>{money(invoice.paidTotal)} pago</span>}
          </div>
          <ul className="divide-y divide-border">
            {invoice.items.map((t) => (
              <MobileRow key={t.id} tx={t} ctx={ctx} nested />
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------
// Cartão benefício (VR/VA): grupo com recargas e gastos do mês
// ---------------------------------------------------------------------

function BenefitTotals({ group, className, stacked }: { group: BenefitGroup; className?: string; stacked?: boolean }) {
  const { money } = usePrefs();
  return (
    <span className={cn("whitespace-nowrap text-xs text-muted-foreground tabular", stacked && "flex flex-col items-end leading-tight", className)}>
      {group.income > 0 && <span className="text-income">+ {money(group.income)}</span>}
      {!stacked && group.income > 0 && group.expense > 0 && " · "}
      {group.expense > 0 && <span>− {money(group.expense)}</span>}
    </span>
  );
}

function BalanceTag({ group }: { group: BenefitGroup }) {
  const { money } = usePrefs();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium tabular",
        group.balance < 0 ? "bg-expense-soft text-expense" : "bg-warning-soft text-warning",
      )}
    >
      Saldo {money(group.balance)}
    </span>
  );
}

function DesktopBenefit({ group, ctx }: { group: BenefitGroup; ctx: Ctx }) {
  const [open, setOpen] = useState(false);
  return (
    <Fragment>
      <tr className="cursor-pointer border-b border-border/70 transition-colors hover:bg-accent/40" onClick={() => setOpen(!open)}>
        <td className="py-3 pl-4 tabular">{formatDate(group.firstDate)}</td>
        <td className="max-w-0 py-3 pr-3">
          <div className="flex min-w-0 items-center gap-2">
            <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
            <span className="grid size-6 shrink-0 place-items-center rounded-md text-white" style={{ background: group.card.color }}>
              <Utensils className="size-3.5" />
            </span>
            <span className="shrink-0 font-semibold">Benefício:</span>
            <CardChip data={ctx.data} card={group.card} month={ctx.month}>
              <span className="font-semibold">{group.card.name}</span>
            </CardChip>
          </div>
        </td>
        <td className="py-3 pr-3">
          <BalanceTag group={group} />
        </td>
        <td className="py-3 text-muted-foreground">
          {group.items.length} {group.items.length === 1 ? "item" : "itens"}
        </td>
        <td className="py-3 pr-4 text-right">
          <BenefitTotals group={group} stacked className="font-semibold" />
        </td>
        <td className="py-3 text-center text-xs text-muted-foreground">auto</td>
        <td className="py-3 pr-4 text-right">
          <Button variant="ghost" size="sm" onClick={(e) => (e.stopPropagation(), setOpen(!open))}>
            {open ? "Ocultar" : "Ver itens"}
          </Button>
        </td>
      </tr>
      {open && group.items.map((t) => <DesktopRow key={t.id} tx={t} ctx={ctx} nested />)}
    </Fragment>
  );
}

function MobileBenefit({ group, ctx }: { group: BenefitGroup; ctx: Ctx }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button type="button" className="flex w-full cursor-pointer items-center gap-3 py-3 pl-3 pr-1 text-left" onClick={() => setOpen(!open)}>
        <span className="size-5 shrink-0" aria-hidden />
        <span className="grid size-8 shrink-0 place-items-center rounded-lg text-white" style={{ background: group.card.color }}>
          <Utensils className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">Benefício: {group.card.name}</p>
          <BenefitTotals group={group} />
        </div>
        <BalanceTag group={group} />
        <ChevronDown className={cn("mr-2 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mb-3 ml-3 mr-1 overflow-hidden rounded-xl border-l-2 bg-muted/40" style={{ borderLeftColor: group.card.color }}>
          <div className="px-3 pt-2.5 text-xs text-muted-foreground">
            <CardChip data={ctx.data} card={group.card} month={ctx.month}>
              Ver saldo do cartão
            </CardChip>
          </div>
          <ul className="divide-y divide-border">
            {group.items.map((t) => (
              <MobileRow key={t.id} tx={t} ctx={ctx} nested />
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
