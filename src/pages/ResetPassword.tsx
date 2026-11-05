import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useSession } from "@/data/session";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Card } from "@/components/ui/misc";
import { Logo } from "@/components/layout/Logo";

export default function ResetPasswordPage() {
  const { updatePassword } = useSession();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError("A senha precisa ter pelo menos 6 caracteres.");
    if (password !== confirm) return setError("As senhas não conferem.");
    setBusy(true);
    try {
      await updatePassword(password);
      toast.success("Senha alterada com sucesso!");
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center p-5">
      <Card className="w-full max-w-sm p-6">
        <Logo size={36} />
        <h1 className="mt-4 text-xl font-semibold">Definir nova senha</h1>
        <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
          <Field label="Nova senha">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Confirmar senha">
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </Field>
          {error && <p className="text-sm text-expense">{error}</p>}
          <Button type="submit" disabled={busy}>
            Salvar senha
          </Button>
        </form>
      </Card>
    </div>
  );
}
