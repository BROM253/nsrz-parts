import type { ThemeConfig } from 'antd';

/**
 * Тёплая палитра: терракота, песок, охра, оливковый.
 * Все цвета текста и статусов — контраст не ниже 4,5 : 1 (WCAG AA) на белом, песочном фоне и фоне своих бейджей.
 * Те же значения используются в мобильном приложении (mobile/lib/theme.dart).
 */
export const c = {
  primary: '#B4532A', // терракота — кнопки, ссылки, акценты
  primaryHover: '#9C4422',
  primaryActive: '#87391C',
  primarySoft: '#F6E3D6',
  primaryTint: '#FCF1E9',
  accent: '#D9922E', // мёд/охра — декоративные акценты
  accentSoft: '#FCEFD9',
  teal: '#2F5D73', // морской акцент для информационных элементов
  tealSoft: '#E3EDF0',
  bg: '#FAF5EE', // песочный фон
  surface: '#FFFFFF',
  surfaceWarm: '#FFFBF6',
  border: '#EADFD2',
  borderStrong: '#D9C9B6',
  text: '#2F2620', // тёмно-коричневый вместо чёрного — мягче для глаз
  textSecondary: '#6E5F53',
  textMuted: '#7A6A5D',
  success: '#3F6B2E',
  successSoft: '#E7F0DF',
  warning: '#8A5208',
  warningSoft: '#FBEBD3',
  danger: '#A8392C',
  dangerSoft: '#F8E1DC',
  coffee: '#3A2A22', // боковое меню панели НСРЗ
  coffeeLight: '#4B382E',
};

export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: c.primary,
    colorSuccess: c.success,
    colorWarning: c.warning,
    colorError: c.danger,
    colorInfo: c.teal,
    colorLink: c.primary,
    colorText: c.text,
    colorTextSecondary: c.textSecondary,
    colorTextTertiary: c.textMuted,
    colorBgLayout: c.bg,
    colorBgContainer: c.surface,
    colorBorder: c.borderStrong,
    colorBorderSecondary: c.border,
    borderRadius: 10,
    borderRadiusLG: 16,
    borderRadiusSM: 8,
    fontFamily: "'Inter Variable', Inter, 'Segoe UI', system-ui, -apple-system, sans-serif",
    fontSize: 15,
    controlHeight: 40,
    controlHeightLG: 48,
    motionDurationMid: '0.22s',
    boxShadowSecondary: '0 12px 32px rgba(58, 42, 34, 0.12)',
  },
  components: {
    Button: { fontWeight: 600, primaryShadow: '0 6px 16px rgba(180, 83, 42, 0.25)', defaultShadow: 'none' },
    Card: { colorBorderSecondary: c.border },
    Table: { headerBg: '#F6EEE4', headerColor: c.textSecondary, rowHoverBg: '#FFF6EE', borderColor: c.border },
    Layout: { siderBg: c.coffee, headerBg: c.surface, bodyBg: c.bg },
    Menu: {
      darkItemBg: c.coffee,
      darkSubMenuItemBg: c.coffee,
      darkItemSelectedBg: c.primary,
      darkItemColor: '#E9DCCD',
      darkItemHoverBg: c.coffeeLight,
      itemBorderRadius: 10,
    },
    Segmented: { itemSelectedBg: c.surface, trackBg: '#F1E7DB' },
    Tabs: { inkBarColor: c.primary, itemSelectedColor: c.primary, itemHoverColor: c.primaryHover },
    Tag: { defaultBg: c.primaryTint },
  },
};
