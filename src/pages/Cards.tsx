import { useEffect, useState } from "react";
import { Archive, ArchiveRestore, CreditCard as CardIcon, Pencil, Plus, Trash2, Utensils } from "lucide-react";
import { toast } from "sonner";
import type { CardType, CreditCard } from "@/lib/types";
import { isBenefitCard } from "@/lib/types";
import { useAction, useFinance } from "@/hooks/useFinance";
import { cardInUse, createEntry } from "@/domain/operations";
import { CardUsageDetails } from "@/components/CardInfo";
import { Button } from "@/components/ui/button";
import { Card, ColorPicker, EmptyState, PALETTE, Segmented, Spinner } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/overlay";
import { Field, Input, MoneyInput } from "@/components/ui/form";
import { currentMonth, dateInMonth, today } from "@/lib/dates";
import { uid } from "@/lib/utils";

function CardDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange(o: boolean): void; editing: CreditCard | null }) {
  const { run, pending } = useAction();
  const [type, setType] = useState<CardType>("credit");
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[10]);
  const [limit, setLimit] = useState(0);
  const [closing, setClosing] = useState(1);
  const [due, setDue] = useState(10);
  const [recharge, setRecharge] = useState(0);
  const [rechargeDay, setRechargeDay] = useState(1);
  const [startBalance, setStartBalance] = useState(0);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setType(editing?.type ?? "credit");
    setName(editing?.name ?? "");
    setColor(editing?.color ?? PALETTE[10]);
    setLimit(editing?.credit_limit ?? 0);
    setClosing(editing?.closing_day ?? 1);
    setDue(editing?.due_day ?? 10);
    setRecharge(0);
    setRechargeDay(1);
    setStartBalance(0);
    setError(undefined);
  }, [open, editing]);

  const benefit = type === "benefit";
  const clampDay = (n: number) => Math.min(Math.max(n, 1), 31);

  async function save() {
    if (!name.trim()) return setError("Informe um nome");
    const payload = benefit
      ? // benefício não tem limite, fechamento nem vencimento (colunas obrigatórias recebem 1)
        { type, name: name.trim(), color, credit_limit: null, closing_day: 1, due_day: 1 }
      : { type, name: name.trim(), color, credit_limit: limit > 0 ? limit : null, closing_day: clampDay(closing), due_day: clampDay(due) };

    if (editing) {
      await run((r) => r.update("cards", [{ id: editing.id, ...payload }]));
      toast.success("Cartão atualizado");
    } else {
      const card: CreditCard = { id: uid(), archived: false, ...payload };
      await run(async (r, d) => {
        await r.insert("cards", [card]);
        if (!benefit) return;
        const withCard = { ...d, cards: [...d.cards, card] };
        const base = { description: null, category_id: null, payment_method: "benefit" as const, card_id: card.id, paid: true, installments: 1 };
        if (startBalance > 0)
          await createEntry(r, withCard, { ...base, kind: "income", name: `Saldo inicial ${card.name}`, amount: startBalance, date: today(), recurrence: "single" });
        if (recharge > 0)
          await createEntry(r, withCard, {
            ...base,
            kind: "income",
            name: `Recarga ${card.name}`,
            amount: recharge,
            date: dateInMonth(currentMonth(), clampDay(rechargeDay)),
            recurrence: "fixed",
          });
      });
      toast.success(benefit ? "Cartão benefício adicionado" : "Cartão adicionado");
    }
    onOpenChange(false);
  }

  const dayInput = (v: number, set: (n: number) => void) => (
    <Input type="number" inputMode="numeric" min={1} max={31} value={v} onChange={(e) => set(Number(e.target.value) || 1)} />
  );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Editar cartão" : "Novo cartão"}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={pending}>Salvar</Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {!editing && (
          <Segmented<CardType>
            className="w-full"
            value={type}
            onChange={setType}
            options={[
              { value: "credit", label: <><CardIcon /> Crédito</> },
              { value: "benefit", label: <><Utensils /> Benefício (VR/VA)</> },
            ]}
          />
        )}
        <div className="relative h-32 overflow-hidden rounded-2xl p-4 text-white shadow-md" style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}>
          {benefit ? <Utensils className="size-6 opacity-80" /> : <CardIcon className="size-6 opacity-80" />}
          <p className="absolute bottom-4 left-4 text-lg font-semibold">{name || "Nome do cartão"}</p>
          <p className="absolute bottom-4 right-4 text-xs opacity-80">{benefit ? "benefício" : `fecha ${closing} · vence ${due}`}</p>
        </div>
        <Field label="Nome" error={error}>
          <Input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={benefit ? "Ex.: VR Refeição" : "Ex.: Nubank"} />
        </Field>
        <Field label="Cor"><ColorPicker value={color} onChange={setColor} /></Field>

        {benefit ? (
          editing ? (
            <p className="text-xs text-muted-foreground">
              Para mudar o valor da recarga mensal, edite o lançamento de recarga na tela principal escolhendo "Este e os próximos".
            </p>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_7rem] gap-4">
                <Field label="Recarga mensal (opcional)" hint="Cria uma entrada fixa todo mês no cartão.">
                  <MoneyInput value={recharge} onChange={setRecharge} allowEmpty placeholder="Sem recarga" />
                </Field>
                <Field label="Dia da recarga">{dayInput(rechargeDay, setRechargeDay)}</Field>
              </div>
              <Field label="Saldo atual (opcional)" hint="Quanto já tem no cartão hoje. O saldo acumula de um mês para o outro.">
                <MoneyInput value={startBalance} onChange={setStartBalance} allowEmpty placeholder="R$ 0,00" />
              </Field>
            </>
          )
        ) : (
          <>
            <Field label="Limite (opcional)" hint="Usado para calcular quanto do limite está em uso, incluindo parcelas futuras.">
              <MoneyInput value={limit} onChange={setLimit} allowEmpty placeholder="Sem limite informado" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Dia do fechamento">{dayInput(closing, setClosing)}</Field>
              <Field label="Dia do vencimento">{dayInput(due, setDue)}</Field>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">
              Compras feitas a partir do dia do fechamento entram na fatura seguinte. Alterar esses dias não muda lançamentos já registrados.
            </p>
          </>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}

export default function CardsPage() {
  const { data } = useFinance();
  const { run } = useAction();
  const [editing, setEditing] = useState<CreditCard | null>(null);
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState<CreditCard | null>(null);

  if (!data) return <div className="grid place-items-center py-24 text-primary"><Spinner /></div>;
  const month = currentMonth();
  const active = data.cards.filter((c) => !c.archived);
  const activeCredit = active.filter((c) => !isBenefitCard(c));
  const activeBenefit = active.filter((c) => isBenefitCard(c));
  const archived = data.cards.filter((c) => c.archived);
  const removingInUse = removing ? cardInUse(data, removing.id) : false;

  const setArchived = async (c: CreditCard, archived: boolean) => {
    await run((r) => r.update("cards", [{ id: c.id, archived }]));
    toast.success(archived ? "Cartão arquivado" : "Cartão reativado");
  };

  const renderCard = (c: CreditCard) => (
    <Card key={c.id} className={c.archived ? "p-4 opacity-70" : "p-4"}>
      <CardUsageDetails data={data} card={c} month={month} />
      <div className="mt-4 flex justify-end gap-1 border-t border-border pt-3">
        <Button variant="ghost" size="sm" onClick={() => { setEditing(c); setOpen(true); }}><Pencil /> Editar</Button>
        <Button variant="ghost" size="sm" onClick={() => setArchived(c, !c.archived)}>
          {c.archived ? <><ArchiveRestore /> Reativar</> : <><Archive /> Arquivar</>}
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Excluir" className="hover:bg-expense-soft hover:text-expense" onClick={() => setRemoving(c)}>
          <Trash2 />
        </Button>
      </div>
    </Card>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Cartões</h1>
          <p className="text-sm text-muted-foreground">Dinheiro, Pix e Débito já vêm prontos. Cadastre aqui cartões de crédito e de benefício (VR/VA).</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus /> <span className="hidden sm:inline">Novo cartão</span>
        </Button>
      </div>

      {active.length === 0 ? (
        <Card><EmptyState icon={<CardIcon />} title="Nenhum cartão cadastrado">Adicione um cartão para acompanhar faturas, limite e saldo de benefícios.</EmptyState></Card>
      ) : (
        <>
          {activeCredit.length > 0 && (
            <>
              <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><CardIcon className="size-4" /> Crédito</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{activeCredit.map(renderCard)}</div>
            </>
          )}
          {activeBenefit.length > 0 && (
            <>
              <h2 className="mt-2 flex items-center gap-2 text-sm font-medium text-muted-foreground"><Utensils className="size-4" /> Benefício (VR/VA)</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{activeBenefit.map(renderCard)}</div>
            </>
          )}
        </>
      )}

      {archived.length > 0 && (
        <>
          <h2 className="mt-2 text-sm font-medium text-muted-foreground">Arquivados</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{archived.map(renderCard)}</div>
        </>
      )}

      <CardDialog open={open} onOpenChange={setOpen} editing={editing} />

      <Dialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Excluir "${removing?.name ?? ""}"?`}
        description={
          removingInUse
            ? "Este cartão possui lançamentos e não pode ser excluído sem perder o histórico. Você pode arquivá-lo: ele some das opções, mas o histórico continua."
            : "Este cartão não possui lançamentos."
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setRemoving(null)}>Cancelar</Button>
            {removingInUse ? (
              <Button onClick={() => { const c = removing!; setRemoving(null); setArchived(c, true); }}><Archive /> Arquivar</Button>
            ) : (
              <Button
                variant="destructive"
                onClick={async () => {
                  const c = removing!;
                  setRemoving(null);
                  await run((r) => r.remove("cards", [c.id]));
                  toast.success("Cartão excluído");
                }}
              >
                Excluir
              </Button>
            )}
          </>
        }
      />
    </div>
  );
}
