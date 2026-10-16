// -----------------------------------------------------------------------------
// The dashboard widgets.
//
// `vehicle`: one card per car (setting `vehicle`, a `source: "devices"`
// select; empty = the first car of the account):
//   - the picture BMW serves for the car (GET /image, fetched once);
//   - two tiles: battery and range for a car with a battery, fuel and range
//     otherwise;
//   - a status list: lock, openings, charge, position, tyres, 12 V battery,
//     age of the data, stream when it is down;
//   - two buttons: the position on a map, and "Read now" (one API call).
// Budget of the core: 8 components; 1 picture + 2 tiles + 1 status + 2
// buttons = 6.
//
// `account`: the CarData account: API calls of the day out of 50 (a gauge),
// the stream, the sign-in, the cars.
// -----------------------------------------------------------------------------

import { t, openingsLabel, ago } from './i18n.js';
import { DAILY_QUOTA } from './store.js';

const WIDGETS = { VEHICLE: 'vehicle', ACCOUNT: 'account' };
const WIDGET_ACTIONS = { REFRESH: 'refresh' };
const TTL_SECONDS = { vehicle: 60, account: 60, message: 120 };
const MAX_STATUS_LENGTH = 40;

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description A number with one decimal, in the language's format.
 * @param {number} value - The number.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
const fmt1 = (value, language) =>
  new Intl.NumberFormat(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    value,
  );

/**
 * @description A widget content made of one message.
 * @param {string} message - The message.
 * @param {number} [ttl] - Its freshness.
 * @returns {object} The content.
 */
function messageContent(message, ttl = TTL_SECONDS.message) {
  return {
    ttl_seconds: ttl,
    components: [{ type: 'text', variant: 'body', text: clip(message, 300) }],
  };
}

/**
 * @description An OpenStreetMap link to a position.
 * @param {{ latitude: number, longitude: number }} position - The position.
 * @returns {string} The URL.
 */
function mapUrl({ latitude, longitude }) {
  const lat = latitude.toFixed(5);
  const lon = longitude.toFixed(5);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;
}

/**
 * @description The two tiles of a car.
 * @param {object} snapshot - Its snapshot.
 * @param {string} language - The language.
 * @returns {Array<object>} The tiles (0 to 2).
 */
function tiles(snapshot, language) {
  const result = [];
  const color = (level) => (level <= 20 ? 'danger' : level <= 40 ? 'warning' : 'success');
  const { battery, fuel } = snapshot;
  if (battery.level !== null) {
    result.push({
      type: 'value',
      value: Math.round(battery.level),
      unit: '%',
      label: t('battery', language),
      icon: snapshot.charge.status === 'charging' ? 'battery-charging' : 'battery',
      color: color(battery.level),
    });
  } else if (fuel.level !== null || fuel.liters !== null) {
    result.push({
      type: 'value',
      value: Math.round(fuel.level ?? fuel.liters),
      unit: fuel.level !== null ? '%' : 'L',
      label: t('fuel', language),
      icon: 'droplet',
      color: fuel.level !== null ? color(fuel.level) : 'primary',
    });
  }
  const range = battery.rangeKm ?? snapshot.rangeKm;
  if (range !== null) {
    result.push({
      type: 'value',
      value: Math.round(range),
      unit: 'km',
      label: t('range', language),
      icon: 'navigation',
    });
  }
  return result;
}

/**
 * @description The status list of a car.
 * @param {object} car - `{ snapshot, atHome, distanceHomeKm }`.
 * @param {object} stream - The stream status.
 * @param {string} language - The language.
 * @param {number} now - Now, in ms.
 * @returns {Array<object>} The rows.
 */
function statusItems({ snapshot, atHome, distanceHomeKm }, stream, language, now) {
  const items = [];
  if (snapshot.lock) {
    items.push({
      label: t('lockState', language),
      value: t(snapshot.lock, language),
      color: snapshot.lock === 'locked' ? 'success' : 'warning',
    });
  }
  if (Object.values(snapshot.openings).some((state) => state !== null)) {
    items.push({
      label: t('openings', language),
      value:
        snapshot.openList.length === 0
          ? t('allClosed', language)
          : clip(
              t('open', language, { list: openingsLabel(snapshot.openList, language) }),
              MAX_STATUS_LENGTH,
            ),
      color: snapshot.openList.length === 0 ? 'success' : 'warning',
    });
  }
  const { charge } = snapshot;
  if (charge.status) {
    const power =
      charge.status === 'charging' && charge.powerKw !== null
        ? ` · ${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(charge.powerKw)} kW`
        : '';
    items.push({
      label: t('charging', language),
      value: clip(`${t(`charge_${charge.status}`, language)}${power}`, MAX_STATUS_LENGTH),
      color:
        charge.status === 'charging'
          ? 'info'
          : ['error', 'interrupted'].includes(charge.status)
            ? 'danger'
            : 'neutral',
    });
  } else if (charge.plugged !== null) {
    items.push({
      label: t('charging', language),
      value: t(charge.plugged ? 'plugged' : 'unplugged', language),
      color: 'neutral',
    });
  }
  if (atHome !== null && atHome !== undefined) {
    items.push({
      label: t('position', language),
      value: atHome ? t('atHome', language) : t('awayFrom', language, { km: distanceHomeKm }),
      color: atHome ? 'success' : 'neutral',
    });
  } else if (snapshot.moving !== null) {
    items.push({
      label: t('position', language),
      value: t(snapshot.moving ? 'driving' : 'parked', language),
      color: snapshot.moving ? 'info' : 'neutral',
    });
  }
  const pressures = Object.values(snapshot.tires).filter((value) => value !== null);
  if (pressures.length > 0) {
    items.push({
      label: t('tires', language),
      value: `${fmt1(Math.min(...pressures), language)} – ${fmt1(Math.max(...pressures), language)} bar`,
      color: Math.min(...pressures) < 1.8 ? 'warning' : 'success',
    });
  }
  if (snapshot.battery12v !== null) {
    items.push({
      label: t('battery12v', language),
      value: `${fmt1(snapshot.battery12v, language)} V`,
      color: snapshot.battery12v < 11.8 ? 'warning' : 'success',
    });
  }
  if (snapshot.odometerKm !== null) {
    items.push({
      label: t('odometer', language),
      value: `${new Intl.NumberFormat(language).format(snapshot.odometerKm)} km`,
    });
  }
  if (Number.isFinite(snapshot.updatedAt)) {
    items.push({ label: t('updated', language), value: ago(snapshot.updatedAt, now, language) });
  }
  if (stream && !stream.connected) {
    items.push({
      label: t('stream', language),
      value: t('streamDown', language),
      color: 'warning',
    });
  }
  return items.slice(0, 10);
}

/**
 * @description The `vehicle` widget.
 * @param {object} options - Options.
 * @param {object} options.car - `{ vin, name, snapshot, atHome, distanceHomeKm }`.
 * @param {string|null} options.imageKey - The key of its picture.
 * @param {object} options.stream - The stream status.
 * @param {string} options.language - The language.
 * @param {number} options.now - Now, in ms.
 * @returns {object} The content.
 */
function buildVehicleWidget({ car, imageKey, stream, language, now }) {
  const { snapshot } = car;
  if (snapshot.updatedAt === null) {
    return messageContent(t('noDataYet', language, { car: car.name }), 60);
  }
  const components = [];
  if (imageKey) {
    components.push({ type: 'image', key: imageKey, alt: clip(car.name, 100), fit: 'contain' });
  }
  components.push(...tiles(snapshot, language));
  components.push({ type: 'status', items: statusItems(car, stream, language, now) });
  if (snapshot.location) {
    components.push({
      type: 'button',
      label: t('buttonMap', language),
      icon: 'map-pin',
      style: 'secondary',
      link: { url: mapUrl(snapshot.location) },
    });
  }
  components.push({
    type: 'button',
    label: t('buttonRefresh', language),
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: WIDGET_ACTIONS.REFRESH, params: { vin: car.vin } },
  });
  return { ttl_seconds: TTL_SECONDS.vehicle, components };
}

/**
 * @description The `account` widget.
 * @param {object} options - Options.
 * @param {object} options.quota - `{ used, left, exhausted }`.
 * @param {object} options.stream - The stream status.
 * @param {object} options.tokens - `{ refreshExpiresAt }`.
 * @param {number} options.cars - How many cars.
 * @param {boolean} options.signedIn - Signed in or not.
 * @param {string} options.language - The language.
 * @param {number} options.now - Now, in ms.
 * @returns {object} The content.
 */
function buildAccountWidget({ quota, stream, tokens, cars, signedIn, language, now }) {
  if (!signedIn) {
    return messageContent(t('notSignedIn', language));
  }
  const used = Math.min(DAILY_QUOTA, quota.exhausted ? DAILY_QUOTA : quota.used);
  const items = [
    {
      label: t('stream', language),
      value: stream.connected
        ? t('streamUp', language)
        : stream.contended
          ? t('streamContended', language)
          : t('streamDown', language),
      color: stream.connected ? 'success' : 'warning',
    },
    {
      label: t('lastMessage', language),
      value: stream.lastMessageAt ? ago(stream.lastMessageAt, now, language) : t('never', language),
    },
    {
      label: t('apiLeft', language),
      value: String(quota.left),
      color: quota.left === 0 ? 'danger' : quota.left <= 10 ? 'warning' : 'success',
    },
    { label: t('cars', language), value: String(cars) },
  ];
  if (tokens.refreshExpiresAt) {
    const days = Math.max(0, Math.floor((tokens.refreshExpiresAt - now) / 86400000));
    items.push({
      label: t('signIn', language),
      value: t('signInValid', language, { days }),
      color: days < 3 ? 'warning' : 'success',
    });
  }
  return {
    ttl_seconds: TTL_SECONDS.account,
    components: [
      {
        type: 'gauge',
        value: used,
        min: 0,
        max: DAILY_QUOTA,
        label: t('apiCalls', language),
        color: used >= DAILY_QUOTA ? 'danger' : used >= 40 ? 'warning' : 'primary',
      },
      {
        type: 'value',
        value: stream.messages,
        label: t('messages', language),
        icon: 'radio',
      },
      { type: 'status', items },
    ],
  };
}

export { WIDGETS, WIDGET_ACTIONS, mapUrl, messageContent, buildVehicleWidget, buildAccountWidget };
