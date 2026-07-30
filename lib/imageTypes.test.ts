import { describe, expect, it } from 'vitest';
import { classificarArquivo, extensaoDe } from './imageTypes';

describe('extensaoDe', () => {
  it('extrai a extensão em minúsculas', () => {
    expect(extensaoDe('foto.JPG')).toBe('jpg');
    expect(extensaoDe('IMG_5879.heic')).toBe('heic');
  });

  it('devolve string vazia quando não há extensão', () => {
    expect(extensaoDe('IMG_5879')).toBe('');
  });

  it('usa apenas o trecho após o último ponto', () => {
    expect(extensaoDe('relatorio.final.png')).toBe('png');
  });
});

describe('classificarArquivo', () => {
  it('aceita imagem comum quando o navegador informa o tipo', () => {
    expect(classificarArquivo('foto.jpg', 'image/jpeg')).toEqual({
      aceito: true,
      mimeType: 'image/jpeg',
    });
  });

  // O caso que derrubava a tela: o Windows não registra o MIME de
  // alguns formatos, então o navegador devolve string vazia.
  it('deduz o tipo pela extensão quando o navegador não informa', () => {
    expect(classificarArquivo('foto.png', '')).toEqual({
      aceito: true,
      mimeType: 'image/png',
    });
    expect(classificarArquivo('imagem.webp', '')).toEqual({
      aceito: true,
      mimeType: 'image/webp',
    });
  });

  // HEIC é o formato padrão do iPhone e nenhum navegador exibe.
  it('recusa HEIC/HEIF com o nome do formato, mesmo sem tipo informado', () => {
    expect(classificarArquivo('IMG_5879.heic', '')).toEqual({
      aceito: false,
      motivo: 'formato_nao_exibivel',
      formato: 'HEIC',
    });
    expect(classificarArquivo('IMG_5879.HEIF', 'image/heif')).toEqual({
      aceito: false,
      motivo: 'formato_nao_exibivel',
      formato: 'HEIF',
    });
  });

  it('recusa arquivo que não é imagem', () => {
    expect(classificarArquivo('contrato.pdf', 'application/pdf')).toEqual({
      aceito: false,
      motivo: 'nao_e_imagem',
    });
  });

  it('recusa arquivo sem extensão e sem tipo informado', () => {
    expect(classificarArquivo('IMG_5879', '')).toEqual({
      aceito: false,
      motivo: 'nao_e_imagem',
    });
  });

  it('confia no tipo do navegador quando a extensão é desconhecida', () => {
    expect(classificarArquivo('captura', 'image/jpeg')).toEqual({
      aceito: true,
      mimeType: 'image/jpeg',
    });
  });
});
