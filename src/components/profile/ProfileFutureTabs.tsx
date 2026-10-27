import { Button, Switch } from 'antd';
import { ApiOutlined, BellOutlined, FormOutlined, RobotOutlined } from '@ant-design/icons';
import { TelegramIntegrationCard } from '../organization/TelegramIntegrationCard';
import { FeaturePlaceholder } from './FeaturePlaceholder';

const NOTE = 'Эти настройки станут доступны после запуска. Сейчас они не влияют на работу сервиса.';

/** Placeholders for the personal AI settings; nothing here is saved yet */
export const ProfileAiTab = () => (
  <section className="profile-page__panel" aria-labelledby="profile-ai-title">
    <div className="profile-page__section">
      <h3 id="profile-ai-title" className="profile-page__section-title">
        Работа с ИИ
      </h3>
      <FeaturePlaceholder
        icon={<RobotOutlined />}
        title="ИИ-ассистент"
        description="Включите или отключите помощника при работе с заявками и опросами."
      >
        <Switch disabled aria-label="ИИ-ассистент" />
      </FeaturePlaceholder>
      <FeaturePlaceholder
        icon={<ApiOutlined />}
        title="Подключение MCP"
        description="Подключите свои MCP-серверы, чтобы ассистент мог работать с вашими данными и сервисами."
      >
        <Button disabled>Подключить</Button>
      </FeaturePlaceholder>
      <p className="profile-page__hint">{NOTE}</p>
    </div>
  </section>
);

/** Linking is real (the same flow as in the organization settings); the options below it are placeholders */
export const ProfileTelegramTab = () => (
  <section className="profile-page__panel" aria-label="Telegram">
    <div className="profile-page__section">
      <h3 className="profile-page__section-title">Аккаунт Telegram</h3>
      <TelegramIntegrationCard />
    </div>
    <div className="profile-page__section">
      <h3 className="profile-page__section-title">Возможности</h3>
      <FeaturePlaceholder
        icon={<BellOutlined />}
        title="Уведомления"
        description="Сейчас в Telegram приходят все уведомления. Выбор того, о чём сообщать, появится позже."
      >
        <Switch disabled checked aria-label="Уведомления в Telegram" />
      </FeaturePlaceholder>
      <FeaturePlaceholder
        icon={<FormOutlined />}
        title="Создание опроса"
        description="Создавайте опросы прямо в чате с ботом."
      >
        <Switch disabled aria-label="Создание опроса в Telegram" />
      </FeaturePlaceholder>
      <p className="profile-page__hint">{NOTE}</p>
    </div>
  </section>
);

