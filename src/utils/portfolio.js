const MAX_PROJECT_FILES = 8;
const MAX_PROJECT_FILE_SIZE = 50 * 1024 * 1024;
const projectFileTypes = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', pdf: 'application/pdf',
};
const acceptedProjectFileTypes = [...new Set(Object.values(projectFileTypes))];

function projectFileType(name, type = '') {
  const provided = type.toLowerCase();
  if (acceptedProjectFileTypes.includes(provided)) return provided;
  if (provided && provided !== 'application/octet-stream') return '';
  return projectFileTypes[name.split('.').pop().toLowerCase()] || '';
}

function googleDriveLinkError(value) {
  if (!value) return '';
  if (typeof value !== 'string' || value.length > 2048) return 'Use a Google Drive share link of up to 2048 characters.';
  let url;
  try { url = new URL(value.trim()); } catch { return 'Enter a valid Google Drive file or folder link.'; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !['drive.google.com', 'docs.google.com'].includes(url.hostname)) {
    return 'Use an HTTPS share link from drive.google.com or docs.google.com.';
  }
  const driveFile = /\/(?:file\/d\/|(?:drive\/(?:u\/\d+\/)?folders\/)|folders\/)[\w-]+/.test(url.pathname);
  const driveId = ['id'].some((key) => /^[\w-]+$/.test(url.searchParams.get(key) || ''));
  const googleDocument = /^\/(?:document|spreadsheets|presentation|drawings|forms)\/(?:u\/\d+\/)?d\/(?:e\/)?[\w-]+/.test(url.pathname);
  if (url.hostname === 'drive.google.com' ? !driveFile && !driveId : !googleDocument) return 'Paste a link to a Google Drive file, folder, or document.';
  return '';
}

function formatProjectFileSize(size) {
  return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.ceil(size / 1024))} KB`;
}

module.exports = { MAX_PROJECT_FILES, MAX_PROJECT_FILE_SIZE, acceptedProjectFileTypes, projectFileType, googleDriveLinkError, formatProjectFileSize };
