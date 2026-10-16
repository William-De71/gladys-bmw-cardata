// -----------------------------------------------------------------------------
// Non-regression of everything users store: the device and feature external
// ids, the fields the Discovery "Update" button compares (category, type,
// unit, min, max, step), and every key of the manifest a scene, a widget or a
// saved configuration refers to.
//
// test/fixtures/discovery.baseline.json was generated from version 0.1.0 (the
// first release). A failure here means existing users would have to delete
// and recreate a device, or would lose a scene or a widget setting: never
// update the baseline without a documented migration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

import { buildDevice } from '../src/device.js';
import { mergeValues, summarize, D } from '../src/vehicle.js';
import { LANGUAGES } from '../src/i18n.js';
import { fakeGladys, electricCar, entry, VIN, NOW } from './helpers/fixtures.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const baseline = read('./fixtures/discovery.baseline.json');
const manifest = read('../gladys-assistant-integration.json');

const ETERNAL = [
  'external_id',
  'category',
  'type',
  'unit',
  'min',
  'max',
  'step',
  'read_only',
  'has_feedback',
];
const pick = (feature) =>
  Object.fromEntries(
    ETERNAL.filter((key) => feature[key] !== undefined).map((key) => [key, feature[key]]),
  );
const keys = (list) => (list ?? []).map((entry) => entry.key);
const byKey = (list) => new Map((list ?? []).map((entry) => [entry.key, entry]));

/**
 * @description A car with every feature known (electric and fuel at once).
 * @param {string} language - The language.
 * @returns {object} The device.
 */
function fullDevice(language) {
  const values = {};
  mergeValues(values, electricCar(NOW), NOW);
  mergeValues(
    values,
    {
      [D.TOTAL_RANGE]: entry('480', 'km'),
      [D.FUEL_LEVEL]: entry('55', '%'),
      [D.FUEL_REMAINING]: entry('30', 'l'),
      [D.CHARGING_POWER]: entry('7400', 'W'),
      [D.TIME_REMAINING]: entry('95', 'min'),
      [D.PRECONDITIONING]: entry('heating'),
      [D.PLUGGED]: entry('true'),
    },
    NOW + 1,
  );
  return buildDevice(
    fakeGladys,
    { vin: VIN, basic: { brand: 'BMW', modelName: 'X5 xDrive50e' }, snapshot: summarize(values) },
    { language, distanceHomeKm: 1.2 },
  );
}

test('the device keeps its external ids and the fields Discovery compares, in every language', () => {
  for (const language of LANGUAGES) {
    const device = fullDevice(language);
    assert.deepEqual(
      {
        external_id: device.external_id,
        should_poll: device.should_poll,
        params: device.params.map((param) => param.name),
        features: device.features.map(pick),
      },
      baseline.device,
      language,
    );
  }
});

test('category / type / unit pairs come from the SDK constants', () => {
  const categories = new Set(Object.values(DEVICE_FEATURE_CATEGORIES));
  const units = new Set(Object.values(DEVICE_FEATURE_UNITS));
  const types = new Set(
    Object.values(DEVICE_FEATURE_TYPES).flatMap((group) => Object.values(group)),
  );
  for (const feature of fullDevice('en').features) {
    assert.ok(categories.has(feature.category), feature.category);
    assert.ok(types.has(feature.type), feature.type);
    if (feature.unit) {
      assert.ok(units.has(feature.unit), feature.unit);
    }
    // distance-sensor + integer has no icon nor label in the Gladys front.
    assert.ok(!(feature.category === 'distance-sensor' && feature.type === 'integer'));
  }
});

test('no configuration key or action disappears or changes type', () => {
  assert.deepEqual(
    keys(manifest.actions).filter((key) => baseline.manifest.actions.includes(key)),
    baseline.manifest.actions,
  );
  const current = byKey(manifest.config_schema);
  for (const { key, type } of baseline.manifest.config_schema) {
    assert.equal(current.get(key)?.type, type, `config_schema.${key}`);
  }
});

test('scene triggers keep their keys, filters, options and variables', () => {
  const current = byKey(manifest.scene_triggers);
  for (const trigger of baseline.manifest.scene_triggers) {
    const now = current.get(trigger.key);
    assert.ok(now, `scene_triggers.${trigger.key}`);
    const fields = byKey(now.fields);
    for (const { key, options } of trigger.fields) {
      const values = (fields.get(key)?.options ?? []).map((option) => option.value);
      options.forEach((value) =>
        assert.ok(values.includes(value), `${trigger.key}.${key}: ${value}`),
      );
    }
    const variables = byKey(now.variables);
    for (const { key, type } of trigger.variables) {
      assert.equal(variables.get(key)?.type, type, `${trigger.key}.variables.${key}`);
    }
  }
});

test('scene actions keep their keys, fields and outputs; widgets their settings', () => {
  const actions = byKey(manifest.scene_actions);
  for (const action of baseline.manifest.scene_actions) {
    const now = actions.get(action.key);
    assert.ok(now, action.key);
    action.fields.forEach((field) => assert.ok(keys(now.fields).includes(field), field));
    const outputs = byKey(now.outputs);
    for (const { key, type } of action.outputs) {
      assert.equal(outputs.get(key)?.type, type, `${action.key}.${key}`);
    }
  }
  const widgets = byKey(manifest.widgets);
  for (const widget of baseline.manifest.widgets) {
    const now = widgets.get(widget.key);
    assert.ok(now, widget.key);
    widget.settings.forEach((key) => assert.ok(keys(now.settings).includes(key), key));
  }
});
