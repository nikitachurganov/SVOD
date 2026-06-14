const DEFAULT_CRUMBS = [
  { title: 'Home' },
  { title: 'Application Center' },
  { title: 'Application List' },
  { title: 'An Application' },
];

export const getBreadcrumbsForPath = (pathname: string): { title: string }[] => {
  if (pathname.startsWith('/requests')) return DEFAULT_CRUMBS;
  if (pathname.startsWith('/forms')) {
    return [
      { title: 'Home' },
      { title: 'Application Center' },
      { title: 'Forms' },
    ];
  }
  if (pathname.startsWith('/participants')) {
    return [
      { title: 'Home' },
      { title: 'Application Center' },
      { title: 'Participants' },
    ];
  }
  if (pathname.startsWith('/settings')) {
    return [
      { title: 'Home' },
      { title: 'Settings' },
    ];
  }
  return [{ title: 'Home' }];
};
