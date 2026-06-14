export default {
  pages: [
    'pages/login/index',
    'pages/work/index',
    'pages/trace/index',
    'pages/me/index',
    'pages/batch/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#059669',
    navigationBarTitleText: '芍药工作台',
    navigationBarTextStyle: 'white',
  },
  tabBar: {
    color: '#94a3b8',
    selectedColor: '#059669',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      { pagePath: 'pages/work/index', text: '工作台' },
      { pagePath: 'pages/trace/index', text: '近期溯源' },
      { pagePath: 'pages/me/index', text: '我的' },
    ],
  },
};
