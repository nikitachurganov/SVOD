import { IS_SURVEYS_APP } from '../config/appMode';

/**
 * What the people-and-access screens call the shared workspace: the surveys service says «команда»,
 * the requests platform keeps «организация». Cases: accusative (пригласили в …), prepositional (состоит в …),
 * genitive (владелец …).
 */
export const TEAM_ACC = IS_SURVEYS_APP ? 'команду' : 'организацию';
export const TEAM_PREP = IS_SURVEYS_APP ? 'команде' : 'организации';
export const TEAM_GEN = IS_SURVEYS_APP ? 'команды' : 'организации';
