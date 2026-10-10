/** Russian strings. Every UI string goes through t('key'); English comes in M5. */
export const ru = {
  'app.title': 'Afterlife Overdrive',
  'app.tagline': 'Смерть — только начало',
  'menu.play': 'Играть',
  'menu.continue': 'Продолжить',
  'menu.settings': 'Настройки',
  'menu.update': 'Доступно обновление — обновить',
  'menu.install': 'Установить на главный экран',
  'menu.version': 'Версия {v}',
  'rotate.title': 'Поверните телефон',
  'rotate.text': 'Игра работает в горизонтальном режиме',
  'pause.title': 'Пауза',
  'pause.resume': 'Продолжить',
  'pause.toMenu': 'В главное меню',
  'controls.attack': 'Атака',
  'controls.dash': 'Рывок',
  'controls.skill1': 'Артефакт 1',
  'controls.skill2': 'Артефакт 2',
  'controls.potion': 'Зелье',
  'controls.interact': 'Действие',
  'controls.pause': 'Пауза',
  'debug.fps': 'FPS',
  loading: 'Загрузка…',
} as const;

export type TKey = keyof typeof ru;
