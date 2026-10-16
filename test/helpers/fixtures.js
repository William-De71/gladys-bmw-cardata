// Fakes for the tests: the BMW sign-in and CarData API behind a `fetch`, and
// an MQTT broker behind `connect`. The answers follow BMW's swagger files
// (customer API 1.0.0, device code flow 1.6) and the wire shape of the
// stream as the Home Assistant integrations record it. Tests never touch the
// network.

import { EventEmitter } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NOW = Date.parse('2026-10-15T08:00:00Z');
const VIN = 'WBA11AA0000000001';
const VIN_MINI = 'WMW11AA0000000002';
const CLIENT_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const GCID = 'gcid-1234-abcd';

const silent = { info() {}, warn() {}, error() {}, debug() {} };

/** @returns {string} A fresh temporary data directory. */
const dataDir = () => mkdtempSync(join(tmpdir(), 'bmw-cardata-'));

/**
 * @description A descriptor entry as BMW sends it.
 * @param {unknown} value - The value.
 * @param {string} [unit] - The unit.
 * @param {number} [at] - The instant.
 * @returns {object} The entry.
 */
const entry = (value, unit = null, at = NOW) => ({
  value,
  ...(unit ? { unit } : {}),
  timestamp: new Date(at).toISOString(),
});

/**
 * @description A realistic electric car (REST shape: string values).
 * @param {number} [at] - The instant.
 * @returns {object} The descriptors.
 */
function electricCar(at = NOW - 3600000) {
  const s = (value, unit) => entry(String(value), unit, at);
  return {
    'vehicle.drivetrain.batteryManagement.header': s(62, '%'),
    'vehicle.drivetrain.electricEngine.remainingElectricRange': s(254, 'km'),
    'vehicle.drivetrain.electricEngine.charging.status': s('NOCHARGING'),
    'vehicle.body.chargingPort.status': s('DISCONNECTED'),
    'vehicle.powertrain.electric.battery.stateOfCharge.target': s(80, '%'),
    'vehicle.vehicle.travelledDistance': s(18234, 'km'),
    'vehicle.cabin.door.status': s('SECURED'),
    'vehicle.cabin.door.lock.status': s('SECURED'),
    'vehicle.cabin.door.row1.driver.isOpen': s('false'),
    'vehicle.cabin.door.row1.passenger.isOpen': s('false'),
    'vehicle.cabin.door.row2.driver.isOpen': s('false'),
    'vehicle.cabin.door.row2.passenger.isOpen': s('false'),
    'vehicle.body.trunk.isOpen': s('false'),
    'vehicle.body.hood.isOpen': s('false'),
    'vehicle.cabin.window.row1.driver.status': s('CLOSED'),
    'vehicle.cabin.window.row1.passenger.status': s('CLOSED'),
    'vehicle.cabin.window.row2.driver.status': s('CLOSED'),
    'vehicle.cabin.window.row2.passenger.status': s('CLOSED'),
    'vehicle.cabin.sunroof.status': s('CLOSED'),
    'vehicle.cabin.infotainment.navigation.currentLocation.latitude': s(48.8566, 'degrees'),
    'vehicle.cabin.infotainment.navigation.currentLocation.longitude': s(2.3522, 'degrees'),
    'vehicle.isMoving': s('false'),
    'vehicle.electricalSystem.battery.voltage': s(12.6, 'V'),
    'vehicle.chassis.axle.row1.wheel.left.tire.pressure': s(250, 'kPa'),
    'vehicle.chassis.axle.row1.wheel.right.tire.pressure': s(250, 'kPa'),
    'vehicle.chassis.axle.row2.wheel.left.tire.pressure': s(270, 'kPa'),
    'vehicle.chassis.axle.row2.wheel.right.tire.pressure': s(270, 'kPa'),
    'vehicle.vehicle.preConditioning.activity': s('standby'),
  };
}

/**
 * @description A fake BMW (sign-in + CarData API) behind fetch.
 * @param {object} [options] - `{ vins, pending, deny, telematic }`.
 * @returns {Function} fetch, with `calls`, `state`.
 */
function fakeBmw({ vins = [VIN], pending = 1, deny = false, telematic = {} } = {}) {
  const state = {
    vins,
    pending,
    deny,
    refreshCount: 0,
    refreshStatus: 200,
    containers: [],
    telematic: { [VIN]: electricCar(), ...telematic },
    status: {},
  };
  const json = (status, body, headers = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? 'application/json' },
    json: async () => body,
    arrayBuffer: async () => body,
  });
  const tokens = (n) => ({
    access_token: `access-${n}`,
    id_token: `id-${n}`,
    refresh_token: `refresh-${n}`,
    token_type: 'Bearer',
    expires_in: 3600,
    scope: 'authenticate_user openid cardata:api:read cardata:streaming:read',
    gcid: GCID,
  });
  const fetchImpl = async (url, options = {}) => {
    const { pathname, searchParams } = new URL(url);
    const method = options.method ?? 'GET';
    const form = Object.fromEntries(new URLSearchParams(options.body ?? ''));
    fetchImpl.calls.push({ method, pathname, form, headers: options.headers ?? {} });
    if (state.status[pathname]) {
      return json(state.status[pathname].status, state.status[pathname].body ?? {});
    }
    if (pathname === '/gcdm/oauth/device/code') {
      if (form.client_id !== CLIENT_ID) {
        return json(400, { error: 'invalid_client' });
      }
      return json(200, {
        device_code: 'device-xyz',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://customer.bmwgroup.com/oneid/link',
        verification_uri_complete: 'https://customer.bmwgroup.com/oneid/link?user_code=ABCD-EFGH',
        interval: 5,
        expires_in: 300,
      });
    }
    if (pathname === '/gcdm/oauth/token') {
      if (form.grant_type === 'urn:ietf:params:oauth:grant-type:device_code') {
        if (state.deny) {
          return json(400, { error: 'access_denied' });
        }
        if (state.pending > 0) {
          state.pending -= 1;
          return json(400, { error: 'authorization_pending' });
        }
        return json(200, tokens(0));
      }
      if (form.grant_type === 'refresh_token') {
        if (state.refreshStatus !== 200) {
          return json(state.refreshStatus, { error: 'invalid_grant' });
        }
        state.refreshCount += 1;
        return json(200, tokens(state.refreshCount));
      }
    }
    if (!String(options.headers?.Authorization ?? '').startsWith('Bearer access-')) {
      return json(401, { exveErrorId: 'CU-101', exveErrorMsg: 'Authentication error' });
    }
    if (pathname === '/customers/vehicles/mappings') {
      return json(
        200,
        state.vins.map((vin) => ({
          vin,
          mappedSince: '2024-01-01T00:00:00Z',
          mappingType: 'PRIMARY',
        })),
      );
    }
    let match = /^\/customers\/vehicles\/(\w{17})\/(\w+)$/.exec(pathname);
    if (match) {
      const [, vin, what] = match;
      if (what === 'basicData') {
        return json(200, {
          vin,
          brand: vin === VIN_MINI ? 'MINI' : 'BMW',
          modelName: vin === VIN_MINI ? 'Cooper SE' : 'iX1 xDrive30',
          series: 'X1',
          propulsionType: 'BEV',
          driveTrain: 'BEV',
          isTelematicsCapable: true,
        });
      }
      if (what === 'telematicData') {
        const id = searchParams.get('containerId');
        if (!state.containers.some((c) => c.containerId === id && c.state === 'ACTIVE')) {
          return json(403, {
            exveErrorId: 'CU-105',
            exveErrorMsg: 'No permission for containerId',
          });
        }
        return json(200, { telematicData: state.telematic[vin] ?? {} });
      }
      if (what === 'image') {
        const png = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
          'base64',
        );
        return json(200, png.buffer.slice(png.byteOffset, png.byteOffset + png.length), {
          'content-type': 'image/png',
        });
      }
    }
    if (pathname === '/customers/containers') {
      if (method === 'POST') {
        const body = JSON.parse(options.body);
        const containerId = `c${String(state.containers.length + 1).padStart(12, '0')}`;
        state.containers.push({ ...body, containerId, state: 'ACTIVE' });
        return json(201, { containerId, ...body, state: 'ACTIVE' });
      }
      return json(200, {
        containers: state.containers.map(({ containerId, name, purpose, state: s }) => ({
          containerId,
          name,
          purpose,
          state: s,
        })),
      });
    }
    match = /^\/customers\/containers\/(\w+)$/.exec(pathname);
    if (match && method === 'DELETE') {
      state.containers.find((c) => c.containerId === match[1]).state = 'DELETED';
      return json(204, null);
    }
    return json(404, { exveErrorId: 'CU-400', exveErrorMsg: 'Bad request' });
  };
  fetchImpl.calls = [];
  fetchImpl.state = state;
  fetchImpl.count = (pathPart) =>
    fetchImpl.calls.filter((call) => call.pathname.includes(pathPart)).length;
  fetchImpl.apiCalls = () =>
    fetchImpl.calls.filter((call) => !call.pathname.startsWith('/gcdm/')).length;
  return fetchImpl;
}

/**
 * @description A fake MQTT broker behind `connect`.
 * @returns {Function} connect, with `clients`, `last()`.
 */
function fakeBroker() {
  const connect = (url, options) => {
    const client = new EventEmitter();
    client.url = url;
    client.options = options;
    client.subscriptions = [];
    client.ended = false;
    client.subscribe = (topic, opts, cb) => {
      client.subscriptions.push(topic);
      cb?.(null);
    };
    client.end = () => {
      client.ended = true;
    };
    // Helpers for the tests.
    client.accept = () => client.emit('connect');
    client.refuse = () => {
      const err = new Error('Connection refused: Not authorized');
      err.code = 5;
      client.emit('error', err);
    };
    client.drop = () => client.emit('close');
    client.send = (vin, data) =>
      client.emit(
        'message',
        `${options.username}/${vin}`,
        Buffer.from(JSON.stringify({ vin, data })),
      );
    connect.clients.push(client);
    return client;
  };
  connect.clients = [];
  connect.last = () => connect.clients[connect.clients.length - 1];
  return connect;
}

// A Gladys-like object for the pure builders.
const fakeGladys = {
  externalIds: (type, id) => {
    const device = `ext:bmw-cardata:${type}:${id}`;
    return { device, feature: (key) => `${device}:${key}` };
  },
};

export {
  NOW,
  VIN,
  VIN_MINI,
  CLIENT_ID,
  GCID,
  silent,
  dataDir,
  entry,
  electricCar,
  fakeBmw,
  fakeBroker,
  fakeGladys,
};
