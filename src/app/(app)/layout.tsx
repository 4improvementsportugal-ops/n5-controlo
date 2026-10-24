import { Suspense } from "react";
import { and, eq, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { canSee, getCurrentUser, type Module } from "@/lib/auth";
import { softwaresFor } from "@/lib/queries";
import { FilterBar } from "@/components/FilterBar";
import { Nav } from "@/components/Nav";
import { LABELS } from "@/lib/format";
import { logout } from "../login/actions";

export const dynamic = "force-dynamic";

const NAV: { href: string; label: string; module: Module }[] = [
  { href: "/", label: "Painel geral", module: "painel" },
  { href: "/comunidades", label: "Comunidades", module: "comunidades" },
  { href: "/pipeline", label: "Pipeline", module: "pipeline" },
  { href: "/campanhas", label: "Campanhas e funil", module: "campanhas" },
  { href: "/receita", label: "Utilização e receita", module: "receita" },
  { href: "/alertas", label: "Alertas", module: "alertas" },
  { href: "/definicoes", label: "Definições", module: "definicoes" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const softwares = await softwaresFor(user);
  const critical = canSee(user.role, "alertas")
    ? (await db.select().from(schema.alerts).where(and(eq(schema.alerts.severity, "critico"), ne(schema.alerts.status, "resolvido")))).length
    : 0;
  const items = NAV.filter((n) => canSee(user.role, n.module)).map((n) => ({ href: n.href, label: n.label, badge: n.href === "/alertas" ? critical : undefined }));
  return (
    <div className="min-h-screen md:flex">
      <aside className="md:w-60 md:shrink-0 md:min-h-screen bg-surface border-b md:border-b-0 md:border-r border-line px-3 py-4 flex flex-col gap-4">
        <div className="px-3">
          <div className="font-semibold text-lg tracking-tight">Controlo N5</div>
          <div className="text-xs text-muted">{user.name} · {LABELS.role[user.role]}</div>
        </div>
        <nav aria-label="Módulos"><Suspense><Nav items={items} /></Suspense></nav>
        <form action={logout} className="mt-auto px-3"><button className="text-sm text-muted hover:text-ink">Sair</button></form>
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
