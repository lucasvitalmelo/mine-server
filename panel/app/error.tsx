'use client';

/**
 * Quatro server actions (`removeWhitelist`, `setWhitelist`, `kick` e
 * `saveWorld`) propagam excecao em vez de devolver `Resultado`. Sem este
 * arquivo, qualquer uma delas com o RCON fora troca o painel inteiro pela
 * tela generica do Next, e ate o botao de atualizar desaparece.
 *
 * Em producao o Next redige a mensagem de erro do servidor e entrega so um
 * `digest`. Entao o texto abaixo assume que a mensagem pode nao dizer nada
 * de util — o que resolve de fato e o botao de voltar.
 */
export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main>
      <section>
        <h2>O painel tropecou</h2>
        <p className="aviso erro">{error.message || 'Erro no servidor.'}</p>
        <div className="row">
          <button type="button" onClick={reset}>
            Tentar de novo
          </button>
        </div>
        <p className="hint">
          Quase sempre e o servidor de jogo fora do ar ou reiniciando. O botao
          acima recarrega so esta tela, sem perder a sessao.
          {error.digest ? ` Referencia: ${error.digest}.` : null}
        </p>
      </section>
    </main>
  );
}
