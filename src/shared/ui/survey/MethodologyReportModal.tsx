import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Modal, Spin } from 'antd';
import { CopyOutlined, DownloadOutlined } from '@ant-design/icons';

import {
  buildMethodologyReport,
  type MethodologyMeta,
  type MethodologyReport,
} from '../../api/surveys.api';
import type { CreateFormPagePayload } from '../../api/forms.api';
import { useNotifications } from '../../context/notifications.context';
import { blocksToWordHtml, parseMarkdownBlocks, type MarkdownBlock } from './markdownBlocks';

export interface MethodologyReportModalProps {
  open: boolean;
  onClose: () => void;
  surveyName: string;
  methodologyMeta: MethodologyMeta | null;
  pages: CreateFormPagePayload[];
}

const downloadBlob = (content: BlobPart, type: string, filename: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const renderBlock = (block: MarkdownBlock, index: number) => {
  switch (block.type) {
    case 'h1':
      return <h2 key={index} style={{ margin: '0 0 12px', fontSize: 18 }}>{block.text}</h2>;
    case 'h2':
      return <h3 key={index} style={{ margin: '16px 0 8px', fontSize: 16 }}>{block.text}</h3>;
    case 'h3':
      return <h4 key={index} style={{ margin: '12px 0 6px', fontSize: 14 }}>{block.text}</h4>;
    case 'quote':
      return (
        <blockquote
          key={index}
          style={{
            margin: '12px 0',
            padding: '4px 12px',
            borderLeft: '3px solid var(--app-border)',
            color: 'var(--app-text-secondary)',
          }}
        >
          {block.text}
        </blockquote>
      );
    case 'ul':
      return (
        <ul key={index} style={{ margin: '0 0 8px', paddingLeft: 20 }}>
          {block.items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      );
    case 'ol':
      return (
        <ol key={index} style={{ margin: '0 0 8px', paddingLeft: 20 }}>
          {block.items.map((item) => <li key={item} style={{ marginBottom: 4 }}>{item}</li>)}
        </ol>
      );
    default:
      return <p key={index} style={{ margin: '0 0 8px', lineHeight: 1.6 }}>{block.text}</p>;
  }
};

export const MethodologyReportModal = ({
  open,
  onClose,
  surveyName,
  methodologyMeta,
  pages,
}: MethodologyReportModalProps) => {
  const { notifySuccess, notifyError } = useNotifications();
  const [report, setReport] = useState<MethodologyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mounted by the parent only while the dialog is open, so loading starts as true
  useEffect(() => {
    let cancelled = false;
    buildMethodologyReport({ name: surveyName, methodology_meta: methodologyMeta, pages })
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch(() => {
        if (!cancelled) setError('Не удалось подготовить обзор. Попробуйте ещё раз.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [surveyName, methodologyMeta, pages]);

  const blocks = useMemo(() => (report ? parseMarkdownBlocks(report.markdown) : []), [report]);
  const baseName = (report?.title ?? 'Методология').slice(0, 80);

  const handleCopy = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.markdown);
      notifySuccess('Текст обзора скопирован');
    } catch {
      notifyError('Не удалось скопировать текст');
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Обзор методологии"
      width={760}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button icon={<CopyOutlined />} onClick={handleCopy} disabled={!report}>
            Копировать
          </Button>
          <Button
            icon={<DownloadOutlined />}
            disabled={!report}
            onClick={() =>
              report && downloadBlob(report.markdown, 'text/markdown;charset=utf-8', `${baseName}.md`)
            }
          >
            Скачать .md
          </Button>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            disabled={!report}
            onClick={() =>
              report &&
              downloadBlob(
                blocksToWordHtml(report.title, blocks),
                'application/msword;charset=utf-8',
                `${baseName}.doc`,
              )
            }
          >
            Скачать для Word
          </Button>
        </div>
      }
    >
      {loading && (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Spin />
        </div>
      )}
      {error && <Alert type="error" message={error} showIcon />}
      {!loading && report && (
        <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 8 }}>
          <p style={{ color: 'var(--app-text-secondary)', fontSize: 13, marginTop: 0 }}>
            Текст можно вставить в раздел работы, посвящённый методологии исследования.
          </p>
          {blocks.map(renderBlock)}
        </div>
      )}
    </Modal>
  );
};
