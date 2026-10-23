export type AppBreadcrumbItem = {
  title: string;
  path?: string;
};

const LOADING_TITLE = 'Загрузка...';

export const getBreadcrumbsForPath = (
  pathname: string,
  entityTitle?: string | null,
  entityParent?: AppBreadcrumbItem | null,
): AppBreadcrumbItem[] | null => {
  if (pathname === '/requests/create') {
    return [
      { title: 'Заявки', path: '/requests' },
      { title: 'Создание заявки' },
    ];
  }

  const requestDetailMatch = pathname.match(/^\/requests\/([^/]+)$/);
  if (requestDetailMatch && requestDetailMatch[1] !== 'create') {
    return [
      { title: 'Заявки', path: '/requests' },
      { title: entityTitle?.trim() || LOADING_TITLE },
    ];
  }

  if (pathname === '/forms/create') {
    return [
      { title: 'Формы', path: '/forms' },
      { title: 'Создание формы' },
    ];
  }

  const formEditMatch = pathname.match(/^\/forms\/([^/]+)\/edit$/);
  if (formEditMatch) {
    const formId = formEditMatch[1];
    return [
      { title: 'Формы', path: '/forms' },
      { title: entityTitle?.trim() || LOADING_TITLE, path: `/forms/${formId}` },
      { title: 'Редактирование' },
    ];
  }

  const formDetailMatch = pathname.match(/^\/forms\/([^/]+)$/);
  if (formDetailMatch && formDetailMatch[1] !== 'create') {
    return [
      { title: 'Формы', path: '/forms' },
      { title: entityTitle?.trim() || LOADING_TITLE },
    ];
  }

  const surveysRoot: AppBreadcrumbItem = { title: 'Опросы', path: '/surveys' };
  // Survey pages know their project; without it the crumb is simply left out
  const projectCrumb: AppBreadcrumbItem[] = entityParent ? [entityParent] : [];

  if (/^\/surveys\/projects\/[^/]+$/.test(pathname)) {
    return [surveysRoot, { title: entityTitle?.trim() || LOADING_TITLE }];
  }

  if (pathname === '/surveys/create') {
    return [surveysRoot, ...projectCrumb, { title: 'Создание опроса' }];
  }

  const surveyEditMatch = pathname.match(/^\/surveys\/([^/]+)\/edit$/);
  if (surveyEditMatch) {
    return [
      surveysRoot,
      ...projectCrumb,
      { title: entityTitle?.trim() || LOADING_TITLE, path: `/surveys/${surveyEditMatch[1]}` },
      { title: 'Редактирование' },
    ];
  }

  const surveyDetailMatch = pathname.match(
    /^\/surveys\/([^/]+)(?:\/(?:form|analytics|responses(?:\/[^/]+)?))?$/,
  );
  if (surveyDetailMatch && surveyDetailMatch[1] !== 'create') {
    return [surveysRoot, ...projectCrumb, { title: entityTitle?.trim() || LOADING_TITLE }];
  }

  return null;
};
