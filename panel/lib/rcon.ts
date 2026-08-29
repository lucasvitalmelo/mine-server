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
/**
 * Respostas simuladas para ver a interface sem um servidor de jogo por perto.
 *
 * A porta do RCON nao e publicada no host, entao uma maquina de fora nao
 * alcanca o servidor real. Mesma trava dupla do bypass do middleware: exige
 * NODE_ENV diferente de production, o que a imagem de producao fixa.
 */
const fakeRcon =
  process.env.NODE_ENV !== 'production' && process.env.PANEL_DEV_FAKE_RCON === 'true';

function fakeResposta(command: string): string {
  const cmd = command.trim().toLowerCase();
  if (cmd === 'list')
    return 'There are 2 of a max of 10 players online: LucasVital, AmigoDaLive';
  if (cmd === 'whitelist list')
    return 'There are 3 whitelisted players: LucasVital, AmigoDaLive, OutroAmigo';
  if (cmd === 'tps') return 'TPS from last 1m, 5m, 15m: 19.87, 19.94, 20.0';
  if (cmd === 'save-all') return 'Saved the game';
  if (cmd === 'seed') return 'Seed: [-4172144997902289642]';
  if (cmd.startsWith('whitelist add')) return `Added ${command.split(' ').pop()} to the whitelist`;
  if (cmd.startsWith('whitelist remove')) return `Removed ${command.split(' ').pop()} from the whitelist`;
  if (cmd.startsWith('whitelist on')) return 'Whitelist is now turned on';
  if (cmd.startsWith('whitelist off')) return 'Whitelist is now turned off';
  if (cmd.startsWith('kick')) return `Kicked ${command.split(' ')[1]}`;
  if (cmd.startsWith('say')) return '';
  return `[simulado] ${command}`;
}

export async function rcon(command: string): Promise<string> {
  if (fakeRcon) return fakeResposta(command);

  if (!password) throw new Error('RCON_PASSWORD não está definida no painel.');

  const client = await Rcon.connect({ host, port, password, timeout: 5000 });
  try {
    return await client.send(command);
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Envia varios comandos numa unica conexao.
 *
 * A tela se atualiza sozinha a cada poucos segundos e precisa de tres
 * consultas por ciclo. Uma conexao por comando multiplicaria por tres o
 * handshake contra o servidor de jogo, que roda com CPU contada.
 */
export async function rconBatch(comandos: string[]): Promise<string[]> {
  if (fakeRcon) return comandos.map(fakeResposta);
  if (!password) throw new Error('RCON_PASSWORD não está definida no painel.');

  const client = await Rcon.connect({ host, port, password, timeout: 5000 });
  try {
    const saidas: string[] = [];
    for (const c of comandos) saidas.push(await client.send(c));
    return saidas;
  } finally {
    await client.end().catch(() => {});
  }
}

/** Igual a rconBatch(), mas devolve a mensagem de erro em cada posição. */
export async function rconBatchSafe(comandos: string[]): Promise<string[]> {
  try {
    return await rconBatch(comandos);
  } catch (err) {
    const msg = `Erro: ${err instanceof Error ? err.message : String(err)}`;
    return comandos.map(() => msg);
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
