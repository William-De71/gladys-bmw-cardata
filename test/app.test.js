// The whole integration against the fake Gladys of the SDK (which checks the
// discovered devices and the states like the host API does), a fake BMW and
// a fake MQTT broker.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent, validateWidgetImage } from '@gladysassistant/integration-sdk';

import { createApp, ACTIONS, SCENE_ACTIONS } from '../src/app.js';
import { WIDGETS, WIDGET_ACTIONS } from '../src/widgets.js';
import { TRIGGERS } from '../src/events.js';
import { D } from '../src/vehicle.js';
import {
  fakeBmw,
  fakeBroker,
  dataDir,
  entry,
  silent,
  NOW,
  VIN,
  CLIENT_ID,
  GCID,
} from './helpers/fixtures.js';

const PREFIX = 'ext:test-integration';
const CAR = `${PREFIX}:vehicle:${VIN}`;
const HOUSES = [{ selector: 'home', name: 'Home', latitude: 48.8566, longitude: 2.3522 }];
const SIGNED_IN = {
  client_id: CLIENT_ID,
  access_token: 'access-0',
  id_token: 'id-0',
  refresh_token: 'refresh-0',
  token_expires_at: String(NOW + 3600000),
  refresh_expires_at: String(NOW + 14 * 86400000),
  gcid: GCID,
};
const manifest = JSON.parse(
  (await import('node:fs')).readFileSync(
    new URL('../gladys-assistant-integration.json', import.meta.url),
    'utf8',
  ),
);

/**
 * @description The integration on a fake Gladys, a fake BMW and a fake broker.
 * @param {object} [options] - `{ config, bmw, dir, clock }`.
 * @returns {Promise<object>} `{ gladys, app, bmw, broker, clock, dir }`.
 */
async function startApp({
  config = SIGNED_IN,
  bmw = fakeBmw(),
  dir = dataDir(),
  clock = { now: NOW },
} = {}) {
  const broker = fakeBroker();
  const gladys = createFakeGladys({ config: { ...config }, houses: HOUSES });
  const app = createApp(gladys, {
    fetchImpl: bmw,
    connectMqtt: broker,
    dataDir: dir,
    now: () => clock.now,
    sleep: async (ms) => {
      clock.now += ms;
    },
    logger: silent,
  });
  await gladys.connect();
  return { gladys, app, bmw, broker, clock, dir };
}

const create = async (gladys, externalId = CAR) => {
  const device = gladys.fake.discoveredDevices.find((d) => d.external_id === externalId);
  assert.ok(device, `${externalId} is offered`);
  await gladys.fake.deviceCreated(device);
  return device;
};
const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);
const ids = (key) => `${CAR}:${key}`;

test('first start: the car is read once, offered with its features, accepted by the host checks', async (t) => {
  const { gladys, bmw, broker } = await startApp();
  t.after(() => gladys.fake.shutdown());
  // mappings + basicData + containers list + create + telematicData.
  assert.equal(bmw.apiCalls(), 5);
  const [device] = gladys.fake.discoveredDevices;
  assert.equal(device.name, 'BMW iX1 xDrive30');
  assert.equal(device.external_id, CAR);
  assert.equal(device.should_poll, false);
  const keys = device.features.map((feature) => feature.external_id.split(':').pop());
  for (const key of ['battery_level', 'electric_range', 'lock', 'doors', 'windows', 'odometer']) {
    assert.ok(keys.includes(key), key);
  }
  assert.ok(keys.includes('distance_home'), 'houses with coordinates give the distance');
  assert.ok(!keys.includes('fuel_level'), 'no fuel on an electric car');
  for (const feature of device.features) {
    for (const field of ['min', 'max', 'read_only', 'has_feedback']) {
      assert.notEqual(feature[field], undefined, `${feature.external_id}.${field}`);
    }
    assert.equal(feature.read_only, true, 'CarData is read-only');
  }
  // The stream: one connection, the ID token as password.
  assert.equal(broker.clients.length, 1);
  assert.equal(broker.last().options.password, 'id-0');
  broker.last().accept();
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('a restart costs no API call: the cars and their values are in /data', async () => {
  const dir = dataDir();
  const first = await startApp({ dir });
  await first.gladys.fake.shutdown();
  const bmw = fakeBmw();
  const second = await startApp({ dir, bmw });
  assert.equal(bmw.apiCalls(), 0);
  assert.equal(second.gladys.fake.discoveredDevices[0].name, 'BMW iX1 xDrive30');
  await second.gladys.fake.shutdown();
});

test('stream: states of the created car, scene events on transitions only', async (t) => {
  const { gladys, app, broker, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  broker.last().accept();
  await create(gladys);
  assert.equal(gladys.fake.lastState(ids('battery_level')), 62);
  assert.equal(gladys.fake.lastState(ids('lock')), 1);
  assert.equal(gladys.fake.lastState(ids('tire_front_left')), 2.5);
  assert.equal(gladys.fake.lastState(ids('distance_home')), 0);

  clock.now += 60000;
  broker.last().send(VIN, {
    [D.DOOR_STATUS]: entry('UNLOCKED', null, clock.now),
    [D.CHARGING_STATUS]: entry('CHARGINGACTIVE', null, clock.now),
    [D.PLUGGED]: entry(true, null, clock.now),
    [D.SOC]: entry(63, '%', clock.now),
  });
  await app.flush();
  assert.equal(gladys.fake.lastState(ids('lock')), 0);
  assert.equal(gladys.fake.lastState(ids('battery_level')), 63);
  assert.equal(gladys.fake.lastState(ids('charging')), 1);
  const [unlocked] = eventsOf(gladys, TRIGGERS.LOCK_CHANGED);
  assert.equal(unlocked.data.state, 'unlocked');
  assert.equal(unlocked.data.vehicle, CAR);
  assert.equal(eventsOf(gladys, TRIGGERS.CHARGING_CHANGED)[0].data.status, 'charging');
  assert.equal(eventsOf(gladys, TRIGGERS.PLUG_CHANGED)[0].data.state, 'plugged');

  // Locked with the trunk open, then driving away from home.
  clock.now += 60000;
  broker.last().send(VIN, {
    [D.TRUNK]: entry(true, null, clock.now),
    [D.DOOR_STATUS]: entry('LOCKED', null, clock.now),
  });
  assert.equal(eventsOf(gladys, TRIGGERS.LEFT_OPEN)[0].data.openings, 'trunk');
  broker.last().send(VIN, {
    [D.MOVING]: entry(true, null, clock.now),
    [D.LATITUDE]: entry(48.9, 'degrees', clock.now),
    [D.LONGITUDE]: entry(2.35, 'degrees', clock.now),
  });
  assert.equal(eventsOf(gladys, TRIGGERS.MOVING_CHANGED)[0].data.state, 'started');
  assert.equal(eventsOf(gladys, TRIGGERS.HOME_CHANGED)[0].data.state, 'left');
  // An older value from the API never fires anything nor goes back in time.
  const before = gladys.fake.sceneEvents.length;
  app.handleData(VIN, { [D.DOOR_STATUS]: entry('UNLOCKED', null, NOW) }, 'api');
  assert.equal(gladys.fake.sceneEvents.length, before);
  for (const { key, data } of gladys.fake.sceneEvents) {
    assert.ok(Object.keys(data).length <= 30, key);
    for (const value of Object.values(data)) {
      assert.ok(value === null || ['string', 'number', 'boolean'].includes(typeof value), key);
    }
    const declared = manifest.scene_triggers.find((trigger) => trigger.key === key);
    for (const variable of declared.variables) {
      assert.ok(variable.key in data, `${key}.${variable.key}`);
    }
  }
});

test('transport: cloud, degraded while the stream is down', async (t) => {
  const { gladys, broker } = await startApp();
  t.after(() => gladys.fake.shutdown());
  broker.last().accept();
  await create(gladys);
  assert.deepEqual(gladys.fake.transports.at(-1), {
    device_external_id: CAR,
    transport: 'cloud',
  });
  broker.last().drop();
  await new Promise((resolve) => setImmediate(resolve));
  const last = gladys.fake.transports.at(-1);
  assert.equal(last.degraded, true);
  assert.equal(Object.keys(last.message).length, 4);
});

test('widgets: valid contents, the picture, the read-now button', async (t) => {
  const { gladys, bmw, broker } = await startApp();
  t.after(() => gladys.fake.shutdown());
  broker.last().accept();
  for (const language of ['en', 'fr', 'de', 'es']) {
    for (const key of Object.values(WIDGETS)) {
      const ack = await gladys.fake.widgetGet(key, { language, settings: { vehicle: CAR } });
      assert.equal(ack.success, true, ack.error);
      assert.deepEqual(validateWidgetContent(ack.data.content), [], `${key} ${language}`);
    }
  }
  // The picture is fetched once in the background, then served.
  await new Promise((resolve) => setImmediate(resolve));
  const ack = await gladys.fake.widgetGet(WIDGETS.VEHICLE, { settings: { vehicle: CAR } });
  const image = ack.data.content.components.find((component) => component.type === 'image');
  assert.ok(image, 'picture shown');
  const served = await gladys.fake.widgetGetImage(image.key);
  assert.equal(served.success, true);
  assert.deepEqual(validateWidgetImage(served.data.image ?? served.data), []);
  assert.equal(bmw.count('/image'), 1);
  const before = bmw.count('/telematicData');
  const toast = await gladys.fake.widgetAction(WIDGETS.VEHICLE, WIDGET_ACTIONS.REFRESH, {
    vin: VIN,
  });
  assert.equal(toast.success, true);
  assert.match((toast.data.message ?? toast.data).en, /1 car\(s\) read/);
  assert.equal(bmw.count('/telematicData'), before + 1);
});

test('scene action: only the declared outputs, scalars', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const ack = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_STATUS, { vehicle: CAR });
  assert.equal(ack.success, true, ack.error);
  const declared = manifest.scene_actions[0].outputs.map((output) => output.key);
  for (const [key, value] of Object.entries(ack.data.outputs ?? ack.data)) {
    assert.ok(declared.includes(key), key);
    assert.ok(value === null || ['string', 'number', 'boolean'].includes(typeof value), key);
  }
  const outputs = ack.data.outputs ?? ack.data;
  assert.equal(outputs.battery_level, 62);
  assert.equal(outputs.locked, true);
  assert.equal(outputs.at_home, true);
  assert.match(outputs.summary, /BMW iX1 xDrive30 · 62 %/);
});

test('sign-in: device code shown in the status, tokens stored after the approval', async (t) => {
  const bmw = fakeBmw({ pending: 2 });
  const { gladys, broker } = await startApp({ config: { client_id: CLIENT_ID }, bmw });
  t.after(() => gladys.fake.shutdown());
  assert.match(gladys.fake.connectionStatus.message.en, /Not signed in/);
  const ack = await gladys.fake.oauthAuthorizeUrl('bmw_account');
  assert.equal(ack.success, true, ack.error);
  assert.match(ack.data.authorize_url, /user_code=ABCD-EFGH/);
  // Let the background wait run.
  for (let i = 0; i < 20 && broker.clients.length === 0; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  const statuses = gladys.fake.connectionStatuses.map((status) => status.message?.en ?? '');
  assert.ok(
    statuses.some((text) => text.includes('ABCD-EFGH')),
    'the code is shown',
  );
  const config = gladys.fake.config;
  assert.equal(config.refresh_token, 'refresh-0');
  assert.equal(config.gcid, GCID);
  assert.equal(broker.clients.length, 1, 'stream started');
});

test('sign-in refused by BMW: a clear status', async (t) => {
  const bmw = fakeBmw({ deny: true });
  const { gladys } = await startApp({ config: { client_id: CLIENT_ID }, bmw });
  t.after(() => gladys.fake.shutdown());
  await gladys.fake.oauthAuthorizeUrl('bmw_account');
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.match(gladys.fake.connectionStatus.message.en, /access_denied/);
});

test('a dead refresh token: sign-in event, status, no more stream', async (t) => {
  const bmw = fakeBmw();
  bmw.state.refreshStatus = 400;
  const { gladys, broker } = await startApp({
    config: { ...SIGNED_IN, token_expires_at: String(NOW - 1000) },
    bmw,
  });
  t.after(() => gladys.fake.shutdown());
  assert.equal(eventsOf(gladys, TRIGGERS.AUTHORIZATION_EXPIRED).length, 1);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /Connect again/);
  assert.equal(broker.clients.length, 0);
});

test('actions: test, diagnostic without secrets, refresh, disconnect', async (t) => {
  const logs = [];
  const capture = {
    info: (line) => logs.push(line),
    warn: (line) => logs.push(line),
    error: (line) => logs.push(String(line)),
    debug() {},
  };
  const gladys = createFakeGladys({ config: { ...SIGNED_IN }, houses: HOUSES });
  const broker = fakeBroker();
  createApp(gladys, {
    fetchImpl: fakeBmw(),
    connectMqtt: broker,
    dataDir: dataDir(),
    now: () => NOW,
    logger: capture,
  });
  await gladys.connect();
  t.after(() => gladys.fake.shutdown());
  broker.last().accept();
  let ack = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.match(ack.data.message.en, /BMW iX1 xDrive30.*Connected.*45\/50/);
  ack = await gladys.fake.action(ACTIONS.DIAGNOSTIC);
  assert.equal(ack.success, true);
  const text = logs.join('\n');
  assert.match(text, /\[diagnostic\].*descriptor\(s\) received/);
  for (const secret of [VIN, 'access-0', 'refresh-0', 'id-0', CLIENT_ID, GCID]) {
    assert.ok(!text.includes(secret), `${secret} leaked in the logs`);
  }
  ack = await gladys.fake.action(ACTIONS.REFRESH);
  assert.match(ack.data.message.fr, /1 voiture\(s\) lue\(s\)/);
  await gladys.fake.action(ACTIONS.DISCONNECT);
  assert.equal(gladys.fake.config.refresh_token, '');
  assert.equal(broker.last().ended, true);
});

test('no command: CarData is read-only', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const device = await create(gladys);
  const lock = device.features.find((feature) => feature.external_id === ids('lock'));
  const ack = await gladys.fake.setValue(device, lock, 0);
  assert.equal(ack.success, false);
});
