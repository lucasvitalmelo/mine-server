import { rconBatchSafe, parseNameList } from '../lib/rcon';
import { serverProperties, ligado } from '../lib/props';
import {
  addWhitelist,
  removeWhitelist,
  setWhitelist,
  kick,
  saveWorld,
  say,
  runCommand,
} from './actions';
import { AutoRefresh, Botao, FormAdicionar, FormAnunciar, Console } from './ui';

export const dynamic = 'force-dynamic';

/** "TPS from last 1m, 5m, 15m: 19.87, 19.94, 20.0" -> "19.87" */
function primeiroTps(raw: string): string | null {
  const m = raw.match(/(\d+[.,]\d+)/);
  return m ? m[1].replace(',', '.') : null;
}

function corTps(tps: string | null): string {
  if (!tps) return '';
  const n = Number(tps);
  if (n >= 19) return 'bom';
  if (n >= 17) return 'atencao';
  return 'ruim';
}

export default async function Page() {
  const [online, whitelistRaw, tpsRaw] = await rconBatchSafe([
    'list',
    'whitelist list',
    'tps',
  ]);
  const props = await serverProperties();

  const conectados = parseNameList(online);
  const liberados = parseNameList(whitelistRaw);
  const tps = primeiroTps(tpsRaw);
  const whitelistLigada = ligado(props, 'white-list');
  const maxPlayers = props?.['max-players'];
  const semJogo = online.startsWith('Erro:');

  return (
    <main>
      <header>
        <div className="titulo">
          <h1>Painel do servidor</h1>
          <AutoRefresh />
        </div>
      </header>

      {semJogo ? (
        <p className="aviso erro">
          Sem contato com o servidor de jogo. {online}
        </p>
      ) : null}

      <section>
        <h2>Estado</h2>
        <div className="painel">
          <div className="metrica">
            <span className="rotulo">Online</span>
            <span className="valor">
              {conectados.length}
              {maxPlayers ? <span className="de">/{maxPlayers}</span> : null}
            </span>
          </div>

          <div className="metrica">
            <span className="rotulo">TPS</span>
            <span className={`valor ${corTps(tps)}`}>{tps ?? '—'}</span>
          </div>

          <div className="metrica">
            <span className="rotulo">Whitelist</span>
            <span className={`valor texto ${whitelistLigada ? 'bom' : whitelistLigada === false ? 'ruim' : ''}`}>
              {whitelistLigada === null ? '—' : whitelistLigada ? 'ligada' : 'desligada'}
            </span>
          </div>

          <div className="metrica">
            <span className="rotulo">Contas</span>
            <span className={`valor texto ${ligado(props, 'online-mode') ? 'bom' : 'atencao'}`}>
              {props?.['online-mode'] === undefined
                ? '—'
                : ligado(props, 'online-mode')
                  ? 'verificadas'
                  : 'sem verificação'}
            </span>
          </div>
        </div>

        {props ? (
          <p className="hint">
            {props['difficulty']} · {props['gamemode']} · visão {props['view-distance']} ·
            simulação {props['simulation-distance']} · mundo {props['level-name']}
          </p>
        ) : (
          <p className="hint">
            Configuração do jogo indisponível — o volume do Minecraft não está montado
            no painel.
          </p>
        )}
      </section>

      <section>
        <h2>Quem está online</h2>
        {conectados.length === 0 ? (
          <p className="empty">Ninguém conectado.</p>
        ) : (
          <div className="chips">
            {conectados.map((nome) => (
              <span className="chip" key={nome}>
                {nome}
                <form action={kick}>
                  <input type="hidden" name="nick" value={nome} />
                  <Botao className="x" title={`Expulsar ${nome}`}>
                    ×
                  </Botao>
                </form>
              </span>
            ))}
          </div>
        )}
        <p className="hint">O × expulsa da sessão atual. A pessoa pode voltar a entrar.</p>
      </section>

      <section>
        <h2>Whitelist</h2>

        <div className="row toggle">
          <span className={`estado ${whitelistLigada ? 'bom' : whitelistLigada === false ? 'ruim' : ''}`}>
            {whitelistLigada === null
              ? 'Estado desconhecido'
              : whitelistLigada
                ? 'Ligada — só quem está na lista entra'
                : 'Desligada — qualquer um entra'}
          </span>
          <form action={setWhitelist}>
            <input type="hidden" name="ligar" value={whitelistLigada ? 'false' : 'true'} />
            <Botao className={whitelistLigada ? 'danger' : ''} pendingLabel="…">
              {whitelistLigada ? 'Desligar' : 'Ligar'}
            </Botao>
          </form>
        </div>

        <FormAdicionar action={addWhitelist} />

        {liberados.length === 0 ? (
          <p className="empty">Nenhum jogador liberado. Com a whitelist ligada, ninguém entra.</p>
        ) : (
          <div className="chips">
            {liberados.map((nome) => (
              <span className="chip" key={nome}>
                {nome}
                <form action={removeWhitelist}>
                  <input type="hidden" name="nick" value={nome} />
                  <Botao className="x" title={`Remover ${nome}`}>
                    ×
                  </Botao>
                </form>
              </span>
            ))}
          </div>
        )}

        <p className="hint">
          {ligado(props, 'online-mode') === false
            ? 'Este servidor não verifica contas, então a whitelist compara apenas o nome digitado — e nome pode ser falsificado. Ela barra scanner e curioso, não quem sabe o nick de alguém.'
            : 'O servidor verifica as contas contra a Microsoft, então a whitelist vale por identidade real.'}
        </p>
      </section>

      <section>
        <h2>Ações rápidas</h2>
        <FormAnunciar action={say} />
        <form action={saveWorld}>
          <Botao className="ghost" pendingLabel="Salvando…">
            Salvar o mundo agora
          </Botao>
        </form>
      </section>

      <section>
        <h2>Console</h2>
        <Console action={runCommand} />
      </section>
    </main>
  );
}
