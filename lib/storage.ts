import { supabase } from './supabase';

function extensionFromUri(uri: string) {
  const match = /\.(\w+)$/.exec(uri.split('?')[0]);
  return match ? match[1].toLowerCase() : 'jpg';
}

/** Faz upload de uma foto local (URI do dispositivo) para o bucket "photos" e retorna o caminho salvo. */
export async function uploadPhoto(localUri: string, folder: string, userId: string) {
  const ext = extensionFromUri(localUri);
  return uploadFile(localUri, folder, userId, `image/${ext === 'jpg' ? 'jpeg' : ext}`, `${Date.now()}.${ext}`);
}

export async function uploadPhotos(localUris: string[], folder: string, userId: string) {
  const paths: string[] = [];
  for (const uri of localUris) {
    paths.push(await uploadPhoto(uri, folder, userId));
  }
  return paths;
}

/** Faz upload de qualquer arquivo (foto, PDF, documento...) para o bucket "photos". */
export async function uploadFile(
  localUri: string,
  folder: string,
  userId: string,
  mimeType: string,
  fileName?: string
) {
  const arraybuffer = await fetch(localUri).then((res) => res.arrayBuffer());
  const safeName = fileName ?? `${Date.now()}.${extensionFromUri(localUri)}`;
  const path = `${folder}/${userId}/${Date.now()}-${safeName}`;

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
