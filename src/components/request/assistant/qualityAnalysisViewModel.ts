import type { AIRequestAnalysis } from '../../../types/request';

export type QualityStatus = 'insufficient_data' | 'ready_for_work';

export type QualityAnalysisViewModel = {
  status: QualityStatus;
  badgeText: string;
  badgeType: 'green' | 'red';
  description: string;
  issues?: string[];
  hiddenIssuesCount: number;
};

const ISSUE_PREVIEW_LIMIT = 3;

const toIssueMessages = (analysis: AIRequestAnalysis): string[] =>
  analysis.issues
    .map((issue) => issue.message?.trim() ?? '')
    .filter((message) => message.length > 0);

const hasBlockingIssues = (analysis: AIRequestAnalysis): boolean => {
  if (analysis.status === 'not_ready') return true;
  return analysis.issues.some((issue) => issue.severity === 'high');
};

export const toQualityAnalysisViewModel = (analysis: AIRequestAnalysis): QualityAnalysisViewModel => {
  const issueMessages = toIssueMessages(analysis);

  if (issueMessages.length === 0) {
    return {
      status: 'ready_for_work',
      badgeText: 'Можно брать в работу',
      badgeType: 'green',
      description: 'Нет замечаний.',
      hiddenIssuesCount: 0,
    };
  }

  const previewIssues = issueMessages.slice(0, ISSUE_PREVIEW_LIMIT);
  const hiddenIssuesCount = Math.max(0, issueMessages.length - previewIssues.length);
  const status: QualityStatus = hasBlockingIssues(analysis) ? 'insufficient_data' : 'ready_for_work';

  return {
    status,
    badgeText: status === 'insufficient_data' ? 'Недостаточно данных' : 'Можно брать в работу',
    badgeType: status === 'insufficient_data' ? 'red' : 'green',
    description: previewIssues.join('; '),
    issues: previewIssues,
    hiddenIssuesCount,
  };
};
