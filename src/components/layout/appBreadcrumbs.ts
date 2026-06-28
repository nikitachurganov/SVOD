export type AppBreadcrumbItem = {
  title: string;
  path?: string;
};

const LOADING_TITLE = 'Загрузка...';

export const getBreadcrumbsForPath = (
  pathname: string,
  entityTitle?: string | null,
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

  return null;
};
