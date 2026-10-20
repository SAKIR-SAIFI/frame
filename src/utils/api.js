export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, signal, raw = false, headers = {} } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: { ...(body === undefined || raw ? {} : { 'Content-Type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('Unable to reach perfectlens. Please check your connection and try again.', 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || 'Something went wrong. Please try again.', response.status);
  return data;
}

export const api = {
  session: (signal) => request('/session', { signal }),
  locationCountries: (signal) => request('/locations/countries', { signal }),
  locationCities: (country, signal) => request(`/locations/cities?country=${encodeURIComponent(country)}`, { signal }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  register: (body) => request('/auth/register', { method: 'POST', body }),
  logout: () => request('/auth/logout', { method: 'POST', body: {} }),
  workspace: (signal) => request('/workspace', { signal }),
  saveAvailability: (availability) => request('/availability', { method: 'PUT', body: { availability } }),
  saveGig: (gig) => request(gig.id ? `/gigs/${gig.id}` : '/gigs', { method: gig.id ? 'PATCH' : 'POST', body: gig }),
  setGigStatus: (id, status) => request(`/gigs/${id}`, { method: 'PATCH', body: { status } }),
  toggleSave: (id) => request(`/shortlist/${id}`, { method: 'POST', body: {} }),
  book: (body) => request('/bookings', { method: 'POST', body }),
  updateBooking: (id, status) => request(`/bookings/${id}`, { method: 'PATCH', body: { status } }),
  postProject: (body) => request('/projects', { method: 'POST', body }),
  closeProject: (id) => request(`/projects/${id}`, { method: 'PATCH', body: { status: 'closed' } }),
  savePortfolioProject: (project) => request(project.id ? `/portfolio-projects/${project.id}` : '/portfolio-projects', { method: project.id ? 'PATCH' : 'POST', body: project }),
  removePortfolioProject: (id) => request(`/portfolio-projects/${id}`, { method: 'DELETE' }),
  uploadPortfolioFile: (projectId, file, type) => request(`/portfolio-projects/${projectId}/assets`, { method: 'POST', body: file, raw: true, headers: { 'Content-Type': type, 'X-File-Name': encodeURIComponent(file.name) } }),
  removePortfolioFile: (projectId, fileId) => request(`/portfolio-projects/${projectId}/assets/${fileId}`, { method: 'DELETE' }),
  sendMessage: (body) => request('/messages', { method: 'POST', body }),
  acceptOffer: (id) => request(`/messages/${id}/accept`, { method: 'POST', body: {} }),
  sendContact: (body) => request('/contact', { method: 'POST', body }),
};
