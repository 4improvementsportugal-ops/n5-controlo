"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PERIODS } from "@/lib/filters";

export function FilterBar({ softwares }: { softwares: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (key: string, value: string) => {
    const p = new URLSearchParams(params.toString());
    if (value) p.set(key, value); else p.delete(key);
    router.push(`${pathname}?${p.toString()}`);
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2">
        <span className="rotulo">Software</span>
        <select className="input w-auto" value={params.get("sw") ?? "todos"} onChange={(e) => set("sw", e.target.value === "todos" ? "" : e.target.value)}>
          <option value="todos">Todos os softwares</option>
          {softwares.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2">
        <span className="rotulo">Período</span>
        <select className="input w-auto" value={params.get("periodo") ?? "mes"} onChange={(e) => set("periodo", e.target.value)}>
          {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </label>
    </div>
  );
}
