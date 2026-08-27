'use server';

import { revalidatePath } from 'next/cache';
import { rcon } from '../lib/rcon';

/** Nick do Minecraft: 3-16 caracteres, letras, números e underscore. */
const NICK = /^[A-Za-z0-9_]{3,16}$/;

function nick(formData: FormData, campo = 'nick'): string {
  const valor = String(formData.get(campo) ?? '').trim();
  if (!NICK.test(valor)) {
    throw new Error(`"${valor}" não é um nick válido (3-16 letras, números ou _).`);
  }
  return valor;
}

export async function addWhitelist(formData: FormData) {
  await rcon(`whitelist add ${nick(formData)}`);
  revalidatePath('/');
}

export async function removeWhitelist(formData: FormData) {
  await rcon(`whitelist remove ${nick(formData)}`);
  revalidatePath('/');
}

export async function toggleWhitelist(formData: FormData) {
  const ligar = String(formData.get('ligar')) === 'true';
  await rcon(`whitelist ${ligar ? 'on' : 'off'}`);
  revalidatePath('/');
}

export async function kick(formData: FormData) {
  const motivo = String(formData.get('motivo') ?? '').trim() || 'Removido pelo painel';
  await rcon(`kick ${nick(formData)} ${motivo}`);
  revalidatePath('/');
}

export async function saveWorld() {
  await rcon('save-all');
  revalidatePath('/');
}

export async function say(formData: FormData) {
  const msg = String(formData.get('mensagem') ?? '').trim();
  if (!msg) throw new Error('Mensagem vazia.');
  await rcon(`say ${msg}`);
  revalidatePath('/');
}

/** Console livre. Devolve a saída para a tela em vez de recarregar a página. */
export async function runCommand(
  _prev: { output: string } | null,
  formData: FormData,
): Promise<{ output: string }> {
  const cmd = String(formData.get('comando') ?? '').trim();
  if (!cmd) return { output: 'Digite um comando.' };
  try {
    const out = await rcon(cmd);
    revalidatePath('/');
    return { output: out.trim() || '(sem saída)' };
  } catch (err) {
    return { output: `Erro: ${err instanceof Error ? err.message : String(err)}` };
  }
}
