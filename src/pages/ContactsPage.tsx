import { Link } from 'react-router-dom';
import { LEGAL } from '../shared/config/legal';
import '../components/legal/legal.css';

/** Contacts and requisites of the seller: the payment provider asks for them on the public site */
export const ContactsPage = () => (
  <article className="legal-doc">
    <h1>Контакты и реквизиты</h1>
    <p className="legal-doc__meta">
      Сервис {LEGAL.serviceName} оказывает самозанятый. На письма мы отвечаем в течение {LEGAL.replyDays}{' '}
      рабочих дней.
    </p>

    <h2>Как с нами связаться</h2>
    <table className="legal-doc__table">
      <tbody>
        <tr>
          <th scope="row">Электронная почта</th>
          <td>
            <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
          </td>
        </tr>
        <tr>
          <th scope="row">Телефон</th>
          <td>{LEGAL.phone}</td>
        </tr>
        <tr>
          <th scope="row">Почтовый адрес</th>
          <td>{LEGAL.address}</td>
        </tr>
        <tr>
          <th scope="row">Сайт</th>
          <td>
            <a href={LEGAL.siteUrl}>{LEGAL.siteUrl}</a>
          </td>
        </tr>
      </tbody>
    </table>

    <h2>Реквизиты</h2>
    <table className="legal-doc__table">
      <tbody>
        <tr>
          <th scope="row">Исполнитель</th>
          <td>{LEGAL.fullName}</td>
        </tr>
        <tr>
          <th scope="row">ИНН самозанятого</th>
          <td>{LEGAL.inn}</td>
        </tr>
        <tr>
          <th scope="row">Статус</th>
          <td>{LEGAL.taxStatus}</td>
        </tr>
      </tbody>
    </table>

    <h2>Документы</h2>
    <p>
      Условия оказания услуг и оплаты — в <Link to="/legal#offer">публичной оферте</Link>. Цены и состав тарифов —
      на странице <Link to="/pricing">«Тарифы»</Link>.
    </p>
  </article>
);
