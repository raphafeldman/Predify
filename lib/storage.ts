import { supabase } from './supabase';

function extensionFromUri(uri: string) {
  const match = /\.(\w+)$/.exec(uri.split('?')[0]);
  return match ? match[1].toLowerCase() : 'jpg';
}

/** Faz upload de uma foto local (URI do dispositivo) para o bucket "photos" e retorna o caminho salvo. */
export async function uploadPhoto(localUri: string, folder: string, userId: string) {
  const arraybuffer = await fetch(localUri).then((res) => res.arrayBuffer());
  const ext = extensionFromUri(localUri);
  const path = `${folder}/${userId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('photos')
    .upload(path, arraybuffer, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` });

  if (error) throw error;
  return path;
}

export async function uploadPhotos(localUris: string[], folder: string, userId: string) {
  const paths: string[] = [];
  for (const uri of localUris) {
    paths.push(await uploadPhoto(uri, folder, userId));
  }
  return paths;
}

export async function getSignedUrl(path: string, expiresInSeconds = 3600) {
  const { data, error } = await supabase.storage
    .from('photos')
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}
