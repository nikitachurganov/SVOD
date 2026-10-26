import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Modal } from 'antd';
import type { InputRef } from 'antd';
import { CheckOutlined, CopyOutlined, ExportOutlined } from '@ant-design/icons';

import { buildPublicSurveyUrl, type SurveyStatus } from '../../api/surveys.api';

interface ShareSurveyModalProps {
  open: boolean;
  onClose: () => void;
  publicToken: string;
  status: SurveyStatus;
  /** Offered while the survey is a draft */
  onPublish?: () => void;
  publishing?: boolean;
}

const STATUS_NOTE: Partial<Record<SurveyStatus, { type: 'warning' | 'info'; text: string }>> = {
  draft: { type: 'warning', text: 'Опрос в черновиках: ссылка заработает после публикации.' },
  closed: {
    type: 'info',
    text: 'Приём ответов остановлен: по этой ссылке новые ответы не принимаются.',
  },
  archived: { type: 'info', text: 'Опрос в архиве: ссылка не принимает ответы.' },
};

/** The one place to get the respondent link: copy it and see whether it accepts answers */
export const ShareSurveyModal = ({
  open,
  onClose,
  publicToken,
  status,
  onPublish,
  publishing = false,
}: ShareSurveyModalProps) => {
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  const timer = useRef<number | undefined>(undefined);
  const inputRef = useRef<InputRef>(null);
  const link = buildPublicSurveyUrl(publicToken);
  const note = STATUS_NOTE[status];

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(link);
      setCopied('done');
    } catch {
      // The async clipboard API needs a secure context and permission; fall back to selecting
      // the field and the legacy copy command
      inputRef.current?.select();
      setCopied(document.execCommand('copy') ? 'done' : 'failed');
    }
    timer.current = window.setTimeout(() => setCopied('idle'), 2500);
  };

  return (
    <Modal
      open={open}
      rootClassName="tour-share-modal"
      onCancel={onClose}
      title="Поделиться опросом"
      footer={
        // Both actions sit on one line and share the control height; on a narrow screen they wrap
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          {status === 'open' ? (
            <Button
              icon={<ExportOutlined />}
              href={link}
              target="_blank"
              rel="noopener noreferrer"
            >
              Открыть как респондент
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={onClose}>Закрыть</Button>
        </div>
      }
      destroyOnHidden
    >
      <p style={{ margin: '0 0 12px' }}>Отправьте эту ссылку респондентам — регистрация не нужна.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Input
          style={{ flex: '1 1 220px', minWidth: 0 }}
          ref={inputRef}
          value={link}
          readOnly
          aria-label="Ссылка на опрос"
          onFocus={(e) => e.target.select()}
        />
        <Button
          type="primary"
          style={{ flex: '0 0 auto' }}
          icon={copied === 'done' ? <CheckOutlined /> : <CopyOutlined />}
          onClick={() => void copy()}
        >
          {copied === 'done' ? 'Скопировано' : 'Скопировать ссылку'}
        </Button>
      </div>
      <div role="status" style={{ minHeight: 22, margin: '8px 0 12px', fontSize: 13 }}>
        {copied === 'done' && <span style={{ color: 'var(--app-success, #389e0d)' }}>Ссылка скопирована</span>}
        {copied === 'failed' && (
          <span style={{ color: 'var(--app-text-error, #cf1322)' }}>
            Не удалось скопировать — выделите ссылку и скопируйте вручную
          </span>
        )}
      </div>

      {note && (
        <Alert
          type={note.type}
          showIcon
          message={note.text}
          action={
            status === 'draft' && onPublish ? (
              <Button size="small" type="primary" loading={publishing} onClick={onPublish}>
                Опубликовать
              </Button>
            ) : undefined
          }
        />
      )}

    </Modal>
  );
};
