import type { Field } from '../../../types/form';
import type { AIRequestAnalysis } from '../../../types/request';
import type { RequestTechnicalSpecEnvelope } from '../../../types/technicalSpec';
import { AiReadinessAssistant } from './AiReadinessAssistant';
import { PerformerHintAssistant } from './PerformerHintAssistant';
import { TzAssistantWidget } from './TzAssistantWidget';

export type RequestAssistantSidebarProps = {
  requestId: string;
  organizationId: string | null | undefined;
  aiAnalysis: AIRequestAnalysis | null | undefined;
  fields: Field[];
  analysisRunning: boolean;
  onRunAnalysis: () => void;
  tz: RequestTechnicalSpecEnvelope | null | undefined;
  onTzUpdated: () => Promise<void>;
  onGoToExecution: () => void;
};

export function RequestAssistantSidebar({
  requestId,
  organizationId,
  aiAnalysis,
  fields,
  analysisRunning,
  onRunAnalysis,
  tz,
  onTzUpdated,
  onGoToExecution,
}: RequestAssistantSidebarProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
      <AiReadinessAssistant
        analysis={aiAnalysis}
        fields={fields}
        running={analysisRunning}
        onAnalyze={onRunAnalysis}
      />
      <TzAssistantWidget
        requestId={requestId}
        organizationId={organizationId}
        tz={tz}
        onUpdated={onTzUpdated}
      />
      <PerformerHintAssistant
        requestId={requestId}
        organizationId={organizationId}
        onGoToExecution={onGoToExecution}
      />
    </div>
  );
}
