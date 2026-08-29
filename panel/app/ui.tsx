'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useActionState } from 'react';
import type { Resultado } from './actions';

/* ---- botão que mostra que está trabalhando -------------------------- */

export function Botao({
  children,
  className,
  title,
  pendingLabel = '…',
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} title={title} aria-label={title} disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

/* ---- atualização automática ----------------------------------------- */

export function AutoRefresh({ intervalo = 5000 }: { intervalo?: number }) {
  const router = useRouter();
  const [ativo, setAtivo] = useState(true);
  const [idade, setIdade] = useState(0);
  const [pending, start] = useTransition();

  useEffect(() => {
    const t = setInterval(() => setIdade((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!ativo) return;
    const t = setInterval(() => {
      start(() => router.refresh());
      setIdade(0);
    }, intervalo);
    return () => clearInterval(t);
  }, [ativo, intervalo, router]);

  return (
    <div className="refresh">
      <span className={`dot ${ativo ? (pending ? 'busy' : 'live') : 'off'}`} aria-hidden="true" />
      <span className="idade">
        {!ativo ? 'pausado' : pending ? 'atualizando…' : idade < 2 ? 'agora' : `há ${idade}s`}
      </span>
      <button type="button" className="link" onClick={() => setAtivo((v) => !v)}>
        {ativo ? 'pausar' : 'retomar'}
      </button>
      <button
        type="button"
        className="link"
        onClick={() => {
          start(() => router.refresh());
          setIdade(0);
        }}
      >
        atualizar
      </button>
    </div>
  );
}

/* ---- formulários com resposta na tela -------------------------------- */

function Aviso({ r }: { r: Resultado | null }) {
  if (!r) return null;
  return <p className={r.ok ? 'aviso ok' : 'aviso erro'}>{r.msg}</p>;
}

export function FormAdicionar({
  action,
}: {
  action: (prev: Resultado | null, fd: FormData) => Promise<Resultado>;
}) {
  const [estado, run] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado?.ok) ref.current?.reset();
  }, [estado]);

  return (
    <div className="stack">
      <form ref={ref} action={run} className="row">
        <input name="nick" placeholder="Nick do jogador" autoComplete="off" className="grow" />
        <Botao pendingLabel="Liberando…">Liberar</Botao>
      </form>
      <Aviso r={estado} />
    </div>
  );
}

export function FormAnunciar({
  action,
}: {
  action: (prev: Resultado | null, fd: FormData) => Promise<Resultado>;
}) {
  const [estado, run] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado?.ok) ref.current?.reset();
  }, [estado]);

  return (
    <div className="stack">
      <form ref={ref} action={run} className="row">
        <input name="mensagem" placeholder="Mensagem no chat do jogo" autoComplete="off" className="grow" />
        <Botao pendingLabel="Enviando…">Anunciar</Botao>
      </form>
      <Aviso r={estado} />
    </div>
  );
}

export function Console({
  action,
}: {
  action: (prev: Resultado | null, fd: FormData) => Promise<Resultado>;
}) {
  const [estado, run] = useActionState(action, null);

  return (
    <div className="stack">
      <form action={run} className="row">
        <input
          name="comando"
          placeholder="list, tps, time set day, difficulty hard…"
          autoComplete="off"
          spellCheck={false}
          className="mono grow"
        />
        <Botao pendingLabel="Enviando…">Enviar</Botao>
      </form>
      {estado ? <pre className={estado.ok ? 'out' : 'out erro'}>{estado.msg}</pre> : null}
      <p className="hint">
        Comandos vão sem a barra. Tudo aqui roda como operador do servidor —
        inclusive <code>stop</code>, que desliga o jogo.
      </p>
    </div>
  );
}
