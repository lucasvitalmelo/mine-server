'use server';

import { revalidatePath } from 'next/cache';
import { rcon } from '../lib/rcon';
import {
  validarNick,
  comandoWhitelist,
  comandoKick,
  type NickValidado,
} from '../lib/nick';

export type Resultado = { ok: boolean; msg: string };

/**
 * A gramatica do nick e a escolha do comando vivem em `lib/nick.ts`, porque
 * um servidor com Geyser tem duas edicoes e as regras divergem entre
 * `fwhitelist` e `kick`. Aqui so extraimos do formulario.
 */
function nick(formData: FormData, campo = 'nick'): NickValidado {
  return validarNick(String(formData.get(campo) ?? ''));
}

function falha(err: unknown): Resultado {
  return { ok: false, msg: err instanceof Error ? err.message : String(err) };
}

/* ---- ações com retorno para a tela ---------------------------------- */

export async function addWhitelist(_prev: Resultado | null, formData: FormData): Promise<Resultado> {
  try {
    const n = nick(formData);
    await rcon(comandoWhitelist(n, 'add'));
    revalidatePath('/');
    const via = n.edicao === 'bedrock' ? ' (Bedrock)' : '';
    return { ok: true, msg: `${n.completo} liberado${via}.` };
  } catch (err) {
    return falha(err);
  }
}

export async function say(_prev: Resultado | null, formData: FormData): Promise<Resultado> {
  try {
    const msg = String(formData.get('mensagem') ?? '').trim();
    if (!msg) return { ok: false, msg: 'Mensagem vazia.' };
    await rcon(`say ${msg}`);
    return { ok: true, msg: 'Enviado ao chat do jogo.' };
  } catch (err) {
    return falha(err);
  }
}

export async function runCommand(_prev: Resultado | null, formData: FormData): Promise<Resultado> {
  try {
    const cmd = String(formData.get('comando') ?? '').trim();
    if (!cmd) return { ok: false, msg: 'Digite um comando.' };
    const out = await rcon(cmd);
    revalidatePath('/');
    return { ok: true, msg: out.trim() || '(sem saída)' };
  } catch (err) {
    return falha(err);
  }
}

/* ---- ações sem retorno: a tela reflete o efeito sozinha -------------- */

export async function removeWhitelist(formData: FormData) {
  await rcon(comandoWhitelist(nick(formData), 'remove'));
  revalidatePath('/');
}

export async function setWhitelist(formData: FormData) {
  const ligar = String(formData.get('ligar')) === 'true';
  await rcon(`whitelist ${ligar ? 'on' : 'off'}`);
  revalidatePath('/');
}

export async function kick(formData: FormData) {
  await rcon(comandoKick(nick(formData), 'Removido pelo painel'));
  revalidatePath('/');
}

export async function saveWorld() {
  await rcon('save-all');
  revalidatePath('/');
}
