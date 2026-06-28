import type { FormFieldType } from '../types/form-builder.types';

export const getFileAccept = (type: FormFieldType): string[] => {
  switch (type) {
    case 'file_vector':
      return ['.svg', '.ai', '.eps', '.pdf'];
    case 'file_image':
      return ['image/*'];
    case 'file_document':
      return ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt'];
    default:
      return [];
  }
};

export const getFileUploadPrompt = (type: FormFieldType): string => {
  switch (type) {
    case 'file_vector':
      return 'Нажмите или перетащите векторный файл для загрузки';
    case 'file_image':
      return 'Нажмите или перетащите изображение для загрузки';
    case 'file_document':
    default:
      return 'Нажмите или перетащите документ для загрузки';
  }
};
