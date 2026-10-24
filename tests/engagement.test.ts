import { describe, expect, it } from "vitest";
import { bandFor, capBlock, daysInactive, inSendingWindow, renderTemplate, ruleShouldFire } from "@/lib/engagement-rules";

const now = new Date("2026-10-24T15:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 864e5);

describe("Inatividade", () => {
  it("conta dias desde a última utilização, ou desde o registo", () => {
    expect(daysInactive(daysAgo(9.5), daysAgo(40), now)).toBe(9);
    expect(daysInactive(null, daysAgo(4), now)).toBe(4);
    expect(daysInactive(null, null, now)).toBeNull();
  });
  it("faixas", () => {
    expect(bandFor(0)).toBe("ativo");
    expect(bandFor(2)).toBe("ativo");
    expect(bandFor(3)).toBe("3_6");
    expect(bandFor(13)).toBe("7_13");
    expect(bandFor(29)).toBe("14_29");
    expect(bandFor(120)).toBe("30_mais");
  });
});

describe("Modelos", () => {
  it("substitui variáveis e usa o primeiro nome", () => {
    expect(renderTemplate("Olá {{nome}}, há {{dias}} dias que não abre o {{software}}.", { nome: "Ana Silva", dias: 9, software: "N5 Clara" }))
      .toBe("Olá Ana, há 9 dias que não abre o N5 Clara.");
    expect(renderTemplate("{{nome}} {{dias}}", {})).toBe("olá alguns");
  });
});

describe("Limites de frequência", () => {
  it("um e-mail a cada 3 dias", () => {
    expect(capBlock([{ channel: "email", at: daysAgo(2) }], "email", now)).toMatch(/3 dias/);
    expect(capBlock([{ channel: "email", at: daysAgo(2) }], "inapp", now)).toBeNull();
    expect(capBlock([{ channel: "email", at: daysAgo(4) }], "email", now)).toBeNull();
  });
  it("no máximo 3 por semana", () => {
    const h = [1, 2, 3].map((d) => ({ channel: "inapp" as const, at: daysAgo(d) }));
    expect(capBlock(h, "inapp", now)).toMatch(/por semana/);
    expect(capBlock(h.slice(0, 2), "inapp", now)).toBeNull();
  });
});

describe("Horário de envio", () => {
  it("09:00 às 20:00 de Lisboa, segunda a sábado", () => {
    expect(inSendingWindow(new Date("2026-10-24T15:00:00Z"))).toBe(true); // sábado 16:00 em Lisboa (UTC+1)
    expect(inSendingWindow(new Date("2026-10-24T20:30:00Z"))).toBe(false); // 21:30
    expect(inSendingWindow(new Date("2026-10-25T12:00:00Z"))).toBe(false); // domingo
    expect(inSendingWindow(new Date("2026-10-26T08:30:00Z"))).toBe(false); // segunda 08:30 em Lisboa (UTC+0 depois da mudança de hora)
    expect(inSendingWindow(new Date("2026-10-26T09:30:00Z"))).toBe(true); // segunda 09:30
  });
});

describe("Disparo das regras", () => {
  it("uma vez por período de inatividade", () => {
    expect(ruleShouldFire(6, 7, daysAgo(6), null)).toBe(false);
    expect(ruleShouldFire(8, 7, daysAgo(8), null)).toBe(true);
    expect(ruleShouldFire(9, 7, daysAgo(9), daysAgo(1))).toBe(false); // já recebeu depois da última utilização
    expect(ruleShouldFire(9, 7, daysAgo(9), daysAgo(20))).toBe(true); // recebeu num período anterior
  });
});
