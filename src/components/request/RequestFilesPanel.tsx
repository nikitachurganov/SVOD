import { useEffect, useState } from 'react';
import { Alert, Button, Card, Spin, Tag } from 'antd';
import { FileOutlined } from '@ant-design/icons';
import { getRequestTimeline, getStageArtifactDownloadUrl } from '../../shared/api/requests.api';
import type { RequestTimelineDTO } from '../../types/execution';

type FormAttachment = { name: string; url: string };

function findFormAttachments(source: unknown): FormAttachment[] {
  const found: FormAttachment[] = [];
  const seen = new Set<unknown>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const row = value as Record<string, unknown>;
    const url = typeof row.file_url === 'string' ? row.file_url : typeof row.url === 'string' ? row.url : null;
    if (url && (typeof row.file_name === 'string' || typeof row.name === 'string')) {
      found.push({ name: String(row.file_name ?? row.name), url });
      return;
    }
    Object.values(row).forEach(visit);
  };
  visit(source);
  return found;
}

export function RequestFilesPanel({ requestId, requestData }: { requestId: string; requestData: unknown }) {
  const [timeline, setTimeline] = useState<RequestTimelineDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const formAttachments = findFormAttachments(requestData);

  useEffect(() => {
    let active = true;
    void getRequestTimeline(requestId)
      .then((data) => { if (active) setTimeline(data); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : 'Не удалось загрузить файлы'); });
    return () => { active = false; };
  }, [requestId]);

  if (!timeline && !error) return <Spin tip="Загружаем файлы…" />;
  if (error) return <Alert type="warning" showIcon message="Файлы" description={error} />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '1rem 0 1.5rem' }}>
      <Alert type="info" showIcon message="Все вложения заявки" description="Материалы для работы и результаты сгруппированы по этапам; ссылки на файлы выдаются после авторизованной проверки доступа." />
      <Card title="Вложения заполненной формы" size="small">
        {formAttachments.length ? formAttachments.map((file, index) => <Button key={`${file.name}-${index}`} type="link" icon={<FileOutlined />} href={file.url} target="_blank">{file.name}</Button>) : <span style={{ color: 'var(--app-text-secondary)' }}>Нет вложений формы</span>}
      </Card>
      {timeline?.stages.map((stage) => (
        <Card key={stage.id} size="small" title={`${stage.sequence}. ${stage.title}`} extra={<Tag>{stage.status}</Tag>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <FileGroup label="Материалы для работы" rows={stage.input_artifacts} requestId={requestId} stageId={stage.id} />
            <FileGroup label="Результаты" rows={stage.result_artifacts} requestId={requestId} stageId={stage.id} />
          </div>
        </Card>
      ))}
    </div>
  );
}

function FileGroup({ label, rows, requestId, stageId }: { label: string; rows: NonNullable<RequestTimelineDTO['stages'][number]['artifacts']>; requestId: string; stageId: string }) {
  return <div><strong style={{ display: 'block', marginBottom: 6 }}>{label}</strong>{rows.length ? rows.map((row) => <Button key={row.id} type="link" size="small" icon={<FileOutlined />} onClick={() => {
    if (row.kind === 'link' && row.url) { window.open(row.url, '_blank', 'noopener,noreferrer'); return; }
    const popup = window.open('', '_blank');
    void getStageArtifactDownloadUrl(requestId, stageId, row.id).then((url) => { if (popup) popup.location.href = url; }).catch(() => popup?.close());
  }}>{row.name}</Button>) : <span style={{ color: 'var(--app-text-secondary)' }}>Нет</span>}</div>;
}
