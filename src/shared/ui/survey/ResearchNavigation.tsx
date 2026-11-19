import { Tabs, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { SurveyDetail } from '../../api/surveys.api';
import { SURVEY_STATUS_LABEL, SURVEY_STATUS_COLOR } from '../../../pages/surveyStatus';

/** The same workflow remains visible inside the full editor. Leaving invokes its unsaved-work guard. */
export const ResearchNavigation = ({ survey }: { survey: SurveyDetail }) => {
  const navigate = useNavigate();
  return <div className="research-editor-navigation"><Tag color={SURVEY_STATUS_COLOR[survey.status]}>{SURVEY_STATUS_LABEL[survey.status]}</Tag><Tabs activeKey="builder" onChange={(key) => navigate(`/surveys/${survey.id}/${key === 'publication' ? 'publication' : 'results/overview'}`)} items={[{ key: 'builder', label: 'Конструктор' }, { key: 'publication', label: 'Публикация' }, { key: 'results', label: 'Результаты' }]} /></div>;
};
