const VECTOR_EXTENSIONS = new Set(['.svg', '.ai', '.eps', '.pdf']);

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
    'application/octet-stream',
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

const getFileExtension = (fileName: string): string => {
  const match = fileName.toLowerCase().match(/\.[^.]+$/);
  return match?.[0] ?? '';
};

export const validateFieldFile = (file: File, fieldType: string): string | null => {
  const maxSize = MAX_FILE_SIZES[fieldType] ?? 10 * 1024 * 1024;
  if (file.size > maxSize) {
    const mb = Math.round(maxSize / 1024 / 1024);
    return `Файл «${file.name}» превышает ${mb} МБ`;
  }

  const extension = getFileExtension(file.name);

  if (fieldType === 'file_vector') {
    if (VECTOR_EXTENSIONS.has(extension)) {
      return null;
    }
    const allowedTypes = ALLOWED_MIME_TYPES.file_vector;
    if (file.type && allowedTypes.includes(file.type)) {
      return null;
    }
    return 'Допустимые форматы: SVG, AI, EPS, PDF';
  }

  const allowedTypes = ALLOWED_MIME_TYPES[fieldType];
  if (allowedTypes && file.type && allowedTypes.includes(file.type)) {
    return null;
  }

  if (fieldType === 'file_image' && file.type.startsWith('image/')) {
    return null;
  }

  if (!allowedTypes) return null;

  return `Тип файла «${file.type || extension || file.name}» не поддерживается`;
};
