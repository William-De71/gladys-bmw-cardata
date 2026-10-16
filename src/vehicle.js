// -----------------------------------------------------------------------------
// BMW CarData descriptors -> a plain snapshot of a car.
//
// CarData speaks in "telematic data keys" (technical descriptors) from BMW's
// Telematics Data Catalogue, each one `{ value, unit, timestamp }`:
//   - the MQTT stream pushes `{ vin, data: { <descriptor>: {...} } }` as soon
//     as the car reports a change — only for the descriptors ticked in the
//     "Data selection" of the CarData portal, and latitude and longitude
//     often in two separate messages;
//   - the REST endpoint `telematicData` answers the same shape for the
//     descriptors of a container, with every value as a string, from BMW's
//     own copy of the car (which can be older than what the stream said).
//
// Every value therefore keeps its timestamp, and an older one never replaces
// a newer one (mergeValues). Values BMW sends as INVALID, UNKNOWN or -NA- are
// unknown (null), never 0 or false.
// -----------------------------------------------------------------------------

const D = {
  SOC: 'vehicle.drivetrain.batteryManagement.header',
  SOC_DISPLAYED: 'vehicle.powertrain.electric.battery.stateOfCharge.displayed',
  ELECTRIC_RANGE: 'vehicle.drivetrain.electricEngine.remainingElectricRange',
  TOTAL_RANGE: 'vehicle.drivetrain.totalRemainingRange',
  LAST_RANGE: 'vehicle.drivetrain.lastRemainingRange',
  FUEL_LEVEL: 'vehicle.drivetrain.fuelSystem.level',
  FUEL_REMAINING: 'vehicle.drivetrain.fuelSystem.remainingFuel',
  CHARGING_STATUS: 'vehicle.drivetrain.electricEngine.charging.status',
  HV_STATUS: 'vehicle.drivetrain.electricEngine.charging.hvStatus',
  PORT_STATUS: 'vehicle.body.chargingPort.status',
  PLUGGED: 'vehicle.powertrain.tractionBattery.charging.port.anyPosition.isPlugged',
  CHARGING_POWER: 'vehicle.powertrain.electric.battery.charging.power',
  SOC_TARGET: 'vehicle.powertrain.electric.battery.stateOfCharge.target',
  TIME_REMAINING: 'vehicle.drivetrain.electricEngine.charging.timeRemaining',
  MILEAGE: 'vehicle.vehicle.travelledDistance',
  DOOR_STATUS: 'vehicle.cabin.door.status',
  DOOR_LOCK: 'vehicle.cabin.door.lock.status',
  DOOR_FRONT_LEFT: 'vehicle.cabin.door.row1.driver.isOpen',
  DOOR_FRONT_RIGHT: 'vehicle.cabin.door.row1.passenger.isOpen',
  DOOR_REAR_LEFT: 'vehicle.cabin.door.row2.driver.isOpen',
  DOOR_REAR_RIGHT: 'vehicle.cabin.door.row2.passenger.isOpen',
  TRUNK: 'vehicle.body.trunk.isOpen',
  HOOD: 'vehicle.body.hood.isOpen',
  WINDOW_FRONT_LEFT: 'vehicle.cabin.window.row1.driver.status',
  WINDOW_FRONT_RIGHT: 'vehicle.cabin.window.row1.passenger.status',
  WINDOW_REAR_LEFT: 'vehicle.cabin.window.row2.driver.status',
  WINDOW_REAR_RIGHT: 'vehicle.cabin.window.row2.passenger.status',
  SUNROOF: 'vehicle.cabin.sunroof.status',
  LATITUDE: 'vehicle.cabin.infotainment.navigation.currentLocation.latitude',
  LONGITUDE: 'vehicle.cabin.infotainment.navigation.currentLocation.longitude',
  MOVING: 'vehicle.isMoving',
  BATTERY_12V: 'vehicle.electricalSystem.battery.voltage',
  TIRE_FRONT_LEFT: 'vehicle.chassis.axle.row1.wheel.left.tire.pressure',
  TIRE_FRONT_RIGHT: 'vehicle.chassis.axle.row1.wheel.right.tire.pressure',
  TIRE_REAR_LEFT: 'vehicle.chassis.axle.row2.wheel.left.tire.pressure',
  TIRE_REAR_RIGHT: 'vehicle.chassis.axle.row2.wheel.right.tire.pressure',
  PRECONDITIONING: 'vehicle.vehicle.preConditioning.activity',
};

// The descriptors of the REST container: every one the integration reads.
// All come from BMW's Telematics Data Catalogue; none is bound to a dedicated
// endpoint nor in BASIC_DATA (those are refused by telematicData), and an
// unknown one makes BMW refuse the whole container (CU-402).
const CONTAINER_DESCRIPTORS = Object.values(D).sort();

// Two halves of a position further apart than this are not the same fix.
const LOCATION_PAIR_MS = 2 * 60 * 1000;
const MILE_KM = 1.609344;
const GALLON_L = 3.785411784;

const UNKNOWN_WORDS = new Set(['INVALID', 'UNKNOWN', '-NA-', 'NA', 'ASN_ISUNKNOWN', '']);

/**
 * @description A finite number out of a CarData value, or null.
 * @param {unknown} value - The value (REST sends strings).
 * @returns {number|null} The number.
 * @example
 * toNumber('62.5'); // -> 62.5
 */
function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  const number = Number(value.trim().replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

/**
 * @description A boolean out of a CarData value: true/false, ASN_isTrue,
 * OPEN/CLOSED, CONNECTED/DISCONNECTED, 1/0. Null when unknown.
 * @param {unknown} value - The value.
 * @returns {boolean|null} The boolean.
 * @example
 * toBoolean('ASN_isTrue'); // -> true
 */
function toBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value === 1 ? true : value === 0 ? false : null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const word = value.trim().toUpperCase();
  if (['TRUE', 'ASN_ISTRUE', 'OPEN', 'CONNECTED', '1', 'YES', 'ON'].includes(word)) {
    return true;
  }
  if (['FALSE', 'ASN_ISFALSE', 'CLOSED', 'DISCONNECTED', '0', 'NO', 'OFF'].includes(word)) {
    return false;
  }
  return null;
}

/**
 * @description An enum word (upper case), or null when unknown.
 * @param {unknown} value - The value.
 * @returns {string|null} The word.
 */
function toWord(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const word = value.trim().toUpperCase();
  return UNKNOWN_WORDS.has(word) ? null : word;
}

/**
 * @description An instant (ms) out of an ISO 8601 timestamp.
 * @param {unknown} value - The timestamp.
 * @returns {number|null} The instant.
 */
function toInstant(value) {
  if (typeof value !== 'string' || value.length > 64) {
    return null;
  }
  const instant = Date.parse(value);
  return Number.isFinite(instant) ? instant : null;
}

/**
 * @description Merge received descriptors into the stored ones. A value
 * older than the stored one is ignored (the REST snapshot can lag behind the
 * stream); a value without a timestamp counts as received now.
 * @param {object} stored - `{ [descriptor]: { value, unit, at } }`, mutated.
 * @param {object} data - The received `{ [descriptor]: { value, unit, timestamp } }`.
 * @param {number} receivedAt - Now, in ms.
 * @returns {string[]} The descriptors whose value or timestamp changed.
 * @example
 * mergeValues(values, { 'vehicle.isMoving': { value: true, timestamp: '…' } }, Date.now());
 */
function mergeValues(stored, data, receivedAt) {
  const changed = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return changed;
  }
  for (const [descriptor, entry] of Object.entries(data)) {
    if (!/^vehicle\.[A-Za-z0-9.]{3,200}$/.test(descriptor) || !entry || typeof entry !== 'object') {
      continue;
    }
    const value = entry.value;
    if (value === undefined || value === null || typeof value === 'object') {
      continue;
    }
    const at = toInstant(entry.timestamp) ?? receivedAt;
    const previous = stored[descriptor];
    if (previous && previous.at > at) {
      continue;
    }
    const unit = typeof entry.unit === 'string' ? entry.unit.slice(0, 20) : null;
    if (previous && previous.at === at && previous.value === value && previous.unit === unit) {
      continue;
    }
    stored[descriptor] = {
      value: typeof value === 'string' ? value.slice(0, 500) : value,
      unit,
      at,
    };
    changed.push(descriptor);
  }
  return changed;
}

/**
 * @description A distance in km (CarData may answer in miles).
 * @param {object|undefined} entry - The stored entry.
 * @returns {number|null} The distance.
 */
function distanceKm(entry) {
  const number = toNumber(entry?.value);
  if (number === null || number < 0) {
    return null;
  }
  return /^mi/i.test(entry.unit ?? '') ? number * MILE_KM : number;
}

/**
 * @description A percentage in 0..100.
 * @param {object|undefined} entry - The stored entry.
 * @returns {number|null} The percentage.
 */
function percent(entry) {
  const number = toNumber(entry?.value);
  return number !== null && number >= 0 && number <= 100 ? number : null;
}

const round = (value, digits = 1) =>
  value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits;

const CHARGING_STATUS = {
  CHARGINGACTIVE: 'charging',
  CHARGING_IN_PROGRESS: 'charging',
  INITIALIZATION: 'starting',
  CHARGINGPAUSED: 'paused',
  CHARGINGENDED: 'finished',
  CHARGINGERROR: 'error',
  CHARGINGINTERRUPTED: 'interrupted',
  CHARGINGDISRUPTED: 'interrupted',
  NOCHARGING: 'not_charging',
};
const HV_STATUS = {
  CHARGING: 'charging',
  ERROR: 'error',
  NOT_CHARGING: 'not_charging',
  WAITING_FOR_CHARGING: 'waiting',
  FINISHED_FULLY_CHARGED: 'finished',
  FINISHED_NOT_FULL: 'finished',
};
const CHARGE_STATUSES = [
  'charging',
  'starting',
  'waiting',
  'paused',
  'finished',
  'interrupted',
  'error',
  'not_charging',
];

/**
 * @description The newest of two stored entries.
 * @param {object|undefined} a - An entry.
 * @param {object|undefined} b - Another one.
 * @returns {object|undefined} The newest.
 */
const newest = (a, b) => (!a ? b : !b ? a : a.at >= b.at ? a : b);

/**
 * @description The charging status: charging.status first (the stream), the
 * HV status otherwise.
 * @param {object} values - The stored values.
 * @returns {string|null} One of CHARGE_STATUSES.
 */
function chargeStatus(values) {
  const status = toWord(values[D.CHARGING_STATUS]?.value);
  if (status && CHARGING_STATUS[status]) {
    return CHARGING_STATUS[status];
  }
  const hv = toWord(values[D.HV_STATUS]?.value);
  return hv && HV_STATUS[hv] ? HV_STATUS[hv] : null;
}

/**
 * @description The lock state, from the newest of the streamed door status
 * and the REST-only lock status.
 * @param {object} values - The stored values.
 * @returns {'locked'|'partly_locked'|'unlocked'|null} The state.
 */
function lockState(values) {
  const word = toWord(newest(values[D.DOOR_STATUS], values[D.DOOR_LOCK])?.value);
  if (!word) {
    return null;
  }
  const plain = word.replace(/^ASN_/, '').replace(/[-_]/g, '');
  if (plain === 'SECURED' || plain === 'LOCKED') {
    return 'locked';
  }
  if (plain === 'SELECTIVELOCKED') {
    return 'partly_locked';
  }
  return plain === 'UNLOCKED' ? 'unlocked' : null;
}

/**
 * @description Whether any of the openings is open (null when none is known).
 * @param {object} values - The stored values.
 * @param {string[]} descriptors - The descriptors.
 * @param {Function} [read] - The reader of one value.
 * @returns {boolean|null} Open or not.
 */
function anyOpen(values, descriptors, read = toBoolean) {
  const states = descriptors.map((descriptor) => read(values[descriptor]?.value));
  if (states.some((state) => state === true)) {
    return true;
  }
  return states.some((state) => state === false) ? false : null;
}

/**
 * @description A window or sunroof status: CLOSED, INTERMEDIATE, OPEN…
 * @param {unknown} value - The value.
 * @returns {boolean|null} Open (intermediate counts as open) or not.
 */
function windowOpen(value) {
  const word = toWord(value);
  if (!word) {
    return null;
  }
  if (word === 'CLOSED') {
    return false;
  }
  return ['OPEN', 'INTERMEDIATE', 'OPEN_TILT', 'INTERMEDIATE_TILT'].includes(word) ? true : null;
}

/**
 * @description A tyre pressure in bar (CarData sends kPa).
 * @param {object|undefined} entry - The stored entry.
 * @returns {number|null} The pressure.
 */
function tireBar(entry) {
  const number = toNumber(entry?.value);
  if (number === null || number <= 0) {
    return null;
  }
  const bar = /bar/i.test(entry.unit ?? '') ? number : number / 100;
  return bar > 0 && bar < 10 ? round(bar, 2) : null;
}

/**
 * @description The position, when both halves are known and from the same fix.
 * @param {object} values - The stored values.
 * @returns {{ latitude: number, longitude: number, at: number }|null} The position.
 */
function location(values) {
  const lat = values[D.LATITUDE];
  const lon = values[D.LONGITUDE];
  const latitude = toNumber(lat?.value);
  const longitude = toNumber(lon?.value);
  if (latitude === null || longitude === null || Math.abs(lat.at - lon.at) > LOCATION_PAIR_MS) {
    return null;
  }
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || (latitude === 0 && longitude === 0)) {
    return null;
  }
  return { latitude, longitude, at: Math.max(lat.at, lon.at) };
}

/**
 * @description The snapshot of a car out of its stored descriptors.
 * @param {object} values - `{ [descriptor]: { value, unit, at } }`.
 * @returns {object} The snapshot (null for every unknown value).
 * @example
 * summarize(values).battery.level; // -> 62
 */
function summarize(values = {}) {
  const fuelEntry = values[D.FUEL_REMAINING];
  let fuelLiters = toNumber(fuelEntry?.value);
  if (fuelLiters !== null && /gal/i.test(fuelEntry.unit ?? '')) {
    fuelLiters *= GALLON_L;
  }
  const powerEntry = values[D.CHARGING_POWER];
  let powerKw = toNumber(powerEntry?.value);
  if (powerKw !== null) {
    powerKw = /^kw$/i.test(powerEntry.unit ?? '') ? powerKw : powerKw / 1000;
    powerKw = powerKw >= 0 && powerKw < 1000 ? round(powerKw, 2) : null;
  }
  const portWord = toWord(values[D.PORT_STATUS]?.value);
  const plugged =
    toBoolean(values[D.PLUGGED]?.value) ??
    (portWord === 'CONNECTED' ? true : portWord === 'DISCONNECTED' ? false : null);
  const minutes = toNumber(values[D.TIME_REMAINING]?.value);
  const voltage = toNumber(values[D.BATTERY_12V]?.value);
  const activity = toWord(values[D.PRECONDITIONING]?.value);
  const openings = {
    doors: anyOpen(values, [
      D.DOOR_FRONT_LEFT,
      D.DOOR_FRONT_RIGHT,
      D.DOOR_REAR_LEFT,
      D.DOOR_REAR_RIGHT,
    ]),
    trunk: toBoolean(values[D.TRUNK]?.value),
    hood: toBoolean(values[D.HOOD]?.value),
    windows: anyOpen(
      values,
      [D.WINDOW_FRONT_LEFT, D.WINDOW_FRONT_RIGHT, D.WINDOW_REAR_LEFT, D.WINDOW_REAR_RIGHT],
      windowOpen,
    ),
    sunroof: windowOpen(values[D.SUNROOF]?.value),
  };
  const timestamps = Object.values(values)
    .map((entry) => entry.at)
    .filter(Number.isFinite);
  return {
    battery: {
      level: round(percent(values[D.SOC]) ?? percent(values[D.SOC_DISPLAYED]), 1),
      rangeKm: round(distanceKm(values[D.ELECTRIC_RANGE]), 0),
    },
    rangeKm: round(
      distanceKm(values[D.TOTAL_RANGE]) ?? distanceKm(values[D.LAST_RANGE]) ?? null,
      0,
    ),
    fuel: {
      level: percent(values[D.FUEL_LEVEL]),
      liters: fuelLiters !== null && fuelLiters >= 0 && fuelLiters < 500 ? round(fuelLiters) : null,
    },
    charge: {
      status: chargeStatus(values),
      plugged,
      powerKw,
      target: percent(values[D.SOC_TARGET]),
      minutesLeft: minutes !== null && minutes >= 0 && minutes < 10000 ? Math.round(minutes) : null,
    },
    odometerKm: round(distanceKm(values[D.MILEAGE]), 0),
    lock: lockState(values),
    openings,
    openList: Object.entries(openings)
      .filter(([, open]) => open === true)
      .map(([name]) => name),
    location: location(values),
    moving: toBoolean(values[D.MOVING]?.value),
    battery12v: voltage !== null && voltage > 0 && voltage < 30 ? round(voltage) : null,
    tires: {
      frontLeft: tireBar(values[D.TIRE_FRONT_LEFT]),
      frontRight: tireBar(values[D.TIRE_FRONT_RIGHT]),
      rearLeft: tireBar(values[D.TIRE_REAR_LEFT]),
      rearRight: tireBar(values[D.TIRE_REAR_RIGHT]),
    },
    climate:
      activity === null
        ? null
        : ['HEATING', 'COOLING', 'VENTILATION'].includes(activity)
          ? true
          : ['STANDBY', 'INACTIVE'].includes(activity)
            ? false
            : null,
    updatedAt: timestamps.length > 0 ? Math.max(...timestamps) : null,
  };
}

/**
 * @description The great-circle distance between two points, in km.
 * @param {{ latitude: number, longitude: number }} a - A point.
 * @param {{ latitude: number, longitude: number }} b - Another one.
 * @returns {number} The distance.
 * @example
 * distanceBetween({ latitude: 48.85, longitude: 2.35 }, { latitude: 48.86, longitude: 2.35 });
 */
function distanceBetween(a, b) {
  const rad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * @description The distance to the nearest house of Gladys, and whether the
 * car is home.
 * @param {object|null} position - The position of the car.
 * @param {Array<object>} houses - The houses (`latitude`, `longitude`).
 * @param {number} radiusMeters - The home radius.
 * @returns {{ distanceHomeKm: number|null, atHome: boolean|null }} The result.
 * @example
 * homeOf(snapshot.location, houses, 200);
 */
function homeOf(position, houses, radiusMeters) {
  const located = (houses ?? []).filter(
    (house) => Number.isFinite(house?.latitude) && Number.isFinite(house?.longitude),
  );
  if (!position || located.length === 0) {
    return { distanceHomeKm: null, atHome: null };
  }
  const km = Math.min(...located.map((house) => distanceBetween(position, house)));
  return { distanceHomeKm: round(km, 1), atHome: km * 1000 <= radiusMeters };
}

export {
  D,
  CONTAINER_DESCRIPTORS,
  CHARGE_STATUSES,
  toNumber,
  toBoolean,
  toWord,
  mergeValues,
  summarize,
  distanceBetween,
  homeOf,
};
