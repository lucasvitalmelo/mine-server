import { Rcon } from 'rcon-client';

const host = process.env.RCON_HOST ?? 'minecraft';
const port = Number(process.env.RCON_PORT ?? 25575);
const password = process.env.RCON_PASSWORD;

/**
 * Abre uma conexão RCON, envia um comando e fecha.
 *
 * Conexão por requisição em vez de pool: o painel é usado por poucas pessoas,
 * algumas vezes por dia. Um pool traria conexões mortas depois de um redeploy
 * do servidor de jogo, em troca de latência que ninguém percebe aqui.
 */
export async function rcon(command: string): Promise<string> {
  if (!password) throw new Error('RCON_PASSWORD não está definida no painel.');

  const client = await Rcon.connect({ host, port, password, timeout: 5000 });
  try {
    return await client.send(command);
  } finally {
    await client.end().catch(() => {});
  }
}

/** Igual a rcon(), mas devolve a mensagem de erro em vez de estourar. */
export async function rconSafe(command: string): Promise<string> {
  try {
    return await rcon(command);
  } catch (err) {
    return `Erro: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * Extrai os nomes de saídas do tipo
 * "There are 3 whitelisted players: Ana, Bia, Caio".
 */
export function parseNameList(raw: string): string[] {
  const idx = raw.indexOf(':');
  if (idx === -1) return [];
  return raw
    .slice(idx + 1)
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
}
