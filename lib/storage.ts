import { supabase } from './supabase';

function extensionFromUri(uri: string) {
  const match = /\.(\w+)$/.exec(uri.split('?')[0]);
  return match ? match[1].toLowerCase() : 'jpg';
}

/** Faz upload de uma foto local (URI do dispositivo) para o bucket "photos" e retorna o caminho salvo. */
export async function uploadPhoto(localUri: string, folder: string, userId: string, condominioId: string) {
  const ext = extensionFromUri(localUri);
  return uploadFile(
    localUri,
    folder,
    userId,
    condominioId,
    `image/${ext === 'jpg' ? 'jpeg' : ext}`,
    `${Date.now()}.${ext}`
  );
}

export async function uploadPhotos(
  localUris: string[],
  folder: string,
  userId: string,
  condominioId: string
) {
  const paths: string[] = [];
  for (const uri of localUris) {
    paths.push(await uploadPhoto(uri, folder, userId, condominioId));
  }
  return paths;
}

/** Faz upload de qualquer arquivo (foto, PDF, documento...) para o bucket "photos".
 * O caminho sempre começa com o id do condomínio — é o que a política de
 * acesso do Storage usa pra isolar os arquivos de um condomínio dos outros. */
export async function uploadFile(
  localUri: string,
  folder: string,
  userId: string,
  condominioId: string,
  mimeType: string,
  fileName?: string
) {
  const arraybuffer = await fetch(localUri).then((res) => res.arrayBuffer());
  const safeName = fileName ?? `${Date.now()}.${extensionFromUri(localUri)}`;
  const path = `${condominioId}/${folder}/${userId}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from('photos')
    .upload(path, arraybuffer, { contentType: mimeType });

  if (error) throw error;
  return path;
}

export async function getSignedUrl(path: string, expiresInSeconds = 3600) {
  const { data, error } = await supabase.storage
    .from('photos')
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}
