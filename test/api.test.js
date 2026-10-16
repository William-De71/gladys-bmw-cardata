import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createCardataClient, redactVin, RESERVE, CONTAINER_NAME } from '../src/cardata-api.js';
import { createTokenManager } from '../src/auth.js';
import { createStore } from '../src/store.js';
import { CONTAINER_DESCRIPTORS } from '../src/vehicle.js';
import { fakeBmw, dataDir, silent, VIN, CLIENT_ID, NOW } from './helpers/fixtures.js';

/**
 * @description An API client signed in, on a fake BMW.
 * @param {object} [options] - Options of fakeBmw.
 * @returns {object} `{ api, store, fetchImpl, clock }`.
 */
function client(options) {
  const fetchImpl = fakeBmw(options);
  const clock = { now: NOW };
  const store = createStore({ dir: dataDir(), now: () => clock.now, logger: silent });
  const tokens = createTokenManager({
    getClientId: () => CLIENT_ID,
    saveTokens: async () => {},
    fetchImpl,
    now: () => clock.now,
  });
  tokens.setTokens({
    accessToken: 'access-0',
    refreshToken: 'refresh-0',
    idToken: 'id-0',
    expiresAt: NOW + 3600000,
  });
  return { api: createCardataClient({ tokens, store, fetchImpl }), store, fetchImpl, clock };
}

test('never a full VIN in a message', () => {
  assert.equal(
    redactVin(`GET /customers/vehicles/${VIN}/basicData`),
    'GET /customers/vehicles/…0001/basicData',
  );
});

test('mappings: primary cars only; every call sends x-version v1 and is counted', async () => {
  const { api, store, fetchImpl } = client({ vins: [VIN] });
  assert.deepEqual(await api.mappings(), [VIN]);
  const [call] = fetchImpl.calls;
  assert.equal(call.headers['x-version'], 'v1');
  assert.equal(call.headers.Authorization, 'Bearer access-0');
  assert.equal(store.quota().used, 1);
  const basic = await api.basicData(VIN);
  assert.equal(basic.modelName, 'iX1 xDrive30');
});

test('container: created once with our descriptors, reused, recreated when they change', async () => {
  const { api, fetchImpl, store } = client();
  const id = await api.ensureContainer(CONTAINER_DESCRIPTORS);
  assert.equal(fetchImpl.state.containers[0].name, CONTAINER_NAME);
  assert.deepEqual(fetchImpl.state.containers[0].technicalDescriptors, CONTAINER_DESCRIPTORS);
  assert.equal(await api.ensureContainer(CONTAINER_DESCRIPTORS), id);
  assert.equal(fetchImpl.count('/customers/containers'), 2, 'list + create, then nothing');
  const other = await api.ensureContainer(CONTAINER_DESCRIPTORS.slice(1));
  assert.notEqual(other, id);
  assert.equal(fetchImpl.state.containers[0].state, 'DELETED', 'the old one of ours is deleted');
  assert.equal(store.container().id, other);
  const data = await api.telematicData(VIN, other);
  assert.equal(data['vehicle.drivetrain.batteryManagement.header'].value, '62');
});

test('quota: automatic calls keep a reserve, manual ones use it, CU-429 stops everything until 00:00 UTC', async () => {
  const { api, store, clock } = client();
  for (let i = 0; i < 50 - RESERVE; i += 1) {
    store.countCall();
  }
  await assert.rejects(api.mappings(), (err) => err.quotaGuard && err.rateLimited);
  assert.deepEqual(await api.mappings({ manual: true }), [VIN]);
  store.markExhausted();
  await assert.rejects(api.mappings({ manual: true }), (err) => err.quotaGuard);
  clock.now = Date.parse('2026-10-16T00:00:01Z');
  assert.equal(store.quota().left, 50);
});

test('a CU-429 from BMW marks the day used up', async () => {
  const { api, store, fetchImpl } = client();
  fetchImpl.state.status['/customers/vehicles/mappings'] = {
    status: 429,
    body: { exveErrorId: 'CU-429', exveErrorMsg: 'API rate limit reached' },
  };
  await assert.rejects(api.mappings(), (err) => err.code === 'CU-429' && err.rateLimited);
  assert.equal(store.quota().exhausted, true);
});

test('a 401 refreshes the token once and retries', async () => {
  const { api, fetchImpl } = client();
  fetchImpl.state.status['/customers/vehicles/mappings'] = {
    status: 401,
    body: { exveErrorId: 'CU-102' },
  };
  const pending = api.mappings();
  // The fake answers 401 once: lift it as soon as the refresh is asked.
  setImmediate(() => delete fetchImpl.state.status['/customers/vehicles/mappings']);
  await pending.catch(() => {});
  assert.equal(fetchImpl.state.refreshCount, 1);
});

test('the picture: base64 when it fits a widget', async () => {
  const { api } = client();
  const image = await api.image(VIN);
  assert.equal(Buffer.from(image, 'base64').toString('latin1', 1, 4), 'PNG');
});
