import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import type { FinanceData, Transaction } from "@/lib/types";
import type { DeleteScope } from "@/domain/operations";
import { installmentMap } from "@/domain/finance";
import { usePrefs } from "@/hooks/prefs";
import { Dialog } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export function DeleteDialog({
  tx,
  data,
  onClose,
  onConfirm,
}: {
  tx: Transaction | null;
  data: FinanceData;
  onClose(): void;
  onConfirm(tx: Transaction, scope: DeleteScope): void;
}) {
  const { money } = usePrefs();
  const [scope, setScope] = useState<DeleteScope>("one");
  const [confirmed, setConfirmed] = useState(false);
  const series = tx?.series_id ? data.series.find((s) => s.id === tx.series_id) : undefined;
  const inst = tx ? installmentMap(data).get(tx.id) : undefined;

  useEffect(() => {
    setScope("one");
    setConfirmed(false);
  }, [tx]);

  const options: { value: DeleteScope; label: string; hint: string }[] = series
    ? [
        { value: "one", label: "Somente este mês", hint: inst ? `Remove apenas a parcela ${inst.n}/${inst.total}.` : "Remove só esta ocorrência." },
        {
          value: "following",
          label: "Este e os próximos",
          hint: series.type === "fixed" ? "Encerra o lançamento fixo a partir deste mês." : "Remove esta parcela e as seguintes.",
        },
        { value: "all", label: "Toda a série", hint: "Remove todos os meses, inclusive os anteriores." },
      ]
    : [];

  return (
    <Dialog
      open={!!tx}
      onOpenChange={(o) => !o && onClose()}
      title="Excluir lançamento?"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={!confirmed} onClick={() => tx && onConfirm(tx, scope)}>
            Excluir
          </Button>
        </>
      }
    >
      {tx && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-xl bg-muted px-3 py-2.5">
            <TriangleAlert className="size-5 shrink-0 text-warning" />
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium">
                {tx.name} {inst && <span className="text-muted-foreground">({inst.n}/{inst.total})</span>}
              </p>
              <p className="text-muted-foreground">{money(tx.amount)}</p>
            </div>
          </div>

          {series && (
            <div className="flex flex-col gap-2" role="radiogroup">
              {options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={scope === o.value}
                  onClick={() => setScope(o.value)}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 text-left transition hover:bg-accent/50",
                    scope === o.value && "border-expense/50 bg-expense-soft",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2 border-input",
                      scope === o.value && "border-expense",
                    )}
                  >
                    {scope === o.value && <span className="size-2 rounded-full bg-expense" />}
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{o.label}</span>
                    <span className="block text-xs text-muted-foreground">{o.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-3 text-sm">
            <Checkbox checked={confirmed} onCheckedChange={setConfirmed} label="Confirmar exclusão" color="var(--expense)" />
            Sim, quero excluir {scope === "one" ? "este lançamento" : "esses lançamentos"}.
          </label>
        </div>
      )}
    </Dialog>
  );
}
