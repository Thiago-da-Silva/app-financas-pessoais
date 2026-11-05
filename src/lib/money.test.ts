import { describe, expect, it } from "vitest";
import { formatMoney, formatPercent, parseMoney, percent } from "./money";

// Intl usa espaço não separável entre "R$" e o número
const norm = (s: string) => s.replace(/\s/g, " ");

describe("money", () => {
  it("formata centavos em reais", () => {
    expect(norm(formatMoney(123456))).toBe("R$ 1.234,56");
    expect(norm(formatMoney(5))).toBe("R$ 0,05");
    expect(norm(formatMoney(-9990))).toBe("-R$ 99,90");
  });

  it("converte texto em centavos sem erro de ponto flutuante", () => {
    expect(parseMoney("1.234,56")).toBe(123456);
    expect(parseMoney("0,1")).toBe(10);
    expect(parseMoney("19.99")).toBe(1999);
    expect(parseMoney("R$ 1.000")).toBe(100000);
    expect(parseMoney("")).toBe(0);
  });

  it("calcula percentuais com proteção contra divisão por zero", () => {
    expect(percent(25, 200)).toBe(12.5);
    expect(percent(10, 0)).toBe(0);
    expect(formatPercent(47.333)).toBe("47,3%");
    expect(formatPercent(0)).toBe("0%");
  });
});
