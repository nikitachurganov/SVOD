/**
 * Checks src/shared/survey-logic/surveyLogic.ts against the cases shared with the backend
 * (backend/tests/fixtures/survey_logic_cases.json). Run: npm run test:logic (Node ≥ 22.18).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { shownFieldIds, surveyPath, type LogicPage } from '../src/shared/survey-logic/surveyLogic.ts';

interface Case {
  name: string;
  pages: LogicPage[];
  answers: Record<string, unknown>;
  path: string[];
  ending: string | null;
  shown: string[];
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { cases } = JSON.parse(
  readFileSync(join(root, 'backend/tests/fixtures/survey_logic_cases.json'), 'utf8'),
) as { cases: Case[] };

let failed = 0;
for (const c of cases) {
  const path = surveyPath(c.pages, c.answers);
  const gotPath = path.pages.map((i) => c.pages[i].id);
  const gotEnding = path.ending === null ? null : c.pages[path.ending].id;
  const gotShown = [...shownFieldIds(c.pages, c.answers)].sort();
  const problems: string[] = [];
  if (JSON.stringify(gotPath) !== JSON.stringify(c.path)) problems.push(`path ${JSON.stringify(gotPath)}`);
  if (gotEnding !== c.ending) problems.push(`ending ${gotEnding}`);
  if (JSON.stringify(gotShown) !== JSON.stringify([...c.shown].sort())) problems.push(`shown ${JSON.stringify(gotShown)}`);
  if (problems.length) {
    failed += 1;
    console.error(`✗ ${c.name}: ${problems.join('; ')}`);
  } else {
    console.log(`✓ ${c.name}`);
  }
}
if (failed) {
  console.error(`${failed} of ${cases.length} cases failed`);
  process.exit(1);
}
console.log(`All ${cases.length} cases passed`);
