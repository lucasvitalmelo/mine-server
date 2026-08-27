import { headers } from 'next/headers';
import { rconSafe, parseNameList } from '../lib/rcon';
import {
  addWhitelist,
  removeWhitelist,
  toggleWhitelist,
  kick,
  saveWorld,
  say,
} from './actions';
import { Console } from './Console';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const h = await headers();
  const email = h.get('cf-access-authenticated-user-email');

  const [online, whitelistRaw, tps] = await Promise.all([
    rconSafe('list'),
    rconSafe('whitelist list'),
    rconSafe('tps'),
  ]);

  const liberados = parseNameList(whitelistRaw);
  const conectados = parseNameList(online);

  return (
    <main>
      <header>
        <h1>Painel do servidor</h1>
        <span className="who">{email ? `logado como ${email}` : 'sessão via Cloudflare Access'}</span>
      </header>

      <section>
        <h2>Estado agora</h2>
        <pre className="status">{online.trim()}</pre>
        <pre className="status">{tps.trim()}</pre>
        <p className="hint">
          TPS é o pulso do servidor: 20,0 é o ideal. Abaixo de 18 os jogadores já
          sentem travada.
        </p>
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
                  <button type="submit" title={`Expulsar ${nome}`} aria-label={`Expulsar ${nome}`}>
                    ×
                  </button>
                </form>
              </span>
            ))}
          </div>
        )}
        <p className="hint">O × expulsa da sessão atual. A pessoa pode voltar a entrar.</p>
      </section>

      <section>
        <h2>Whitelist</h2>
        <form action={addWhitelist} className="row">
          <input name="nick" placeholder="Nick do jogador" autoComplete="off" className="grow" />
          <button type="submit">Liberar</button>
        </form>

        {liberados.length === 0 ? (
          <p className="empty">Nenhum jogador liberado. Com a whitelist ligada, ninguém entra.</p>
        ) : (
          <div className="chips">
            {liberados.map((nome) => (
              <span className="chip" key={nome}>
                {nome}
                <form action={removeWhitelist}>
                  <input type="hidden" name="nick" value={nome} />
                  <button type="submit" title={`Remover ${nome}`} aria-label={`Remover ${nome}`}>
                    ×
                  </button>
                </form>
              </span>
            ))}
          </div>
        )}

        <div className="row">
          <form action={toggleWhitelist}>
            <input type="hidden" name="ligar" value="true" />
            <button type="submit" className="ghost">Ligar whitelist</button>
          </form>
          <form action={toggleWhitelist}>
            <input type="hidden" name="ligar" value="false" />
            <button type="submit" className="danger">Desligar whitelist</button>
          </form>
        </div>

        <p className="hint">
          Este servidor aceita clientes sem conta Microsoft, então a whitelist compara
          apenas o nome digitado — e o nome pode ser falsificado. Ela barra scanner e
          curioso, não quem sabe o nick de alguém. Autenticação de verdade exige um
          plugin de login.
        </p>
      </section>

      <section>
        <h2>Ações rápidas</h2>
        <form action={say} className="row">
          <input name="mensagem" placeholder="Mensagem no chat do jogo" autoComplete="off" className="grow" />
          <button type="submit">Anunciar</button>
        </form>
        <form action={saveWorld}>
          <button type="submit" className="ghost">Salvar o mundo agora</button>
        </form>
      </section>

      <section>
        <h2>Console</h2>
        <Console />
      </section>
    </main>
  );
}
