import { supabase } from "./supabase";

/**
 * Uploads a user avatar from a base64 string and returns its public URL.
 * Using base64 avoids Blob/Hermes incompatibility with Supabase storage in React Native.
 * File path: avatars/{userId}/{timestamp}.{ext}
 */
export async function uploadAvatar(
  userId: string,
  base64: string,
  mimeType: string = "image/jpeg"
): Promise<string> {
  const ext = mimeType.split("/")[1] ?? "jpg";
  const path = `${userId}/${Date.now()}.${ext}`;

  const byteCharacters = atob(base64);
  const byteArray = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteArray[i] = byteCharacters.charCodeAt(i);
  }

  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, byteArray, { upsert: true, contentType: mimeType });

  if (error) throw error;

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Uploads an event photo from a base64 string and returns its public URL.
 * File path: event-photos/{userId}/{timestamp}.{ext}
 */
export async function uploadEventPhoto(
  userId: string,
  base64: string,
  mimeType: string = "image/jpeg"
): Promise<string> {
  const ext = mimeType.split("/")[1] ?? "jpg";
  const path = `${userId}/${Date.now()}.${ext}`;

  const byteCharacters = atob(base64);
  const byteArray = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteArray[i] = byteCharacters.charCodeAt(i);
  }

  const { error } = await supabase.storage
    .from("event-photos")
    .upload(path, byteArray, { contentType: mimeType });

  if (error) throw error;

  const { data } = supabase.storage.from("event-photos").getPublicUrl(path);
  return data.publicUrl;
}
