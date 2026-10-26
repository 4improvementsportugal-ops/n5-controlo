import { describe, expect, it } from "vitest";
import { leadSummary, minutesSaved, responseBucket, returnMultiple, summarizeTasks, timeValueCents, type LeadRecord, type TaskRef } from "../src/lib/metrics";

const ref: TaskRef = { key: "lead.first_reply", label: "Primeira resposta", manualMinutes: 4, remainingMinutes: 0.5, validated: true };

describe("tempo poupado", () => {
  it("conta o tempo de referência menos o que fica para a pessoa", () => {
    expect(minutesSaved({ task: ref.key, by: "ai" }, ref)).toBe(3.5);
    expect(minutesSaved({ task: ref.key, by: "assisted", humanSeconds: 60 }, ref)).toBe(3);
  });
  it("não conta tarefas feitas à mão nem tarefas fora do catálogo", () => {
    expect(minutesSaved({ task: ref.key, by: "human" }, ref)).toBe(0);
    expect(minutesSaved({ task: "outra", by: "ai" }, undefined)).toBe(0);
  });
  it("nunca dá tempo negativo", () => {
    expect(minutesSaved({ task: ref.key, by: "assisted", humanSeconds: 600 }, ref)).toBe(0);
  });
  it("resume por tarefa e marca as desconhecidas", () => {
    const rows = summarizeTasks([{ task: ref.key, by: "ai" }, { task: ref.key, by: "human" }, { task: "x", by: "ai" }], [ref]);
    const r = rows.find((x) => x.key === ref.key)!;
    expect(r.count).toBe(2); expect(r.ai).toBe(1); expect(r.human).toBe(1); expect(r.minutesSaved).toBe(3.5);
    expect(rows.find((x) => x.key === "x")!.known).toBe(false);
  });
  it("converte minutos em valor", () => {
    expect(timeValueCents(90, 2000)).toBe(3000);
  });
});

function lead(i: number, o: Partial<LeadRecord>): LeadRecord {
  return { lead: `l${i}`, receivedAt: new Date(), afterHours: false, firstResponseSeconds: 30, respondedBy: "ai", visit: false, visitByAi: false, deal: false, commissionCents: 0, ...o };
}

describe("leads", () => {
  it("separa por tempo de resposta", () => {
    expect(responseBucket(45)).toBe("1m");
    expect(responseBucket(200)).toBe("5m");
    expect(responseBucket(7200)).toBe("24h");
    expect(responseBucket(null)).toBe("sem");
  });
  it("só estima negócio protegido com amostra suficiente", () => {
    const few = [lead(1, { visit: true }), lead(2, { firstResponseSeconds: 9000, respondedBy: "human" })];
    const s = leadSummary(few, 5, 30);
    expect(s.upliftVisit).toBeNull();
    expect(s.protectedDeals).toBeNull();
  });
  it("mede a diferença de conversão e estima o que a IA protegeu fora de horas", () => {
    const leads: LeadRecord[] = [];
    // 40 rápidas: 20 visitas, 4 negócios de 3 000 €; 10 delas fora de horas pela IA
    for (let i = 0; i < 40; i++) leads.push(lead(i, { visit: i < 20, deal: i < 4, commissionCents: i < 4 ? 300000 : 0, afterHours: i >= 30 }));
    // 40 lentas (respondidas pela pessoa no dia seguinte): 8 visitas, 0 negócios
    for (let i = 40; i < 80; i++) leads.push(lead(i, { firstResponseSeconds: 14 * 3600, respondedBy: "human", visit: i < 48 }));
    const s = leadSummary(leads, 5, 30);
    expect(s.fast.visitRate).toBe(0.5);
    expect(s.slow.visitRate).toBe(0.2);
    expect(s.upliftVisit).toBeCloseTo(0.3);
    expect(s.afterHoursByAi).toBe(10);
    expect(s.protectedVisits).toBeCloseTo(3);
    expect(s.upliftDeal).toBeCloseTo(0.1);
    expect(s.protectedDeals).toBeCloseTo(1);
    expect(s.protectedCommissionCents).toBe(300000);
    expect(s.medianAiSeconds).toBe(30);
    expect(s.dealsFirstByAi).toBe(4);
  });
});

describe("retorno", () => {
  it("divide o valor pelo custo", () => {
    expect(returnMultiple(38210, 3821)).toBe(10);
    expect(returnMultiple(100, 0)).toBeNull();
  });
});
