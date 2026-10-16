// -----------------------------------------------------------------------------
// Scene triggers: what changed between two snapshots of a car.
//
// The stream pushes a change within seconds; the integration compares the
// snapshot after each update with the one before. Only a change between two
// KNOWN values fires (a value that appears for the first time is a baseline),
// and the first update of each car after a start fires nothing (no replay of
// what happened while Gladys was off).
//
// Every event carries the device of the car in `vehicle`, the field of the
// `source: "devices"` filter of the manifest.
// -----------------------------------------------------------------------------

import { t, openingsLabel } from './i18n.js';

const TRIGGERS = {
  LOCK_CHANGED: 'lock_changed',
  LEFT_OPEN: 'left_open',
  CHARGING_CHANGED: 'charging_changed',
  PLUG_CHANGED: 'plug_changed',
  MOVING_CHANGED: 'moving_changed',
  HOME_CHANGED: 'home_changed',
  AUTHORIZATION_EXPIRED: 'authorization_expired',
};

/**
 * @description The events between two states of a car.
 * @param {object} before - `{ snapshot, atHome }` before the update.
 * @param {object} after - `{ snapshot, atHome }` after it.
 * @returns {Array<{ key: string, values: object }>} The events.
 * @example
 * detectEvents(before, after); // -> [{ key: 'lock_changed', values: { state: 'unlocked' } }]
 */
function detectEvents(before, after) {
  const a = before.snapshot;
  const b = after.snapshot;
  const events = [];
  const changed = (x, y) =>
    x !== null && x !== undefined && y !== null && y !== undefined && x !== y;
  const locked = (state) => (state === null ? null : state === 'locked');

  if (changed(locked(a.lock), locked(b.lock))) {
    events.push({
      key: TRIGGERS.LOCK_CHANGED,
      values: { state: b.lock === 'locked' ? 'locked' : 'unlocked' },
    });
  }

  // Locked with something open: when it starts, or when one more opens.
  if (b.lock === 'locked' && b.openList.length > 0) {
    const wasLeftOpen = a.lock === 'locked' && a.openList.length > 0;
    const newlyOpen = b.openList.filter((name) => !a.openList.includes(name));
    if (!wasLeftOpen || newlyOpen.length > 0) {
      events.push({ key: TRIGGERS.LEFT_OPEN, values: { openings: b.openList } });
    }
  }

  if (changed(a.charge.status, b.charge.status)) {
    events.push({ key: TRIGGERS.CHARGING_CHANGED, values: { status: b.charge.status } });
  }

  if (changed(a.charge.plugged, b.charge.plugged)) {
    events.push({
      key: TRIGGERS.PLUG_CHANGED,
      values: { state: b.charge.plugged ? 'plugged' : 'unplugged' },
    });
  }

  if (changed(a.moving, b.moving)) {
    events.push({
      key: TRIGGERS.MOVING_CHANGED,
      values: { state: b.moving ? 'started' : 'stopped' },
    });
  }

  if (changed(before.atHome, after.atHome)) {
    events.push({
      key: TRIGGERS.HOME_CHANGED,
      values: { state: after.atHome ? 'arrived' : 'left' },
    });
  }
  return events;
}

/**
 * @description The scene data of an event (flat, scalar values only).
 * @param {object} event - `{ key, values }` (detectEvents).
 * @param {object} context - `{ vehicle, carName, after, language }`.
 * @returns {{ key: string, data: object }} The scene event.
 */
function buildSceneEvent(event, { vehicle, carName, after, language }) {
  const { snapshot } = after;
  const car = carName;
  const base = { vehicle, vehicle_name: carName };
  const level = snapshot.battery.level;
  switch (event.key) {
    case TRIGGERS.LOCK_CHANGED:
      return {
        key: event.key,
        data: {
          ...base,
          state: event.values.state,
          summary: t(
            event.values.state === 'locked' ? 'summaryLocked' : 'summaryUnlocked',
            language,
            {
              car,
            },
          ),
        },
      };
    case TRIGGERS.LEFT_OPEN: {
      const list = openingsLabel(event.values.openings, language);
      return {
        key: event.key,
        data: { ...base, openings: list, summary: t('summaryLeftOpen', language, { car, list }) },
      };
    }
    case TRIGGERS.CHARGING_CHANGED: {
      const status = t(`charge_${event.values.status}`, language);
      return {
        key: event.key,
        data: {
          ...base,
          status: event.values.status,
          status_label: status,
          battery_level: level,
          range_km: snapshot.battery.rangeKm,
          summary: t('summaryCharging', language, { car, status, level: level ?? '?' }),
        },
      };
    }
    case TRIGGERS.PLUG_CHANGED:
      return {
        key: event.key,
        data: {
          ...base,
          state: event.values.state,
          battery_level: level,
          summary: t(
            event.values.state === 'plugged' ? 'summaryPlugged' : 'summaryUnplugged',
            language,
            {
              car,
            },
          ),
        },
      };
    case TRIGGERS.MOVING_CHANGED:
      return {
        key: event.key,
        data: {
          ...base,
          state: event.values.state,
          summary: t(
            event.values.state === 'started' ? 'summaryStarted' : 'summaryStopped',
            language,
            {
              car,
            },
          ),
        },
      };
    case TRIGGERS.HOME_CHANGED:
      return {
        key: event.key,
        data: {
          ...base,
          state: event.values.state,
          distance_km: after.distanceHomeKm ?? null,
          summary: t(
            event.values.state === 'arrived' ? 'summaryArrived' : 'summaryLeft',
            language,
            {
              car,
            },
          ),
        },
      };
    default:
      throw new Error(`Unknown event ${event.key}`);
  }
}

/**
 * @description The scene data of the "sign-in to renew" event.
 * @param {string} language - The language.
 * @returns {{ key: string, data: object }} The scene event.
 */
function buildAuthorizationExpiredEvent(language) {
  return { key: TRIGGERS.AUTHORIZATION_EXPIRED, data: { summary: t('summaryReauth', language) } };
}

export { TRIGGERS, detectEvents, buildSceneEvent, buildAuthorizationExpiredEvent };
