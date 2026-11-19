export type ResearchView = 'form' | 'publication' | 'overview' | 'analytics' | 'responses' | 'insights';
export type ResearchSection = 'builder' | 'publication' | 'results';

/** Keep respondent and legacy author links valid while giving results a separate URL space. */
export function researchRoute(pathname: string): { view: ResearchView; section: ResearchSection; responseId?: string; known: boolean } {
  const parts = pathname.replace(/\/$/, '').split('/');
  const [, , , segment, detail, responseId] = parts;
  if (parts.length > 6) return { view: 'form', section: 'builder', known: false };
  if (!segment || segment === 'form') return { view: 'form', section: 'builder', known: !detail };
  if (segment === 'publication') return { view: 'publication', section: 'publication', known: !detail };
  if (segment === 'responses') return { view: 'responses', section: 'results', responseId: detail, known: !responseId };
  if (segment === 'analytics') return { view: 'analytics', section: 'results', known: !detail };
  if (segment === 'results') {
    const view = detail === 'questions' ? 'analytics' : detail === 'responses' ? 'responses' : detail === 'insights' ? 'insights' : 'overview';
    return { view, section: 'results', responseId: view === 'responses' ? responseId : undefined, known: (!detail || ['overview', 'questions', 'responses', 'insights'].includes(detail)) && (view === 'responses' || !responseId) };
  }
  return { view: 'form', section: 'builder', known: false };
}

export function researchViewPath(id: string, view: ResearchView): string {
  const base = `/surveys/${id}`;
  if (view === 'form') return base;
  if (view === 'publication') return `${base}/publication`;
  return `${base}/results/${view === 'analytics' ? 'questions' : view}`;
}
