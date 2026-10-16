// -----------------------------------------------------------------------------
// The "BMW <model>" devices.
//
// One device per car of the account (VIN), offered on the Discovery screen.
// The features follow what the car reports (a diesel gets no battery, a car
// without a sunroof no sunroof): a feature appears once its value is known,
// so scan again after a first drive or charge if one is missing.
//
// Everything is read-only: CarData sends data and accepts no command (no
// lock, no climate, no charge control). The lock is therefore a read-only
// feature, like the climate (pre-conditioning started from the BMW app).
//
// The categories are the "electrical vehicle" ones of Gladys (the only car
// categories), used for every drivetrain. The ranges and the distance from
// home use the generic distance sensor with the `decimal` type:
// `distance-sensor` + `integer` has no icon nor label in the Gladys UI.
//
// External ids: ext:<selector>:vehicle:<VIN>[:<feature>].
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { t } from './i18n.js';

const DEVICE_TYPE = 'vehicle';
const BINARY = { min: 0, max: 1 };

const known = (value) => value !== null && value !== undefined;
const binary = (value) => (value ? 1 : 0);

const distance = (max) => ({
  category: CATEGORIES.DISTANCE_SENSOR,
  type: TYPES.SENSOR.DECIMAL,
  unit: UNITS.KM,
  min: 0,
  max,
});

const opening = (type, read) => ({
  shape: { category: CATEGORIES.ELECTRICAL_VEHICLE_STATE, type, ...BINARY },
  has: (s) => known(read(s)),
  state: (s) => (known(read(s)) ? binary(read(s)) : null),
});

const tire = (read) => ({
  shape: {
    category: CATEGORIES.ELECTRICAL_VEHICLE_STATE,
    type: TYPES.ELECTRICAL_VEHICLE_STATE.TIRE_PRESSURE,
    unit: UNITS.BAR,
    min: 0,
    max: 6,
  },
  has: (s) => known(read(s)),
  state: (s) => read(s),
});

// Every feature: its key (forever), its name, its Gladys shape, whether the
// car has it, its state (a number, `{ text }`, or null when unknown).
const FEATURES = [
  {
    key: 'battery_level',
    name: 'featureBatteryLevel',
    shape: {
      category: CATEGORIES.ELECTRICAL_VEHICLE_BATTERY,
      type: TYPES.ELECTRICAL_VEHICLE_BATTERY.BATTERY_LEVEL,
      unit: UNITS.PERCENT,
      min: 0,
      max: 100,
    },
    has: (s) => known(s.battery.level),
    state: (s) => s.battery.level,
  },
  {
    key: 'electric_range',
    name: 'featureElectricRange',
    shape: {
      category: CATEGORIES.ELECTRICAL_VEHICLE_BATTERY,
      type: TYPES.ELECTRICAL_VEHICLE_BATTERY.BATTERY_RANGE_ESTIMATE,
      unit: UNITS.KM,
      min: 0,
      max: 1500,
    },
    has: (s) => known(s.battery.rangeKm),
    state: (s) => s.battery.rangeKm,
  },
  {
    key: 'total_range',
    name: 'featureTotalRange',
    shape: distance(3000),
    has: (s) => known(s.rangeKm),
    state: (s) => s.rangeKm,
  },
  {
    key: 'fuel_level',
    name: 'featureFuelLevel',
    shape: {
      category: CATEGORIES.LEVEL_SENSOR,
      type: TYPES.LEVEL_SENSOR.LIQUID_LEVEL_PERCENT,
      unit: UNITS.PERCENT,
      min: 0,
      max: 100,
    },
    has: (s) => known(s.fuel.level),
    state: (s) => s.fuel.level,
  },
  {
    key: 'fuel_amount',
    name: 'featureFuelAmount',
    shape: {
      category: CATEGORIES.VOLUME_SENSOR,
      type: TYPES.VOLUME_SENSOR.DECIMAL,
      unit: UNITS.LITER,
      min: 0,
      max: 200,
    },
    has: (s) => known(s.fuel.liters),
    state: (s) => s.fuel.liters,
  },
  {
    key: 'plugged',
    name: 'featurePlugged',
    shape: {
      category: CATEGORIES.ELECTRICAL_VEHICLE_CHARGE,
      type: TYPES.ELECTRICAL_VEHICLE_CHARGE.PLUGGED,
      ...BINARY,
    },
    has: (s) => known(s.charge.plugged),
    state: (s) => (known(s.charge.plugged) ? binary(s.charge.plugged) : null),
  },
  {
    key: 'charging',
    name: 'featureCharging',
    shape: {
      category: CATEGORIES.ELECTRICAL_VEHICLE_CHARGE,
      type: TYPES.ELECTRICAL_VEHICLE_CHARGE.CHARGE_ON,
      ...BINARY,
    },
    has: (s) => known(s.charge.status),
    state: (s) => (known(s.charge.status) ? binary(s.charge.status === 'charging') : null),
  },
  {
    key: 'charging_status',
    name: 'featureChargingStatus',
    shape: {
      category: CATEGORIES.TEXT,
      type: TYPES.TEXT.TEXT,
      keep_history: false,
      min: 0,
      max: 0,
    },
    has: (s) => known(s.charge.status),
    state: (s, { language }) =>
      known(s.charge.status) ? { text: t(`charge_${s.charge.status}`, language) } : null,
  },
  {
    key: 'charge_power',
    name: 'featureChargePower',
    shape: {
      category: CATEGORIES.ELECTRICAL_VEHICLE_CHARGE,
      type: TYPES.ELECTRICAL_VEHICLE_CHARGE.CHARGE_POWER,
      unit: UNITS.KILOWATT,
      min: 0,
      max: 400,
    },
    has: (s) => known(s.charge.powerKw),
    state: (s) => s.charge.powerKw,
  },
  {
    key: 'charge_target',
    name: 'featureChargeTarget',
    shape: {
      category: CATEGORIES.ELECTRICAL_VEHICLE_CHARGE,
      type: TYPES.ELECTRICAL_VEHICLE_CHARGE.TARGET_CHARGE_LIMIT,
      unit: UNITS.PERCENT,
      min: 0,
      max: 100,
    },
    has: (s) => known(s.charge.target),
    state: (s) => s.charge.target,
  },
  {
    key: 'charge_time',
    name: 'featureChargeTime',
    shape: {
      category: CATEGORIES.DURATION,
      type: TYPES.DURATION.INTEGER,
      unit: UNITS.MINUTES,
      min: 0,
      max: 5000,
    },
    has: (s) => known(s.charge.minutesLeft),
    state: (s) => s.charge.minutesLeft,
  },
  {
    key: 'odometer',
    name: 'featureOdometer',
    shape: {
      category: CATEGORIES.ELECTRICAL_VEHICLE_STATE,
      type: TYPES.ELECTRICAL_VEHICLE_STATE.ODOMETER,
      unit: UNITS.KM,
      min: 0,
      max: 2000000,
    },
    has: (s) => known(s.odometerKm),
    state: (s) => s.odometerKm,
  },
  {
    key: 'lock',
    name: 'featureLock',
    // 1 = locked, as the dashboard labels it. Read-only: CarData sends no command.
    shape: {
      category: CATEGORIES.ELECTRICAL_VEHICLE_COMMAND,
      type: TYPES.ELECTRICAL_VEHICLE_COMMAND.LOCK,
      ...BINARY,
    },
    has: (s) => known(s.lock),
    state: (s) => (known(s.lock) ? binary(s.lock === 'locked') : null),
  },
  {
    key: 'doors',
    name: 'featureDoors',
    ...opening(TYPES.ELECTRICAL_VEHICLE_STATE.DOOR_OPENED, (s) => s.openings.doors),
  },
  {
    key: 'trunk',
    name: 'featureTrunk',
    ...opening(TYPES.ELECTRICAL_VEHICLE_STATE.DOOR_OPENED, (s) => s.openings.trunk),
  },
  {
    key: 'hood',
    name: 'featureHood',
    ...opening(TYPES.ELECTRICAL_VEHICLE_STATE.DOOR_OPENED, (s) => s.openings.hood),
  },
  {
    key: 'windows',
    name: 'featureWindows',
    ...opening(TYPES.ELECTRICAL_VEHICLE_STATE.WINDOW_OPENED, (s) => s.openings.windows),
  },
  {
    key: 'sunroof',
    name: 'featureSunroof',
    ...opening(TYPES.ELECTRICAL_VEHICLE_STATE.WINDOW_OPENED, (s) => s.openings.sunroof),
  },
  {
    key: 'moving',
    name: 'featureMoving',
    shape: { category: CATEGORIES.MOTION_SENSOR, type: TYPES.SENSOR.BINARY, ...BINARY },
    has: (s) => known(s.moving),
    state: (s) => (known(s.moving) ? binary(s.moving) : null),
  },
  {
    key: 'climate',
    name: 'featureClimate',
    shape: {
      category: CATEGORIES.ELECTRICAL_VEHICLE_CLIMATE,
      type: TYPES.ELECTRICAL_VEHICLE_CLIMATE.CLIMATE_ON,
      keep_history: false,
      ...BINARY,
    },
    has: (s) => known(s.climate),
    state: (s) => (known(s.climate) ? binary(s.climate) : null),
  },
  { key: 'tire_front_left', name: 'featureTireFrontLeft', ...tire((s) => s.tires.frontLeft) },
  { key: 'tire_front_right', name: 'featureTireFrontRight', ...tire((s) => s.tires.frontRight) },
  { key: 'tire_rear_left', name: 'featureTireRearLeft', ...tire((s) => s.tires.rearLeft) },
  { key: 'tire_rear_right', name: 'featureTireRearRight', ...tire((s) => s.tires.rearRight) },
  {
    key: 'distance_home',
    name: 'featureDistanceHome',
    shape: distance(20000),
    has: (s, { distanceHomeKm }) => known(distanceHomeKm),
    state: (s, { distanceHomeKm }) => (known(distanceHomeKm) ? distanceHomeKm : null),
  },
];

const FEATURE_KEYS = FEATURES.map((feature) => feature.key);

/**
 * @description The external ids of a car.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} vin - The VIN.
 * @returns {{ device: string, feature: Function }} The ids.
 */
function idsOf(gladys, vin) {
  return gladys.externalIds(DEVICE_TYPE, vin);
}

/**
 * @description The VIN and feature key an external id stands for.
 * @param {unknown} externalId - A device or feature external id.
 * @returns {{ vin: string, feature: string|null }|null} Its parts.
 * @example
 * parseExternalId('ext:bmw-cardata:vehicle:WBA11AA0000000001:lock');
 */
function parseExternalId(externalId) {
  const match = /:vehicle:([A-HJ-NPR-Z0-9]{17})(?::([a-z0-9_]+))?$/.exec(String(externalId ?? ''));
  return match ? { vin: match[1], feature: match[2] ?? null } : null;
}

/**
 * @description The name of a car: "BMW iX1 xDrive30", "MINI Cooper SE", or
 * "BMW …0001" before its basic data is known.
 * @param {string} vin - The VIN.
 * @param {object|null} basic - Its basic data.
 * @returns {string} The name.
 */
function vehicleName(vin, basic) {
  const raw = String(basic?.brand ?? '');
  const brand = /^mini/i.test(raw)
    ? 'MINI'
    : /rolls/i.test(raw)
      ? 'Rolls-Royce'
      : /supra|toyota/i.test(raw)
        ? 'Toyota'
        : 'BMW';
  const model = String(basic?.modelName ?? basic?.series ?? '').trim();
  return model ? `${brand} ${model}`.slice(0, 80) : `${brand} …${vin.slice(-4)}`;
}

/**
 * @description Build the device of a car.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} car - `{ vin, basic, snapshot }`.
 * @param {object} context - `{ language, distanceHomeKm }`.
 * @returns {object} The discovered device.
 */
function buildDevice(gladys, { vin, basic, snapshot }, context) {
  const ids = idsOf(gladys, vin);
  const language = context.language ?? 'en';
  return {
    name: vehicleName(vin, basic),
    external_id: ids.device,
    should_poll: false,
    params: [
      { name: 'BMW_VIN', value: vin },
      { name: 'BMW_MODEL', value: basic?.modelName || 'unknown' },
    ],
    features: FEATURES.filter((feature) => feature.has(snapshot, context)).map((feature) => ({
      name: t(feature.name, language),
      external_id: ids.feature(feature.key),
      read_only: true,
      has_feedback: false,
      keep_history: true,
      ...feature.shape,
    })),
  };
}

/**
 * @description The states of a car. Unknown values are omitted, never sent as 0.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} vin - The VIN.
 * @param {object} snapshot - Its snapshot.
 * @param {object} context - `{ language, distanceHomeKm }`.
 * @param {Set<string>|null} [only] - Feature external ids to keep (the created ones).
 * @returns {Array<object>} The states.
 */
function buildStates(gladys, vin, snapshot, context, only = null) {
  const ids = idsOf(gladys, vin);
  const states = [];
  for (const feature of FEATURES) {
    const externalId = ids.feature(feature.key);
    if (only && !only.has(externalId)) {
      continue;
    }
    const value = feature.state(snapshot, context);
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === 'object') {
      states.push({ device_feature_external_id: externalId, text: value.text });
    } else if (Number.isFinite(value)) {
      states.push({ device_feature_external_id: externalId, state: value });
    }
  }
  return states;
}

export {
  DEVICE_TYPE,
  FEATURES,
  FEATURE_KEYS,
  idsOf,
  parseExternalId,
  vehicleName,
  buildDevice,
  buildStates,
};
