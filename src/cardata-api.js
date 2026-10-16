// -----------------------------------------------------------------------------
// The BMW CarData REST API (https://api-cardata.bmwgroup.com, header
// `x-version: v1`, the access token of the device code flow).
//
// The quota is the constraint: 50 calls a day for the whole account (every
// client ID and every tool of the account share it), reset at 00:00 UTC.
// Every call is counted in /data (store.js) before it is sent. Calls the
// integration makes on its own keep a reserve for the ones the user asks
// for (refresh button, scene action). CU-429 means BMW counted more than we
// did (another tool on the account): nothing more until 00:00 UTC.
//
// Endpoints used (customer API swagger 1.0.0):
//   GET    /customers/vehicles/mappings              the cars of the account
//   GET    /customers/vehicles/{vin}/basicData       brand, model, drivetrain
//   GET    /customers/containers                     our container, if any
//   POST   /customers/containers                     create it (10 at most per user)
//   DELETE /customers/containers/{id}                an outdated one of ours
//   GET    /customers/vehicles/{vin}/telematicData   the descriptors of the container
//   GET    /customers/vehicles/{vin}/image           the picture of the car
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';

const API_URL = 'https://api-cardata.bmwgroup.com';
const REQUEST_TIMEOUT_MS = 30000;
// Calls left untouched by the automatic reads, for the user's own requests.
const RESERVE = 5;
const CONTAINER_NAME = 'Gladys Assistant';
const CONTAINER_PURPOSE = 'Gladys Assistant BMW CarData integration';
const MAX_IMAGE_BYTES = 300 * 1024;

/** An error of the CarData API. */
class CardataError extends Error {
  /**
   * @param {string} message - The message.
   * @param {object} [details] - `{ status, code, rateLimited, quotaGuard }`.
   */
  constructor(message, { status = 0, code = '', rateLimited = false, quotaGuard = false } = {}) {
    super(message);
    this.name = 'CardataError';
    this.status = status;
    this.code = code;
    this.rateLimited = rateLimited;
    // True when the integration itself declined to spend a call.
    this.quotaGuard = quotaGuard;
  }
}

/**
 * @description "WBA…1234" -> "…1234": never log a full VIN.
 * @param {string} text - A text that may hold VINs.
 * @returns {string} The text.
 * @example
 * redactVin('GET /customers/vehicles/WBA11AA0000000001/basicData'); // '…0001'
 */
function redactVin(text) {
  return String(text ?? '').replace(/\b[A-HJ-NPR-Z0-9]{13}([A-HJ-NPR-Z0-9]{4})\b/g, '…$1');
}

/**
 * @description The signature of a descriptor set (container reuse).
 * @param {string[]} descriptors - The descriptors.
 * @returns {string} The signature.
 */
function signatureOf(descriptors) {
  return createHash('sha1')
    .update([...new Set(descriptors)].sort().join('\n'))
    .digest('hex');
}

/**
 * @description A list of objects out of an answer: a plain list, or wrapped
 * under one of the keys.
 * @param {unknown} body - The answer.
 * @param {string[]} keys - The possible keys.
 * @returns {object[]} The objects.
 */
function listOf(body, keys) {
  if (Array.isArray(body)) {
    return body.filter((item) => item && typeof item === 'object');
  }
  if (body && typeof body === 'object') {
    for (const key of keys) {
      if (Array.isArray(body[key])) {
        return body[key].filter((item) => item && typeof item === 'object');
      }
    }
    if (typeof body.vin === 'string') {
      return [body];
    }
  }
  return [];
}

/**
 * @description Create the API client.
 * @param {object} options - Options.
 * @param {object} options.tokens - The token manager (auth.js).
 * @param {object} options.store - The store (quota).
 * @param {Function} [options.fetchImpl] - fetch.
 * @param {string} [options.userAgent] - The User-Agent.
 * @returns {object} The client.
 */
function createCardataClient({
  tokens,
  store,
  fetchImpl = fetch,
  userAgent = 'gladys-bmw-cardata',
}) {
  /**
   * @description Spend one call of the quota, or refuse.
   * @param {boolean} manual - Asked by the user.
   * @throws {CardataError} When the quota (or its reserve) is used up.
   */
  function spend(manual) {
    const quota = store.quota();
    if (quota.exhausted || quota.left <= (manual ? 0 : RESERVE)) {
      throw new CardataError(
        `Daily API quota ${quota.exhausted ? 'used up' : 'kept for manual requests'} (${quota.used} calls today)`,
        { rateLimited: true, quotaGuard: true },
      );
    }
    store.countCall();
  }

  /**
   * @description One call of the API.
   * @param {string} method - The method.
   * @param {string} path - The path.
   * @param {object} [options] - `{ manual, json, binary }`.
   * @returns {Promise<object>} `{ status, body, contentType }`.
   * @throws {CardataError} On any refusal.
   */
  async function call(method, path, { manual = false, json, binary = false } = {}) {
    spend(manual);
    let token = await tokens.getAccessToken();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response;
      try {
        response = await fetchImpl(`${API_URL}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            'x-version': 'v1',
            Accept: binary ? '*/*' : 'application/json',
            'User-Agent': userAgent,
            ...(json ? { 'Content-Type': 'application/json' } : {}),
          },
          body: json ? JSON.stringify(json) : undefined,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        throw new CardataError(`CarData API unreachable: ${err.message}`);
      }
      const contentType = response.headers?.get?.('content-type') ?? '';
      if (response.ok) {
        if (response.status === 204) {
          return { status: 204, body: null, contentType };
        }
        if (binary) {
          return {
            status: response.status,
            body: Buffer.from(await response.arrayBuffer()),
            contentType,
          };
        }
        let body;
        try {
          body = await response.json();
        } catch {
          throw new CardataError(`${method} ${redactVin(path)}: invalid JSON answer`, {
            status: response.status,
          });
        }
        return { status: response.status, body, contentType };
      }
      let body;
      try {
        body = await response.json();
      } catch {
        body = {};
      }
      const code = typeof body?.exveErrorId === 'string' ? body.exveErrorId : '';
      const message = typeof body?.exveErrorMsg === 'string' ? body.exveErrorMsg : '';
      // An expired or refused token: refresh once (a new call is counted, BMW
      // counts every request).
      if (response.status === 401 && attempt === 0 && code !== 'CU-103') {
        token = await tokens.getAccessToken({ rejected: token });
        spend(true);
        continue;
      }
      const rateLimited = response.status === 429 || code === 'CU-429';
      if (rateLimited) {
        store.markExhausted();
      }
      throw new CardataError(
        `${method} ${redactVin(path)} refused (HTTP ${response.status}${code ? ` ${code}` : ''}${message ? `: ${message.slice(0, 120)}` : ''})`,
        { status: response.status, code, rateLimited },
      );
    }
    throw new CardataError(`${method} ${redactVin(path)}: token refused`, { status: 401 });
  }

  return {
    /**
     * @description The cars of the account the user is the PRIMARY user of
     * (CarData serves no data for a secondary mapping).
     * @param {object} [options] - `{ manual }`.
     * @returns {Promise<string[]>} The VINs.
     */
    async mappings({ manual = false } = {}) {
      const { body } = await call('GET', '/customers/vehicles/mappings', { manual });
      return listOf(body, ['mappings', 'vehicles'])
        .filter((item) => !item.mappingType || String(item.mappingType).toUpperCase() === 'PRIMARY')
        .map((item) => String(item.vin ?? '').toUpperCase())
        .filter((vin) => /^[A-HJ-NPR-Z0-9]{17}$/.test(vin));
    },

    /**
     * @description The basic data of a car (brand, model, drivetrain).
     * @param {string} vin - The VIN.
     * @param {object} [options] - `{ manual }`.
     * @returns {Promise<object>} The subset the integration uses.
     */
    async basicData(vin, { manual = false } = {}) {
      const { body } = await call('GET', `/customers/vehicles/${vin}/basicData`, { manual });
      const text = (value) => (typeof value === 'string' ? value.slice(0, 80) : null);
      return {
        brand: text(body?.brand),
        modelName: text(body?.modelName),
        series: text(body?.series),
        propulsionType: text(body?.propulsionType),
        driveTrain: text(body?.driveTrain),
        constructionDate: text(body?.constructionDate),
      };
    },

    /**
     * @description The container of the integration, created or replaced
     * when its descriptor set changed.
     * @param {string[]} descriptors - The descriptors it must hold.
     * @param {object} [options] - `{ manual }`.
     * @returns {Promise<string>} Its id.
     */
    async ensureContainer(descriptors, { manual = false } = {}) {
      const signature = signatureOf(descriptors);
      const known = store.container();
      if (known?.id && known.signature === signature) {
        return known.id;
      }
      const { body } = await call('GET', '/customers/containers', { manual });
      const ours = listOf(body, ['containers', 'items']).filter(
        (item) => item.name === CONTAINER_NAME && item.purpose === CONTAINER_PURPOSE,
      );
      const create = () =>
        call('POST', '/customers/containers', {
          manual,
          json: {
            name: CONTAINER_NAME,
            purpose: CONTAINER_PURPOSE,
            technicalDescriptors: [...descriptors],
          },
        });
      let created;
      try {
        created = await create();
      } catch (err) {
        // CU-124: 10 containers already. Make room among ours, then once more.
        if (err.code !== 'CU-124' || ours.length === 0) {
          throw err;
        }
        for (const old of ours) {
          await call('DELETE', `/customers/containers/${old.containerId}`, { manual }).catch(
            () => {},
          );
        }
        ours.length = 0;
        created = await create();
      }
      const id = created.body?.containerId;
      if (typeof id !== 'string' || !id) {
        throw new CardataError('The container was created without an id');
      }
      store.setContainer({ id, signature });
      // Outdated containers of ours (BMW allows 10 per user): best effort.
      for (const old of ours.filter((item) => item.containerId && item.containerId !== id)) {
        if (String(old.state ?? 'ACTIVE').toUpperCase() !== 'ACTIVE') {
          continue;
        }
        try {
          await call('DELETE', `/customers/containers/${old.containerId}`, { manual });
        } catch {
          // Left for later: it does not block the reading.
        }
      }
      return id;
    },

    /** Forget the container (BMW refused it: CU-105). */
    forgetContainer() {
      store.setContainer(null);
    },

    /**
     * @description The descriptors of the container for a car.
     * @param {string} vin - The VIN.
     * @param {string} containerId - The container id.
     * @param {object} [options] - `{ manual }`.
     * @returns {Promise<object>} `{ [descriptor]: { value, unit, timestamp } }`.
     */
    async telematicData(vin, containerId, { manual = false } = {}) {
      const { body } = await call(
        'GET',
        `/customers/vehicles/${vin}/telematicData?containerId=${encodeURIComponent(containerId)}`,
        { manual },
      );
      const data = body?.telematicData ?? body?.data;
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    },

    /**
     * @description The picture of a car, when it fits a widget (≤ 300 KB).
     * @param {string} vin - The VIN.
     * @param {object} [options] - `{ manual }`.
     * @returns {Promise<string|null>} The picture, base64.
     */
    async image(vin, { manual = false } = {}) {
      const { body } = await call('GET', `/customers/vehicles/${vin}/image`, {
        manual,
        binary: true,
      });
      if (!Buffer.isBuffer(body) || body.length === 0 || body.length > MAX_IMAGE_BYTES) {
        return null;
      }
      return body.toString('base64');
    },
  };
}

export {
  API_URL,
  RESERVE,
  CONTAINER_NAME,
  CONTAINER_PURPOSE,
  CardataError,
  redactVin,
  signatureOf,
  createCardataClient,
};
