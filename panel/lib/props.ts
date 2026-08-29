import { readFile } from 'node:fs/promises';

/**
 * Le o server.properties do servidor de jogo.
 *
 * Existe porque o RCON nao tem consulta de estado: `whitelist list` devolve
 * os nomes tanto com a whitelist ligada quanto desligada. Sem ler o arquivo,
 * o painel so poderia adivinhar a partir do ultimo clique — e mentiria assim
 * que alguem mexesse por fora.
 *
 * O volume do Minecraft e montado aqui em modo somente-leitura, entao o
 * painel nao consegue escrever no mundo nem por engano.
 */

const base = process.env.MC_DATA_PATH ?? '/mc';

const fake =
  process.env.NODE_ENV !== 'production' && process.env.PANEL_DEV_FAKE_RCON === 'true';

const FAKE_PROPS: Record<string, string> = {
  'white-list': 'true',
  'online-mode': 'false',
  'max-players': '10',
  difficulty: 'normal',
  gamemode: 'survival',
  'view-distance': '7',
  'simulation-distance': '5',
  motd: 'Servidor Paper',
  'level-name': 'world',
};

export type Props = Record<string, string>;

export async function serverProperties(): Promise<Props | null> {
  if (fake) return FAKE_PROPS;

  try {
    const raw = await readFile(`${base}/server.properties`, 'utf8');
    const out: Props = {};
    for (const linha of raw.split('\n')) {
      const t = linha.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
    return out;
  } catch {
    // Volume nao montado, arquivo ainda nao gerado, permissao. Nao e erro
    // fatal: a tela some com os campos que dependem disto.
    return null;
  }
}

export function ligado(props: Props | null, chave: string): boolean | null {
  const v = props?.[chave];
  if (v === undefined) return null;
  return v === 'true';
}
