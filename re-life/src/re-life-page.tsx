import React from 'react';
import { useTranslation } from 'react-i18next';

export function ReLifePage(): React.ReactElement {
  const { t } = useTranslation('re-life');
  return React.createElement(
    'div',
    { className: 'flex h-full flex-col items-center justify-center p-8 text-center' },
    React.createElement(
      'h1',
      { className: 'text-2xl font-semibold text-gray-800' },
      t('Timeline.title', 'Life Timeline'),
    ),
    React.createElement(
      'p',
      { className: 'mt-2 text-sm text-gray-500' },
      t('Timeline.emptyHint', 'Add your first decision node to get started.'),
    ),
  );
}
