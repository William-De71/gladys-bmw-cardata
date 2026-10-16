// -----------------------------------------------------------------------------
// The BMW CarData integration, wired to a Gladys client.
//
// `createApp(gladys)` registers every handler on the client it receives:
// `new GladysIntegration()` in production (index.js), the fake Gladys of the
// SDK in the tests. Nothing here connects: the caller does, once the
// handlers are registered.
//
// Data flow:
//   - the MQTT stream (stream.js) is the main source: free, pushed within
//     seconds of a change, for the descriptors ticked in the portal;
//   - the REST API (cardata-api.js) fills the gaps: the list of cars, their
//     model, the descriptors the stream does not send (door lock status…),
//     a reading every `api_refresh_hours`, and on request (button, scene).
//     50 calls a day for the whole account: see the quota in store.js.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import {
  ACCOUNT_FIELD,
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
  normalizeConfig,
  readLanguage,
} from './config.js';
import { AuthError, createTokenManager, requestDeviceCode, waitForApproval } from './auth.js';
import { createCardataClient, CardataError, redactVin } from './cardata-api.js';
import { createStore } from './store.js';
import { createStream } from './stream.js';
import { CONTAINER_DESCRIPTORS, mergeValues, summarize, homeOf } from './vehicle.js';
import {
  FEATURES,
  idsOf,
  parseExternalId,
  vehicleName,
  buildDevice,
  buildStates,
} from './device.js';
import { detectEvents, buildSceneEvent, buildAuthorizationExpiredEvent } from './events.js';
import {
  WIDGETS,
  WIDGET_ACTIONS,
  messageContent,
  buildVehicleWidget,
  buildAccountWidget,
} from './widgets.js';
import { DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { t, all, each, openingsLabel } from './i18n.js';

const { version, homepage } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const ACTIONS = {
  TEST_CONNECTION: 'test_connection',
  REFRESH: 'refresh',
  DIAGNOSTIC: 'diagnostic',
  DISCONNECT: 'disconnect',
};
const SCENE_ACTIONS = { GET_STATUS: 'get_status' };

const HOUR = 60 * 60 * 1000;
// Unchanged states again every hour, so the dashboard never shows them as
// outdated while the car sleeps in the garage.
const HEARTBEAT_MS = HOUR;
const HOUSES_MAX_AGE_MS = HOUR;
const RETRY_MS = 5 * 60 * 1000;
// How often the REST schedule is checked (the interval itself is in hours).
const API_CHECK_MS = 15 * 60 * 1000;
// A burst of stream messages (a drive) is published at most this often.
const PUBLISH_DELAY_MS = 2000;
const WIDGET_REFRESH_MIN_MS = 10000;
// The list of cars is read again after this long (or on a scan, after an hour).
const MAPPINGS_MAX_AGE_MS = 7 * 24 * HOUR;
const MAPPINGS_SCAN_AGE_MS = HOUR;
const BASIC_RETRY_MS = 24 * HOUR;

/**
 * @description Register the handlers of the integration on a Gladys client.
 * @param {object} gladys - The GladysIntegration instance (or the fake one).
 * @param {object} [options] - Options (tests).
 * @param {Function} [options.fetchImpl] - fetch.
 * @param {Function} [options.connectMqtt] - mqtt.connect.
 * @param {string} [options.dataDir] - The data directory.
 * @param {Function} [options.now] - Clock.
 * @param {Function} [options.sleep] - `(ms) => Promise` (sign-in wait).
 * @param {object} [options.logger] - Logger.
 * @returns {object} What the tests look into.
 */
export function createApp(
  gladys,
  {
    fetchImpl = fetch,
    connectMqtt,
    dataDir = process.env.CARDATA_DATA_DIR || '/data',
    now = Date.now,
    sleep,
    logger = sdkLogger,
  } = {},
) {
  let config = normalizeConfig();
  let lastLanguage = 'en';
  let createdDevices = new Set();
  let createdFeatures = new Set();
  let houses = [];
  let housesReadAt = 0;
  let lastStatus = null;
  let startRetry = null;
  let tokenTimer = null;
  let apiTimer = null;
  let starting = Promise.resolve();
  let signInGeneration = 0;
  let authLost = false;
  // Per VIN: { snapshot, atHome, distanceHomeKm, featureKeys } once seen in this run.
  const runtime = new Map();
  const publishTimers = new Map();
  const transports = new Map();
  const widgetRefreshedAt = new Map();
  const imageTried = new Set();
  // The feature keys of each car as last offered on the Discovery screen.
  const offeredKeys = new Map();

  const store = createStore({ dir: dataDir, now, logger });

  const tokens = createTokenManager({
    fetchImpl,
    now,
    getClientId: () => config.clientId,
    saveTokens: async (next) => {
      await gladys.setConfig({
        [INTERNAL_KEYS.accessToken]: next.accessToken,
        [INTERNAL_KEYS.idToken]: next.idToken,
        [INTERNAL_KEYS.refreshToken]: next.refreshToken,
        [INTERNAL_KEYS.expiresAt]: String(next.expiresAt),
        [INTERNAL_KEYS.refreshExpiresAt]: String(next.refreshExpiresAt),
        [INTERNAL_KEYS.gcid]: next.gcid,
      });
      config = { ...config, tokens: { ...next } };
    },
  });

  const api = createCardataClient({
    tokens,
    store,
    fetchImpl,
    userAgent: `gladys-bmw-cardata/${version} (+${homepage})`,
  });

  const stream = createStream({
    getOptions: () => ({
      host: config.streamHost,
      port: config.streamPort,
      gcid: tokens.tokens.gcid,
      idToken: tokens.tokens.idToken,
    }),
    onMessage: (vin, data) => handleData(vin, data, 'stream'),
    onStatus: () => onStreamStatus(),
    onAuthRefused: async () => {
      await tokens.refresh();
    },
    ...(connectMqtt ? { connect: connectMqtt } : {}),
    now,
    logger,
  });

  // --- Helpers ---------------------------------------------------------------------

  /**
   * @description The language of the texts written outside a widget request.
   * @returns {string} The language.
   */
  function textLanguage() {
    return config.language === AUTO_LANGUAGE ? lastLanguage : config.language;
  }

  /**
   * @description Remember the language of a widget request.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (typeof next !== 'string' || !/^[a-z]{2}$/.test(next) || next === lastLanguage) {
      return;
    }
    lastLanguage = next;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const signature = JSON.stringify([connected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  /**
   * @description Report the status of a signed-in account (stream state).
   * @returns {Promise<void>}
   */
  async function reportRunning() {
    const status = stream.status();
    const count = store.vins().length;
    if (status.connected) {
      await reportStatus(true, all('statusConnected', { count }));
    } else if (status.contended) {
      await reportStatus(true, all('statusStreamContended', { count }));
    } else {
      await reportStatus(true, all('statusStreamDown', { count }));
    }
  }

  /** The stream connected or closed: status, transports, widgets. */
  function onStreamStatus() {
    if (authLost || !tokens.hasGrant()) {
      return;
    }
    reportRunning().catch(() => {});
    for (const vin of store.vins()) {
      publishTransport(vin).catch(() => {});
    }
    refreshWidget(WIDGETS.ACCOUNT);
  }

  /**
   * @description Ask Gladys to refresh a widget (at most once every 10 s).
   * @param {string} key - The widget key.
   */
  function refreshWidget(key) {
    const last = widgetRefreshedAt.get(key) ?? 0;
    if (now() - last < WIDGET_REFRESH_MIN_MS) {
      return;
    }
    widgetRefreshedAt.set(key, now());
    try {
      gladys.requestWidgetRefresh(key);
    } catch (err) {
      logger.debug?.(`Widget refresh not sent: ${err.message}`);
    }
  }

  /**
   * @description Refresh the houses of Gladys (the home of the cars).
   * @param {boolean} [force] - Even if read recently.
   * @returns {Promise<void>}
   */
  async function refreshHouses(force = false) {
    if (!force && now() - housesReadAt < HOUSES_MAX_AGE_MS) {
      return;
    }
    try {
      houses = await gladys.getHouses();
      housesReadAt = now();
    } catch (err) {
      logger.warn(`Unable to read the houses: ${err.message}`);
    }
  }

  /**
   * @description Refresh the external ids of the devices the user created.
   * @returns {Promise<void>}
   */
  async function refreshCreatedDevices() {
    try {
      const devices = await gladys.getDevices();
      createdDevices = new Set(devices.map((device) => device.external_id));
      createdFeatures = new Set(
        devices.flatMap((device) => (device.features ?? []).map((feature) => feature.external_id)),
      );
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  /**
   * @description The current state of a car, computed from the stored values.
   * @param {string} vin - The VIN.
   * @returns {object} `{ vin, name, basic, snapshot, atHome, distanceHomeKm }`.
   */
  function carOf(vin) {
    const stored = store.vehicle(vin);
    const snapshot = summarize(stored.values);
    const home = homeOf(snapshot.location, houses, config.homeRadius);
    return {
      vin,
      basic: stored.basic,
      name: vehicleName(vin, stored.basic),
      snapshot,
      ...home,
    };
  }

  /**
   * @description The context of the states of a car.
   * @param {object} car - The car (carOf).
   * @returns {object} The context (device.js).
   */
  const contextOf = (car) => ({ language: textLanguage(), distanceHomeKm: car.distanceHomeKm });

  /**
   * @description The car a device external id points at; empty = the first car.
   * @param {unknown} deviceExternalId - A `source: "devices"` value.
   * @returns {object|null} The car.
   */
  function resolveCar(deviceExternalId) {
    const parsed = parseExternalId(deviceExternalId);
    if (parsed && store.has(parsed.vin)) {
      return carOf(parsed.vin);
    }
    const first = store.vins()[0];
    return first ? carOf(first) : null;
  }

  // --- Publishing -------------------------------------------------------------------

  /**
   * @description Publish the states of a car that changed (or are an hour old).
   * @param {string} vin - The VIN.
   * @param {boolean} [force] - Every state, even unchanged.
   * @returns {Promise<void>}
   */
  async function publishStates(vin, force = false) {
    const car = carOf(vin);
    const states = buildStates(gladys, vin, car.snapshot, contextOf(car), createdFeatures);
    if (force) {
      gladys.forgetPublishedStates(idsOf(gladys, vin).device);
    }
    if (states.length > 0) {
      await gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
    }
  }

  /**
   * @description Publish the transport badge of a car, when it changed:
   * cloud; degraded while the stream is down (API values only); unreachable
   * once the sign-in is lost.
   * @param {string} vin - The VIN.
   * @returns {Promise<void>}
   */
  async function publishTransport(vin) {
    const externalId = idsOf(gladys, vin).device;
    if (!createdDevices.has(externalId)) {
      return;
    }
    let entry = { external_id: externalId, transport: DEVICE_TRANSPORTS.CLOUD };
    if (authLost || !tokens.hasGrant()) {
      entry = { external_id: externalId, transport: DEVICE_TRANSPORTS.UNREACHABLE };
    } else if (!stream.status().connected) {
      entry = { ...entry, degraded: true, message: all('transportStreamDown') };
    }
    const signature = JSON.stringify(entry);
    if (transports.get(externalId) === signature) {
      return;
    }
    try {
      await gladys.publishTransports([entry]);
      transports.set(externalId, signature);
    } catch (err) {
      logger.warn(`Unable to publish the transport: ${err.message}`);
    }
  }

  /**
   * @description Offer a device per car on the Discovery screen.
   * @returns {Promise<number>} How many devices were offered.
   */
  async function publishDiscoveredDevices() {
    const devices = store.vins().map((vin) => {
      const car = carOf(vin);
      offeredKeys.set(vin, featureKeysOf(car));
      return buildDevice(gladys, car, contextOf(car));
    });
    await gladys.publishDiscoveredDevices(devices);
    return devices.length;
  }

  /**
   * @description The keys of the features a car has now.
   * @param {object} car - The car.
   * @returns {string} The keys, joined.
   */
  const featureKeysOf = (car) =>
    FEATURES.filter((feature) => feature.has(car.snapshot, contextOf(car)))
      .map((feature) => feature.key)
      .join(',');

  /**
   * @description Publish what changed for a car, once a burst of messages is over.
   * @param {string} vin - The VIN.
   */
  function schedulePublish(vin) {
    if (publishTimers.has(vin)) {
      return;
    }
    const timer = setTimeout(() => {
      publishTimers.delete(vin);
      publishStates(vin).catch((err) =>
        logger.warn(`Unable to publish the states: ${err.message}`),
      );
      publishTransport(vin).catch(() => {});
      refreshWidget(WIDGETS.VEHICLE);
    }, PUBLISH_DELAY_MS);
    timer.unref?.();
    publishTimers.set(vin, timer);
  }

  /**
   * @description New descriptors for a car, from the stream or the API.
   * @param {string} vin - The VIN.
   * @param {object} data - `{ [descriptor]: { value, unit, timestamp } }`.
   * @param {'stream'|'api'} source - Where they come from.
   */
  function handleData(vin, data, source) {
    const isNew = !store.has(vin);
    const stored = store.vehicle(vin);
    const before = runtime.get(vin) ?? null;
    const changed = mergeValues(stored.values, data, now());
    if (changed.length === 0) {
      return;
    }
    store.save();
    const after = carOf(vin);
    const featureKeys = featureKeysOf(after);
    runtime.set(vin, { ...after, featureKeys });
    if (isNew) {
      logger.info(`New car on the ${source}: …${vin.slice(-4)}`);
      fetchBasicData([vin]).catch(() => {});
    }
    // The first update of a car in this run is a baseline: no event.
    if (before) {
      const carName = after.name;
      const vehicle = idsOf(gladys, vin).device;
      for (const event of detectEvents(before, after)) {
        const { key, data: eventData } = buildSceneEvent(event, {
          vehicle,
          carName,
          after,
          language: textLanguage(),
        });
        logger.info(`${carName}: ${key} (${eventData.summary})`);
        gladys
          .publishSceneEvent(key, eventData)
          .catch((err) => logger.warn(`Unable to publish the scene event ${key}: ${err.message}`));
      }
    }
    if (isNew || offeredKeys.get(vin) !== featureKeys) {
      publishDiscoveredDevices().catch(() => {});
    }
    schedulePublish(vin);
  }

  // --- REST API -------------------------------------------------------------------

  /**
   * @description The basic data (model) of the cars that lack it.
   * @param {string[]} vins - The VINs.
   * @param {object} [options] - `{ manual }`.
   * @returns {Promise<void>}
   */
  async function fetchBasicData(vins, { manual = false } = {}) {
    for (const vin of vins) {
      const stored = store.vehicle(vin);
      if (stored.basic || (!manual && now() - (stored.basicTriedAt ?? 0) < BASIC_RETRY_MS)) {
        continue;
      }
      stored.basicTriedAt = now();
      try {
        stored.basic = await api.basicData(vin, { manual });
        logger.info(`Car …${vin.slice(-4)}: ${vehicleName(vin, stored.basic)}`);
      } catch (err) {
        logger.warn(`Basic data of …${vin.slice(-4)} unavailable: ${redactVin(err.message)}`);
      }
      store.save();
    }
  }

  /**
   * @description Read the list of cars (mapping) when it is old, then the
   * model of each new one.
   * @param {object} [options] - `{ manual }`.
   * @returns {Promise<void>}
   */
  async function discover({ manual = false } = {}) {
    const age = now() - store.mappingsAt();
    const maxAge = manual ? MAPPINGS_SCAN_AGE_MS : MAPPINGS_MAX_AGE_MS;
    if (store.vins().length === 0 || age > maxAge) {
      const vins = await api.mappings({ manual });
      store.keepOnly(vins);
      logger.info(`${vins.length} car(s) on the account (primary user)`);
    }
    await fetchBasicData(store.vins(), { manual });
  }

  /**
   * @description Read the cars through the REST API (the container).
   * @param {object} [options] - `{ manual, vins }`.
   * @returns {Promise<number>} How many cars were read.
   */
  async function readCars({ manual = false, vins = store.vins() } = {}) {
    let count = 0;
    let containerId = await api.ensureContainer(CONTAINER_DESCRIPTORS, { manual });
    for (const vin of vins) {
      let data;
      try {
        data = await api.telematicData(vin, containerId, { manual });
      } catch (err) {
        if (err.code !== 'CU-105') {
          throw err;
        }
        // The container is gone (deleted elsewhere, or older than BMW keeps it).
        api.forgetContainer();
        containerId = await api.ensureContainer(CONTAINER_DESCRIPTORS, { manual });
        data = await api.telematicData(vin, containerId, { manual });
      }
      store.vehicle(vin).restAt = now();
      handleData(vin, data, 'api');
      count += 1;
    }
    store.save();
    refreshWidget(WIDGETS.ACCOUNT);
    return count;
  }

  /**
   * @description The REST reading of the schedule, when due.
   * @returns {Promise<void>}
   */
  async function readIfDue() {
    if (config.apiRefreshHours === 0 || authLost || !tokens.hasGrant()) {
      return;
    }
    const due = store
      .vins()
      .filter((vin) => now() - (store.vehicle(vin).restAt ?? 0) >= config.apiRefreshHours * HOUR);
    if (due.length === 0) {
      return;
    }
    try {
      await readCars({ vins: due });
    } catch (err) {
      handleError(err, 'Scheduled API reading');
    }
  }

  /**
   * @description Log an error, and handle a lost sign-in.
   * @param {Error} err - The error.
   * @param {string} what - What failed.
   */
  function handleError(err, what) {
    if (err instanceof AuthError && err.reauth) {
      handleAuthLost(err).catch(() => {});
      return;
    }
    if (err instanceof CardataError && err.quotaGuard) {
      logger.info(`${what} skipped: ${err.message}`);
      return;
    }
    logger.warn(`${what} failed: ${redactVin(err.message)}`);
  }

  /**
   * @description The sign-in is dead (refresh token expired or revoked).
   * @param {Error} err - The error.
   * @returns {Promise<void>}
   */
  async function handleAuthLost(err) {
    if (authLost) {
      return;
    }
    authLost = true;
    logger.error(`BMW sign-in lost: ${err.message}. Click Connect again.`);
    clearTimeout(tokenTimer);
    stream.stop();
    await reportStatus(false, all('statusReauth'));
    for (const vin of store.vins()) {
      await publishTransport(vin);
    }
    const { key, data } = buildAuthorizationExpiredEvent(textLanguage());
    await gladys
      .publishSceneEvent(key, data)
      .catch((e) => logger.warn(`Unable to publish the scene event ${key}: ${e.message}`));
    refreshWidget(WIDGETS.ACCOUNT);
  }

  // --- Tokens and start ---------------------------------------------------------------

  /** Refresh the tokens before they expire, then reconnect the stream. */
  function scheduleTokenRefresh() {
    clearTimeout(tokenTimer);
    tokenTimer = setTimeout(async () => {
      try {
        await tokens.refresh();
        stream.restart();
        scheduleTokenRefresh();
      } catch (err) {
        if (err instanceof AuthError && err.reauth) {
          await handleAuthLost(err);
          return;
        }
        logger.warn(`Token refresh failed, retry in 5 min: ${err.message}`);
        tokenTimer = setTimeout(scheduleTokenRefresh, RETRY_MS);
        tokenTimer.unref?.();
      }
    }, tokens.refreshDelay());
    tokenTimer.unref?.();
  }

  /** Stop the timers and the stream. */
  function stopAll() {
    clearTimeout(startRetry);
    clearTimeout(tokenTimer);
    clearInterval(apiTimer);
    publishTimers.forEach((timer) => clearTimeout(timer));
    publishTimers.clear();
    stream.stop();
  }

  /**
   * @description Sign in check, stream, list of cars, first reading.
   * @returns {Promise<void>}
   */
  async function start() {
    stopAll();
    if (!config.clientId) {
      await reportStatus(false, all('statusNoClient'));
      return;
    }
    if (!tokens.hasGrant()) {
      await reportStatus(false, all('statusNotSignedIn'));
      return;
    }
    authLost = false;
    try {
      if (tokens.dueForRefresh() || !tokens.tokens.idToken) {
        await tokens.refresh();
      }
    } catch (err) {
      if (err instanceof AuthError && err.reauth) {
        await handleAuthLost(err);
        return;
      }
      logger.warn(`BMW unreachable, retry in 5 min: ${err.message}`);
      await reportStatus(false, all('statusUnreachable'));
      startRetry = setTimeout(() => startIfReady().catch(() => {}), RETRY_MS);
      startRetry.unref?.();
      return;
    }
    scheduleTokenRefresh();
    stream.start();
    try {
      await discover();
    } catch (err) {
      handleError(err, 'Reading the cars of the account');
    }
    // A car never read (first start) is read once, whatever the schedule.
    const never = store.vins().filter((vin) => !store.vehicle(vin).restAt);
    if (never.length > 0) {
      await readCars({ vins: never }).catch((err) => handleError(err, 'First API reading'));
    }
    await reportRunning();
    await publishDiscoveredDevices().catch((err) =>
      logger.warn(`Unable to offer the cars: ${err.message}`),
    );
    for (const vin of store.vins()) {
      await publishStates(vin).catch(() => {});
      await publishTransport(vin);
    }
    await readIfDue();
    apiTimer = setInterval(() => {
      refreshHouses().catch(() => {});
      readIfDue().catch(() => {});
    }, API_CHECK_MS);
    apiTimer.unref?.();
  }

  /**
   * @description Start, one at a time.
   * @returns {Promise<void>}
   */
  function startIfReady() {
    starting = starting.catch(() => {}).then(start);
    return starting;
  }

  // --- Sign-in (device code flow) -------------------------------------------------------

  gladys.onOAuthAuthorizeUrl(async (key) => {
    if (key !== ACCOUNT_FIELD) {
      throw new Error(`Unknown account field: ${key}`);
    }
    if (!config.clientId) {
      throw new Error(t('statusNoClient', textLanguage()));
    }
    let code;
    try {
      code = await requestDeviceCode({ clientId: config.clientId, fetchImpl });
    } catch (err) {
      logger.error(`BMW sign-in could not start: ${err.message}`);
      throw new Error(t('signInStartFailed', textLanguage(), { reason: err.message }), {
        cause: err,
      });
    }
    signInGeneration += 1;
    const mine = signInGeneration;
    logger.info(
      `BMW sign-in: approve the code ${code.userCode} on the BMW page (valid ${Math.round(code.expiresIn / 60)} min)`,
    );
    lastStatus = null;
    await reportStatus(false, all('statusEnterCode', { code: code.userCode }));
    waitForApproval({
      clientId: config.clientId,
      code,
      fetchImpl,
      now,
      ...(sleep ? { sleep } : {}),
      cancelled: () => mine !== signInGeneration,
    })
      .then(async (next) => {
        if (!next) {
          return;
        }
        await tokens.adopt(next);
        logger.info(`Signed in to BMW CarData (account …${next.gcid.slice(-4)})`);
        authLost = false;
        lastStatus = null;
        await startIfReady();
      })
      .catch(async (err) => {
        if (mine !== signInGeneration) {
          return;
        }
        logger.error(`BMW sign-in failed: ${err.message}`);
        const reason = /access_denied/.test(err.code)
          ? 'denied'
          : /expired/.test(err.code)
            ? 'expired'
            : 'other';
        lastStatus = null;
        await reportStatus(false, all(`statusSignIn_${reason}`));
      });
    return code.verificationUrl;
  });

  // --- Devices --------------------------------------------------------------------------

  gladys.onSetValue(async () => {
    throw new Error('BMW CarData is read-only: it accepts no command');
  });

  gladys.onScanRequest(async () => {
    if (tokens.hasGrant() && !authLost) {
      await discover({ manual: true }).catch((err) => handleError(err, 'Scan'));
    }
    const count = await publishDiscoveredDevices();
    logger.info(`Scan: ${count} car(s) offered`);
  });

  // Gladys drops the states of a feature that does not exist yet: publish
  // them all once the car is created, and refresh the widgets.
  gladys.onDeviceCreated(async (device) => {
    await refreshCreatedDevices();
    const parsed = parseExternalId(device.external_id);
    if (parsed && store.has(parsed.vin)) {
      await publishStates(parsed.vin, true).catch((err) =>
        logger.warn(`Unable to publish the states: ${err.message}`),
      );
      transports.delete(device.external_id);
      await publishTransport(parsed.vin);
    }
    widgetRefreshedAt.clear();
    refreshWidget(WIDGETS.VEHICLE);
  });

  gladys.onDeviceDeleted(refreshCreatedDevices);

  // --- Dashboard widgets ----------------------------------------------------------------

  /**
   * @description The image key of a car picture (it never changes once stored).
   * @param {string} vin - The VIN.
   * @returns {string} The key.
   */
  const imageKeyOf = (vin) => `car-${createHash('sha1').update(vin).digest('hex').slice(0, 16)}`;

  /**
   * @description The picture of a car: its key when stored, else fetched once
   * in the background (one API call, never into the reserve).
   * @param {string} vin - The VIN.
   * @returns {string|null} The key.
   */
  function pictureOf(vin) {
    if (store.image(vin)) {
      return imageKeyOf(vin);
    }
    if (!imageTried.has(vin) && tokens.hasGrant() && !authLost) {
      imageTried.add(vin);
      api
        .image(vin)
        .then((base64) => {
          if (base64) {
            store.setImage(vin, base64);
            widgetRefreshedAt.delete(WIDGETS.VEHICLE);
            refreshWidget(WIDGETS.VEHICLE);
          }
        })
        .catch((err) => logger.info(`Car picture unavailable: ${redactVin(err.message)}`));
    }
    return null;
  }

  gladys.onWidgetGet(WIDGETS.VEHICLE, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    if (!tokens.hasGrant()) {
      return messageContent(t('notSignedIn', lang));
    }
    const car = resolveCar(settings.vehicle);
    if (!car) {
      return messageContent(t('noVehicle', lang));
    }
    return buildVehicleWidget({
      car,
      imageKey: settings.show_picture === false ? null : pictureOf(car.vin),
      stream: stream.status(),
      language: lang,
      now: now(),
    });
  });

  gladys.onWidgetAction(WIDGETS.VEHICLE, async (actionKey, params) => {
    const vin = typeof params?.vin === 'string' ? params.vin : '';
    if (actionKey !== WIDGET_ACTIONS.REFRESH || !store.has(vin)) {
      throw new Error(`Unknown action ${actionKey}`);
    }
    try {
      await readCars({ manual: true, vins: [vin] });
      return all('refreshDone', { count: 1, left: store.quota().left });
    } catch (err) {
      handleError(err, 'Widget refresh');
      return err instanceof CardataError && err.rateLimited
        ? all('quotaExhausted')
        : all('refreshFailed');
    }
  });

  gladys.onWidgetGetImage(async (imageKey) => {
    const vin = store.vins().find((candidate) => imageKeyOf(candidate) === imageKey);
    const image = vin ? store.image(vin) : null;
    if (!image) {
      throw new Error(`Unknown image key: ${imageKey}`);
    }
    return image;
  });

  gladys.onWidgetGet(WIDGETS.ACCOUNT, async ({ language: lang }) => {
    rememberLanguage(lang);
    return buildAccountWidget({
      quota: store.quota(),
      stream: stream.status(),
      tokens: tokens.tokens,
      cars: store.vins().length,
      signedIn: tokens.hasGrant() && !authLost,
      language: lang,
      now: now(),
    });
  });

  // --- Scene action -----------------------------------------------------------------------

  gladys.onSceneAction(SCENE_ACTIONS.GET_STATUS, async (fields) => {
    let car = resolveCar(fields.vehicle);
    if (!car) {
      throw new Error('No BMW car: check the integration settings');
    }
    if (fields.refresh === true) {
      try {
        await readCars({ manual: true, vins: [car.vin] });
      } catch (err) {
        handleError(err, 'Scene refresh');
      }
      car = carOf(car.vin);
    }
    const language = textLanguage();
    const { snapshot } = car;
    const level = snapshot.battery.level ?? snapshot.fuel.level;
    const range = snapshot.battery.rangeKm ?? snapshot.rangeKm;
    const parts = [car.name];
    if (level !== null) {
      parts.push(`${Math.round(level)} %`);
    }
    if (range !== null) {
      parts.push(`${Math.round(range)} km`);
    }
    if (snapshot.lock) {
      parts.push(t(snapshot.lock, language));
    }
    if (snapshot.charge.status) {
      parts.push(t(`charge_${snapshot.charge.status}`, language));
    }
    return {
      battery_level: snapshot.battery.level,
      range_km: range,
      fuel_level: snapshot.fuel.level,
      charging_status: snapshot.charge.status,
      plugged: snapshot.charge.plugged,
      locked: snapshot.lock === null ? null : snapshot.lock === 'locked',
      open_list: openingsLabel(snapshot.openList, language),
      at_home: car.atHome,
      distance_home_km: car.distanceHomeKm,
      odometer_km: snapshot.odometerKm,
      summary: parts.join(' · '),
    };
  });

  // --- Configuration screen actions -------------------------------------------------------

  gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
    if (!config.clientId) {
      return all('statusNoClient');
    }
    if (!tokens.hasGrant() || authLost) {
      return all(authLost ? 'statusReauth' : 'statusNotSignedIn');
    }
    try {
      await tokens.getAccessToken();
      if (store.vins().length === 0) {
        await discover({ manual: true });
      }
    } catch (err) {
      handleError(err, 'Connection test');
      return each((lang) =>
        `${t('statusUnreachable', lang)} (${redactVin(err.message)})`.slice(0, 200),
      );
    }
    const status = stream.status();
    const quota = store.quota();
    return each((lang) =>
      t('testResult', lang, {
        cars:
          store
            .vins()
            .map((vin) => vehicleName(vin, store.vehicle(vin).basic))
            .join(', ') || '0',
        stream: t(status.connected ? 'streamUp' : 'streamDown', lang),
        left: quota.left,
      }).slice(0, 200),
    );
  });

  gladys.onAction(ACTIONS.REFRESH, async () => {
    if (!tokens.hasGrant() || authLost) {
      return all('statusNotSignedIn');
    }
    try {
      await discover({ manual: true });
      const count = await readCars({ manual: true });
      await publishDiscoveredDevices();
      return all('refreshDone', { count, left: store.quota().left });
    } catch (err) {
      handleError(err, 'Refresh');
      return err instanceof CardataError && err.rateLimited
        ? all('quotaExhausted')
        : each((lang) => `${t('refreshFailed', lang)} (${redactVin(err.message)})`.slice(0, 200));
    }
  });

  gladys.onAction(ACTIONS.DIAGNOSTIC, async () => {
    // Gladys passes no DEBUG variable to the container: this writes an
    // anonymized summary in the logs (Settings -> Supervision) instead.
    const status = stream.status();
    const quota = store.quota();
    const token = tokens.tokens;
    const iso = (instant) => (instant ? new Date(instant).toISOString() : 'never');
    const container = store.container();
    logger.info(`[diagnostic] gladys-bmw-cardata ${version}, Node ${process.version}`);
    logger.info(
      `[diagnostic] client ID: ${config.clientId ? `set (${config.clientId.length} characters)` : 'missing'}; signed in: ${tokens.hasGrant()}; sign-in lost: ${authLost}; account: …${token.gcid.slice(-4)}`,
    );
    logger.info(
      `[diagnostic] access token until ${iso(token.expiresAt)}, ID token present: ${Boolean(token.idToken)}, refresh token until ~${iso(token.refreshExpiresAt)}`,
    );
    logger.info(
      `[diagnostic] stream ${config.streamHost}:${config.streamPort}: running ${status.running}, connected ${status.connected} since ${iso(status.since)}, ${status.messages} message(s), last ${iso(status.lastMessageAt)}, contended ${status.contended}, last error "${status.lastError}"`,
    );
    logger.info(
      `[diagnostic] API: ${quota.used} call(s) on ${quota.day} (UTC), ${quota.left} left, exhausted ${quota.exhausted}; container ${container?.id ? `…${container.id.slice(-4)}` : 'none'}; schedule every ${config.apiRefreshHours} h; houses ${houses.length}`,
    );
    for (const vin of store.vins()) {
      const stored = store.vehicle(vin);
      const car = carOf(vin);
      const s = car.snapshot;
      logger.info(
        `[diagnostic] car …${vin.slice(-4)}: ${car.name}, ${stored.basic?.propulsionType ?? '?'} / ${stored.basic?.driveTrain ?? '?'}, created in Gladys ${createdDevices.has(idsOf(gladys, vin).device)}, last API reading ${iso(stored.restAt)}, picture ${Boolean(store.image(vin))}`,
      );
      logger.info(
        `[diagnostic] car …${vin.slice(-4)} snapshot: battery ${s.battery.level}, electric range ${s.battery.rangeKm}, range ${s.rangeKm}, fuel ${s.fuel.level}% / ${s.fuel.liters} L, charge ${s.charge.status} plugged ${s.charge.plugged}, lock ${s.lock}, open [${s.openList.join(',')}], moving ${s.moving}, position known ${Boolean(s.location)}, at home ${car.atHome}`,
      );
      const descriptors = Object.entries(stored.values)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, entry]) => `${name.replace(/^vehicle\./, '')}@${iso(entry.at).slice(0, 16)}`);
      logger.info(
        `[diagnostic] car …${vin.slice(-4)}: ${descriptors.length} descriptor(s) received: ${descriptors.join(' ')}`,
      );
    }
    return all('diagnosticDone');
  });

  gladys.onAction(ACTIONS.DISCONNECT, async () => {
    signInGeneration += 1;
    stopAll();
    await tokens.clear();
    store.clear();
    runtime.clear();
    authLost = false;
    lastStatus = null;
    await reportStatus(false, all('statusNotSignedIn'));
    refreshWidget(WIDGETS.ACCOUNT);
    return all('disconnected');
  });

  // --- Configuration ------------------------------------------------------------------------

  /**
   * @description Reload the whole config (internal keys included).
   * @param {object} [fallback] - Raw values to use when the read fails.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      const raw = await gladys.getConfig();
      config = normalizeConfig(raw);
      lastLanguage = readLanguage(raw, lastLanguage);
    } catch (err) {
      if (fallback) {
        config = { ...normalizeConfig(fallback), tokens: config.tokens };
      }
      logger.error('Unable to read the configuration', err);
    }
    tokens.setTokens(config.tokens);
  }

  gladys.onConfigUpdated(async (rawConfig) => {
    const before = JSON.stringify([config.clientId, config.streamHost, config.streamPort]);
    const clientBefore = config.clientId;
    await loadConfig(rawConfig);
    if (clientBefore && clientBefore !== config.clientId && tokens.hasGrant()) {
      // The tokens belong to the previous client ID.
      logger.info('Client ID changed: sign in again');
      await tokens.clear();
    }
    if (before !== JSON.stringify([config.clientId, config.streamHost, config.streamPort])) {
      lastStatus = null;
      await startIfReady();
    }
  });

  // --- Connection lifecycle -----------------------------------------------------------------

  gladys.on('connected', async () => {
    store.load();
    await loadConfig();
    await refreshHouses(true);
    await refreshCreatedDevices();
    lastStatus = null;
    await startIfReady();
  });

  gladys.handleShutdown((signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    signInGeneration += 1;
    stopAll();
    store.flush();
  });

  return {
    stream,
    store,
    tokens,
    handleData,
    readCars,
    flush: async () => {
      for (const [vin, timer] of publishTimers) {
        clearTimeout(timer);
        publishTimers.delete(vin);
        await publishStates(vin);
        await publishTransport(vin);
      }
    },
    stop: stopAll,
  };
}

export { ACTIONS, SCENE_ACTIONS };
