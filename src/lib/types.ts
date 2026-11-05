export type Kind = "income" | "expense";
export type PaymentMethod = "cash" | "pix" | "debit" | "card";
export type SeriesType = "installment" | "fixed";
export type Recurrence = "single" | SeriesType;

export interface Profile {
  id: string;
  name: string;
  avatar_url: string | null;
  initial_balance: number; // centavos
  carry_balance: boolean;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  budget: number | null; // centavos/mês
  created_at?: string;
}

export interface CreditCard {
  id: string;
  name: string;
  color: string;
  credit_limit: number | null;
  closing_day: number;
  due_day: number;
  archived: boolean;
  created_at?: string;
}

export interface Series {
  id: string;
  type: SeriesType;
  kind: Kind;
  name: string;
  description: string | null;
  amount: number;
  category_id: string | null;
  payment_method: PaymentMethod;
  card_id: string | null;
  day: number;
  start_month: string; // YYYY-MM-01
  end_month: string | null;
  generated_until: string | null;
  created_at?: string;
}

export interface Transaction {
  id: string;
  series_id: string | null;
  kind: Kind;
  name: string;
  description: string | null;
  amount: number; // centavos, sempre >= 0
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM-01 (competência / mês da fatura)
  category_id: string | null;
  payment_method: PaymentMethod;
  card_id: string | null;
  paid: boolean;
  created_at?: string;
}

export interface FinanceData {
  profile: Profile;
  categories: Category[];
  cards: CreditCard[];
  series: Series[];
  transactions: Transaction[];
}

export const PAYMENT_LABELS: Record<Exclude<PaymentMethod, "card">, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  debit: "Débito",
};
