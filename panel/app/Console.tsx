'use client';

import { useActionState } from 'react';
import { runCommand } from './actions';

export function Console() {
  const [state, action, pending] = useActionState(runCommand, null);

  return (
    <div className="stack">
      <form action={action} className="row">
        <input
          name="comando"
          placeholder="list, tps, time set day, difficulty hard…"
          autoComplete="off"
          spellCheck={false}
          className="mono grow"
        />
        <button type="submit" disabled={pending}>
          {pending ? 'Enviando…' : 'Enviar'}
        </button>
      </form>
      {state?.output ? <pre className="out">{state.output}</pre> : null}
      <p className="hint">
        Comandos vão sem a barra. Tudo que você digitar aqui roda como operador do
        servidor — inclusive <code>stop</code>, que desliga o jogo.
      </p>
    </div>
  );
}
