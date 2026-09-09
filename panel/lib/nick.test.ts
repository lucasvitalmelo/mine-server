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
    expect(() => validarNick('.Gamer  Tag')).toThrow(/nick de Bedrock valido/);
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
