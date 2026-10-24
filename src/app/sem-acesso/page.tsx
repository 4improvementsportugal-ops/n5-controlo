import Link from "next/link";

export default function NoAccess() {
  return (
    <main className="min-h-screen grid place-items-center px-4">
      <div className="card max-w-md text-center space-y-2">
        <h1 className="h1">Sem acesso a este módulo</h1>
        <p className="text-muted">A tua função não inclui este módulo. Pede acesso a um sócio ou à direção de operações.</p>
        <Link className="btn" href="/comunidades">Ir para Comunidades</Link>
      </div>
    </main>
  );
}
