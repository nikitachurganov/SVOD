import { useEffect, useState } from 'react';
import { Button, Card, Collapse, Tag, Typography } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  getRequestTelegramSource,
  type TelegramRequestSource,
} from '../../shared/api/telegram.api';

interface Props {
  requestId: string;
}

/** «Из Telegram»: the dialog or description the bot built this request from */
export const RequestTelegramSource = ({ requestId }: Props) => {
  const [source, setSource] = useState<TelegramRequestSource | null>(null);

  useEffect(() => {
    let active = true;
    getRequestTelegramSource(requestId)
      .then((data) => {
        if (active) setSource(data);
      })
      .catch(() => {
        // No Telegram source (or no access) — the block is simply not shown
        if (active) setSource(null);
      });
    return () => {
      active = false;
    };
  }, [requestId]);

  if (!source) return null;

  const isGroup = source.source_kind === 'group';
  const origin = isGroup
    ? `Группа «${source.chat_title || 'Telegram'}»`
    : 'Личный чат с ботом';

  return (
    <Card
      size="small"
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <SendOutlined />
          Из Telegram
        </span>
      }
      extra={
        source.message_url ? (
          <Button type="link" size="small" href={source.message_url} target="_blank" rel="noopener noreferrer">
            Открыть сообщение
          </Button>
        ) : null
      }
      style={{ marginBottom: 16 }}
    >
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Tag>{origin}</Tag>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {dayjs(source.created_at).format('DD.MM.YYYY HH:mm')}
            {source.confirmed_by ? ` · подтвердил(а) ${source.confirmed_by}` : ''}
          </Typography.Text>
        </div>
        {source.summary ? (
          <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
            {source.summary}
          </Typography.Paragraph>
        ) : null}
        <Collapse
          size="small"
          items={[
            {
              key: 'source',
              label: isGroup ? `Исходный диалог (${source.transcript.length})` : 'Исходный текст',
              children: isGroup && source.transcript.length ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {source.transcript.map((item, index) => (
                    <div key={`${item.sent_at ?? ''}-${index}`}>
                      <Typography.Text strong style={{ fontSize: 13 }}>
                        {item.from_name || 'Участник'}
                      </Typography.Text>
                      {item.sent_at ? (
                        <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                          {dayjs(item.sent_at).format('DD.MM HH:mm')}
                        </Typography.Text>
                      ) : null}
                      <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{item.text}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{source.source_text}</div>
              ),
            },
          ]}
        />
      </div>
    </Card>
  );
};
