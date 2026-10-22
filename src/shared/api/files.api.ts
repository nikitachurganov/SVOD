import api from '../lib/api';

const MAX_FILE_SIZES: Record<string, number> = {
  file_image: 10 * 1024 * 1024,
  file_vector: 20 * 1024 * 1024,
  file_document: 20 * 1024 * 1024,
};

const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  file_image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  file_vector: [
    'image/svg+xml',
    'application/pdf',
    'application/postscript',
    'application/illustrator',
  ],
  file_document: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
  ],
};

export interface FileMetadata {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  file_url: string;
}

function validateFile(file: File, fieldType: string): void {
  const maxSize = MAX_FILE_SIZES[fieldType] ?? 10 * 1024 * 1024;
  if (file.size > maxSize) {
    const mb = Math.round(maxSize / 1024 / 1024);
    throw new Error(`Файл "${file.name}" превышает ${mb} МБ`);
  }

  const allowedTypes = ALLOWED_MIME_TYPES[fieldType];
  if (allowedTypes && !allowedTypes.includes(file.type)) {
    throw new Error(
      `Тип файла "${file.type}" не поддерживается для данного поля`,
    );
  }
}

export async function uploadFile(
  file: File,
  fieldType: string,
  requestId: string,
  fieldId: string,
): Promise<FileMetadata> {
  validateFile(file, fieldType);

  const body = new FormData();
  body.append('field_id', fieldId);
  body.append('file', file);

  const { data } = await api.post<{
    id: string;
    file_name: string;
    file_type: string;
    file_size: number;
    file_url: string;
  }>(`/requests/${requestId}/files/upload`, body, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return {
    id: data.id,
    file_name: data.file_name,
    file_type: data.file_type,
    file_size: data.file_size,
    file_url: data.file_url,
  };
}

export async function resolveFileDownloadUrl(fileUrl: string): Promise<string> {
  if (!fileUrl.startsWith('/files/') || !fileUrl.endsWith('/download-url')) return fileUrl;
  const { data } = await api.get<{ url: string }>(fileUrl);
  return data.url;
}

/**
 * Uploads all files for a given field and returns an array of metadata objects.
 */
export async function uploadFieldFiles(
  fileList: Array<{ originFileObj?: File; name?: string }>,
  fieldType: string,
  requestId: string,
  fieldId: string,
): Promise<FileMetadata[]> {
  const results: FileMetadata[] = [];

  for (const entry of fileList) {
    const file = entry.originFileObj;
    if (!file) continue;
    const meta = await uploadFile(file, fieldType, requestId, fieldId);
    results.push(meta);
  }

  return results;
}

/**
 * Deletes all files associated with a request.
 * Falls back to a per-file deletion loop.
 */
export async function deleteRequestFiles(requestId: string): Promise<void> {
  try {
    const { data: files } = await api.get<Array<{ id: string }>>(
      `/requests/${requestId}/files`,
    );
    for (const file of files) {
      await api.delete(`/files/${file.id}`);
    }
  } catch {
    // If the request is already deleted the files are cascade-deleted anyway.
  }
}
