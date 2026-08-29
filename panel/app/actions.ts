'use server';

import { revalidatePath } from 'next/cache';
import { rcon } from '../lib/rcon';

/** Nick do Minecraft: 3-16 caracteres, letras, números e underscore. */
const NICK = /^[A-Za-z0-9_]{3,16}$/;

export type Resultado = { ok: boolean; msg: string };

function nick(formData: FormData, campo = 'nick'): string {
  const valor = String(formData.get(campo) ?? '').trim();
  if (!NICK.test(valor)) {
    throw new Error(`"${valor}" não é um nick válido (3-16 letras, números ou _).`);
  }
  return valor;
}

function falha(err: unknown): Resultado {
  return { ok: false, msg: err instanceof Error ? err.message : String(err) };
}

/* ---- ações com retorno para a tela ---------------------------------- */

export async function addWhitelist(_prev: Resultado | null, formData: FormData): Promise<Resultado> {
  try {
    const n = nick(formData);
    await rcon(`whitelist add ${n}`);
    revalidatePath('/');
    return { ok: true, msg: `${n} liberado.` };
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
  await rcon(`whitelist remove ${nick(formData)}`);
  revalidatePath('/');
}

export async function setWhitelist(formData: FormData) {
  const ligar = String(formData.get('ligar')) === 'true';
  await rcon(`whitelist ${ligar ? 'on' : 'off'}`);
  revalidatePath('/');
}

export async function kick(formData: FormData) {
  await rcon(`kick ${nick(formData)} Removido pelo painel`);
  revalidatePath('/');
}

export async function saveWorld() {
  await rcon('save-all');
  revalidatePath('/');
}
