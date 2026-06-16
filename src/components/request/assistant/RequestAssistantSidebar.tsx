import type { AIRequestAnalysis } from '../../../types/request';
import type { RequestTechnicalSpecEnvelope } from '../../../types/technicalSpec';
import { featureFlags } from '../../../shared/config/featureFlags';
import { AiReadinessAssistant } from './AiReadinessAssistant';
import { PerformerHintAssistant } from './PerformerHintAssistant';
import { TzAssistantWidget } from './TzAssistantWidget';

export type RequestAssistantSidebarProps = {
  requestId: string;
  organizationId: string | null | undefined;
  aiAnalysis: AIRequestAnalysis | null | undefined;
  tz: RequestTechnicalSpecEnvelope | null | undefined;
  onTzUpdated: () => Promise<void>;
  onGoToExecution: () => void;
};

export function RequestAssistantSidebar({
  requestId,
  organizationId,
  aiAnalysis,
  tz,
  onTzUpdated,
  onGoToExecution,
}: RequestAssistantSidebarProps) {
  const showReadiness = featureFlags.requestAssistant;
  const showTz = featureFlags.tzGeneration;
  const showPerformerHint = featureFlags.executorMatching;

  if (!showReadiness && !showTz && !showPerformerHint) {
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
      {showReadiness && <AiReadinessAssistant analysis={aiAnalysis} />}
      {showTz && (
        <TzAssistantWidget
          requestId={requestId}
          organizationId={organizationId}
          tz={tz}
          onUpdated={onTzUpdated}
        />
      )}
      {showPerformerHint && (
        <PerformerHintAssistant
          requestId={requestId}
          organizationId={organizationId}
          onGoToExecution={onGoToExecution}
        />
      )}
    </div>
  );
}
