# Finanças: controle financeiro pessoal

App web *mobile first* para controle financeiro mensal: receitas e despesas, cartões de crédito com fatura e limite, parcelamentos, lançamentos fixos, categorias com orçamento, gráficos e tema claro/escuro.

**Stack:** Vite + React 18 + TypeScript · Tailwind CSS v4 · Radix UI · TanStack Query · Recharts · Supabase (Auth, Postgres com RLS, Storage) · hospedagem estática no Render.

## Rodando localmente

```bash
npm install
npm run dev
```

Sem configurar o Supabase, o app já funciona no **modo demonstração**: botão "Ver demonstração" na tela de login, ou usuário `teste` / senha `teste`. Os dados fictícios ficam só no navegador (localStorage) e podem ser restaurados em *Perfil → Restaurar dados da demonstração*.

## Testes

```bash
npm test          # roda uma vez
npm run test:watch  # modo observação durante o desenvolvimento
```

Os testes unitários (Vitest) cobrem as regras de negócio em `src/domain` (faturas, fechamento, parcelas, fixos, saldos, limite do cartão, edição e exclusão de séries, desfazer) e os utilitários de data e moeda em `src/lib`. O workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) roda os testes e o build em cada push e pull request.

## Configurando o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com) (plano gratuito).
2. No **SQL Editor**, cole e rode o conteúdo de [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql). Ele cria as tabelas, as regras de segurança (RLS), as categorias padrão de cada novo usuário e o bucket `avatars` para fotos de perfil.
3. Em **Authentication → URL Configuration**, informe a URL do site (ex.: `https://seu-app.onrender.com`) em *Site URL* e em *Redirect URLs*, incluindo `https://seu-app.onrender.com/redefinir-senha`.
4. Copie `.env.example` para `.env` e preencha com os dados de **Project Settings → API**:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

> A chave *anon* é pública por natureza: a segurança vem das políticas RLS. Nunca use a chave `service_role` no frontend.

## Deploy no Render (grátis)

1. Suba o projeto para um repositório no GitHub.
2. No Render: **New → Blueprint** e selecione o repositório. O arquivo [`render.yaml`](render.yaml) cria um *Static Site*, que não hiberna como os Web Services gratuitos.
3. Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` quando o Render pedir.

### Mantendo o Supabase ativo

O plano gratuito pausa projetos após 7 dias sem uso. O workflow [`.github/workflows/supabase-keepalive.yml`](.github/workflows/supabase-keepalive.yml) faz uma consulta a cada 3 dias. Para ativá-lo, cadastre os secrets `SUPABASE_URL` e `SUPABASE_ANON_KEY` em *Settings → Secrets and variables → Actions* do repositório.

## Regras de negócio

| Tema | Como funciona |
|---|---|
| **Mês de competência** | Cada lançamento tem `month`. Para cartão, é o mês do **vencimento da fatura**. |
| **Fechamento do cartão** | Compras feitas a partir do dia de fechamento entram na fatura seguinte. |
| **Parcelado** | O valor informado é o **da parcela**. Gera N meses a partir do mês da compra. Diminuir a quantidade remove as últimas parcelas; aumentar adiciona no final. |
| **Fixo mensal** | Gerado 12 meses à frente e estendido automaticamente ao navegar. Excluir "este e os próximos" encerra o fixo. |
| **Editar série** | "Somente este mês" ou "Este e os próximos". O histórico anterior nunca é alterado. |
| **Saldo anterior** | Saldo inicial + tudo o que foi pago/recebido nos meses anteriores. Pode ser desativado no Perfil. |
| **Saldo realizado / previsto** | Realizado considera só o que está marcado como pago; previsto considera tudo do mês. |
| **Limite do cartão** | Comprometido = itens não pagos, incluindo parcelas futuras. Assinaturas fixas só contam quando cobradas. |
| **Estorno** | Uma *entrada* paga com cartão abate a fatura e devolve limite. |

## Estrutura

```
src/
  data/        acesso a dados (Supabase e modo demo), sessão
  domain/      regras de negócio (faturas, parcelas, saldos, operações)
  components/  UI (ui/ = componentes base, dashboard/ = tela principal)
  pages/       telas (login, dashboard, categorias, cartões, perfil)
supabase/      migrations SQL
```

## Próximos passos

- PWA instalável (fase 2)
