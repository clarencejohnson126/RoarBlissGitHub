import type { Language } from '../types';

export const languages: Language[] = [
  {
    code: 'en',
    name: '🇬🇧 English',
    dialects: [
      { code: 'en-US', name: 'American English' },
      { code: 'en-GB', name: 'British English' },
      { code: 'en-AU', name: 'Australian English' },
      { code: 'en-JM', name: 'Jamaican Patois' },
      { code: 'en-IE', name: 'Irish English' },
      { code: 'en-ZA', name: 'South African English' }
    ]
  },
  {
    code: 'de',
    name: '🇩🇪 German',
    dialects: [
      { code: 'de-DE', name: 'Standard German' },
      { code: 'de-BY', name: 'Bayrisch (Bavarian)' },
      { code: 'de-SB', name: 'Schwäbisch (Swabian)' },
      { code: 'de-KP', name: 'Kurpfälzisch (Palatinate)' },
      { code: 'de-AT', name: 'Austrian German' },
      { code: 'de-CH', name: 'Swiss German' }
    ]
  },
  {
    code: 'fr',
    name: '🇫🇷 French',
    dialects: [
      { code: 'fr-FR', name: 'Standard French' },
      { code: 'fr-CA', name: 'Canadian French' },
      { code: 'fr-BE', name: 'Belgian French' },
      { code: 'fr-CH', name: 'Swiss French' }
    ]
  },
  {
    code: 'es',
    name: '🇪🇸 Spanish',
    dialects: [
      { code: 'es-ES', name: 'European Spanish' },
      { code: 'es-MX', name: 'Mexican Spanish' },
      { code: 'es-AR', name: 'Argentinian Spanish' },
      { code: 'es-CO', name: 'Colombian Spanish' }
    ]
  },
  {
    code: 'zh',
    name: '🇨🇳 Chinese',
    dialects: [
      { code: 'zh-CN', name: 'Mandarin (Simplified)' },
      { code: 'zh-TW', name: 'Mandarin (Traditional)' },
      { code: 'zh-HK', name: 'Cantonese (Hong Kong)' },
      { code: 'zh-SG', name: 'Mandarin (Singapore)' }
    ]
  },
  {
    code: 'hi',
    name: '🇮🇳 Hindi',
    dialects: [
      { code: 'hi-IN', name: 'Standard Hindi' },
      { code: 'hi-Latn', name: 'Hinglish' },
      { code: 'hi-UP', name: 'UP Hindi' },
      { code: 'hi-BH', name: 'Bihari Hindi' }
    ]
  },
  {
    code: 'nl',
    name: '🇳🇱 Dutch',
    dialects: [
      { code: 'nl-NL', name: 'Standard Dutch' },
      { code: 'nl-BE', name: 'Flemish' },
      { code: 'nl-SR', name: 'Surinamese Dutch' }
    ]
  },
  {
    code: 'it',
    name: '🇮🇹 Italian',
    dialects: [
      { code: 'it-IT', name: 'Standard Italian' },
      { code: 'it-CH', name: 'Swiss Italian' },
      { code: 'it-SM', name: 'San Marino Italian' }
    ]
  },
  {
    code: 'ru',
    name: '🇷🇺 Russian',
    dialects: [
      { code: 'ru-RU', name: 'Standard Russian' },
      { code: 'ru-BY', name: 'Belarusian Russian' },
      { code: 'ru-KZ', name: 'Kazakh Russian' },
      { code: 'ru-UA', name: 'Ukrainian Russian' }
    ]
  }
];