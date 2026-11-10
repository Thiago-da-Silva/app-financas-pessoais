import type { FinanceData, Profile } from "@/lib/types";

export type Table = "categories" | "cards" | "series" | "transactions";
export type Row = { id: string } & Record<string, unknown>;

/** Acesso a dados genérico — implementado pelo Supabase e pelo modo demo (localStorage). */
export interface Repo {
  mode: "supabase" | "demo";
  loadAll(): Promise<FinanceData>;
  insert(table: Table, rows: object[]): Promise<void>;
  /** Cada linha traz o id e somente os campos a alterar. */
  update(table: Table, rows: Row[]): Promise<void>;
  remove(table: Table, ids: string[]): Promise<void>;
  updateProfile(patch: Partial<Omit<Profile, "id">>): Promise<void>;
  uploadAvatar(file: File): Promise<string>;
  /** Apaga todos os dados do usuário e o próprio login (LGPD). */
  deleteAccount(): Promise<void>;
}
