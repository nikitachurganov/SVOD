/** The three documents a person accepts before paying; each on its own, and anew at every payment */
export type ConsentKey = 'offer' | 'privacy' | 'personalData';

export const CONSENTS: { key: ConsentKey; before: string; link: string; to: string }[] = [
  { key: 'offer', before: 'Я принимаю условия', link: 'публичной оферты', to: '/legal#offer' },
  { key: 'privacy', before: 'Я ознакомлен(а) с', link: 'политикой конфиденциальности', to: '/legal#privacy' },
  {
    key: 'personalData',
    before: 'Я даю',
    link: 'согласие на обработку персональных данных',
    to: '/legal#consent',
  },
];

export type Accepted = Record<ConsentKey, boolean>;

export const NOTHING_ACCEPTED: Accepted = { offer: false, privacy: false, personalData: false };

export const allAccepted = (accepted: Accepted): boolean => CONSENTS.every(({ key }) => accepted[key]);
