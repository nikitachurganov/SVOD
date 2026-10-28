import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Anchor } from 'antd';
import { useLocation } from 'react-router-dom';
import { ConsentPage } from './ConsentPage';
import { ContactsPage } from './ContactsPage';
import { OfferPage } from './OfferPage';
import { PrivacyPage } from './PrivacyPage';
import { RefundPage } from './RefundPage';
import { TermsPage } from './TermsPage';
import '../components/legal/legal.css';

interface LegalSection {
  /** The anchor: /legal#offer */
  id: string;
  label: string;
  content: ReactNode;
}

const SECTIONS: LegalSection[] = [
  { id: 'offer', label: 'Публичная оферта', content: <OfferPage /> },
  { id: 'terms', label: 'Пользовательское соглашение', content: <TermsPage /> },
  { id: 'privacy', label: 'Политика конфиденциальности', content: <PrivacyPage /> },
  { id: 'consent', label: 'Согласие на обработку данных', content: <ConsentPage /> },
  { id: 'refund', label: 'Условия возврата', content: <RefundPage /> },
  { id: 'contacts', label: 'Контакты и реквизиты', content: <ContactsPage /> },
];

const NARROW_QUERY = '(max-width: 900px)';
/** The row of anchors is stuck to the top on a narrow screen: a section stops below it */
const NARROW_OFFSET = 52;

/** The table of contents is a row on a narrow screen and a column next to the text on a wide one */
const useNarrowScreen = () => {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(NARROW_QUERY);
    const onChange = () => setNarrow(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return narrow;
};

/**
 * All the legal documents as one long read with the table of contents made of the standard
 * Ant Design anchors: it tracks the scroll and scrolls to the section on a click.
 */
export const LegalPage = () => {
  const { hash } = useLocation();
  const rootRef = useRef<HTMLDivElement>(null);
  const narrow = useNarrowScreen();

  const getScrollArea = () => rootRef.current?.closest<HTMLElement>('.legal-shell__body') ?? window;

  // Opening /legal#terms (from the sign-up form, from another document) scrolls to that document
  useEffect(() => {
    const id = hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }, [hash]);

  return (
    <div className="legal-shell__layout" ref={rootRef}>
      <nav className="legal-shell__nav" aria-label="Содержание">
        <Anchor
          affix={false}
          replace
          getContainer={getScrollArea}
          direction={narrow ? 'horizontal' : 'vertical'}
          targetOffset={narrow ? NARROW_OFFSET : 0}
          items={SECTIONS.map(({ id, label }) => ({ key: id, href: `#${id}`, title: label }))}
        />
      </nav>
      <div className="legal-longread">
        {SECTIONS.map(({ id, content }) => (
          <section key={id} id={id} className="legal-longread__section">
            {content}
          </section>
        ))}
      </div>
    </div>
  );
};
