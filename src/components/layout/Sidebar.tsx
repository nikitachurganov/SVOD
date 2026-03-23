const navigationItems = [
  { key: 'requests', label: 'Заявки', path: '/requests' },
  { key: 'forms', label: 'Формы', path: '/forms' },
  { key: 'participants', label: 'Участники', path: '/participants' },
];

export const getSelectedMenuKey = (pathname: string): string => {
  const matched = navigationItems.find((item) => pathname.startsWith(item.path));
  return matched?.key ?? 'requests';
};
