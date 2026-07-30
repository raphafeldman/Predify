// O navegador descobre o tipo do arquivo pela associação do sistema
// operacional, não pelo conteúdo. Quando essa associação não existe
// (caso clássico: .heic do iPhone no Windows), `file.type` vem vazio.
// Aqui o tipo é deduzido pela extensão nesses casos.
const MIME_POR_EXTENSAO: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
};

// Formatos que o navegador não consegue exibir. Aceitá-los geraria um
// anexo quebrado mais tarde (miniatura e visualizador em branco), então
// é melhor recusar na hora, explicando o porquê.
const NAO_EXIBIVEIS_NA_WEB: Record<string, string> = {
  heic: 'HEIC',
  heif: 'HEIF',
};

export function extensaoDe(nome: string): string {
  const match = /\.([^.]+)$/.exec(nome);
  return match ? match[1].toLowerCase() : '';
}

export type ClassificacaoArquivo =
  | { aceito: true; mimeType: string }
  | { aceito: false; motivo: 'formato_nao_exibivel'; formato: string }
  | { aceito: false; motivo: 'nao_e_imagem' };

/** Decide se um arquivo escolhido no navegador pode virar anexo de foto.
 * `tipoDoNavegador` é o `File.type`, que pode vir vazio. */
export function classificarArquivo(nome: string, tipoDoNavegador: string): ClassificacaoArquivo {
  const ext = extensaoDe(nome);

  const formatoNaoExibivel = NAO_EXIBIVEIS_NA_WEB[ext];
  if (formatoNaoExibivel) {
    return { aceito: false, motivo: 'formato_nao_exibivel', formato: formatoNaoExibivel };
  }

  const mimeType = tipoDoNavegador || MIME_POR_EXTENSAO[ext] || '';
  if (!mimeType.startsWith('image/')) {
    return { aceito: false, motivo: 'nao_e_imagem' };
  }

  return { aceito: true, mimeType };
}
