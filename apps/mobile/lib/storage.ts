import { supabase } from "./supabase";

/**
 * Converts a local file URI to a Blob for upload.
 */
async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  return response.blob();
}

/**
 * Uploads a user avatar and returns its public URL.
 * File path: avatars/{userId}/{timestamp}.{ext}
 */
export async function uploadAvatar(
  userId: string,
  imageUri: string
): Promise<string> {
  const ext = imageUri.split(".").pop() ?? "jpg";
  const path = `${userId}/${Date.now()}.${ext}`;

  const blob = await uriToBlob(imageUri);

  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, blob, { upsert: true, contentType: `image/${ext}` });

  if (error) throw error;

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Uploads an event photo and returns its public URL.
 * File path: event-photos/{userId}/{timestamp}.{ext}
 */
export async function uploadEventPhoto(
  userId: string,
  imageUri: string
): Promise<string> {
  const ext = imageUri.split(".").pop() ?? "jpg";
  const path = `${userId}/${Date.now()}.${ext}`;

  const blob = await uriToBlob(imageUri);

  const { error } = await supabase.storage
    .from("event-photos")
    .upload(path, blob, { contentType: `image/${ext}` });

  if (error) throw error;

  const { data } = supabase.storage.from("event-photos").getPublicUrl(path);
  return data.publicUrl;
}
