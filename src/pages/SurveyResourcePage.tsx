import { Button, Result } from 'antd';
import { Link, useParams } from 'react-router-dom';
import { SURVEY_RESOURCES } from '../shared/data/surveyResources';

export const SurveyResourcePage = () => {
  const { slug } = useParams();
  const resource = SURVEY_RESOURCES.find((item) => item.slug === slug);
  if (!resource) return <Result status="404" title="Материал не найден" extra={<Link to="/surveys"><Button>На главную</Button></Link>} />;
  return <article className="app-dashboard-page app-resource-article"><Link to="/surveys">← На главную</Link><h1>{resource.title}</h1><p className="app-dashboard-muted">{resource.description}</p>{resource.sections.map((section) => <section key={section.title}><h2>{section.title}</h2><p>{section.text}</p></section>)}</article>;
};
