// -----------------------------------------------------------------------------
// The BMW CarData stream: MQTT over TLS (mqtts, port 9000 by default).
//
// What BMW documents and what the Home Assistant integrations met in practice:
//   - user name = the GCID of the account, password = the current ID token
//     (1 h), client id = the GCID; topic `<gcid>/+` (one topic per VIN);
//   - TLS 1.3 only; QoS 0 only (no message is stored for us while offline);
//   - ONE connection per account: a second client (Home Assistant, MQTT
//     Explorer…) with the same account disconnects the first one, and so on;
//   - when the ID token expires, BMW closes the connection: reconnect with
//     the new one after each token refresh;
//   - too many connection attempts from one IP within a minute get that IP
//     rate limited: never reconnect in a tight loop (backoff here);
//   - the stream sends only what the car reports, for the descriptors ticked
//     in the "Data selection" of the CarData portal: a car that sleeps sends
//     nothing, sometimes for days.
// -----------------------------------------------------------------------------

import mqtt from 'mqtt';

const MIN_RETRY_MS = 15000;
const MAX_RETRY_MS = 10 * 60 * 1000;
// A session shorter than this was probably kicked out by another client.
const SHORT_SESSION_MS = 60000;

/**
 * @description Create the stream client.
 * @param {object} options - Options.
 * @param {Function} options.getOptions - `() => ({ host, port, gcid, idToken })`.
 * @param {Function} options.onMessage - `(vin, data) => void`.
 * @param {Function} [options.onStatus] - `(status) => void`, on every change.
 * @param {Function} [options.onAuthRefused] - `async () => void`: the broker
 * refused the ID token (refresh it, then reconnect).
 * @param {Function} [options.connect] - mqtt.connect, for the tests.
 * @param {Function} [options.now] - Clock.
 * @param {object} [options.logger] - Logger.
 * @returns {object} The stream.
 */
function createStream({
  getOptions,
  onMessage,
  onStatus = () => {},
  onAuthRefused = async () => {},
  connect = mqtt.connect,
  now = Date.now,
  logger = console,
}) {
  let client = null;
  let wanted = false;
  let retryTimer = null;
  let retryMs = MIN_RETRY_MS;
  let connectedAt = 0;
  let shortSessions = 0;
  const status = {
    connected: false,
    since: 0,
    lastMessageAt: 0,
    messages: 0,
    lastError: '',
    contended: false,
  };

  const report = () => onStatus({ ...status });

  /** Schedule the next attempt (exponential backoff). */
  function scheduleRetry() {
    if (!wanted || retryTimer) {
      return;
    }
    const delay = retryMs;
    retryMs = Math.min(MAX_RETRY_MS, retryMs * 2);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      open();
    }, delay);
    retryTimer.unref?.();
  }

  /**
   * @description Handle one MQTT message.
   * @param {string} topic - The topic.
   * @param {Buffer} payload - The payload.
   */
  function handleMessage(topic, payload) {
    let message;
    try {
      message = JSON.parse(payload.toString('utf8'));
    } catch {
      logger.debug?.('Stream: a message that is not JSON was ignored');
      return;
    }
    const vin = String(message?.vin ?? topic.split('/').pop() ?? '').toUpperCase();
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin) || !message?.data || typeof message.data !== 'object') {
      return;
    }
    status.lastMessageAt = now();
    status.messages += 1;
    try {
      onMessage(vin, message.data);
    } catch (err) {
      logger.warn(`Stream: message not handled: ${err.message}`);
    }
  }

  /** Open a connection with the current options. */
  function open() {
    if (!wanted) {
      return;
    }
    close();
    const { host, port, gcid, idToken } = getOptions();
    if (!gcid || !idToken) {
      status.lastError = 'no ID token';
      report();
      return;
    }
    const current = connect(`mqtts://${host}:${port}`, {
      clientId: gcid,
      username: gcid,
      password: idToken,
      protocolVersion: 4,
      keepalive: 30,
      clean: true,
      reconnectPeriod: 0,
      connectTimeout: 30000,
      minVersion: 'TLSv1.3',
    });
    client = current;
    current.on('connect', () => {
      if (client !== current) {
        return;
      }
      connectedAt = now();
      status.connected = true;
      status.since = connectedAt;
      status.lastError = '';
      current.subscribe(`${gcid}/+`, { qos: 0 }, (err) => {
        if (err) {
          logger.warn(`Stream: subscription refused: ${err.message}`);
        }
      });
      logger.info('Stream connected');
      report();
    });
    current.on('message', handleMessage);
    current.on('error', (err) => {
      if (client !== current) {
        return;
      }
      status.lastError = String(err?.message ?? err).slice(0, 200);
      // CONNACK 4/5: bad user name or password, not authorized.
      if (
        err?.code === 4 ||
        err?.code === 5 ||
        /not authori[sz]ed|bad user/i.test(status.lastError)
      ) {
        logger.warn(`Stream: ID token refused (${status.lastError})`);
        current.end(true);
        client = null;
        status.connected = false;
        report();
        onAuthRefused()
          .catch((e) => logger.warn(`Stream: token refresh failed: ${e.message}`))
          .finally(scheduleRetry);
        return;
      }
      logger.warn(`Stream error: ${status.lastError}`);
    });
    current.on('close', () => {
      if (client !== current) {
        return;
      }
      client = null;
      const wasConnected = status.connected;
      status.connected = false;
      if (wasConnected) {
        const lasted = now() - connectedAt;
        shortSessions = lasted < SHORT_SESSION_MS ? shortSessions + 1 : 0;
        status.contended = shortSessions >= 3;
        if (lasted >= SHORT_SESSION_MS) {
          retryMs = MIN_RETRY_MS;
        }
        logger.info(`Stream closed after ${Math.round(lasted / 1000)} s`);
      }
      report();
      scheduleRetry();
    });
  }

  /** Close the current connection (no retry scheduled by it). */
  function close() {
    if (client) {
      const old = client;
      client = null;
      old.end(true);
    }
    if (status.connected) {
      status.connected = false;
      report();
    }
  }

  return {
    /** Connect (and stay connected). */
    start() {
      wanted = true;
      clearTimeout(retryTimer);
      retryTimer = null;
      retryMs = MIN_RETRY_MS;
      open();
    },

    /** Reconnect with fresh credentials (after a token refresh). */
    restart() {
      if (!wanted) {
        return;
      }
      clearTimeout(retryTimer);
      retryTimer = null;
      open();
    },

    /** Disconnect for good. */
    stop() {
      wanted = false;
      clearTimeout(retryTimer);
      retryTimer = null;
      close();
    },

    /** @returns {object} The status: connected, since, lastMessageAt, messages… */
    status() {
      return { ...status, running: wanted };
    },
  };
}

export { MIN_RETRY_MS, createStream };
