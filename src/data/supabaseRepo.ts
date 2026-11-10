import type { SupabaseClient } from "@supabase/supabase-js";
import type { Repo, Row, Table } from "./repo";
import type { FinanceData, Profile } from "@/lib/types";

const PAGE = 1000;

async function fetchAll<T>(sb: SupabaseClient, table: string, order = "created_at"): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from(table)
      .select("*")
      .order(order, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

function strip<T>(rows: Record<string, unknown>[]): T[] {
  return rows.map(({ user_id: _ignored, ...rest }) => rest as T);
}

export function createSupabaseRepo(sb: SupabaseClient, userId: string): Repo {
  return {
    mode: "supabase",

    async loadAll(): Promise<FinanceData> {
      const [profileRes, categories, cards, series, transactions] = await Promise.all([
        sb.from("profiles").select("*").eq("id", userId).maybeSingle(),
        fetchAll<Record<string, unknown>>(sb, "categories"),
        fetchAll<Record<string, unknown>>(sb, "cards"),
        fetchAll<Record<string, unknown>>(sb, "series"),
        fetchAll<Record<string, unknown>>(sb, "transactions", "date"),
      ]);
      if (profileRes.error) throw profileRes.error;
      let profile = profileRes.data as Profile | null;
      if (!profile) {
        const { data, error } = await sb.from("profiles").upsert({ id: userId, name: "" }).select("*").single();
        if (error) throw error;
        profile = data as Profile;
      }
      return {
        profile,
        categories: strip(categories),
        cards: strip(cards),
        series: strip(series),
        transactions: strip(transactions),
      };
    },

    async insert(table: Table, rows: object[]) {
      if (!rows.length) return;
      const { error } = await sb.from(table).insert(rows);
      if (error) throw error;
    },

    async update(table: Table, rows: Row[]) {
      if (!rows.length) return;
      // agrupa linhas com o mesmo patch para reduzir requisições
      const groups = new Map<string, { patch: Record<string, unknown>; ids: string[] }>();
      for (const { id, ...patch } of rows) {
        const key = JSON.stringify(patch);
        const g = groups.get(key) ?? { patch, ids: [] };
        g.ids.push(id);
        groups.set(key, g);
      }
      const results = await Promise.all(
        [...groups.values()].map((g) => sb.from(table).update(g.patch).in("id", g.ids)),
      );
      const err = results.find((r) => r.error)?.error;
      if (err) throw err;
    },

    async remove(table: Table, ids: string[]) {
      if (!ids.length) return;
      const { error } = await sb.from(table).delete().in("id", ids);
      if (error) throw error;
    },

    async updateProfile(patch) {
      const { error } = await sb.from("profiles").update(patch).eq("id", userId);
      if (error) throw error;
    },

    async uploadAvatar(file: File) {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error } = await sb.storage.from("avatars").upload(path, file, {
        upsert: true,
        contentType: file.type,
      });
      if (error) throw error;
      return sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    },

    async deleteAccount() {
      // 1) fotos de perfil (o banco não apaga arquivos do Storage sozinho)
      const { data: files } = await sb.storage.from("avatars").list(userId, { limit: 1000 });
      if (files?.length) {
        const { error } = await sb.storage.from("avatars").remove(files.map((f) => `${userId}/${f.name}`));
        if (error) throw error;
      }
      // 2) todos os dados + login, numa função do banco que só apaga o usuário logado
      const { error } = await sb.rpc("delete_my_account");
      if (error) throw error;
      await sb.auth.signOut({ scope: "local" });
    },
  };
}
