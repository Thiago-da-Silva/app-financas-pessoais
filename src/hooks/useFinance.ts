import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSession } from "@/data/session";
import type { Repo } from "@/data/repo";
import type { FinanceData } from "@/lib/types";

export function useFinanceKey() {
  const { mode, userId } = useSession();
  return ["finance", mode, userId] as const;
}

export function useFinance() {
  const { repo } = useSession();
  const key = useFinanceKey();
  return useQuery({
    queryKey: key,
    queryFn: () => repo!.loadAll(),
    enabled: !!repo,
    staleTime: 30_000,
  });
}

type Action<T> = (repo: Repo, data: FinanceData) => Promise<T>;

/**
 * Executa uma operação de escrita e recarrega os dados.
 * `optimistic` permite aplicar a mudança na tela antes da resposta do servidor.
 */
export function useAction() {
  const { repo } = useSession();
  const qc = useQueryClient();
  const key = useFinanceKey();

  const mutation = useMutation({
    mutationFn: async <T,>(args: { fn: Action<T>; optimistic?: (d: FinanceData) => FinanceData }) => {
      const data = qc.getQueryData<FinanceData>(key);
      if (!repo || !data) throw new Error("Dados não carregados");
      if (args.optimistic) qc.setQueryData<FinanceData>(key, args.optimistic(data));
      return args.fn(repo, data);
    },
    onError: (e) => {
      toast.error("Não foi possível salvar", { description: e instanceof Error ? e.message : String(e) });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  return {
    run: <T,>(fn: Action<T>, optimistic?: (d: FinanceData) => FinanceData) =>
      mutation.mutateAsync({ fn, optimistic } as never) as Promise<T>,
    pending: mutation.isPending,
  };
}
