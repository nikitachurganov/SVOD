import assert from 'node:assert/strict';
import { readResearchFilters, selectResearch } from '../src/shared/utils/surveyCatalog.ts';
import type { SurveyListItem } from '../src/shared/api/surveys.api.ts';
import { researchRoute, researchViewPath, type ResearchView } from '../src/shared/utils/researchNavigation.ts';

for (const view of ['form', 'publication', 'overview', 'analytics', 'responses', 'insights'] as ResearchView[]) {
  const route = researchRoute(researchViewPath('study', view));
  assert.equal(route.view, view, `Deep link must restore ${view}`);
  assert.equal(route.known, true);
}
assert.deepEqual(researchRoute('/surveys/study/results/responses/response-one'), { view: 'responses', section: 'results', responseId: 'response-one', known: true });
assert.equal(researchRoute('/surveys/study/responses/legacy-response').responseId, 'legacy-response');
assert.equal(researchRoute('/surveys/study/analytics').view, 'analytics');
assert.equal(researchRoute('/surveys/study/form').section, 'builder');
assert.equal(researchRoute('/surveys/study/results/').view, 'overview');
for (const invalid of ['unknown', 'results/unknown', 'results/insights/extra', 'publication/extra', 'form/extra', 'responses/one/extra', 'results/responses/one/extra']) {
  assert.equal(researchRoute(`/surveys/study/${invalid}`).known, false, `Reject unknown route ${invalid}`);
}
console.log('Research navigation: canonical links, legacy links, response deep links and invalid descendants passed.');

const row = (id: string, author: string, status = 'draft', updated = '2026-11-11') => ({ id, name: `Опрос ${id}`, author: { id: author }, status, updated_at: updated, project_id: 'p' }) as SurveyListItem;
const catalog = [row('b', 'me'), row('a', 'me'), row('c', 'other', 'open'), row('d', 'me', 'archived')];
const defaults = readResearchFilters(new URLSearchParams());
assert.deepEqual(selectResearch(catalog, 'me', defaults).map((item) => item.id), ['a', 'b']);
assert.deepEqual(catalog.map((item) => item.id), ['b', 'a', 'c', 'd'], 'Selection must not mutate source data');
assert.equal(selectResearch(catalog, undefined, defaults).length, 0, 'Unknown author is never assumed to be me');
assert.equal(selectResearch(catalog, 'me', { ...defaults, scope: 'team' }).length, 3);
assert.deepEqual(selectResearch(catalog, 'me', { ...defaults, status: 'archived' }).map((item) => item.id), ['d']);
assert.deepEqual(selectResearch(catalog, 'me', { ...defaults, query: '  ОПРОС A ' }).map((item) => item.id), ['a']);
assert.equal(selectResearch(catalog, 'me', { ...defaults, project: 'foreign' }).length, 0);
assert.equal(readResearchFilters(new URLSearchParams('scope=invalid&status=invalid')).scope, 'mine');
assert.equal(readResearchFilters(new URLSearchParams('scope=team&status=archived')).status, 'archived');
console.log('Research catalog: ownership, archive, search, project, stable ordering and query defaults passed.');
