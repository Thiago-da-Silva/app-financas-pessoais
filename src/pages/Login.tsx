import { useState, type FormEvent } from "react";
import { ArrowRight, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/data/session";
import { supabaseConfigured } from "@/data/supabase";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Card, Segmented, Spinner } from "@/components/ui/misc";
import { Logo } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/layout/AppLayout";

type Tab = "login" | "signup" | "forgot";

export default function LoginPage() {
  const { signIn, signUp, sendPasswordReset, enterDemo } = useSession();
  const [tab, setTab] = useState<Tab>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (tab === "login") await signIn(email, password);
      else if (tab === "signup") {
        if (password.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
        const { needsConfirmation } = await signUp(name, email, password);
        if (needsConfirmation) setInfo("Conta criada! Enviamos um link de confirmação para o seu e-mail.");
      } else {
        await sendPasswordReset(email);
        setInfo("Se o e-mail existir, você receberá um link para redefinir a senha.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative grid min-h-dvh lg:grid-cols-2">
      <div className="absolute right-3 top-3 z-10">
        <ThemeToggle />
      </div>

      {/* Lado ilustrativo (desktop) */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <span className="grid size-9 place-items-center rounded-xl bg-white/15">
            <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 16l5-5 4 4 7-8" />
            </svg>
          </span>
          Finanças
        </div>
        <div className="max-w-md">
          <h1 className="text-4xl font-semibold leading-tight">Seu dinheiro organizado, mês a mês.</h1>
          <p className="mt-4 text-white/80">
            Receitas, despesas, faturas de cartão, parcelas e lançamentos fixos — tudo em um só lugar, no celular ou no computador.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          {[
            ["Faturas", "agrupadas por cartão"],
            ["Parcelas", "com limite calculado"],
            ["Saldo", "previsto e realizado"],
          ].map(([a, b]) => (
            <div key={a} className="rounded-2xl bg-white/10 p-4 backdrop-blur">
              <p className="font-semibold">{a}</p>
              <p className="text-white/70">{b}</p>
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-3xl" />
      </div>

      {/* Formulário */}
      <div className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <Logo size={36} />
            <span className="text-lg font-semibold">Finanças</span>
          </div>
          <h2 className="text-2xl font-semibold">
            {tab === "login" ? "Bem-vindo de volta" : tab === "signup" ? "Criar sua conta" : "Recuperar senha"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {tab === "forgot" ? "Informe seu e-mail para receber o link." : "Controle financeiro pessoal simples e bonito."}
          </p>

          {tab !== "forgot" && (
            <Segmented
              className="mt-6 w-full"
              value={tab}
              onChange={(v) => {
                setTab(v);
                setError(null);
                setInfo(null);
              }}
              options={[
                { value: "login", label: "Entrar" },
                { value: "signup", label: "Criar conta" },
              ]}
            />
          )}

          <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
            {tab === "signup" && (
              <Field label="Nome" htmlFor="name">
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
              </Field>
            )}
            <Field label="E-mail" htmlFor="email">
              <Input
                id="email"
                type={tab === "login" ? "text" : "email"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="voce@email.com"
              />
            </Field>
            {tab !== "forgot" && (
              <Field
                label={
                  <span className="flex w-full justify-between">
                    Senha
                    {tab === "login" && (
                      <button type="button" className="cursor-pointer text-primary hover:underline" onClick={() => setTab("forgot")}>
                        Esqueci a senha
                      </button>
                    )}
                  </span>
                }
                htmlFor="password"
              >
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={tab === "signup" ? "new-password" : "current-password"}
                />
              </Field>
            )}

            {error && <p className="rounded-xl bg-expense-soft px-3 py-2 text-sm text-expense">{error}</p>}
            {info && <p className="rounded-xl bg-income-soft px-3 py-2 text-sm text-income">{info}</p>}

            <Button type="submit" size="lg" disabled={busy}>
              {busy ? <Spinner className="size-4" /> : null}
              {tab === "login" ? "Entrar" : tab === "signup" ? "Criar conta" : "Enviar link"}
              {!busy && <ArrowRight />}
            </Button>
            {tab === "forgot" && (
              <Button variant="ghost" onClick={() => setTab("login")}>
                Voltar para o login
              </Button>
            )}
          </form>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            ou
            <span className="h-px flex-1 bg-border" />
          </div>

          <Card className="p-4">
            <p className="text-sm font-medium">Quer só conhecer o sistema?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Acesse a demonstração com dados fictícios — ou entre com usuário <b>teste</b> e senha <b>teste</b>.
            </p>
            <Button
              variant="outline"
              className="mt-3 w-full"
              onClick={() => {
                enterDemo();
                toast.success("Bem-vindo à demonstração!");
              }}
            >
              <PlayCircle /> Ver demonstração
            </Button>
          </Card>

          {!supabaseConfigured && (
            <p className="mt-4 text-center text-xs text-warning">
              Supabase ainda não configurado: apenas a demonstração está disponível.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
