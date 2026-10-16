import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  D,
  CONTAINER_DESCRIPTORS,
  toBoolean,
  toNumber,
  mergeValues,
  summarize,
  homeOf,
} from '../src/vehicle.js';
import { NOW, entry, electricCar } from './helpers/fixtures.js';

const merged = (data, values = {}) => {
  mergeValues(values, data, NOW);
  return values;
};

test('values: booleans and numbers in every shape BMW sends', () => {
  for (const yes of [true, 'true', 'ASN_isTrue', 'OPEN', 'CONNECTED', 1]) {
    assert.equal(toBoolean(yes), true, String(yes));
  }
  for (const no of [false, 'false', 'ASN_isFalse', 'CLOSED', 'DISCONNECTED', 0]) {
    assert.equal(toBoolean(no), false, String(no));
  }
  for (const unknown of ['INVALID', 'ASN_isUnknown', 'UNKNOWN', null, 2]) {
    assert.equal(toBoolean(unknown), null, String(unknown));
  }
  assert.equal(toNumber('62.5'), 62.5);
  assert.equal(toNumber('-NA-'), null);
  assert.equal(toNumber(''), null);
});

test('merge: an older value never replaces a newer one (the REST copy lags behind the stream)', () => {
  const values = merged({ [D.SOC]: entry(70, '%', NOW) });
  const changed = mergeValues(values, { [D.SOC]: entry('62', '%', NOW - 60000) }, NOW);
  assert.deepEqual(changed, []);
  assert.equal(summarize(values).battery.level, 70);
  assert.deepEqual(mergeValues(values, { [D.SOC]: entry(71, '%', NOW + 1000) }, NOW), [D.SOC]);
  // Same value, same instant: nothing changed.
  assert.deepEqual(mergeValues(values, { [D.SOC]: entry(71, '%', NOW + 1000) }, NOW), []);
  // Garbage is ignored.
  assert.deepEqual(
    mergeValues(values, { 'not.a.vehicle': entry(1), [D.HOOD]: { value: {} } }, NOW),
    [],
  );
});

test('snapshot of an electric car: units converted, unknowns null', () => {
  const s = summarize(merged(electricCar()));
  assert.equal(s.battery.level, 62);
  assert.equal(s.battery.rangeKm, 254);
  assert.equal(s.charge.status, 'not_charging');
  assert.equal(s.charge.plugged, false);
  assert.equal(s.charge.target, 80);
  assert.equal(s.odometerKm, 18234);
  assert.equal(s.lock, 'locked');
  assert.deepEqual(s.openList, []);
  assert.equal(s.tires.frontLeft, 2.5);
  assert.equal(s.battery12v, 12.6);
  assert.equal(s.moving, false);
  assert.equal(s.climate, false);
  assert.equal(s.fuel.level, null);
  assert.equal(s.fuel.liters, null);
  assert.deepEqual(s.location, { latitude: 48.8566, longitude: 2.3522, at: NOW - 3600000 });
});

test('snapshot: charging, miles, gallons, watts, open windows, partial lock', () => {
  const s = summarize(
    merged({
      [D.CHARGING_STATUS]: entry('CHARGINGACTIVE'),
      [D.PLUGGED]: entry(true),
      [D.CHARGING_POWER]: entry(11040, 'W'),
      [D.MILEAGE]: entry(1000, 'mi'),
      [D.FUEL_REMAINING]: entry(10, 'gal'),
      [D.WINDOW_REAR_LEFT]: entry('INTERMEDIATE'),
      [D.DOOR_STATUS]: entry('SELECTIVELOCKED'),
      [D.TRUNK]: entry('INVALID'),
    }),
  );
  assert.equal(s.charge.status, 'charging');
  assert.equal(s.charge.plugged, true);
  assert.equal(s.charge.powerKw, 11.04);
  assert.equal(s.odometerKm, 1609);
  assert.equal(s.fuel.liters, 37.9);
  assert.equal(s.openings.windows, true);
  assert.equal(s.openings.trunk, null);
  assert.deepEqual(s.openList, ['windows']);
  assert.equal(s.lock, 'partly_locked');
});

test('the newest of the streamed door status and the REST lock status wins', () => {
  const values = merged({
    [D.DOOR_LOCK]: entry('SECURED', null, NOW - 86400000),
    [D.DOOR_STATUS]: entry('UNLOCKED', null, NOW),
  });
  assert.equal(summarize(values).lock, 'unlocked');
});

test('the HV status stands in for the charging status', () => {
  const s = summarize(merged({ [D.HV_STATUS]: entry('FINISHED_FULLY_CHARGED') }));
  assert.equal(s.charge.status, 'finished');
});

test('position: both halves from the same fix only', () => {
  const values = merged({ [D.LATITUDE]: entry(48.1, 'degrees', NOW) });
  assert.equal(summarize(values).location, null);
  mergeValues(values, { [D.LONGITUDE]: entry(16.3, 'degrees', NOW - 10 * 60000) }, NOW);
  assert.equal(summarize(values).location, null, 'ten minutes apart');
  mergeValues(values, { [D.LONGITUDE]: entry(16.3, 'degrees', NOW + 1000) }, NOW);
  assert.deepEqual(summarize(values).location, { latitude: 48.1, longitude: 16.3, at: NOW + 1000 });
});

test('home: the nearest house within the radius', () => {
  const houses = [
    { latitude: 48.8566, longitude: 2.3522 },
    { latitude: 45.764, longitude: 4.8357 },
  ];
  assert.deepEqual(homeOf({ latitude: 48.8567, longitude: 2.3523 }, houses, 200), {
    distanceHomeKm: 0,
    atHome: true,
  });
  const away = homeOf({ latitude: 48.9, longitude: 2.35 }, houses, 200);
  assert.equal(away.atHome, false);
  assert.ok(away.distanceHomeKm > 4 && away.distanceHomeKm < 5);
  assert.deepEqual(homeOf(null, houses, 200), { distanceHomeKm: null, atHome: null });
  assert.deepEqual(homeOf({ latitude: 1, longitude: 1 }, [{}], 200), {
    distanceHomeKm: null,
    atHome: null,
  });
});

test('the container asks only descriptors of the BMW catalogue', async () => {
  const { readFileSync } = await import('node:fs');
  const catalogue = JSON.parse(
    readFileSync(new URL('./fixtures/catalogue-descriptors.json', import.meta.url), 'utf8'),
  );
  for (const descriptor of CONTAINER_DESCRIPTORS) {
    assert.ok(catalogue.descriptors.includes(descriptor), descriptor);
  }
  assert.equal(new Set(CONTAINER_DESCRIPTORS).size, CONTAINER_DESCRIPTORS.length);
});
