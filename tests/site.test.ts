import { describe, expect, it } from "vitest";
import { sectionOrder, siteConclusions, stepFunnel } from "@/lib/metrics";
import { buildSiteQueries, siteFor } from "@/lib/siteQueries";

describe("Monitorização do site", () => {
  it("monta as consultas com o domínio e o dia, e recusa valores estranhos", () => {
    const q = buildSiteQueries("clara.numerocinco.pt", "2026-10-29");
    expect(q.mainFunnel).toContain("'clara.numerocinco.pt'");
    expect(q.pages).toContain("toDateTime('2026-10-29 00:00:00')");
    expect(Object.values(q).every((s) => !s.includes("{{"))).toBe(true);
    expect(() => buildSiteQueries("x' OR 1=1 --", "2026-10-29")).toThrow();
    expect(() => buildSiteQueries("clara.numerocinco.pt", "ontem")).toThrow();
  });

  it("sabe o site de cada software", () => {
    expect(siteFor("sw_clara", "")).toBe("clara.numerocinco.pt");
    expect(siteFor("sw_imobiliario", "sw_imobiliario:imo.numerocinco.pt")).toBe("imo.numerocinco.pt");
    expect(siteFor("sw_outro", "")).toBeNull();
  });

  it("conta quem sai em cada passo da inscrição", () => {
    const s = stepFunnel([{ passo: "nome", chegaram: 20 }, { passo: "email", chegaram: 15 }, { passo: "telefone", chegaram: 15 }]);
    expect(s[0]).toMatchObject({ step: "nome", reached: 20, left: 5, shareLeft: 0.25, shareOfStart: 1 });
    expect(s[1]).toMatchObject({ reached: 15, left: 0, shareOfStart: 0.75 });
  });

  it("usa a ordem do site quando as secções são as da página principal", () => {
    expect(sectionOrder([{ seccao: "lista" }, { seccao: "inicio" }])[0][0]).toBe("inicio");
    expect(sectionOrder([{ seccao: "passos", posicao: 2 }, { seccao: "topo", posicao: 1 }]).map(([id]) => id)).toEqual(["topo", "passos"]);
  });

  it("espera por dados antes de concluir e mostra primeiro o que está mal", () => {
    const base = { metaClicksByDay: [], days: [], sections: [], errors: [], times: [], visit: null, steps: stepFunnel([]) };
    const pouco = siteConclusions({ ...base, funnel: [{ fonte: "Todas", aberturas: 26, qualificadas: 17, iniciadas: 0, enviadas: 0, pagamentos: 0, pagas: 0 }] });
    expect(pouco.map((c) => c.topic)).toEqual(["Página", "Cliques da Meta"]);
    expect(pouco.every((c) => c.state === "espera")).toBe(true);
    const muito = siteConclusions({ ...base, funnel: [{ fonte: "Todas", aberturas: 100, qualificadas: 30, iniciadas: 1, enviadas: 0, pagamentos: 0, pagas: 0 }] });
    expect(muito[0]).toMatchObject({ topic: "Primeira impressão", state: "mau" });
  });
});

import { adRef, utmContentOf } from "@/lib/metrics";
describe("Compras da Stripe por anúncio", () => {
  it("junta o utm_content da inscrição ao nome do anúncio", () => {
    expect(adRef("CLA · N3 · LISTA-FSBO · /angariacao/")).toBe("cla_n3_lista_fsbo");
    expect(adRef("cla_n3_lista-fsbo")).toBe("cla_n3_lista_fsbo");
    expect(adRef("CLA · N3 · DIA · VÍDEO")).toBe("cla_n3_dia_video");
    expect(adRef("CLA · N1 · POSICIONAMENTO · /")).toBe("cla_n1_posicionamento");
    expect(adRef(null)).toBe("");
  });

  it("lê o utm_content da ligação do anúncio na Meta", () => {
    const link = "https://clara.numerocinco.pt/leads/?utm_source=meta&utm_medium=paid&utm_campaign=lancamento&utm_content=cla_n2_leads";
    expect(utmContentOf({ object_story_spec: { link_data: { link } } })).toBe("cla_n2_leads");
    expect(utmContentOf({ object_story_spec: { video_data: { call_to_action: { value: { link } } } } })).toBe("cla_n2_leads");
    expect(utmContentOf({ url_tags: "utm_source=meta&utm_content=cla_n4_copiloto" })).toBe("cla_n4_copiloto");
    expect(utmContentOf({ asset_feed_spec: { link_urls: [{ website_url: "https://clara.numerocinco.pt/crm/?utm_content=cla_n4_copiloto" }] } })).toBe("cla_n4_copiloto");
    // parâmetros dinâmicos da Meta e ligações sem utm_content ficam de fora (conta o nome do anúncio)
    expect(utmContentOf({ url_tags: "utm_content={{ad.name}}" })).toBeNull();
    expect(utmContentOf({ object_story_spec: { link_data: { link: "https://clara.numerocinco.pt/" } } })).toBeNull();
    expect(utmContentOf(null)).toBeNull();
  });
});
