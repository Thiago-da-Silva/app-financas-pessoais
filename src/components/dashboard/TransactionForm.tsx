import { useEffect, useMemo, useState } from "react";
import { Banknote, CreditCard as CardIcon, Landmark, Plus, QrCode, Repeat, Utensils } from "lucide-react";
import { toast } from "sonner";
import type { FinanceData, Kind, PaymentMethod, Recurrence, Transaction } from "@/lib/types";
import { isBenefitCard } from "@/lib/types";
import { benefitSummary, competenceMonth, installmentMap, invoiceDueDate } from "@/domain/finance";
import { createEntry, editEntry, type EditScope, type EntryInput } from "@/domain/operations";
import { useAction } from "@/hooks/useFinance";
import { usePrefs } from "@/hooks/prefs";
import { Dialog } from "@/components/ui/overlay";
import { Field, Input, MoneyInput, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { RichSelect, Segmented, Switch } from "@/components/ui/misc";
import { CategoryDialog } from "@/components/CategoryForm";
import { currentMonth, dateInMonth, formatDate, monthLabel, monthOf, parts, today } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type FormMode = { type: "new"; kind?: Kind } | { type: "edit"; tx: Transaction } | { type: "duplicate"; tx: Transaction };

interface State {
  kind: Kind;
  name: string;
  description: string;
  amount: number;
  category_id: string;
  pay: string; // cash | pix | debit | card:<id> (crédito ou benefício)
  date: string;
  paid: boolean;
  recurrence: Recurrence;
  installments: number;
}

const PM_ICONS = { cash: Banknote, pix: QrCode, debit: Landmark } as const;

export function TransactionForm({
  open,
  onOpenChange,
  data,
  month,
  mode,
}: {
  open: boolean;
  onOpenChange(o: boolean): void;
  data: FinanceData;
  month: string;
  mode: FormMode;
}) {
  const { run, pending } = useAction();
  const { money } = usePrefs();
  const [s, setS] = useState<State>(() => initial());
  const [errors, setErrors] = useState<Partial<Record<keyof State, string>>>({});
  const [askScope, setAskScope] = useState(false);
  const [catOpen, setCatOpen] = useState(false);

  const editingTx = mode.type === "edit" ? mode.tx : null;
  const series = editingTx?.series_id ? data.series.find((x) => x.id === editingTx.series_id) : undefined;
  const instInfo = useMemo(() => (editingTx ? installmentMap(data).get(editingTx.id) : undefined), [data, editingTx]);

  function initial(): State {
    if (mode.type !== "new") {
      const t = mode.tx;
      const ser = t.series_id ? data.series.find((x) => x.id === t.series_id) : undefined;
      const info = mode.type === "edit" ? installmentMap(data).get(t.id) : undefined;
      return {
        kind: t.kind,
        name: t.name,
        description: t.description ?? "",
        amount: t.amount,
        category_id: t.category_id ?? "",
        pay: t.card_id ? `card:${t.card_id}` : t.payment_method,
        date: mode.type === "duplicate" ? defaultDate() : t.date,
        paid: mode.type === "duplicate" ? false : t.paid,
        recurrence: mode.type === "edit" && ser ? ser.type : "single",
        installments: info?.total ?? 2,
      };
    }
    return {
      kind: mode.kind ?? "expense",
      name: "",
      description: "",
      amount: 0,
      category_id: "",
      pay: "pix",
      date: defaultDate(),
      paid: false,
      recurrence: "single",
      installments: 2,
    };
  }

  function defaultDate() {
    return month === currentMonth() ? today() : dateInMonth(month, parts(today()).d);
  }

  useEffect(() => {
    if (open) {
      setS(initial());
      setErrors({});
      setAskScope(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  const set = <K extends keyof State>(k: K, v: State[K]) => setS((p) => ({ ...p, [k]: v }));

  const activeCards = data.cards.filter((c) => !c.archived || s.pay === `card:${c.id}`);
  const selectedCard = s.pay.startsWith("card:") ? data.cards.find((c) => c.id === s.pay.slice(5)) : undefined;
  const isBenefit = isBenefitCard(selectedCard);
  const invMonth = selectedCard && !isBenefit && s.date ? competenceMonth(s.date, selectedCard) : null;
  const benefitBalance = selectedCard && isBenefit && s.date ? benefitSummary(data, monthOf(s.date), selectedCard.id).balance : null;
  const creditCards = activeCards.filter((c) => !isBenefitCard(c));
  const benefitCards = activeCards.filter((c) => isBenefitCard(c));

  function dateHint() {
    if (selectedCard && invMonth)
      return `Fatura de ${monthLabel(invMonth)} · vence ${formatDate(invoiceDueDate(invMonth, selectedCard))}`;
    if (benefitBalance != null) {
      // ao editar, o próprio lançamento já está no saldo
      const own = editingTx && editingTx.card_id === selectedCard!.id ? (editingTx.kind === "income" ? editingTx.amount : -editingTx.amount) : 0;
      const after = benefitBalance - own + (s.kind === "income" ? s.amount : -s.amount);
      return after < 0
        ? `Saldo insuficiente: o cartão ficará em ${money(after)}`
        : `Saldo do cartão após este lançamento: ${money(after)}`;
    }
    return undefined;
  }

  function toInput(): EntryInput {
    const isCard = s.pay.startsWith("card:");
    return {
      kind: s.kind,
      name: s.name,
      description: s.description || null,
      amount: s.amount,
      category_id: s.category_id || null,
      payment_method: (isCard ? (isBenefit ? "benefit" : "card") : s.pay) as PaymentMethod,
      card_id: isCard ? s.pay.slice(5) : null,
      date: s.date,
      paid: isBenefit ? true : s.paid, // benefício é debitado na hora
      recurrence: s.recurrence,
      installments: s.installments,
    };
  }

  function validate() {
    const e: typeof errors = {};
    if (!s.name.trim()) e.name = "Informe um nome";
    if (s.amount <= 0) e.amount = "Informe um valor";
    if (!s.date) e.date = "Informe a data";
    if (s.recurrence === "installment" && (s.installments < 1 || s.installments > 120)) e.installments = "Entre 1 e 120";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save(scope?: EditScope) {
    if (!validate()) return;
    const input = toInput();
    if (mode.type === "edit") {
      if (series && !scope) {
        setAskScope(true);
        return;
      }
      await run((repo, d) => editEntry(repo, d, mode.tx, input, scope ?? "one"));
      toast.success("Lançamento atualizado");
    } else {
      await run((repo, d) => createEntry(repo, d, input));
      const label =
        input.recurrence === "installment"
          ? `${input.installments}x de ${money(input.amount)}`
          : input.recurrence === "fixed"
            ? "lançamento fixo mensal"
            : money(input.amount);
      toast.success(input.kind === "income" ? "Entrada adicionada" : "Saída adicionada", { description: `${input.name} · ${label}` });
    }
    setAskScope(false);
    onOpenChange(false);
  }

  const title = mode.type === "edit" ? "Editar lançamento" : mode.type === "duplicate" ? "Duplicar lançamento" : "Novo lançamento";

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={() => save()} disabled={pending}>
              {mode.type === "edit" ? "Salvar alterações" : "Adicionar"}
            </Button>
          </>
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Segmented
            className="w-full"
            value={s.kind}
            onChange={(v) => set("kind", v)}
            options={[
              { value: "expense", label: "Saída", activeClass: "!text-expense" },
              { value: "income", label: "Entrada", activeClass: "!text-income" },
            ]}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" error={errors.name} className="sm:col-span-2">
              <Input
                value={s.name}
                maxLength={120}
                onChange={(e) => set("name", e.target.value)}
                placeholder={s.kind === "expense" ? "Ex.: Supermercado" : "Ex.: Salário"}
                autoFocus={mode.type === "new"}
              />
            </Field>
            <Field
              label={s.recurrence === "installment" ? "Valor da parcela" : "Valor"}
              error={errors.amount}
              hint={
                s.recurrence === "installment" && s.amount > 0 && s.installments > 1
                  ? `Total: ${money(s.amount * s.installments)}`
                  : undefined
              }
            >
              <MoneyInput value={s.amount} onChange={(v) => set("amount", v)} />
            </Field>
            <Field
              label="Data"
              error={errors.date}
              hint={dateHint()}
            >
              <Input type="date" value={s.date} onChange={(e) => set("date", e.target.value)} />
            </Field>
          </div>

          <Field label="Categoria">
            <div className="flex gap-2">
              <RichSelect
                value={s.category_id}
                onChange={(v) => set("category_id", v === "__none" ? "" : v)}
                placeholder="Selecione uma categoria"
                items={[
                  { value: "__none", label: "Sem categoria", color: "#94a3b8" },
                  ...data.categories
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((c) => ({ value: c.id, label: c.name, color: c.color })),
                ]}
              />
              <Button variant="outline" size="icon" className="shrink-0" onClick={() => setCatOpen(true)} aria-label="Nova categoria" title="Nova categoria">
                <Plus />
              </Button>
            </div>
          </Field>

          <Field label="Forma de pagamento">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {(["pix", "debit", "cash"] as const).map((pm) => {
                const Icon = PM_ICONS[pm];
                return (
                  <PayChip key={pm} active={s.pay === pm} onClick={() => set("pay", pm)}>
                    <Icon className="size-4" />
                    {{ cash: "Dinheiro", pix: "Pix", debit: "Débito" }[pm]}
                  </PayChip>
                );
              })}
              {creditCards.map((c) => (
                <PayChip key={c.id} active={s.pay === `card:${c.id}`} onClick={() => set("pay", `card:${c.id}`)} color={c.color}>
                  <CardIcon className="size-4" style={{ color: c.color }} />
                  <span className="truncate">{c.name}</span>
                </PayChip>
              ))}
              {benefitCards.map((c) => (
                <PayChip key={c.id} active={s.pay === `card:${c.id}`} onClick={() => set("pay", `card:${c.id}`)} color={c.color}>
                  <Utensils className="size-4" style={{ color: c.color }} />
                  <span className="truncate">{c.name}</span>
                </PayChip>
              ))}
            </div>
          </Field>

          <Field label="Repetição">
            {series ? (
              <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5 text-sm">
                <Repeat className="size-4 text-muted-foreground" />
                {series.type === "fixed" ? "Lançamento fixo mensal" : `Parcelado — parcela ${instInfo?.n ?? "?"} de ${instInfo?.total ?? "?"}`}
              </div>
            ) : (
              <Segmented
                className="w-full"
                value={s.recurrence}
                onChange={(v) => set("recurrence", v)}
                options={[
                  { value: "single", label: "Único" },
                  { value: "installment", label: "Parcelado" },
                  { value: "fixed", label: "Fixo mensal" },
                ]}
              />
            )}
          </Field>

          {s.recurrence === "installment" && (
            <Field
              label="Quantidade de parcelas"
              error={errors.installments}
              hint={
                series
                  ? "Diminuir remove as últimas parcelas; aumentar adiciona novas no final."
                  : "Conta o mês selecionado e os seguintes."
              }
            >
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => set("installments", Math.max(1, s.installments - 1))} aria-label="Menos">
                  −
                </Button>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={120}
                  className="w-20 text-center tabular"
                  value={s.installments}
                  onChange={(e) => set("installments", Number(e.target.value) || 1)}
                />
                <Button variant="outline" size="icon" onClick={() => set("installments", Math.min(120, s.installments + 1))} aria-label="Mais">
                  +
                </Button>
                <span className="text-sm text-muted-foreground">vezes</span>
              </div>
            </Field>
          )}
          {s.recurrence === "fixed" && !series && (
            <p className="-mt-2 text-xs text-muted-foreground">Repete todo mês até você excluir ou encerrar. Ideal para salário, aluguel e assinaturas.</p>
          )}

          {isBenefit ? (
            <p className="-mt-1 text-xs text-muted-foreground">
              {s.kind === "income"
                ? "Recarga no cartão benefício: soma ao saldo do cartão (separado do saldo geral)."
                : "Gasto no cartão benefício: é descontado do saldo do cartão, sem precisar marcar como pago."}
            </p>
          ) : (
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">{s.kind === "income" ? "Já recebido" : "Já pago"}</p>
                {s.recurrence !== "single" && !series && <p className="text-xs text-muted-foreground">Vale apenas para o primeiro mês.</p>}
              </div>
              <Switch checked={s.paid} onCheckedChange={(v) => set("paid", v)} />
            </label>
          )}

          <Field label="Descrição (opcional)">
            <Textarea value={s.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="Detalhes, observações..." />
          </Field>
          <button type="submit" className="hidden" />
        </form>
      </Dialog>

      <Dialog
        open={askScope}
        onOpenChange={setAskScope}
        title="Aplicar alteração a..."
        description="Este lançamento faz parte de uma série. Meses anteriores nunca são alterados."
      >
        <div className="flex flex-col gap-2 pb-2">
          <Button variant="outline" className="h-auto justify-start py-3 text-left" onClick={() => save("one")} disabled={pending}>
            <div>
              <p className="font-medium">Somente este mês</p>
              <p className="text-xs font-normal text-muted-foreground">Os demais meses continuam como estão.</p>
            </div>
          </Button>
          <Button variant="outline" className="h-auto justify-start py-3 text-left" onClick={() => save("following")} disabled={pending}>
            <div>
              <p className="font-medium">Este e os próximos meses</p>
              <p className="text-xs font-normal text-muted-foreground">O histórico anterior é mantido.</p>
            </div>
          </Button>
        </div>
      </Dialog>

      <CategoryDialog open={catOpen} onOpenChange={setCatOpen} onCreated={(c) => set("category_id", c.id)} />
    </>
  );
}

function PayChip({
  active,
  onClick,
  children,
  color,
}: {
  active: boolean;
  onClick(): void;
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-10 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-input px-2 text-sm transition hover:bg-accent",
        active && "border-transparent bg-primary/10 font-medium text-foreground ring-2 ring-primary",
      )}
      style={active && color ? { boxShadow: `0 0 0 2px ${color}`, background: `${color}1a` } : undefined}
    >
      {children}
    </button>
  );
}
