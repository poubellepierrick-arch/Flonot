import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEV_STUDIO_URL,
  PREV_APP_URL,
  detectEnvironment,
  getEnvSwitchInfo,
  isEnvSwitchPasswordValid,
} from './envSwitch';

test('detectEnvironment identifies prev vs dev hostnames', () => {
  assert.equal(
    detectEnvironment('ais-pre-hr4yukwvvzqxeobj6vkdg4-619622288073.europe-west2.run.app'),
    'prev'
  );
  assert.equal(
    detectEnvironment('ais-dev-hr4yukwvvzqxeobj6vkdg4-619622288073.europe-west2.run.app'),
    'dev'
  );
  assert.equal(detectEnvironment('localhost'), 'dev');
});

test('getEnvSwitchInfo directs dev to prev URL and prev to AI Studio dev URL', () => {
  const fromDev = getEnvSwitchInfo({
    hostname: 'ais-dev-hr4yukwvvzqxeobj6vkdg4-619622288073.europe-west2.run.app',
    origin: 'https://ais-dev-hr4yukwvvzqxeobj6vkdg4-619622288073.europe-west2.run.app',
    pathname: '/',
  });
  assert.equal(fromDev.currentEnv, 'dev');
  assert.equal(fromDev.targetEnv, 'prev');
  assert.equal(fromDev.buttonLabel, 'prev');
  assert.equal(fromDev.targetUrl, PREV_APP_URL);

  const fromPrev = getEnvSwitchInfo({
    hostname: 'ais-pre-hr4yukwvvzqxeobj6vkdg4-619622288073.europe-west2.run.app',
    origin: PREV_APP_URL,
    pathname: '/',
  });
  assert.equal(fromPrev.currentEnv, 'prev');
  assert.equal(fromPrev.targetEnv, 'dev');
  assert.equal(fromPrev.buttonLabel, 'dev');
  assert.equal(fromPrev.targetUrl, DEV_STUDIO_URL);
});

test('getEnvSwitchInfo falls back to PREV_APP_URL on localhost and preserves query/path', () => {
  const fromLocal = getEnvSwitchInfo({
    hostname: 'localhost',
    origin: 'http://localhost:3000',
    pathname: '/atelier',
    search: '?tab=stats',
  });
  assert.equal(fromLocal.currentEnv, 'dev');
  assert.equal(fromLocal.targetUrl, `${PREV_APP_URL}/atelier?tab=stats`);
});

test('isEnvSwitchPasswordValid accepts 1217 and rejects other inputs', () => {
  assert.equal(isEnvSwitchPasswordValid('1217'), true);
  assert.equal(isEnvSwitchPasswordValid(' 1217 '), true);
  assert.equal(isEnvSwitchPasswordValid('1234'), false);
  assert.equal(isEnvSwitchPasswordValid(''), false);
});
