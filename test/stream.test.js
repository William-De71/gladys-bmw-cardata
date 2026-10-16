import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createStream } from '../src/stream.js';
import { fakeBroker, silent, GCID, VIN, entry } from './helpers/fixtures.js';

/**
 * @description A stream on a fake broker.
 * @returns {object} `{ stream, broker, messages, statuses, refused }`.
 */
function setup() {
  const broker = fakeBroker();
  const messages = [];
  const statuses = [];
  const refused = [];
  const stream = createStream({
    getOptions: () => ({
      host: 'customer.streaming-cardata.bmwgroup.com',
      port: 9000,
      gcid: GCID,
      idToken: 'id-0',
    }),
    onMessage: (vin, data) => messages.push({ vin, data }),
    onStatus: (status) => statuses.push(status),
    onAuthRefused: async () => refused.push(true),
    connect: broker,
    logger: silent,
  });
  return { stream, broker, messages, statuses, refused };
}

test('connects as BMW documents it: mqtts, GCID, ID token, TLS 1.3, topic gcid/+', (t) => {
  const { stream, broker } = setup();
  t.after(() => stream.stop());
  stream.start();
  const client = broker.last();
  assert.equal(client.url, 'mqtts://customer.streaming-cardata.bmwgroup.com:9000');
  assert.equal(client.options.username, GCID);
  assert.equal(client.options.clientId, GCID);
  assert.equal(client.options.password, 'id-0');
  assert.equal(client.options.minVersion, 'TLSv1.3');
  assert.equal(client.options.reconnectPeriod, 0, 'the stream handles its own backoff');
  client.accept();
  assert.deepEqual(client.subscriptions, [`${GCID}/+`]);
  assert.equal(stream.status().connected, true);
});

test('messages: { vin, data } handed over, garbage ignored', (t) => {
  const { stream, broker, messages } = setup();
  t.after(() => stream.stop());
  stream.start();
  const client = broker.last();
  client.accept();
  client.send(VIN, { 'vehicle.isMoving': entry(true) });
  client.emit('message', `${GCID}/${VIN}`, Buffer.from('not json'));
  client.emit('message', `${GCID}/x`, Buffer.from('{"vin":"short","data":{}}'));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].vin, VIN);
  assert.equal(stream.status().messages, 1);
});

test('a refused ID token asks a refresh; a closed stream retries later, not in a loop', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { stream, broker, refused } = setup();
  t.after(() => stream.stop());
  stream.start();
  broker.last().refuse();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(refused.length, 1);
  assert.equal(broker.clients.length, 1);
  t.mock.timers.tick(15000);
  assert.equal(broker.clients.length, 2, 'retried after 15 s');
  broker.last().accept();
  broker.last().drop();
  t.mock.timers.tick(14000);
  assert.equal(broker.clients.length, 2);
  t.mock.timers.tick(20000);
  assert.equal(broker.clients.length, 3, 'backoff doubled');
});

test('three short sessions in a row: another client holds the stream', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { stream, broker } = setup();
  t.after(() => stream.stop());
  stream.start();
  for (let i = 0; i < 3; i += 1) {
    broker.last().accept();
    broker.last().drop();
    t.mock.timers.tick(10 * 60 * 1000);
  }
  assert.equal(stream.status().contended, true);
});

test('restart reconnects with the new token; stop ends everything', () => {
  const { stream, broker } = setup();
  stream.start();
  broker.last().accept();
  stream.restart();
  assert.equal(broker.clients[0].ended, true);
  assert.equal(broker.clients.length, 2);
  stream.stop();
  assert.equal(broker.clients[1].ended, true);
  assert.equal(stream.status().running, false);
});
