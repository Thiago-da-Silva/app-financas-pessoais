import type { Repo, Row, Table } from "./repo";
import type { FinanceData } from "@/lib/types";
import { buildDemoData } from "./demoSeed";
import { safeStorage } from "@/lib/utils";

const KEY = "cf-demo-data-v1";
const store = safeStorage();

let memory: FinanceData | null = null;

function read(): FinanceData {
  if (memory) return memory;
  const raw = store.get(KEY);
  if (raw) {
    try {
      memory = JSON.parse(raw) as FinanceData;
      return memory;
    } catch {
      /* dados corrompidos: recria */
    }
  }
  memory = buildDemoData();
  write(memory);
  return memory;
}

function write(data: FinanceData) {
  memory = data;
  store.set(KEY, JSON.stringify(data));
}

export function resetDemoData() {
  memory = null;
  store.remove(KEY);
}

const delay = () => new Promise((r) => setTimeout(r, 60));

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // reduz para 256px para caber no localStorage
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d")!;
        const s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => reject(new Error("Imagem inválida"));
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function createLocalRepo(): Repo {
  return {
    mode: "demo",
    async loadAll() {
      await delay();
      return structuredClone(read());
    },
    async insert(table: Table, rows: object[]) {
      const data = read();
      const now = new Date().toISOString();
      (data[table] as object[]).push(...rows.map((r) => ({ created_at: now, ...r })));
      write(data);
    },
    async update(table: Table, rows: Row[]) {
      const data = read();
      const byId = new Map(rows.map((r) => [r.id, r]));
      const list = data[table] as unknown as Row[];
      data[table] = list.map((item) => (byId.has(item.id) ? { ...item, ...byId.get(item.id) } : item)) as never;
      write(data);
    },
    async remove(table: Table, ids: string[]) {
      const data = read();
      const set = new Set(ids);
      data[table] = (data[table] as unknown as Row[]).filter((r) => !set.has(r.id)) as never;
      // imita os "on delete" do banco
      if (table === "series") {
        data.transactions = data.transactions.filter((t) => !t.series_id || !set.has(t.series_id));
      }
      if (table === "categories") {
        data.transactions = data.transactions.map((t) =>
          t.category_id && set.has(t.category_id) ? { ...t, category_id: null } : t,
        );
        data.series = data.series.map((s) => (s.category_id && set.has(s.category_id) ? { ...s, category_id: null } : s));
      }
      write(data);
    },
    async updateProfile(patch) {
      const data = read();
      data.profile = { ...data.profile, ...patch };
      write(data);
    },
    async uploadAvatar(file: File) {
      return fileToDataUrl(file);
    },
  };
}
