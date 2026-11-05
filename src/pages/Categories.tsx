import { useMemo, useState } from "react";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Category } from "@/lib/types";
import { useAction, useFinance } from "@/hooks/useFinance";
import { usePrefs } from "@/hooks/prefs";
import { deleteCategory } from "@/domain/operations";
import { CategoryDialog } from "@/components/CategoryForm";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Spinner } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/overlay";
import { NativeSelect } from "@/components/ui/form";
import { currentMonth } from "@/lib/dates";

export default function CategoriesPage() {
  const { data } = useFinance();
  const { run, pending } = useAction();
  const { money } = usePrefs();
  const [editing, setEditing] = useState<Category | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [removing, setRemoving] = useState<Category | null>(null);
  const [moveTo, setMoveTo] = useState("");

  const stats = useMemo(() => {
    const m = new Map<string, { count: number; month: number }>();
    const cm = currentMonth();
    for (const t of data?.transactions ?? []) {
      if (!t.category_id) continue;
      const s = m.get(t.category_id) ?? { count: 0, month: 0 };
      s.count++;
      if (t.month === cm && t.kind === "expense") s.month += t.amount;
      m.set(t.category_id, s);
    }
    return m;
  }, [data]);

  if (!data) return <div className="grid place-items-center py-24 text-primary"><Spinner /></div>;

  const sorted = data.categories.slice().sort((a, b) => a.name.localeCompare(b.name));
  const inUse = removing ? (stats.get(removing.id)?.count ?? 0) : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Categorias</h1>
          <p className="text-sm text-muted-foreground">Organize seus lançamentos com nomes e cores.</p>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus /> <span className="hidden sm:inline">Nova categoria</span>
        </Button>
      </div>

      {sorted.length === 0 ? (
        <Card><EmptyState icon={<Tags />} title="Nenhuma categoria ainda" /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((c) => {
            const s = stats.get(c.id);
            return (
              <Card key={c.id} className="flex items-center gap-3 p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: c.color }}>
                  <Tags className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {s?.count ?? 0} lançamentos
                    {c.budget ? ` · orçamento ${money(c.budget)}` : ""}
                  </p>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label="Editar" onClick={() => { setEditing(c); setFormOpen(true); }}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Excluir" className="hover:bg-expense-soft hover:text-expense" onClick={() => { setRemoving(c); setMoveTo(""); }}>
                  <Trash2 />
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <CategoryDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} />

      <Dialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Excluir "${removing?.name ?? ""}"?`}
        description={inUse ? `Esta categoria está em ${inUse} lançamento(s). Escolha para onde movê-los.` : "Esta categoria não está em uso."}
        footer={
          <>
            <Button variant="outline" onClick={() => setRemoving(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={async () => {
                const c = removing!;
                setRemoving(null);
                await run((r, d) => deleteCategory(r, d, c.id, moveTo || null));
                toast.success("Categoria excluída");
              }}
            >
              Excluir
            </Button>
          </>
        }
      >
        {inUse > 0 && (
          <NativeSelect value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label="Mover lançamentos para">
            <option value="">Deixar sem categoria</option>
            {sorted.filter((c) => c.id !== removing?.id).map((c) => (
              <option key={c.id} value={c.id}>Mover para {c.name}</option>
            ))}
          </NativeSelect>
        )}
      </Dialog>
    </div>
  );
}
