/**
 * Validacao de nick e escolha de comando, num servidor que aceita as duas
 * edicoes do jogo.
 *
 * Quem entra pelo Bedrock passa pelo Floodgate, que prefixa o nick com ".".
 * O `replace-spaces` do Floodgate esta LIGADO neste servidor, entao a
 * gamertag "Gamer Tag" chega como ".Gamer_Tag" — sem espaco.
 *
 * Espaco importa mais do que parece. O comando do jogo e
 * `kick <alvo> [<motivo>]` e ele separa os argumentos por espaco, sem aceitar
 * aspas em nome de jogador. Um nick com espaco viraria
 * `kick .Gamer Tag Removido pelo painel`, e o servidor iria procurar o
 * jogador ".Gamer" com motivo "Tag Removido pelo painel" — nao acha ninguem
 * e nao levanta erro. Por isso o nick com espaco e recusado aqui em vez de
 * virar um comando quebrado.
 *
 * Sem espaco, as duas gramaticas viram a mesma coisa e o que muda e so o
 * prefixo. O que continua divergindo sao os comandos: o `fwhitelist` do
 * Floodgate quer o nome SEM o prefixo, enquanto o `kick` do vanilla quer o
 * nome exatamente como o servidor conhece — COM o prefixo. Errar isso
 * tambem nao levanta erro, so volta "player not found". Cada uma das duas
 * regras tem teste proprio.
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

/**
 * Vale para as duas edicoes: 3-16 letras, numeros e underscore. Sem espaco,
 * porque o comando do jogo quebraria (ver comentario do topo).
 */
const NOME = /^[A-Za-z0-9_]{3,16}$/;

export function validarNick(bruto: string): NickValidado {
  const valor = bruto.trim();

  if (valor.startsWith(PREFIXO_BEDROCK)) {
    const semPrefixo = valor.slice(PREFIXO_BEDROCK.length);
    if (!NOME.test(semPrefixo)) {
      throw new Error(
        `"${valor}" nao e um nick de Bedrock valido (o "." e depois 3-16 letras, ` +
          `numeros ou _; espaco nao entra, o Floodgate troca por _).`,
      );
    }
    return { edicao: 'bedrock', completo: valor, semPrefixo };
  }

  if (!NOME.test(valor)) {
    throw new Error(
      `"${valor}" nao e um nick valido (3-16 letras, numeros ou _; jogadores de ` +
        `Bedrock devem comecar com "." — ex.: .GamerTag).`,
    );
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
