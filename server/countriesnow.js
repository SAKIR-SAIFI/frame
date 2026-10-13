const fallbackLocations = require('../src/data/locations.json');

const COUNTRIES_NOW_BASE = 'https://countriesnow.space/api/v0.1/countries';
const DEFAULT_CACHE_MS = 24 * 60 * 60 * 1000;
const FALLBACK_CACHE_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

function normalizeName(value) {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase() : '';
}

function indiaCityFallback() {
  return [...new Set(fallbackLocations.flatMap((location) => [location.city, ...location.aliases]))].sort((a, b) => a.localeCompare(b));
}

function createCountriesNowService({ fetchImpl = global.fetch, now = Date.now } = {}) {
  let countriesCache;
  let countriesRequest;
  const citiesCache = new Map();
  const citiesRequests = new Map();

  async function payloadFor(response) {
    if (!response.ok) throw new Error(`CountriesNow returned HTTP ${response.status}.`);
    const payload = await response.json();
    if (payload.error || !Array.isArray(payload.data)) throw new Error('CountriesNow returned an invalid response.');
    return payload.data;
  }

  async function getCountries() {
    if (countriesCache && countriesCache.expiresAt > now()) return countriesCache.value;
    if (countriesRequest) return countriesRequest;
    countriesRequest = (async () => {
      try {
        const response = await fetchImpl(`${COUNTRIES_NOW_BASE}/iso`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        const data = await payloadFor(response);
        const countries = data
          .filter((item) => typeof item.name === 'string' && item.name.trim())
          .map((item) => ({ name: item.name.trim(), code: item.Iso2 || item.iso2 || '' }))
          .sort((first, second) => first.name.localeCompare(second.name));
        countriesCache = { value: countries, expiresAt: now() + DEFAULT_CACHE_MS };
        return countries;
      } catch (error) {
        if (countriesCache?.value.length) {
          countriesCache.expiresAt = now() + FALLBACK_CACHE_MS;
          return countriesCache.value;
        }
        const fallback = [{ name: 'India', code: 'IN' }];
        countriesCache = { value: fallback, expiresAt: now() + FALLBACK_CACHE_MS };
        return fallback;
      } finally {
        countriesRequest = null;
      }
    })();
    return countriesRequest;
  }

  async function getCities(countryName) {
    const countries = await getCountries();
    const country = countries.find((item) => normalizeName(item.name) === normalizeName(countryName));
    if (!country) throw new Error('Select a country from the location suggestions.');
    const key = normalizeName(country.name);
    const cached = citiesCache.get(key);
    if (cached && cached.expiresAt > now()) return cached.value;
    if (citiesRequests.has(key)) return citiesRequests.get(key);

    const request = (async () => {
      try {
        const response = await fetchImpl(`${COUNTRIES_NOW_BASE}/cities`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ country: country.name }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const data = await payloadFor(response);
        const cities = [...new Set(data.filter((city) => typeof city === 'string' && city.trim()).map((city) => city.trim()))]
          .sort((first, second) => first.localeCompare(second));
        citiesCache.set(key, { value: cities, expiresAt: now() + DEFAULT_CACHE_MS });
        return cities;
      } catch (error) {
        if (cached?.value.length) {
          cached.expiresAt = now() + FALLBACK_CACHE_MS;
          return cached.value;
        }
        if (country.name === 'India') {
          const fallback = indiaCityFallback();
          citiesCache.set(key, { value: fallback, expiresAt: now() + FALLBACK_CACHE_MS });
          return fallback;
        }
        throw new Error('City suggestions are temporarily unavailable. Please try again.');
      } finally {
        citiesRequests.delete(key);
      }
    })();
    citiesRequests.set(key, request);
    return request;
  }

  return { getCountries, getCities };
}

module.exports = { createCountriesNowService, COUNTRIES_NOW_BASE };
