// -----------------------------------------------------------------------------
// What the integration keeps in /data (the only writable place of the
// container) between two starts, so that a restart costs no API call:
//   - the cars of the account (VIN, basic data: brand, model, drivetrain);
//   - the last value of every descriptor received, with its timestamp;
//   - the REST container (its id and the descriptor set it was made for);
//   - the API calls of the current UTC day (BMW allows 50 a day per account,
//     reset at 00:00 UTC) and when the quota ran out;
//   - the picture of each car (GET /image, fetched once).
// The tokens are NOT here: they live in the Gladys config (backed up).
// Writes are grouped (one every few seconds at most).
// -----------------------------------------------------------------------------

import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const FILE = 'cardata.json';
const IMAGES = 'images';
const WRITE_DELAY_MS = 5000;
const DAILY_QUOTA = 50;

/**
 * @description The UTC day of an instant ("2026-10-15"): BMW resets the quota
 * at 00:00 UTC.
 * @param {number} instant - The instant, in ms.
 * @returns {string} The day.
 */
const utcDay = (instant) => new Date(instant).toISOString().slice(0, 10);

/**
 * @description Create the store.
 * @param {object} options - Options.
 * @param {string} [options.dir] - The data directory (/data in the container).
 * @param {Function} [options.now] - Clock.
 * @param {object} [options.logger] - Logger.
 * @returns {object} The store.
 */
function createStore({ dir = '/data', now = Date.now, logger = console } = {}) {
  const path = join(dir, FILE);
  let state = { vehicles: {}, quota: { day: '', used: 0, exhausted: false }, container: null };
  let timer = null;

  /** Write the file now (atomic rename). */
  function flush() {
    clearTimeout(timer);
    timer = null;
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(`${path}.tmp`, JSON.stringify(state));
      renameSync(`${path}.tmp`, path);
    } catch (err) {
      logger.warn(`Unable to write ${path}: ${err.message}`);
    }
  }

  /** Write the file soon. */
  function save() {
    if (!timer) {
      timer = setTimeout(flush, WRITE_DELAY_MS);
      timer.unref?.();
    }
  }

  /**
   * @description The quota of today (reset when the UTC day changed).
   * @returns {object} `{ day, used, exhausted }`.
   */
  function quota() {
    const today = utcDay(now());
    if (state.quota.day !== today) {
      state.quota = { day: today, used: 0, exhausted: false };
    }
    return state.quota;
  }

  return {
    /** Read the file (startup). A missing or broken file starts empty. */
    load() {
      try {
        if (existsSync(path)) {
          const read = JSON.parse(readFileSync(path, 'utf8'));
          state = {
            vehicles: read.vehicles && typeof read.vehicles === 'object' ? read.vehicles : {},
            quota: read.quota && typeof read.quota === 'object' ? read.quota : state.quota,
            container: read.container ?? null,
            mappingsAt: Number(read.mappingsAt) || 0,
          };
        }
      } catch (err) {
        logger.warn(`Unable to read ${path}, starting empty: ${err.message}`);
      }
    },

    flush,
    save,

    /** @returns {string[]} The VINs of the account, in order. */
    vins() {
      return Object.keys(state.vehicles).sort();
    },

    /**
     * @description The stored car (created when missing).
     * @param {string} vin - The VIN.
     * @returns {object} `{ basic, values, restAt, mapping }`, mutable (then save()).
     */
    vehicle(vin) {
      if (!state.vehicles[vin]) {
        state.vehicles[vin] = { basic: null, values: {}, restAt: 0, basicTriedAt: 0 };
        save();
      }
      return state.vehicles[vin];
    },

    /** @param {string} vin - The VIN. @returns {boolean} Whether it is known. */
    has(vin) {
      return Boolean(state.vehicles[vin]);
    },

    /**
     * @description Keep only these cars (the mapping of the account).
     * @param {string[]} vins - The VINs.
     */
    keepOnly(vins) {
      for (const vin of Object.keys(state.vehicles)) {
        if (!vins.includes(vin)) {
          delete state.vehicles[vin];
        }
      }
      vins.forEach((vin) => this.vehicle(vin));
      state.mappingsAt = now();
      save();
    },

    /** @returns {number} When the mapping was last read (ms). */
    mappingsAt() {
      return state.mappingsAt ?? 0;
    },

    /** @returns {object|null} `{ id, signature }` of the REST container. */
    container() {
      return state.container;
    },

    /** @param {object|null} container - `{ id, signature }`. */
    setContainer(container) {
      state.container = container;
      save();
    },

    /** @returns {{ day: string, used: number, left: number, exhausted: boolean }} Today. */
    quota() {
      const today = quota();
      return {
        day: today.day,
        used: today.used,
        left: today.exhausted ? 0 : Math.max(0, DAILY_QUOTA - today.used),
        exhausted: today.exhausted || today.used >= DAILY_QUOTA,
      };
    },

    /** Count one API call. */
    countCall() {
      quota().used += 1;
      save();
    },

    /** BMW said the quota is used up (CU-429): nothing more until 00:00 UTC. */
    markExhausted() {
      quota().exhausted = true;
      save();
    },

    /**
     * @description The stored picture of a car.
     * @param {string} vin - The VIN.
     * @returns {string|null} The picture, base64, null when none.
     */
    image(vin) {
      try {
        return readFileSync(join(dir, IMAGES, `${vin}.b64`), 'utf8') || null;
      } catch {
        return null;
      }
    },

    /**
     * @description Store the picture of a car.
     * @param {string} vin - The VIN.
     * @param {string} base64 - The picture.
     */
    setImage(vin, base64) {
      try {
        mkdirSync(join(dir, IMAGES), { recursive: true });
        writeFileSync(join(dir, IMAGES, `${vin}.b64`), base64);
      } catch (err) {
        logger.warn(`Unable to store the car picture: ${err.message}`);
      }
    },

    /** Forget everything (disconnect). */
    clear() {
      state = { vehicles: {}, quota: state.quota, container: null, mappingsAt: 0 };
      flush();
    },
  };
}

export { DAILY_QUOTA, utcDay, createStore };
