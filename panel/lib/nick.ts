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
