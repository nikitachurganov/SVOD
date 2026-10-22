import type { AIRequestAnalysis } from '../../../types/request';
import { featureFlags } from '../../../shared/config/featureFlags';
import { AiReadinessAssistant } from './AiReadinessAssistant';

export type RequestAssistantSidebarProps = {
  requestId: string;
  aiAnalysis: AIRequestAnalysis | null | undefined;
  aiAnalysisStatus?: string | null;
  canManagePlan?: boolean;
  onRequestUpdated: () => Promise<void>;
};

/** Right-hand assistant: request readiness. Specs live on the stages, not on the request. */
export function RequestAssistantSidebar({
  requestId,
  aiAnalysis,
  aiAnalysisStatus,
  canManagePlan = false,
  onRequestUpdated,
}: RequestAssistantSidebarProps) {
  if (!featureFlags.requestAssistant) {
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
      <AiReadinessAssistant
        requestId={requestId}
        analysis={aiAnalysis}
        status={aiAnalysisStatus}
        canGenerate={canManagePlan}
        onUpdated={onRequestUpdated}
      />
    </div>
  );
}
