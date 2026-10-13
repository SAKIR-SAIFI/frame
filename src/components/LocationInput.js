import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '../utils/api';
import locations from '../data/locations.json';
import Icon from './Icon';

const normalize = (value) => value.trim().toLocaleLowerCase();

function indianCity(value) {
  const query = normalize(value);
  return locations.find((item) => [item.city, `${item.city}, ${item.state}`, ...item.aliases, ...item.aliases.map((alias) => `${alias}, ${item.state}`)]
    .some((candidate) => normalize(candidate) === query));
}

function initialLocation(value) {
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return { country: 'India', city: '' };
  if (normalize(value) === 'remote across india') return { country: 'India', city: 'Remote across India' };
  const india = indianCity(value);
  if (india) return { country: 'India', city: india.city };
  return { country: parts.length > 1 ? parts[parts.length - 1] : 'India', city: parts.slice(0, -1).join(', ') || parts[0] };
}

function cityOption(country, sourceCity) {
  const city = sourceCity.trim();
  if (!city) return null;
  const india = country === 'India' ? indianCity(city) : null;
  return {
    city: india?.city || city,
    label: india ? `${india.city}, ${india.state}` : `${city}, ${country}`,
    detail: india ? `${india.state} · India` : country,
    aliases: india?.aliases || [],
  };
}

export default function LocationInput({ id, label, name = 'location', value, onChange, required = false, allowRemote = false, compact = false, placeholder = 'Start typing a city' }) {
  const generatedId = useId();
  const inputId = id || `location-${generatedId}`;
  const countryId = `${inputId}-country`;
  const listId = `${inputId}-suggestions`;
  const initial = useRef(initialLocation(value));
  const lastEmittedValue = useRef(value);
  const cityInput = useRef(null);
  const [countries, setCountries] = useState([]);
  const [country, setCountry] = useState(initial.current.country);
  const [cities, setCities] = useState([]);
  const [cityQuery, setCityQuery] = useState(initial.current.city);
  const [selected, setSelected] = useState(Boolean(value));
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [loadingCities, setLoadingCities] = useState(false);
  const [cityError, setCityError] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    let current = true;
    api.locationCountries().then(({ countries: result }) => {
      if (!current) return;
      const available = Array.isArray(result) && result.length ? result : [{ name: 'India', code: 'IN' }];
      setCountries(available);
      setCountry(available.find((item) => normalize(item.name) === normalize(initial.current.country))?.name || 'India');
    }).catch(() => {
      if (!current) return;
      setCountries([{ name: 'India', code: 'IN' }]);
      setCountry('India');
    }).finally(() => { if (current) setLoadingCountries(false); });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    if (!country) return undefined;
    let current = true;
    setLoadingCities(true);
    setCities([]);
    setCityError('');
    api.locationCities(country).then(({ cities: result }) => {
      if (current) setCities(Array.isArray(result) ? result : []);
    }).catch(() => {
      if (!current) return;
      if (country === 'India') setCities([...new Set(locations.flatMap((item) => [item.city, ...item.aliases]))]);
      else { setCities([]); setCityError('Could not load city suggestions. Please try again.'); }
    }).finally(() => { if (current) setLoadingCities(false); });
    return () => { current = false; };
  }, [country]);

  useEffect(() => {
    if (value === lastEmittedValue.current) return;
    lastEmittedValue.current = value;
    if (!value) {
      setCountry('India');
      setCityQuery('');
      setSelected(false);
      return;
    }
    const parsed = initialLocation(value);
    const matchingCountry = countries.find((item) => normalize(item.name) === normalize(parsed.country));
    setCountry(matchingCountry?.name || 'India');
    setCityQuery(parsed.city);
    setSelected(true);
  }, [countries, value]);

  const options = useMemo(() => {
    const byCity = new Map();
    for (const sourceCity of cities) {
      const option = cityOption(country, sourceCity);
      if (option && !byCity.has(normalize(option.city))) byCity.set(normalize(option.city), option);
    }
    const query = normalize(cityQuery);
    const matches = [...byCity.values()].filter((option) => [option.city, option.label, ...option.aliases].some((part) => normalize(part).includes(query))).slice(0, 8);
    if (allowRemote && country === 'India' && (!query || 'remote across india'.includes(query))) {
      matches.push({ city: 'Remote across India', label: 'Remote across India', detail: 'Work from anywhere in India', aliases: [] });
    }
    return matches;
  }, [allowRemote, cities, cityQuery, country]);

  function emitLocation(nextValue) {
    lastEmittedValue.current = nextValue;
    onChange(nextValue);
  }

  function choose(option) {
    setCityQuery(option.city);
    setSelected(true);
    setOpen(false);
    setActive(-1);
    cityInput.current?.setCustomValidity('');
    emitLocation(option.label);
  }

  function handleKey(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      if (options.length) setActive((current) => (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    } else if (event.key === 'Enter' && open && active >= 0 && options[active]) {
      event.preventDefault();
      choose(options[active]);
    } else if (event.key === 'Escape' && open) {
      event.stopPropagation();
      setOpen(false);
    }
  }

  return <div className={`location-autocomplete ${compact ? 'location-autocomplete-compact' : ''}`}>
    <label className={compact ? 'sr-only' : ''} htmlFor={countryId}>Country</label>
    <select id={countryId} aria-label={`${label} country`} value={country} disabled={loadingCountries} onChange={(event) => {
      setCountry(event.target.value);
      setCityQuery('');
      setSelected(false);
      setOpen(false);
      cityInput.current?.setCustomValidity('');
      emitLocation('');
    }}>
      {loadingCountries && !countries.length && <option value={country}>Loading countries…</option>}
      {countries.map((item) => <option key={item.code || item.name} value={item.name}>{item.name}</option>)}
    </select>
    <label className={compact ? 'sr-only' : ''} htmlFor={inputId}>{label}</label>
    <input ref={cityInput} id={inputId} role="combobox" value={cityQuery} required={required} maxLength="100" autoComplete="off"
      placeholder={placeholder} aria-autocomplete="list" aria-expanded={open} aria-controls={open ? listId : undefined}
      aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
      onFocus={() => setOpen(true)} onBlur={() => { setOpen(false); setActive(-1); }}
      onChange={(event) => {
        setCityQuery(event.target.value);
        setSelected(false);
        event.target.setCustomValidity(event.target.value ? 'Choose a city from the suggestions.' : '');
        emitLocation('');
        setOpen(true);
        setActive(-1);
      }} onKeyDown={handleKey} />
    <input type="hidden" name={name} value={selected ? value : ''} />
    {open && <div className="location-options" id={listId} role="listbox" aria-label={`${label} suggestions`}>
      {options.length ? options.map((option, index) => <button type="button" role="option" tabIndex={-1} id={`${listId}-${index}`} key={option.label}
        aria-selected={active === index} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}>
        <Icon name={option.city.startsWith('Remote') ? 'globe' : 'pin'} size={17} /><span><strong>{option.city}</strong><small>{option.detail}</small></span>
      </button>) : <p>{loadingCities ? 'Loading cities…' : cityError || 'No match yet. Try another city.'}</p>}
    </div>}
  </div>;
}
