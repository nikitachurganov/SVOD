import { useEffect } from 'react';
import { Upload, message } from 'antd';
import { useField } from '@formily/react';
import type { Field } from '@formily/core';
import type { FormFieldType } from '../../types/form-builder.types';
import { validateFieldFile } from '../../utils/fileFieldValidation';
import { FieldLabel } from '../../ui/form-builder/FieldLabel';

const getFileAccept = (type: FormFieldType): string[] => {
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

const getFileUploadPrompt = (type: FormFieldType): string => {
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

interface FormilyFileUploadProps {
  fieldType: FormFieldType;
  label?: string;
  required?: boolean;
}

export const FormilyFileUpload = ({ fieldType, label, required }: FormilyFileUploadProps) => {
  const field = useField() as Field;
  const files = (field.value as File[] | undefined) ?? [];
  const error = field.selfErrors[0];

  useEffect(() => {
    field.setValidator((value: unknown) => {
      if (!required) return '';
      if (Array.isArray(value) && value.length > 0) return '';
      return 'Загрузите файл';
    });
  }, [field, required]);

  return (
    <div style={{ marginBottom: 24 }}>
      {label ? <FieldLabel label={label} required={required} /> : null}
      <Upload.Dragger
        accept={getFileAccept(fieldType).join(',')}
        multiple
        showUploadList
        fileList={files.map((file, index) => ({
          uid: `${field.path}-${index}`,
          name: file.name,
          status: 'done' as const,
        }))}
        beforeUpload={(file) => {
          const fileError = validateFieldFile(file, fieldType);
          if (fileError) {
            message.error(fileError);
            return Upload.LIST_IGNORE;
          }
          field.onInput([...files, file]);
          return false;
        }}
        onRemove={(file) => {
          const next = files.filter((item) => item.name !== file.name);
          field.onInput(next);
        }}
      >
        <p style={{ color: 'var(--app-text-secondary)' }}>{getFileUploadPrompt(fieldType)}</p>
      </Upload.Dragger>
      {error ? (
        <div style={{ color: 'var(--app-text-error)', fontSize: '0.75rem', marginTop: 4 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
};
