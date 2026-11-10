import { useEffect, useRef, useState } from "react";
import { Camera, Download, KeyRound, LogOut, Monitor, Moon, RotateCcw, Sun, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/data/session";
import { useAction, useFinance } from "@/hooks/useFinance";
import { usePrefs, type Theme } from "@/hooks/prefs";
import { Avatar } from "@/components/layout/Avatar";
import { Button } from "@/components/ui/button";
import { Card, Segmented, Spinner, Switch } from "@/components/ui/misc";
import { Field, Input, MoneyInput } from "@/components/ui/form";
import { Dialog } from "@/components/ui/overlay";
import { exportCsv } from "@/lib/csv";
import { today } from "@/lib/dates";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

export default function ProfilePage() {
  const { data } = useFinance();
  const { run, pending } = useAction();
  const { mode, email, signOut, updatePassword, resetDemo, repo } = useSession();
  const { theme, setTheme } = usePrefs();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [initial, setInitial] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (data) {
      setName(data.profile.name);
      setInitial(data.profile.initial_balance);
    }
  }, [data]);

  if (!data) return <div className="grid place-items-center py-24 text-primary"><Spinner /></div>;

  async function onAvatar(file: File | undefined) {
    if (!file || !repo) return;
    if (!file.type.startsWith("image/")) return toast.error("Escolha um arquivo de imagem");
    if (file.size > 5 * 1024 * 1024) return toast.error("A imagem deve ter no máximo 5 MB");
    setUploading(true);
    try {
      const url = await repo.uploadAvatar(file);
      await run((r) => r.updateProfile({ avatar_url: url }));
      toast.success("Foto atualizada");
    } catch (e) {
      toast.error("Falha no upload", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <h1 className="text-xl font-semibold sm:text-2xl">Perfil e configurações</h1>

      <Section title="Seus dados">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="relative self-center">
            <Avatar name={name} url={data.profile.avatar_url} size={88} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 grid size-9 cursor-pointer place-items-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow"
              aria-label="Trocar foto"
            >
              {uploading ? <Spinner className="size-4" /> : <Camera className="size-4" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onAvatar(e.target.files?.[0])} />
          </div>
          <div className="flex flex-1 flex-col gap-3">
            <Field label="Nome"><Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="E-mail"><Input value={email ?? ""} disabled /></Field>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {data.profile.avatar_url && (
            <Button variant="ghost" onClick={() => run((r) => r.updateProfile({ avatar_url: null }))}>Remover foto</Button>
          )}
          <Button
            disabled={pending || name === data.profile.name}
            onClick={async () => {
              await run((r) => r.updateProfile({ name: name.trim() }));
              toast.success("Nome atualizado");
            }}
          >
            Salvar
          </Button>
        </div>
      </Section>

      <Section title="Saldo" description="Como o saldo é levado de um mês para o outro.">
        <label className="flex cursor-pointer items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Acumular saldo entre meses</p>
            <p className="text-xs text-muted-foreground">Mostra o card "Saldo anterior" com o saldo inicial + o que foi pago nos meses anteriores.</p>
          </div>
          <Switch
            checked={data.profile.carry_balance}
            onCheckedChange={(v) => run((r) => r.updateProfile({ carry_balance: v }), (d) => ({ ...d, profile: { ...d.profile, carry_balance: v } }))}
          />
        </label>
        {data.profile.carry_balance && (
          <div className="mt-4 flex items-end gap-2">
            <Field label="Saldo inicial" className="flex-1" hint="Quanto você tinha em conta quando começou a usar o app.">
              <MoneyInput value={initial} onChange={setInitial} />
            </Field>
            <Button
              variant="outline"
              className="mb-6"
              disabled={initial === data.profile.initial_balance}
              onClick={async () => {
                await run((r) => r.updateProfile({ initial_balance: initial }));
                toast.success("Saldo inicial atualizado");
              }}
            >
              Salvar
            </Button>
          </div>
        )}
        {data.cards.some((c) => c.type === "benefit") && (
          <label className="mt-5 flex cursor-pointer items-center justify-between gap-4 border-t border-border pt-4">
            <div>
              <p className="text-sm font-medium">Somar saldo dos cartões benefício ao saldo geral</p>
              <p className="text-xs text-muted-foreground">
                Desligado (padrão), o saldo do VR/VA aparece só na seção "Cartões benefício", porque esse dinheiro não paga outras contas.
                Ligado, ele entra no saldo anterior, realizado e previsto (entradas e saídas continuam sem ele).
              </p>
            </div>
            <Switch
              checked={!!data.profile.sum_benefits}
              onCheckedChange={(v) =>
                run((r) => r.updateProfile({ sum_benefits: v }), (d) => ({ ...d, profile: { ...d.profile, sum_benefits: v } }))
              }
            />
          </label>
        )}
      </Section>

      <Section title="Aparência">
        <Segmented<Theme>
          className="w-full"
          value={theme}
          onChange={setTheme}
          options={[
            { value: "light", label: <><Sun /> Claro</> },
            { value: "dark", label: <><Moon /> Escuro</> },
            { value: "system", label: <><Monitor /> Sistema</> },
          ]}
        />
      </Section>

      <Section title="Dados e segurança">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button variant="outline" onClick={() => exportCsv(data, data.transactions, `financas-backup-${today()}.csv`)}>
            <Download /> Exportar tudo (CSV)
          </Button>
          {mode === "supabase" && (
            <Button variant="outline" onClick={() => { setPw(""); setPw2(""); setPwOpen(true); }}>
              <KeyRound /> Alterar senha
            </Button>
          )}
          {mode === "demo" && (
            <Button variant="outline" onClick={() => setResetOpen(true)}>
              <RotateCcw /> Restaurar dados da demonstração
            </Button>
          )}
          <Button variant="ghost" className="text-expense hover:bg-expense-soft sm:ml-auto" onClick={() => signOut()}>
            <LogOut /> Sair
          </Button>
        </div>
      </Section>

      <Card className="border-expense/30 p-5">
        <h2 className="font-semibold text-expense">Excluir minha conta</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Apaga permanentemente sua conta e todos os seus dados: lançamentos, cartões, categorias, perfil e foto. Essa ação não pode
          ser desfeita.
        </p>
        <Button
          variant="outline"
          className="mt-4 border-expense/40 text-expense hover:bg-expense-soft"
          onClick={() => {
            setDeleteConfirm("");
            setDeleteOpen(true);
          }}
        >
          <Trash2 /> Excluir minha conta
        </Button>
      </Card>

      <Dialog
        open={deleteOpen}
        onOpenChange={(o) => !deleting && setDeleteOpen(o)}
        title="Excluir conta permanentemente?"
        footer={
          <>
            <Button variant="outline" disabled={deleting} onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deleteConfirm.trim().toUpperCase() !== "EXCLUIR" || deleting}
              onClick={async () => {
                if (!repo) return;
                setDeleting(true);
                try {
                  await repo.deleteAccount();
                  qc.clear();
                  await signOut();
                  toast.success(mode === "demo" ? "Demonstração apagada" : "Sua conta e seus dados foram excluídos");
                } catch (e) {
                  toast.error("Não foi possível excluir a conta", { description: e instanceof Error ? e.message : String(e) });
                  setDeleting(false);
                }
              }}
            >
              {deleting ? <Spinner className="size-4" /> : <Trash2 />} Excluir tudo
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex gap-3 rounded-xl bg-expense-soft p-3 text-sm text-expense">
            <TriangleAlert className="size-5 shrink-0" />
            <p>
              Serão apagados <b>{data.transactions.length} lançamentos</b>, {data.cards.length} cartões, {data.categories.length} categorias,
              seu perfil{data.profile.avatar_url ? ", sua foto" : ""} e o seu login. Não há como recuperar depois.
            </p>
          </div>
          <Button variant="outline" onClick={() => exportCsv(data, data.transactions, `financas-backup-${today()}.csv`)}>
            <Download /> Baixar meus dados antes (CSV)
          </Button>
          <Field label={<>Para confirmar, digite <b className="text-foreground">EXCLUIR</b></>}>
            <Input value={deleteConfirm} maxLength={20} onChange={(e) => setDeleteConfirm(e.target.value)} autoComplete="off" placeholder="EXCLUIR" />
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={pwOpen}
        onOpenChange={setPwOpen}
        title="Alterar senha"
        footer={
          <>
            <Button variant="outline" onClick={() => setPwOpen(false)}>Cancelar</Button>
            <Button
              onClick={async () => {
                if (pw.length < 6) return toast.error("A senha precisa ter pelo menos 6 caracteres");
                if (pw !== pw2) return toast.error("As senhas não conferem");
                try {
                  await updatePassword(pw);
                  toast.success("Senha alterada");
                  setPwOpen(false);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : String(e));
                }
              }}
            >
              Salvar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Nova senha"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" maxLength={72} /></Field>
          <Field label="Confirmar nova senha"><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" maxLength={72} /></Field>
        </div>
      </Dialog>

      <Dialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Restaurar demonstração?"
        description="Todas as alterações feitas na demonstração serão descartadas e os dados fictícios originais voltarão."
        footer={
          <>
            <Button variant="outline" onClick={() => setResetOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                resetDemo();
                setResetOpen(false);
                await qc.invalidateQueries({ queryKey: ["finance"] });
                toast.success("Demonstração restaurada");
              }}
            >
              Restaurar
            </Button>
          </>
        }
      />
    </div>
  );
}
