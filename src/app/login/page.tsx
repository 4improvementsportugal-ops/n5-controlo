"use client";
import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const demo = process.env.NEXT_PUBLIC_DEMO_DATA === "true";
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <main className="min-h-screen grid place-items-center px-4">
      <form action={action} className="card w-full max-w-sm space-y-4">
        <div>
          <h1 className="h1">Controlo N5</h1>
          <p className="text-muted text-sm mt-1">Acesso só para a equipa.</p>
        </div>
        <div>
          <label className="label" htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" autoComplete="username" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">Palavra-passe</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
        </div>
        {state?.error ? <p className="text-bad text-sm" role="alert">{state.error}</p> : null}
        {demo ? <p className="text-xs text-muted">Demonstração com dados de exemplo: socio@exemplo.n5 · exemplo-n5-2026!</p> : null}
        <button className="btn btn-primary w-full justify-center" disabled={pending}>{pending ? "A entrar…" : "Entrar"}</button>
      </form>
    </main>
  );
}
