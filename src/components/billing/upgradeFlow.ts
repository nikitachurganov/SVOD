import type { QuoteTerm } from '../../types/billing';
import { DEFAULT_SEATS } from './seatPricing';

/** The pages of the way to a paid plan, after the plans themselves (those are a window) */
export type FlowStep = 'who' | 'seats' | 'checkout';
export type FlowOffer = 'researcher' | 'pack';
export type FlowWho = 'solo' | 'team';

/** Everything the person chose so far; it lives in the address, so «back» and a reload keep it */
export interface FlowState {
  offer: FlowOffer;
  term: QuoteTerm;
  who: FlowWho;
  seats: number;
  /** The team the seats are for: its id, NEW_TEAM (to be created before the payment) or null (not chosen yet) */
  org: string | null;
}

/** The team does not exist yet: it is created by «Далее: оплата» on the seats page */
export const NEW_TEAM = 'new';

const ORG_PATTERN = /^[0-9a-f-]{36}$/i;

export const FLOW_ROOT = '/upgrade';

export const isFlowStep = (value: string | undefined): value is FlowStep =>
  value === 'who' || value === 'seats' || value === 'checkout';

const clampSeats = (value: number, max: number): number =>
  Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), 1), max) : 1;

export const readFlow = (params: URLSearchParams, maxSeats: number): FlowState => {
  const offer: FlowOffer = params.get('offer') === 'pack' ? 'pack' : 'researcher';
  const term: QuoteTerm = params.get('term') === 'month' ? 'month' : 'year';
  const who: FlowWho = params.get('who') === 'team' ? 'team' : 'solo';
  const asked = params.get('seats');
  const seats = who === 'team' ? clampSeats(asked === null ? DEFAULT_SEATS : Number(asked), maxSeats) : 1;
  const askedOrg = params.get('org');
  const org = who === 'team' && askedOrg && (askedOrg === NEW_TEAM || ORG_PATTERN.test(askedOrg)) ? askedOrg : null;
  return { offer, term, who, seats, org };
};

export const flowSearch = (state: FlowState): string => {
  const params = new URLSearchParams();
  if (state.offer === 'pack') {
    params.set('offer', 'pack');
  } else {
    params.set('term', state.term);
    params.set('who', state.who);
    if (state.who === 'team') params.set('seats', String(state.seats));
    if (state.who === 'team' && state.org) params.set('org', state.org);
  }
  return `?${params.toString()}`;
};

export const flowPath = (step: FlowStep, state: FlowState): string =>
  `${FLOW_ROOT}/${step}${flowSearch(state)}`;

export interface Crumb {
  step: FlowStep;
  label: string;
}

/** The trail at the top of the pages: «Один или команда › Места › Оплата»; the pack has only the payment */
export const crumbsFor = (state: FlowState, seatMode: boolean): Crumb[] => {
  if (state.offer === 'pack' || !seatMode) return [{ step: 'checkout', label: 'Оплата' }];
  const crumbs: Crumb[] = [{ step: 'who', label: 'Один или команда' }];
  if (state.who === 'team') crumbs.push({ step: 'seats', label: 'Места' });
  crumbs.push({ step: 'checkout', label: 'Оплата' });
  return crumbs;
};
