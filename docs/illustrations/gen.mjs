// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The two widgets on a made-up car (fixed date): a BMW iX1 charging at home
// with a window left ajar, and the CarData account of the day. The picture
// of the car is a drawing (BMW serves the real one through its API).
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildVehicleWidget, buildAccountWidget } = await load('src/widgets.js');
const { mergeValues, summarize, homeOf, D } = await load('src/vehicle.js');
const { LANGUAGES } = await load('src/i18n.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

// Thursday 15 October 2026, 20:00 in Paris.
const NOW = Date.parse('2026-10-15T18:00:00Z');
const at = NOW - 12 * 60000;
const e = (value, unit) => ({ value, unit, timestamp: new Date(at).toISOString() });
const values = {};
mergeValues(
  values,
  {
    [D.SOC]: e(68, '%'),
    [D.ELECTRIC_RANGE]: e(281, 'km'),
    [D.CHARGING_STATUS]: e('CHARGINGACTIVE'),
    [D.PLUGGED]: e(true),
    [D.CHARGING_POWER]: e(10950, 'W'),
    [D.SOC_TARGET]: e(80, '%'),
    [D.MILEAGE]: e(18234, 'km'),
    [D.DOOR_STATUS]: e('SECURED'),
    [D.DOOR_FRONT_LEFT]: e(false),
    [D.TRUNK]: e(false),
    [D.WINDOW_REAR_LEFT]: e('INTERMEDIATE'),
    [D.WINDOW_FRONT_LEFT]: e('CLOSED'),
    [D.LATITUDE]: e(48.8566, 'degrees'),
    [D.LONGITUDE]: e(2.3522, 'degrees'),
    [D.MOVING]: e(false),
    [D.BATTERY_12V]: e(12.7, 'V'),
    [D.TIRE_FRONT_LEFT]: e(250, 'kPa'),
    [D.TIRE_FRONT_RIGHT]: e(250, 'kPa'),
    [D.TIRE_REAR_LEFT]: e(270, 'kPa'),
    [D.TIRE_REAR_RIGHT]: e(268, 'kPa'),
  },
  NOW,
);
const snapshot = summarize(values);
const home = homeOf(snapshot.location, [{ latitude: 48.8567, longitude: 2.3524 }], 200);
const car = { vin: 'WBA11AA0000000001', name: 'BMW iX1 xDrive30', snapshot, ...home };
const stream = { connected: true, lastMessageAt: at, messages: 1284, contended: false };

const drawing = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
<rect width="640" height="360" fill="#eef3fa"/>
<g transform="translate(320 200)">
<path d="M-230 40 C-230 10 -215 -5 -185 -10 L-120 -20 C-90 -60 -55 -78 0 -80 C60 -80 100 -62 135 -22 L200 -12 C222 -8 232 8 232 30 L232 48 L-230 48 Z" fill="#2f6fc0" stroke="#1c4f96" stroke-width="3"/>
<path d="M-105 -22 C-80 -55 -50 -68 -5 -69 L-5 -22 Z" fill="#cfe4ff"/>
<path d="M7 -69 C55 -68 88 -52 115 -22 L7 -22 Z" fill="#cfe4ff"/>
<circle cx="-140" cy="50" r="36" fill="#1b2533"/><circle cx="140" cy="50" r="36" fill="#1b2533"/>
<circle cx="-140" cy="50" r="13" fill="#9aa6b8"/><circle cx="140" cy="50" r="13" fill="#9aa6b8"/>
</g></svg>`;
const imageKey = 'car-illustration';

const contents = {};
for (const language of LANGUAGES) {
  contents[language] = {
    vehicle: buildVehicleWidget({ car, imageKey, stream, language, now: NOW }),
    account: buildAccountWidget({
      quota: { used: 9, left: 41, exhausted: false },
      stream,
      tokens: { refreshExpiresAt: NOW + 13.6 * 86400000 },
      cars: 1,
      signedIn: true,
      language,
      now: NOW,
    }),
  };
}
const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
const images = {
  [imageKey]: `data:image/svg+xml;base64,${Buffer.from(drawing).toString('base64')}`,
};
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents, images }));
