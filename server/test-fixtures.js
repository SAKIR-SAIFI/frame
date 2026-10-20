// Test-only sample records; the production API never loads or inserts these fixtures.
const crypto = require('node:crypto');
const { dateKey, parseDate } = require('../src/utils/scheduling');

const demoPassword = 'PerfectLensIndia2026!';
const image = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=85`;

function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

const samples = [
  { id: 'aarav', name: 'Aarav Sharma', category: 'cinematography', location: 'Mumbai, Maharashtra', rate: 18000, rating: 4.9, reviews: 128, title: 'Your vision, brought to life in every frame.', bio: 'From Mumbai brand campaigns to destination wedding films in Rajasthan, I turn big ideas into cinematic stories. Eight years behind the camera, a thoughtful eye, and a fully equipped kit for your next production.', equipment: ['Sony FX6', 'Cinema lenses', 'Lighting kit'], skills: ['Commercials', 'Music videos', 'Short films', 'Wedding films', 'Hindi', 'Marathi'], photo: 'photo-1492691527719-9d1e07e534b4', color: '#dee5d9' },
  { id: 'priya', name: 'Priya Nair', category: 'drone', location: 'Bengaluru, Karnataka', rate: 12000, rating: 5, reviews: 94, title: 'A different perspective. An unforgettable shot.', bio: 'DGCA-certified drone pilot filming across Karnataka and the rest of India. From property flyovers to cinematic travel films, I plan every aerial shoot with care and bring a fresh perspective to your story.', equipment: ['DJI Mavic 3 Pro', 'FPV drone', '4K / 120fps'], skills: ['Drone footage', 'Real estate', 'Aerial cinematography', 'Travel films', 'Kannada', 'English'], photo: 'photo-1506947411487-a56738267384', color: '#d5e9e7' },
  { id: 'kabir', name: 'Kabir Singh', category: 'gimbal', location: 'Delhi, Delhi', rate: 15000, rating: 4.9, reviews: 76, title: 'Smooth moves. Stories that stay with you.', bio: 'Based in Delhi NCR, I create fluid tracking shots for music videos, live events, and brand films. Bring your ambitious one-take idea — I will bring the rig and a plan to make it happen.', equipment: ['DJI Ronin 4D', 'RS 3 Pro', 'Sony FX3'], skills: ['Music videos', 'Events', 'Tracking shots', 'Commercials', 'Hindi', 'Punjabi'], photo: 'photo-1589872307379-0ffdf9829123', color: '#e9dfd2' },
  { id: 'ananya', name: 'Ananya Iyer', category: 'camera', location: 'Chennai, Tamil Nadu', rate: 16000, rating: 4.9, reviews: 112, title: 'Real moments. Beautifully captured.', bio: 'Documentaries, Tamil wedding celebrations, and lifestyle campaigns captured with natural light and honest emotion. A calm approach that makes every team feel at home in front of the lens.', equipment: ['Canon C70', 'RF lens kit', 'Audio kit'], skills: ['Wedding films', 'Documentaries', 'Lifestyle', 'Events', 'Tamil', 'English'], photo: 'photo-1452587925148-ce544e77e70d', color: '#e2e8dc' },
  { id: 'rohan', name: 'Rohan Mehta', category: 'camera', location: 'Pune, Maharashtra', rate: 14000, rating: 4.8, reviews: 63, title: 'Big-set experience. Small-team energy.', bio: 'Camera operator for commercial productions, live events, and documentaries across Maharashtra. Reliable on a big set and equally happy building a small creative crew from the ground up.', equipment: ['ARRI Alexa Mini', 'Easyrig', 'Wireless focus'], skills: ['Commercials', 'Live events', 'Documentaries', 'Broadcast', 'Hindi', 'Marathi'], photo: 'photo-1516035069371-29a1b244cc32', color: '#e1ded9' },
  { id: 'meera', name: 'Meera Joshi', category: 'photography', location: 'Jaipur, Rajasthan', rate: 10000, rating: 5, reviews: 87, title: 'A little light. A whole lot of feeling.', bio: 'Portraits, handcrafted product photography, and destination weddings in the Pink City. I work with Indian independent brands and couples to make photographs that feel personal and full of life.', equipment: ['Sony A7R V', 'Portrait lenses', 'Studio lights'], skills: ['Portraits', 'Brand photography', 'Weddings', 'Product photography', 'Hindi', 'English'], photo: 'photo-1500530855697-b586d89ba3ee', color: '#e6dbc9' },
  { id: 'aditya', name: 'Aditya Rao', category: 'editing', location: 'Hyderabad, Telangana', rate: 8000, rating: 4.9, reviews: 146, title: 'Find the rhythm. Make the story shine.', bio: 'Hyderabad-based editor collaborating remotely across India. I turn raw footage into sharp brand films, engaging reels, and thoughtful documentary stories, with Telugu, Hindi, and English edits.', equipment: ['DaVinci Resolve', 'Premiere Pro', 'Color grading'], skills: ['Video editing', 'Music videos', 'Commercials', 'Color grading', 'Telugu', 'Remote'], photo: 'photo-1574717024653-61fd2cf4d44d', color: '#dce1e7', remote: true },
  { id: 'zoya', name: 'Zoya Khan', category: 'cinematography', location: 'Kochi, Kerala', rate: 22000, rating: 5, reviews: 52, title: 'Thoughtful images for meaningful stories.', bio: 'Narrative cinematographer inspired by Kerala’s coast, bold colour, and interesting people. I partner with directors and brands across India, from the first moodboard to the final frame.', equipment: ['Blackmagic 6K', 'Anamorphic lenses', 'LED lighting'], skills: ['Short films', 'Brand films', 'Commercials', 'Music videos', 'Malayalam', 'English'], photo: 'photo-1470071459604-3b5ec3a7fe05', color: '#e4e8dd' },
];

function createSeed() {
  const createdAt = Date.now();
  const users = samples.map((sample, index) => ({
    id: `freelancer-${sample.id}`, name: sample.name, email: `${sample.id}@perfectlens.in`, role: 'freelancer',
    passwordHash: passwordHash(demoPassword), phone: `900000000${index}`, location: sample.location,
    company: '', specialty: sample.category, demo: true, createdAt,
    availability: Array.from({ length: 7 }, (_, weekday) => ({ id: `${sample.id}-weekly-${weekday}`, weekday, start: index === 1 ? '10:00' : '09:00', end: index === 1 ? '18:00' : '17:00' })),
  }));
  users.push({ id: 'client-demo', name: 'Ishita Kapoor', email: 'client@perfectlens.in', role: 'client', passwordHash: passwordHash(demoPassword), phone: '9000000010', location: 'Mumbai, Maharashtra', company: 'Studio Mango', availability: [], demo: true, createdAt });
  const gigs = samples.map(({ photo, ...sample }) => ({ ...sample, ownerId: `freelancer-${sample.id}`, cover: image(photo), avatar: '', status: 'published', verified: true, createdAt }));
  const day = parseDate(dateKey());
  day.setUTCDate(day.getUTCDate() + 7);
  return {
    version: 1, users, gigs, bookings: [], portfolioProjects: [],
    projects: [{ id: 'project-demo', clientId: 'client-demo', title: 'A launch film for an Indian homegrown brand', category: 'cinematography', budget: 25000, location: 'Mumbai, Maharashtra', description: 'A warm, cinematic brand film for Studio Mango. We need one shoot day, product close-ups, and a 60-second launch edit.', preferredTimes: [{ id: 'project-demo-time', date: dateKey(day), start: '09:00', end: '17:00' }], urgent: false, status: 'open', createdAt }],
    messages: [{ id: 'welcome-aarav', creatorId: 'aarav', clientId: 'client-demo', senderId: 'freelancer-aarav', text: 'Namaste, Ishita! Happy to talk through your next shoot, kit, budget, and a call time that works for both of us.', timestamp: createdAt }],
    agreedRates: {}, shortlists: {},
  };
}

module.exports = { createSeed, passwordHash, demoPassword };
