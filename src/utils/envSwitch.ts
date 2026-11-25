export const DEV_STUDIO_URL =
  'https://aistudio.google.com/apps/6cc4dada-e3d5-4bed-8cb1-56e19c00c487?showAssistant=true&showPreview=true';
export const PREV_APP_URL =
  'https://ais-pre-hr4yukwvvzqxeobj6vkdg4-619622288073.europe-west2.run.app';
export const ENV_SWITCH_PASSWORD = '1217';

export type AppEnvironment = 'dev' | 'prev';

export interface EnvSwitchInfo {
  currentEnv: AppEnvironment;
  targetEnv: AppEnvironment;
  targetUrl: string;
  buttonLabel: string;
  targetTitle: string;
}

export function detectEnvironment(hostname: string): AppEnvironment {
  if (hostname.toLowerCase().includes('ais-pre-')) {
    return 'prev';
  }
  return 'dev';
}

export function getEnvSwitchInfo(loc: {
  hostname: string;
  origin: string;
  pathname?: string;
  search?: string;
  hash?: string;
}): EnvSwitchInfo {
  const currentEnv = detectEnvironment(loc.hostname);
  const pathPart = loc.pathname && loc.pathname !== '/' ? loc.pathname : '';
  const suffix = `${pathPart}${loc.search ?? ''}${loc.hash ?? ''}`;

  if (currentEnv === 'prev') {
    return {
      currentEnv: 'prev',
      targetEnv: 'dev',
      targetUrl: DEV_STUDIO_URL,
      buttonLabel: 'dev',
      targetTitle: "Ouvrir l'environnement dev (AI Studio)",
    };
  }

  const basePrev = loc.hostname.toLowerCase().includes('ais-dev-')
    ? loc.origin.replace(/ais-dev-/i, 'ais-pre-')
    : PREV_APP_URL;

  return {
    currentEnv: 'dev',
    targetEnv: 'prev',
    targetUrl: `${basePrev}${suffix}`,
    buttonLabel: 'prev',
    targetTitle: 'Ouvrir la prévisualisation (prev)',
  };
}

export function isEnvSwitchPasswordValid(password: string): boolean {
  return password.trim() === ENV_SWITCH_PASSWORD;
}
