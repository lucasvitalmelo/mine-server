# Crossplay Bedrock + Java (Geyser + Floodgate) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar jogadores de Minecraft Bedrock (console, celular, Windows) entrarem no mesmo servidor Paper que os jogadores de Java já usam, sem quebrar o painel de administração.

**Architecture:** Dois plugins entram no servidor Paper via a variável `PLUGINS` da imagem `itzg/minecraft-server`: o **Geyser** traduz pacotes de Bedrock para Java numa porta UDP separada, e o **Floodgate** deixa entrar quem não tem conta Java. Como o Floodgate prefixa o nick de Bedrock com `.`, o painel Next.js passa a ter duas gramáticas de nome ao mesmo tempo — então a validação e o roteamento de comando saem de `actions.ts` para um módulo próprio com testes.

**Tech Stack:** Docker Compose · itzg/minecraft-server (Paper) · Geyser-Spigot · Floodgate · Next.js 15 App Router · TypeScript · Vitest

---

## Escopo

**Dentro:** plugins Geyser/Floodgate, porta UDP, fixação da versão do Paper, validação e roteamento de nick no painel, `error.tsx`, documentação.

**Fora:** os 17 achados da revisão de 2026-08-29. Eles são um plano separado e **não foram esquecidos**. A única exceção é a Task 4 (`error.tsx`), incluída porque as ações que estouram estão exatamente no raio de alcance deste plano.

## Fatos verificados (2026-09-09)

Confirmados por pesquisa antes de escrever o plano. Se algum mudar, o plano muda.

| Fato | Valor | Por que importa |
|---|---|---|
| Geyser emula cliente Java | **26.2** | Se o Paper passar disso, o Bedrock para de conectar |
| Geyser aceita Bedrock | 26.0 – 26.45 | Cliente de console se atualiza sozinho |
| MC 26.3 | lançando em setembro/2026 | `MC_VERSION=LATEST` quebraria o Bedrock em dias |
| Prefixo do Floodgate | `.` (default) | Decisão: **manter**. Deixa óbvio quem é de Bedrock |
| `replace-spaces` do Floodgate | **ligar** (default é `false`) | Sem isso o nick tem espaço e o `kick` quebra — ver Correção abaixo |
| `fwhitelist` | quer o nick **SEM** o prefixo | A wiki é explícita: "The username prefix doesn't need to be included" |
| `kick` | quer o nick **COM** o prefixo | Duas regras para a mesma string — a fonte de bug mais provável aqui |
| Porta Bedrock | 19132 **UDP** | O `ports:` de hoje só publica TCP |
| Firewall que importa | painel da Hostinger, **não** `ufw` | README:57 já explica: Docker escreve na chain `DOCKER` e passa por cima do ufw |
| Geyser precisa de Java | 21+ | `MC_IMAGE_TAG=java25` atende |

## Decisões tomadas antes do plano

1. **Manter o prefixo `.`** e adaptar o painel (em vez de zerar o prefixo).
2. **Fixar `MC_VERSION`** em 26.2 (em vez de manter `LATEST`).
3. **O painel roteia para `fwhitelist`** automaticamente (em vez de exigir o console).
4. **Ligar `replace-spaces`** no Floodgate (decidido durante a execução — ver Correção abaixo).

## Correção aplicada durante a execução

O plano original aceitava espaço em nick de Bedrock, porque o `replace-spaces` do Floodgate vem desligado e gamertag de Xbox tem espaço. **Isso estava errado e a revisão de código pegou.**

O comando do jogo é `kick <alvo> [<motivo>]` e separa argumentos por espaço, sem aceitar aspas em nome de jogador. Um nick `.Gamer Tag` produziria:

```
kick .Gamer Tag Removido pelo painel
```

O servidor procuraria o jogador `.Gamer` com motivo `Tag Removido pelo painel`. Ninguém é expulso e **nenhum erro é levantado** — exatamente a falha silenciosa que o módulo existe para evitar. Também derrubaria o critério de aceite da Task 9 Step 4.

**Decisão:** ligar `replace-spaces` no Floodgate, então `Gamer Tag` chega como `.Gamer_Tag`. O prefixo `.` continua (é outra configuração). Consequências, todas já aplicadas:

- `panel/lib/nick.ts` recusa espaço; os regex `JAVA` e `GAMERTAG` colapsaram no único `NOME = /^[A-Za-z0-9_]{3,16}$/`, já que sem espaço as duas gramáticas viram a mesma.
- A suíte foi de 11 para 12 testes. O décimo segundo é guarda de regressão: verifica que o alvo do comando nunca contém espaço.
- A Task 7 ganhou um passo para o config do Floodgate.
- Commits: `520479c` (gramática) e `c3b36d7` (mensagem de erro citando o prefixo).

**Os blocos de código da Task 2 abaixo são o texto original do plano e foram superados por `520479c`.** Ficam como registro; o estado real do módulo é o do commit.

## Situação

Tasks 1, 2, 3, 4, 5, 6 e 8 executadas na branch `feat/bedrock-crossplay` (11
commits). O conteúdo da Task 8 Step 2 e Step 3 foi estendido depois da
execução — a revisão final do README acrescentou o bloco de configuração
obrigatória (`auth-type` e `replace-spaces`) que faltava na seção "Bedrock no
mesmo servidor".

Tasks 7 e 9 **não foram executadas**: ambas rodam contra o VPS ao vivo (`docker
exec`, o painel de firewall da Hostinger) e clientes reais do jogo, fora do
alcance desta sessão. Ficam abertas para quando o deploy acontecer de fato.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `panel/lib/nick.ts` **(criar)** | Única fonte de verdade sobre gramática de nick e qual comando RCON cada edição recebe. Puro, sem I/O — por isso é testável. |
| `panel/lib/nick.test.ts` **(criar)** | Trava as regras que divergem entre `fwhitelist` e `kick`. |
| `panel/app/error.tsx` **(criar)** | Rede de proteção para as ações que estouram. |
| `panel/app/actions.ts` **(modificar)** | Passa a delegar validação e montagem de comando para `lib/nick.ts`. |
| `panel/package.json` **(modificar)** | Ganha `vitest` e o script `test`. |
| `docker-compose.yml` **(modificar)** | `PLUGINS`, porta UDP, versão fixa. |
| `.env.example` **(modificar)** | `MC_VERSION` fixo, `MC_BEDROCK_PORT`. |
| `README.md` **(modificar)** | Como conectar do Bedrock e como diagnosticar UDP. |

**Por que um arquivo novo em vez de mexer só em `actions.ts`:** `actions.ts` é `'use server'`. Testar qualquer coisa lá dentro arrasta o runtime de server actions do Next. `lib/nick.ts` é função pura de string — testa em milissegundos, e é onde vive a regra que erra fácil.

---

### Task 1: Pôr um test runner no painel

O painel não tem nenhum teste hoje. Vale a exceção porque as Tasks 2 e 3 introduzem uma regra não óbvia (o prefixo entra no `kick`, sai no `fwhitelist`) que quebra em silêncio: o comando errado não levanta erro, só volta "player not found" e o clique parece não ter funcionado. O custo é uma devDependency que **nunca chega na imagem de produção** — o `Dockerfile` faz `npm ci` só no estágio `builder`, e o `runner` copia apenas a saída `standalone`.

**Files:**
- Modify: `panel/package.json:5-9` (scripts) e `panel/package.json:16-21` (devDependencies)

- [x] **Step 1: Instalar o vitest**

```bash
cd panel && npm install -D vitest
```

- [x] **Step 2: Adicionar o script `test`**

Em `panel/package.json`, o bloco `scripts` passa de:

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
```

para:

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run"
  },
```

- [x] **Step 3: Verificar que o runner sobe sem teste nenhum**

Run: `cd panel && npm test`
Expected: sai com "No test files found" e código de saída diferente de 0. É o estado esperado antes da Task 2 — confirma que o vitest está instalado e procurando.

- [x] **Step 4: Confirmar que a produção não foi afetada**

Run: `cd panel && grep -n 'vitest' package.json && grep -n 'npm ci' Dockerfile`
Expected: `vitest` aparece dentro de `devDependencies`, e o `npm ci` do Dockerfile está na linha 6, no estágio `builder`. O estágio `runner` (linhas 11-20) não roda `npm`.

- [x] **Step 5: Commit**

```bash
git add panel/package.json panel/package-lock.json
git commit -m "chore: adicionar vitest ao painel"
```

---

### Task 2: Gramática de nick e roteamento de comando

**Files:**
- Create: `panel/lib/nick.ts`
- Test: `panel/lib/nick.test.ts`

- [x] **Step 1: Escrever os testes que falham**

Crie `panel/lib/nick.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validarNick, comandoWhitelist, comandoKick } from './nick';

describe('validarNick', () => {
  it('aceita nick de Java e nao mexe nele', () => {
    expect(validarNick('Lucas_Vital')).toEqual({
      edicao: 'java',
      completo: 'Lucas_Vital',
      semPrefixo: 'Lucas_Vital',
    });
  });

  it('aceita nick de Bedrock com prefixo e espaco no meio', () => {
    expect(validarNick('.Gamer Tag')).toEqual({
      edicao: 'bedrock',
      completo: '.Gamer Tag',
      semPrefixo: 'Gamer Tag',
    });
  });

  it('tira espaco das pontas antes de validar', () => {
    expect(validarNick('  Lucas_Vital  ').completo).toBe('Lucas_Vital');
    expect(validarNick(' .Gamer Tag ').semPrefixo).toBe('Gamer Tag');
  });

  it('recusa nick de Java curto ou com caractere que o jogo nao aceita', () => {
    expect(() => validarNick('ab')).toThrow(/nao e um nick valido/);
    expect(() => validarNick('lucas;stop')).toThrow(/nao e um nick valido/);
    expect(() => validarNick('Lucas Vital')).toThrow(/nao e um nick valido/);
  });

  it('recusa Bedrock com espaco duplo ou espaco colado no prefixo', () => {
    expect(() => validarNick('.Gamer  Tag')).toThrow(/Bedrock/);
    expect(() => validarNick('. GamerTag')).toThrow(/Bedrock/);
  });

  it('recusa so o prefixo, ou prefixo com nome curto', () => {
    expect(() => validarNick('.')).toThrow(/Bedrock/);
    expect(() => validarNick('.ab')).toThrow(/Bedrock/);
  });

  it('recusa Bedrock com nome longo demais', () => {
    expect(() => validarNick('.' + 'a'.repeat(17))).toThrow(/Bedrock/);
  });
});

describe('comandoWhitelist', () => {
  it('no Java usa whitelist com o nome inteiro', () => {
    expect(comandoWhitelist(validarNick('Lucas_Vital'), 'add')).toBe(
      'whitelist add Lucas_Vital',
    );
    expect(comandoWhitelist(validarNick('Lucas_Vital'), 'remove')).toBe(
      'whitelist remove Lucas_Vital',
    );
  });

  it('no Bedrock usa fwhitelist e TIRA o prefixo', () => {
    expect(comandoWhitelist(validarNick('.Gamer Tag'), 'add')).toBe(
      'fwhitelist add Gamer Tag',
    );
    expect(comandoWhitelist(validarNick('.Gamer Tag'), 'remove')).toBe(
      'fwhitelist remove Gamer Tag',
    );
  });
});

describe('comandoKick', () => {
  it('MANTEM o prefixo do Bedrock, ao contrario do fwhitelist', () => {
    expect(comandoKick(validarNick('.Gamer Tag'), 'Removido pelo painel')).toBe(
      'kick .Gamer Tag Removido pelo painel',
    );
  });

  it('no Java e o nome puro', () => {
    expect(comandoKick(validarNick('Lucas_Vital'), 'Removido pelo painel')).toBe(
      'kick Lucas_Vital Removido pelo painel',
    );
  });
});
```

- [x] **Step 2: Rodar e confirmar que falha**

Run: `cd panel && npm test`
Expected: FAIL — "Failed to resolve import './nick'". O arquivo ainda não existe.

- [x] **Step 3: Escrever a implementação mínima**

Crie `panel/lib/nick.ts`. As mensagens de erro vão sem acento, seguindo o padrão de `lib/props.ts` e `lib/rcon.ts`:

```ts
/**
 * Validacao de nick e escolha de comando, num servidor que aceita as duas
 * edicoes do jogo.
 *
 * Quem entra pelo Bedrock passa pelo Floodgate, que prefixa o nick com "."
 * e nao troca espacos (`replace-spaces: false`, o default). Ou seja, o mesmo
 * servidor tem duas gramaticas de nome ao mesmo tempo:
 *
 *   Java     Lucas_Vital    letras, numeros e _
 *   Bedrock  .Gamer Tag     prefixo "." e espacos no meio
 *
 * E os comandos divergem: o `fwhitelist` do Floodgate quer o nome SEM o
 * prefixo, enquanto o `kick` do vanilla quer o nome exatamente como o
 * servidor conhece — COM o prefixo. Errar isso nao levanta erro: o comando
 * volta "player not found" e o clique parece nao ter feito nada. Por isso
 * cada uma das duas regras tem teste proprio.
 */

export const PREFIXO_BEDROCK = '.';

export type Edicao = 'java' | 'bedrock';

export type NickValidado = {
  edicao: Edicao;
  /** Como o servidor conhece o jogador. Com prefixo, se for Bedrock. */
  completo: string;
  /** Sem o prefixo. E o que o `fwhitelist` espera. */
  semPrefixo: string;
};

/** Java: 3-16, letras, numeros e underscore. */
const JAVA = /^[A-Za-z0-9_]{3,16}$/;

/**
 * Gamertag: blocos de letras/numeros/underscore separados por UM espaco.
 * A forma da regex ja recusa espaco nas pontas e espaco duplo, sem precisar
 * de lookbehind.
 */
const GAMERTAG = /^[A-Za-z0-9_]+(?: [A-Za-z0-9_]+)*$/;

export function validarNick(bruto: string): NickValidado {
  const valor = bruto.trim();

  if (valor.startsWith(PREFIXO_BEDROCK)) {
    const semPrefixo = valor.slice(PREFIXO_BEDROCK.length);
    if (semPrefixo.length < 3 || semPrefixo.length > 16 || !GAMERTAG.test(semPrefixo)) {
      throw new Error(
        `"${valor}" nao e um nick de Bedrock valido (o "." e depois 3-16 letras, ` +
          `numeros, _ ou espaco simples).`,
      );
    }
    return { edicao: 'bedrock', completo: valor, semPrefixo };
  }

  if (!JAVA.test(valor)) {
    throw new Error(`"${valor}" nao e um nick valido (3-16 letras, numeros ou _).`);
  }

  return { edicao: 'java', completo: valor, semPrefixo: valor };
}

export function comandoWhitelist(n: NickValidado, acao: 'add' | 'remove'): string {
  return n.edicao === 'bedrock'
    ? `fwhitelist ${acao} ${n.semPrefixo}`
    : `whitelist ${acao} ${n.completo}`;
}

export function comandoKick(n: NickValidado, motivo: string): string {
  return `kick ${n.completo} ${motivo}`;
}
```

- [x] **Step 4: Rodar e confirmar que passa**

Run: `cd panel && npm test`
Expected: PASS — 11 testes em 3 suítes.

- [x] **Step 5: Confirmar que os tipos fecham**

Run: `cd panel && npx tsc --noEmit`
Expected: sem saída, exit 0.

- [x] **Step 6: Commit**

```bash
git add panel/lib/nick.ts panel/lib/nick.test.ts
git commit -m "feat: gramatica de nick e roteamento de comando para Bedrock"
```

---

### Task 3: Ligar as server actions no novo módulo

Sem esta task, o primeiro jogador de Bedrock que aparecer na tela derruba o painel: o chip dele vem com `<form action={kick}>` e o `NICK` atual rejeita o `.` e o espaço.

**Files:**
- Modify: `panel/app/actions.ts:1-18` (imports e helper) e `panel/app/actions.ts:26-73` (as ações)

- [x] **Step 1: Trocar o topo do arquivo**

Em `panel/app/actions.ts`, as linhas 1-18 passam de:

```ts
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
```

para:

```ts
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
```

- [x] **Step 2: Trocar `addWhitelist`**

O bloco das linhas 26-36 passa de:

```ts
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
```

para:

```ts
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
```

O sufixo `(Bedrock)` não é enfeite: é a confirmação visível de que o painel roteou para `fwhitelist`, e é o que a Task 9 Step 5 verifica.

- [x] **Step 3: Trocar `removeWhitelist` e `kick`**

O bloco das linhas 61-73 passa de:

```ts
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
```

para:

```ts
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
```

`setWhitelist` não muda: `whitelist on|off` é estado global do servidor e não recebe nick.

- [x] **Step 4: Confirmar que não sobrou nick interpolado na mão**

Run: `cd panel && grep -n 'whitelist add\|whitelist remove\|kick ' app/actions.ts`
Expected: nenhuma linha. As três montagens agora vêm de `lib/nick.ts`. Se aparecer alguma, um dos passos acima não foi aplicado.

- [x] **Step 5: Confirmar tipos e testes**

Run: `cd panel && npx tsc --noEmit && npm test`
Expected: `tsc` sem saída (exit 0) e os 11 testes passando.

- [x] **Step 6: Ver a tela de pé com RCON simulado**

```bash
cd panel && PANEL_DEV_BYPASS=true PANEL_DEV_FAKE_RCON=true npm run dev
```

Abra `http://localhost:3000`.
Expected: o painel renderiza e "Quem está online" mostra `LucasVital` e `AmigoDaLive` (vêm de `lib/rcon.ts:29`), sem erro no console do navegador. Encerre com Ctrl+C.

- [x] **Step 7: Commit**

```bash
git add panel/app/actions.ts
git commit -m "feat: painel roteia whitelist e kick por edicao do jogador"
```

---

### Task 4: Rede de proteção para as ações que estouram

`removeWhitelist`, `setWhitelist`, `kick` e `saveWorld` não têm `try/catch`, e o app não tem `error.tsx`. Com o RCON fora, um clique troca o painel inteiro pela tela genérica do Next, sem o `AutoRefresh` — e só recarregar na mão devolve o painel.

**Files:**
- Create: `panel/app/error.tsx`

- [x] **Step 1: Criar o error boundary**

Crie `panel/app/error.tsx`:

```tsx
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
```

- [x] **Step 2: Confirmar que os tipos fecham**

Run: `cd panel && npx tsc --noEmit`
Expected: sem saída, exit 0.

- [x] **Step 3: Ver o boundary funcionando**

```bash
cd panel && PANEL_DEV_BYPASS=true npm run dev
```

`PANEL_DEV_FAKE_RCON` fica **de fora de propósito**: sem ele, `lib/rcon.ts:45` estoura por falta de `RCON_PASSWORD`, que é exatamente o caminho de erro que queremos exercitar.

Abra `http://localhost:3000` e clique em "Salvar o mundo agora".
Expected: aparece "O painel tropecou" com a mensagem "RCON_PASSWORD não está definida no painel.", e "Tentar de novo" volta para o painel. Encerre com Ctrl+C.

- [x] **Step 4: Commit**

```bash
git add panel/app/error.tsx
git commit -m "feat: error boundary no painel"
```

---

### Task 5: Fixar a versão do Paper em 26.2

O Geyser emula um cliente Java **26.2**, e o MC **26.3** sai neste mês. Com `MC_VERSION=LATEST`, um redeploy qualquer levanta o Paper em 26.3 e o Bedrock para de conectar sem nada ter mudado no seu deploy. O `.env.example:50-54` já recomendava fixar; esta task cumpre a própria recomendação, agora com motivo forte.

**Files:**
- Modify: `.env.example:44-55`

- [x] **Step 1: Trocar o bloco de versão**

Em `.env.example`, as linhas 44-55 passam de:

```
# Versão do Minecraft. LATEST pega a última build estável do Paper.
#
# ACOPLADO A MC_IMAGE_TAG: cada versão do Minecraft exige uma versão mínima
# de Java. Se a imagem tiver Java velho, o servidor sai com exitCode 1 em
# loop e a porta nunca abre. Ex.: MC 26.1 exige Java 25.
#
# Depois que o servidor subir, PINE a versão com o número exato que aparece
# no log — assim um redeploy não troca de versão debaixo dos seus jogadores,
# obrigando todos a atualizar o cliente sem aviso:
#   docker logs $(docker ps -qf name=minecraft) | grep -i "server version"
MC_VERSION=LATEST
```

para:

```
# Versão do Minecraft. FIXA de propósito — não volte para LATEST.
#
# ACOPLADO AO GEYSER: o Geyser emula um cliente Java 26.2. Se o Paper subir
# além disso, os jogadores de Bedrock param de conectar do nada, num deploy
# em que você não mexeu em nada. Subir de versão virou ato deliberado: veja
# em https://geysermc.org/wiki/geyser/supported-versions/ qual Java o Geyser
# emula hoje e mude os dois juntos.
#
# ACOPLADO A MC_IMAGE_TAG: cada versão do Minecraft exige uma versão mínima
# de Java. Se a imagem tiver Java velho, o servidor sai com exitCode 1 em
# loop e a porta nunca abre. MC 26.1 e 26.2 exigem Java 25 — confirme no
# primeiro boot com:
#   docker logs $(docker ps -qf name=minecraft) 2>&1 | grep -i "java version"
MC_VERSION=26.2
```

- [x] **Step 2: Confirmar que a tag do Java continua compatível**

Run: `grep -n 'MC_IMAGE_TAG' .env.example`
Expected: `MC_IMAGE_TAG=java25`. O Geyser pede Java 21+ e o MC 26.2 pede Java 25, então `java25` atende aos dois.

**Se este valor não for `java25`, pare aqui** e corrija antes de seguir — MC 26.2 em Java velho entra em loop de restart sem nunca abrir a porta.

- [x] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: fixar MC_VERSION em 26.2 por causa do Geyser"
```

---

### Task 6: Plugins e porta UDP no compose

**Files:**
- Modify: `docker-compose.yml:18-30` (ports e início do environment)
- Modify: `.env.example:62-67` (bloco de porta)

- [x] **Step 1: Publicar a porta UDP**

Em `docker-compose.yml`, as linhas 18-22 passam de:

```yaml
    # Minecraft Java é TCP bruto, NÃO é HTTP — não passa pelo Traefik do
    # Coolify. Deixe o campo de domínio VAZIO no Coolify e libere a porta
    # no firewall do VPS: sudo ufw allow 25565/tcp
    ports:
      - "${MC_PORT:-25565}:25565"
```

para:

```yaml
    # Minecraft não é HTTP — não passa pelo Traefik do Coolify. Deixe o campo
    # de domínio VAZIO no Coolify e libere as portas no firewall do PROVEDOR
    # (na Hostinger: VPS -> Firewall). `ufw` no VPS é inócuo aqui: o Docker
    # escreve na chain DOCKER do iptables e passa por cima dele.
    ports:
      # Java: TCP.
      - "${MC_PORT:-25565}:25565"
      # Bedrock: UDP, e a porta é outra. Sem o `/udp` aqui o cliente de
      # Bedrock não lista nem conecta — e não dá mensagem de erro que ajude.
      - "${MC_BEDROCK_PORT:-19132}:19132/udp"
```

O comentário antigo mandava `ufw allow 25565/tcp`, contradizendo o próprio README:57 que chama isso de inócuo. O texto novo resolve a contradição.

- [x] **Step 2: Fixar a versão e adicionar os plugins**

Em `docker-compose.yml`, a linha `VERSION: "${MC_VERSION:-LATEST}"` passa a:

```yaml
      VERSION: "${MC_VERSION:-26.2}"
```

E logo depois dela, insira:

```yaml
      # --- Crossplay com Bedrock -----------------------------------------
      # Geyser traduz os pacotes de Bedrock para Java. Floodgate deixa
      # entrar quem NÃO tem conta Java — console e celular. Sem o Floodgate,
      # o Geyser sozinho só aceita quem também comprou o Java, o que exclui
      # quase todo mundo que você quer convidar.
      #
      # Os dois ficam em `latest` de propósito, ao contrário do Paper: o
      # cliente de Bedrock se atualiza sozinho no console, então o Geyser
      # precisa acompanhar. É o Paper que fica preso em 26.2, porque é essa
      # a versão de cliente Java que o Geyser emula.
      #
      # O `auth-type` do Geyser ainda precisa ir para `floodgate` na mão,
      # uma vez, depois do primeiro boot. Ver Task 7 do plano e o README.
      PLUGINS: |
        https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot
        https://download.geysermc.org/v2/projects/floodgate/versions/latest/builds/latest/downloads/spigot
```

- [x] **Step 3: Documentar a porta nova**

Em `.env.example`, depois da linha `MC_PORT=25565`, insira:

```
# Porta do Bedrock (Geyser). UDP, não TCP. Se mudar, o jogador de Bedrock
# precisa digitar a porta na tela de servidor do jogo, e a regra no firewall
# do provedor tem que acompanhar.
MC_BEDROCK_PORT=19132
```

- [x] **Step 4: Validar o compose antes de qualquer deploy**

```bash
chk=$(mktemp) && cat .env.example > "$chk" && printf 'RCON_PASSWORD=x\nPANEL_PASSWORD=y\n' >> "$chk"
docker compose --env-file "$chk" config | grep -B2 -A6 'published'
rm -f "$chk"
```

O arquivo temporário fica **fora do repositório** de propósito. Uma versão anterior deste passo criava `.env.check` na raiz, e o `.gitignore` só cobre `.env` e `.env.local` — ou seja, um arquivo com senhas de mentira ficava a um `git add .` de ser comitado.

Expected: aparecem as duas publicações — `25565` com `protocol: tcp` e `19132` com `protocol: udp`. Se o 19132 sair como `tcp`, o `/udp` do Step 1 não foi aplicado.

Preenchemos `RCON_PASSWORD` e `PANEL_PASSWORD` no arquivo temporário porque o compose usa `${VAR:?}` nas duas e a interpolação falha com valor vazio. Isso é um achado da revisão que **este plano não corrige** — só contorna para validar.

- [x] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "feat: Geyser e Floodgate com porta UDP do Bedrock"
```

---

### Task 7: Apontar o Geyser para o Floodgate

O Geyser sobe com `auth-type: online`, que exige conta Java. Sem trocar para `floodgate`, os plugins instalam, a porta abre, o servidor até aparece na lista do Bedrock — e a conexão morre na autenticação. É a falha mais confusa de toda a montagem, porque tudo parece certo.

Isto é um passo manual de uma vez, não declarativo, e foi decisão consciente: o `config.yml` do Geyser só existe **depois** do primeiro boot, então um `PATCH_DEFINITIONS` no startup não teria arquivo para corrigir no boot inicial e passaria em silêncio. O volume `minecraft-data` sobrevive a redeploy, então o passo vale uma vez. **Se o volume for recriado, repita esta task.**

**Files:** nenhum arquivo do repositório. Roda no VPS.

- [ ] **Step 1: Fazer o deploy com o que as Tasks 5 e 6 mudaram**

No Coolify: adicione `MC_BEDROCK_PORT=19132` e mude `MC_VERSION` para `26.2` nas Environment Variables, depois Deploy. Aguarde o primeiro boot terminar — ele baixa o Paper 26.2 e os dois plugins, e é lento.

- [ ] **Step 2: Confirmar que os plugins carregaram**

```bash
docker logs $(docker ps -qf name=minecraft) 2>&1 | grep -iE 'geyser|floodgate'
```

Expected: linhas de carregamento do Geyser e do Floodgate.
Se não aparecer nada, confira o que baixou: `docker exec $(docker ps -qf name=minecraft) ls /data/plugins`

- [ ] **Step 3: Ver o valor errado antes de corrigir**

```bash
docker exec $(docker ps -qf name=minecraft) grep -n '^auth-type' /data/plugins/Geyser-Spigot/config.yml
```

Expected: `auth-type: online` — o default, e o estado que quebra o Bedrock.

Se o comando disser que o arquivo não existe, o servidor ainda não terminou de subir ou o Geyser não carregou. Volte ao Step 2.

- [ ] **Step 4: Trocar para floodgate**

```bash
docker exec $(docker ps -qf name=minecraft) sed -i 's/^auth-type: .*/auth-type: floodgate/' /data/plugins/Geyser-Spigot/config.yml
```

- [ ] **Step 4b: Ligar o `replace-spaces` do Floodgate**

Este é outro arquivo, de outro plugin. Sem isso, a gamertag `Gamer Tag` entra como `.Gamer Tag` e o `kick` do painel procura um jogador chamado `.Gamer` — não expulsa ninguém e não dá erro. O painel já recusa nick com espaço (`panel/lib/nick.ts`), então sem este passo o × simplesmente não funciona para esses jogadores.

Veja o valor atual:

```bash
docker exec $(docker ps -qf name=minecraft) grep -n 'replace-spaces' /data/plugins/floodgate/config.yml
```

Expected: `replace-spaces: false` — o default.

Troque:

```bash
docker exec $(docker ps -qf name=minecraft) sed -i 's/^replace-spaces: .*/replace-spaces: true/' /data/plugins/floodgate/config.yml
```

Se o `grep` não achar o arquivo, confirme o nome da pasta com `docker exec $(docker ps -qf name=minecraft) ls /data/plugins` — dependendo da build, o Floodgate cria `floodgate/` ou `Floodgate/`.

- [ ] **Step 5: Confirmar as duas trocas, e só então reiniciar**

```bash
docker exec $(docker ps -qf name=minecraft) grep -n '^auth-type' /data/plugins/Geyser-Spigot/config.yml
docker exec $(docker ps -qf name=minecraft) grep -n 'replace-spaces' /data/plugins/floodgate/config.yml
```

Expected: `auth-type: floodgate` e `replace-spaces: true`. As duas, antes de reiniciar.

Confirmado, reinicie pelo botão Restart do Coolify ou:

```bash
docker restart $(docker ps -qf name=minecraft)
```

- [ ] **Step 6: Confirmar que o Geyser subiu escutando UDP**

```bash
docker logs $(docker ps -qf name=minecraft) 2>&1 | grep -i 'geyser'
sudo ss -ulnp | grep 19132
```

Expected: o log confirma o Geyser iniciado, e o `ss` mostra algo escutando em 19132.

Repare no `-u`: **`ss -ulnp` é UDP**, diferente do `ss -tlnp` que o README:109 usa para o Java. Copiar o comando de TCP aqui dá falso negativo e manda você caçar um container saudável.

- [ ] **Step 7: Liberar a porta no firewall do provedor**

Na Hostinger: VPS → Firewall → nova regra, **UDP**, porta 19132.

Não use `ufw`: como o README:57 explica, portas publicadas pelo Docker escrevem na chain `DOCKER` do iptables e passam por cima dele.

---

### Task 8: Documentar

**Files:**
- Modify: `README.md:53-55` (passo do firewall)
- Modify: `README.md` (nova seção depois de "Não consigo conectar", que termina na linha 116)

- [x] **Step 1: Incluir a porta UDP no passo do firewall**

Em `README.md`, as linhas 53-55 passam de:

```
**5. Libere a porta 25565/TCP no firewall do painel do provedor.**

Na Hostinger: VPS → Firewall → nova regra, TCP, porta 25565.
```

para:

```
**5. Libere as portas no firewall do painel do provedor.**

Duas regras, porque as duas edições do jogo usam protocolos diferentes:

| Edição | Porta | Protocolo |
|---|---|---|
| Java | 25565 | TCP |
| Bedrock | 19132 | **UDP** |

Na Hostinger: VPS → Firewall → uma regra para cada linha da tabela.
```

- [x] **Step 2: Acrescentar o diagnóstico de UDP**

Em `README.md`, depois da linha 116 (a que termina em "Investigue com `docker ps -a` e `docker logs $(docker ps -aqf name=minecraft)`."), insira o texto abaixo. Ele contém blocos de código, então está delimitado aqui com quatro backticks — escreva no README apenas o conteúdo interno, com os três backticks normais:

````
### Java conecta, Bedrock não

O diagnóstico é outro comando, porque o Bedrock é UDP — `-u` no lugar do `-t`:

```bash
sudo ss -ulnp | grep 19132
```

- **Aparece algo escutando** → o Geyser está de pé. Falta a regra **UDP** no
  firewall do provedor, ou o `auth-type` do Geyser não está em `floodgate`.
  Confira o segundo com:

```bash
docker exec $(docker ps -qf name=minecraft) grep '^auth-type' /data/plugins/Geyser-Spigot/config.yml
```

- **Não aparece nada** → o Geyser não carregou. Veja
  `docker logs $(docker ps -qf name=minecraft) 2>&1 | grep -i geyser`.

Se o servidor aparece na lista mas a conexão morre na autenticação, é o
`auth-type`. Ele volta para `online` se o volume `minecraft-data` for
recriado — nesse caso, reaplique:

```bash
docker exec $(docker ps -qf name=minecraft) sed -i 's/^auth-type: .*/auth-type: floodgate/' /data/plugins/Geyser-Spigot/config.yml
docker restart $(docker ps -qf name=minecraft)
```
````

- [x] **Step 3: Documentar como o Bedrock conecta e o prefixo do nick**

Em `README.md`, depois da seção criada no Step 2, insira (mesma convenção: escreva com três backticks):

````
## Bedrock no mesmo servidor

O servidor aceita as duas edições ao mesmo tempo, via
[Geyser](https://geysermc.org/) (traduz os pacotes) e Floodgate (deixa entrar
quem não tem conta Java). Console, celular e Windows entram normalmente.

No jogo: Servidores → Adicionar servidor, IP do VPS, **porta 19132**.

### O nick de quem entra pelo Bedrock tem um ponto na frente

O Floodgate prefixa o nome com `.` para não colidir com um jogador de Java de
mesmo nome. E como o `replace-spaces` está ligado neste servidor, espaço da
gamertag vira `_`: `Gamer Tag` no Xbox aparece como `.Gamer_Tag` no servidor.

Espaço fica de fora porque o comando do jogo é `kick <alvo> [<motivo>]` e ele
separa os argumentos por espaço, sem aceitar aspas em nome de jogador. Um nick
com espaço faria o servidor procurar só o primeiro pedaço, sem expulsar ninguém
e sem dar erro.

Isso muda os comandos, e o painel já trata a diferença sozinho
(`panel/lib/nick.ts`):

| Ação | Java | Bedrock |
|---|---|---|
| Liberar na whitelist | `whitelist add Nick` | `fwhitelist add Gamer_Tag` (**sem** o ponto) |
| Expulsar | `kick Nick` | `kick .Gamer_Tag` (**com** o ponto) |

Se for digitar no campo de Console do painel, respeite a coluna certa: o
comando errado não dá erro, só volta "player not found".

### A versão do Paper está fixa por causa disto

`MC_VERSION=26.2` não é arbitrário: é a versão de cliente Java que o Geyser
emula. Voltar para `LATEST` derruba o Bedrock no próximo redeploy que pegar uma
versão nova. Para atualizar, veja qual Java o Geyser emula em
[supported-versions](https://geysermc.org/wiki/geyser/supported-versions/) e
mude os dois juntos.
````

- [x] **Step 4: Conferir que o README não ficou se contradizendo**

Run: `grep -n 'ufw allow' README.md docker-compose.yml`
Expected: nenhuma linha manda rodar `ufw allow` como se resolvesse. O que sobrar deve ser só a explicação de por que é inócuo (README:57).

- [x] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: crossplay Bedrock, prefixo do nick e diagnostico UDP"
```

---

### Task 9: Verificação de ponta a ponta

**Files:** nenhum.

- [ ] **Step 1: Java continua entrando**

Conecte com o cliente Java em `IP_DO_VPS:25565`.
Expected: entra normalmente. Se o launcher pedir para atualizar, é porque o cliente está em 26.3 e o servidor está fixo em 26.2 — use o perfil 26.2.

- [ ] **Step 2: Bedrock entra**

No celular ou console: Servidores → Adicionar servidor → IP do VPS, porta 19132.
Expected: conecta, e o jogador aparece no mundo junto do jogador de Java.

- [ ] **Step 3: O painel vê o jogador de Bedrock com o ponto**

Abra o painel.
Expected: em "Quem está online" o jogador de Bedrock aparece como `.Nick`, com o × ao lado.

- [ ] **Step 4: Expulsar pelo painel funciona — o teste que fecha o plano**

Clique no × do jogador de Bedrock.
Expected: ele é desconectado do jogo e o painel **continua de pé**. Antes da Task 3 este clique estourava no regex `NICK` e trocava o painel pela tela de erro.

- [ ] **Step 5: Liberar na whitelist funciona nas duas edições**

Com a whitelist ligada, digite `.Nick` (com o ponto) no campo "Nick do jogador" e clique em Liberar.
Expected: a mensagem verde diz "`.Nick` liberado (Bedrock)." — o sufixo confirma que o painel roteou para `fwhitelist`.

Depois libere um nick de Java e confirme que a mensagem vem **sem** o sufixo.

- [ ] **Step 6: Fechar**

```bash
git status
```

Expected: árvore limpa. Se algum ajuste foi necessário durante a verificação, commite antes de encerrar.

---

## Se der errado: como voltar

Nenhuma task altera o mundo do jogo, então o rollback é sempre de configuração:

1. **Bedrock não conecta e você quer o servidor de volta agora:** tire a linha `19132:19132/udp` e o bloco `PLUGINS` do `docker-compose.yml`, depois redeploy. Os plugins ficam no volume mas não carregam.
2. **O Paper 26.2 não subiu:** confirme `MC_IMAGE_TAG=java25`. MC 26.2 em Java velho sai com exitCode 1 em loop de restart, sem nunca abrir a porta.
3. **Os plugins subiram mas quebraram o servidor:** `docker exec $(docker ps -qf name=minecraft) rm -rf /data/plugins/Geyser-Spigot /data/plugins/floodgate` e reinicie.
4. **O painel:** as Tasks 1-4 são commits separados e independentes das de infra. `git revert` em qualquer um deles volta ao comportamento anterior sem tocar no servidor.

## Ordem das tasks e por quê

As Tasks 2-4 (painel) vêm **antes** da Task 6 (abrir a porta UDP) de propósito. Se a porta abrisse primeiro, o primeiro jogador de Bedrock a entrar já deixaria o painel numa armadilha: o chip dele carrega `<form action={kick}>`, o `NICK` atual rejeita `.` e espaço, e `kick` não tem `try/catch` nem `error.tsx`. Assim o plano nunca passa por um estado em que um jogador de Bedrock derruba a ferramenta de administração.

## Fora de escopo, de propósito

Os outros achados da revisão de 2026-08-29 seguem abertos — em especial os dois que bloqueiam deploy (`PANEL_PASSWORD` vazio com `${...:?}`, e senha acentuada travando o painel por causa do `atob()`) e o de renderizar a string `"Erro: ..."` do RCON como se fosse dado, que mostra TPS `172.18` em verde durante uma queda. Eles pedem plano próprio.
