import { Modal } from 'antd';

interface AiConsentModalProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Asked once per survey: ИИ works through an external service, so the researcher agrees first */
export const AiConsentModal = ({ open, onConfirm, onCancel }: AiConsentModalProps) => (
  <Modal
    open={open}
    title="Передать данные опроса ИИ?"
    okText="Да, продолжить"
    cancelText="Отмена"
    onOk={onConfirm}
    onCancel={onCancel}
  >
    <p style={{ marginTop: 0 }}>ИИ-помощник работает через внешний сервис (OpenRouter). Ему будут переданы:</p>
    <ul style={{ paddingLeft: 20 }}>
      <li>сводные цифры по вопросам и показатели опроса;</li>
      <li>до 30 цитат из открытых ответов, телефоны и e-mail в них заменяются метками;</li>
      <li>тексты вопросов анкеты.</li>
    </ul>
    <p style={{ marginBottom: 0 }}>
      Продолжая, вы подтверждаете, что вправе передавать эти данные: опрос анонимный или респонденты
      согласились на такую обработку. Решение запоминается для этого опроса в вашем браузере.
    </p>
  </Modal>
);
