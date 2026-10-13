import specialties from './specialties.json';

export const image = (id, width = 800) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`;
export const categories = [{ id: 'all', label: 'All gigs', icon: 'grid' }, ...specialties];
export const portfolioCovers = {
  cinematography: image('photo-1492691527719-9d1e07e534b4'),
  camera: image('photo-1452587925148-ce544e77e70d'),
  drone: image('photo-1506947411487-a56738267384'),
  gimbal: image('photo-1589872307379-0ffdf9829123'),
  photography: image('photo-1500530855697-b586d89ba3ee'),
  editing: image('photo-1574717024653-61fd2cf4d44d'),
};
