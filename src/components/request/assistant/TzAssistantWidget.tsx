import { useState } from 'react';
import { Button, Modal, Tag, Tile } from '@carbon/react';
import { RequestTechnicalSpecPanel } from '../RequestTechnicalSpecPanel';
import type { RequestTechnicalSpecEnvelope } from '../../../types/technicalSpec';

export type TzAssistantWidgetProps = {
  requestId: string;
  organizationId: string | null | undefined;
  tz: RequestTechnicalSpecEnvelope | null | undefined;
  onUpdated: () => Promise<void>;
};

export function TzAssistantWidget({
  requestId,
  organizationId,
  tz,
  onUpdated,
}: TzAssistantWidgetProps) {
  const [fullOpen, setFullOpen] = useState(false);

  return (
    <>
      <Tile style={{ padding: 14 }}>
        <span style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
          Техническое задание
        </span>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--cds-text-secondary)', lineHeight: 1.45 }}>
          Артефакт для передачи исполнителю. Редактирование и подтверждение — в полном виде.
        </p>
        {!organizationId ? (
          <span style={{ fontSize: 12, color: 'var(--cds-text-secondary)' }}>
            Нужна организация у заявки.
          </span>
        ) : tz ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12 }}>Статус:</span>
              {tz.status === 'confirmed' ? (
                <Tag type="green">Подтверждено</Tag>
              ) : (
                <Tag type="blue">Черновик</Tag>
              )}
            </div>
            {tz.sections?.title ? (
              <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4 }}>
                {tz.sections.title}
              </span>
            ) : null}
            <Button kind="primary" size="sm" onClick={() => setFullOpen(true)}>
              Открыть полностью
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--cds-text-secondary)' }}>
              ТЗ ещё не сформировано.
            </span>
            <Button kind="primary" size="sm" onClick={() => setFullOpen(true)}>
              Сгенерировать и открыть
            </Button>
          </div>
        )}
      </Tile>

      <Modal
        open={fullOpen}
        onRequestClose={() => setFullOpen(false)}
        modalHeading="Техническое задание"
        passiveModal
        size="lg"
      >
        <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <RequestTechnicalSpecPanel
            requestId={requestId}
            tz={tz}
            organizationId={organizationId}
            onUpdated={async () => {
              await onUpdated();
            }}
          />
        </div>
      </Modal>
    </>
  );
}
