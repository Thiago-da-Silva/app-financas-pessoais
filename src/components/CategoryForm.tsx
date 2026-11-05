import { useEffect, useState } from "react";
import type { Category } from "@/lib/types";
import { Dialog } from "@/components/ui/overlay";
import { Field, Input, MoneyInput } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { ColorPicker, Dot, PALETTE } from "@/components/ui/misc";
import { useAction } from "@/hooks/useFinance";
import { uid } from "@/lib/utils";
import { toast } from "sonner";

export function CategoryDialog({
  open,
  onOpenChange,
  editing,
  onCreated,
}: {
  open: boolean;
  onOpenChange(o: boolean): void;
  editing?: Category | null;
  onCreated?(c: Category): void;
}) {
  const { run, pending } = useAction();
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [budget, setBudget] = useState(0);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setColor(editing?.color ?? PALETTE[Math.floor(Math.random() * 16)]);
    setBudget(editing?.budget ?? 0);
    setError(undefined);
  }, [open, editing]);

  async function save() {
    if (!name.trim()) return setError("Informe um nome");
    const payload = { name: name.trim(), color, budget: budget > 0 ? budget : null };
    if (editing) {
      await run((repo) => repo.update("categories", [{ id: editing.id, ...payload }]));
      toast.success("Categoria atualizada");
    } else {
      const c: Category = { id: uid(), ...payload };
      await run((repo) => repo.insert("categories", [c]));
      toast.success("Categoria criada");
      onCreated?.(c);
    }
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Editar categoria" : "Nova categoria"}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={pending}>
            Salvar
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
        <Field label="Nome" error={error}>
          <div className="relative">
            <Dot color={color} className="absolute left-3 top-1/2 size-3 -translate-y-1/2" />
            <Input autoFocus className="pl-8" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Mercado" />
          </div>
        </Field>
        <Field label="Cor">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <Field label="Orçamento mensal (opcional)" hint="Usado para acompanhar quanto você já gastou na categoria no mês.">
          <MoneyInput value={budget} onChange={setBudget} allowEmpty placeholder="Sem orçamento" />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}
