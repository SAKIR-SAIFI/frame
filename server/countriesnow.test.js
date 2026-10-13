const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCountriesNowService } = require('./countriesnow');

const jsonResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

test('CountriesNow returns cached countries and country-specific cities', async () => {
  const calls = [];
  const service = createCountriesNowService({
    now: () => 1_000,
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith('/iso')) return jsonResponse({ error: false, data: [{ name: 'India', Iso2: 'IN' }, { name: 'Canada', Iso2: 'CA' }] });
      return jsonResponse({ error: false, data: ['Toronto', 'Vancouver'] });
    },
  });

  assert.deepEqual(await service.getCountries(), [{ name: 'Canada', code: 'CA' }, { name: 'India', code: 'IN' }]);
  assert.deepEqual(await service.getCountries(), [{ name: 'Canada', code: 'CA' }, { name: 'India', code: 'IN' }]);
  assert.deepEqual(await service.getCities('Canada'), ['Toronto', 'Vancouver']);
  assert.equal(calls.filter((call) => call.url.endsWith('/iso')).length, 1);
  assert.equal(calls[1].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[1].options.body), { country: 'Canada' });
});

test('CountriesNow falls back to India and the built-in Indian city list when unavailable', async () => {
  const service = createCountriesNowService({ fetchImpl: async () => { throw new Error('offline'); } });
  assert.deepEqual(await service.getCountries(), [{ name: 'India', code: 'IN' }]);
  const cities = await service.getCities('India');
  assert.ok(cities.includes('Bengaluru'));
  await assert.rejects(service.getCities('Canada'), /Select a country/);
});
