import { Suspense } from "react";
import { and, eq, ne, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { canSee, getCurrentUser, type Module } from "@/lib/auth";
import { softwaresFor } from "@/lib/queries";
import { FilterBar } from "@/components/FilterBar";
import { Nav } from "@/components/Nav";
import { Marca } from "@/components/Simbolo";
import { LABELS } from "@/lib/format";
import { logout } from "../login/actions";

export const dynamic = "force-dynamic";

const NAV: { href: string; label: string; module: Module }[] = [
  { href: "/", label: "Painel geral", module: "painel" },
  { href: "/comunidades", label: "Comunidades", module: "comunidades" },
  { href: "/pipeline", label: "Pipeline", module: "pipeline" },
  { href: "/chat", label: "Chat", module: "chat" },
  { href: "/campanhas", label: "Campanhas e funil", module: "campanhas" },
  { href: "/receita", label: "Utilização e receita", module: "receita" },
  { href: "/reativacao", label: "Reativação", module: "reativacao" },
  { href: "/impacto", label: "Impacto", module: "impacto" },
  { href: "/alertas", label: "Alertas", module: "alertas" },
  { href: "/definicoes", label: "Definições", module: "definicoes" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Em paralelo, e só a contagem dos alertas críticos (antes vinham as linhas todas)
  const [softwares, critical] = await Promise.all([
    softwaresFor(user),
    canSee(user.role, "alertas")
      ? db.select({ n: sql<number>`count(*)::int` }).from(schema.alerts).where(and(eq(schema.alerts.severity, "critico"), ne(schema.alerts.status, "resolvido"))).then(([r]) => r?.n ?? 0)
      : Promise.resolve(0),
  ]);
  const items = NAV.filter((n) => canSee(user.role, n.module)).map((n) => ({ href: n.href, label: n.label, badge: n.href === "/alertas" ? critical : undefined }));
  return (
    <div className="min-h-screen md:flex">
      <aside className="md:w-60 md:shrink-0 md:min-h-screen bg-ink text-cream px-3 py-5 flex flex-col gap-5">
        <div className="px-3">
          <Marca fundo="escuro" />
          <div className="text-xs text-cream/60 mt-2.5">{user.name} · {LABELS.role[user.role]}</div>
        </div>
        <nav aria-label="Módulos"><Suspense><Nav items={items} /></Suspense></nav>
        <form action={logout} className="mt-auto px-3"><button className="text-sm text-cream/60 hover:text-cream">Sair</button></form>
      </aside>
      <div className="flex-1 min-w-0">
        <div className="sticky top-0 z-10 bg-canvas/95 backdrop-blur border-b border-line px-4 md:px-8 py-3">
          <Suspense><FilterBar softwares={softwares.map((s) => ({ id: s.id, name: s.name }))} /></Suspense>
        </div>
        <main className="px-4 md:px-8 py-6 max-w-[1400px]">{children}</main>
      </div>
    </div>
  );
}
