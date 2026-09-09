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

  it('aceita nick de Bedrock com prefixo', () => {
    expect(validarNick('.Gamer_Tag')).toEqual({
      edicao: 'bedrock',
      completo: '.Gamer_Tag',
      semPrefixo: 'Gamer_Tag',
    });
  });

  it('tira espaco das pontas antes de validar', () => {
    expect(validarNick('  Lucas_Vital  ').completo).toBe('Lucas_Vital');
    expect(validarNick(' .Gamer_Tag ').semPrefixo).toBe('Gamer_Tag');
  });

  it('recusa nick de Java curto ou com caractere que o jogo nao aceita', () => {
    expect(() => validarNick('ab')).toThrow(/nao e um nick valido/);
    expect(() => validarNick('lucas;stop')).toThrow(/nao e um nick valido/);
    expect(() => validarNick('Lucas Vital')).toThrow(/nao e um nick valido/);
  });

  it('recusa espaco no nick de Bedrock, porque quebraria o comando', () => {
    expect(() => validarNick('.Gamer Tag')).toThrow(/nick de Bedrock valido/);
    expect(() => validarNick('. GamerTag')).toThrow(/nick de Bedrock valido/);
  });

  it('recusa so o prefixo, ou prefixo com nome curto', () => {
    expect(() => validarNick('.')).toThrow(/nick de Bedrock valido/);
    expect(() => validarNick('.ab')).toThrow(/nick de Bedrock valido/);
  });

  it('recusa Bedrock com nome longo demais', () => {
    expect(() => validarNick('.' + 'a'.repeat(17))).toThrow(/nick de Bedrock valido/);
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
    expect(comandoWhitelist(validarNick('.Gamer_Tag'), 'add')).toBe(
      'fwhitelist add Gamer_Tag',
    );
    expect(comandoWhitelist(validarNick('.Gamer_Tag'), 'remove')).toBe(
      'fwhitelist remove Gamer_Tag',
    );
  });
});

describe('comandoKick', () => {
  it('MANTEM o prefixo do Bedrock, ao contrario do fwhitelist', () => {
    expect(comandoKick(validarNick('.Gamer_Tag'), 'Removido pelo painel')).toBe(
      'kick .Gamer_Tag Removido pelo painel',
    );
  });

  it('no Java e o nome puro', () => {
    expect(comandoKick(validarNick('Lucas_Vital'), 'Removido pelo painel')).toBe(
      'kick Lucas_Vital Removido pelo painel',
    );
  });

  it('o alvo do comando nunca tem espaco, senao o servidor le pela metade', () => {
    const bedrock = validarNick('.Gamer_Tag');
    const java = validarNick('Lucas_Vital');

    // O alvo e o token seguinte ao nome do comando. Com espaco no meio, o
    // servidor pega so o primeiro pedaco e nao acha ninguem.
    expect(comandoKick(bedrock, 'Removido pelo painel').split(' ')[1]).toBe('.Gamer_Tag');
    expect(comandoKick(java, 'Removido pelo painel').split(' ')[1]).toBe('Lucas_Vital');
    expect(comandoWhitelist(bedrock, 'add').split(' ')[2]).toBe('Gamer_Tag');
    expect(comandoWhitelist(java, 'add').split(' ')[2]).toBe('Lucas_Vital');
  });
});
