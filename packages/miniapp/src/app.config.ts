import { DEFAULT_TENANT_SETTINGS } from '@nongchang/shared';

export default {
  pages: [
    'pages/login/index',
    'pages/register/index',
    'pages/work/index',
    'pages/trace/index',
    'pages/me/index',
    'pages/usage/index',
    'pages/batch/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#059669',
    navigationBarTitleText: DEFAULT_TENANT_SETTINGS.workbenchTitle,
    navigationBarTextStyle: 'white',
  },
  tabBar: {
    color: '#94a3b8',
    selectedColor: '#059669',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      { pagePath: 'pages/work/index', text: '工作台' },
      { pagePath: 'pages/trace/index', text: '溯源' },
      { pagePath: 'pages/me/index', text: '我的' },
    ],
  },
  permission: {
    'scope.userLocation': {
      desc: '用于在农事记录中标记作业地点，便于溯源核验',
    },
  },
  requiredPrivateInfos: ['getLocation'],
};
