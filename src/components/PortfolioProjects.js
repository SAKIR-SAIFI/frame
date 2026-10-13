import { useState } from 'react';
import Icon from './Icon';
import Modal from './Modal';
import { categories } from '../data/creators';
import { dateKey, formatDate } from '../utils/marketplace';
import { MAX_PROJECT_FILES, MAX_PROJECT_FILE_SIZE, acceptedProjectFileTypes, projectFileType, googleDriveLinkError, formatProjectFileSize } from '../utils/portfolio';

function fileIcon(type) {
  return type.startsWith('image/') ? 'camera' : type.startsWith('video/') ? 'video' : 'file';
}

function ProjectCard({ project, children, showVisibility = false }) {
  const [expanded, setExpanded] = useState(false);
  const specialty = categories.find((item) => item.id === project.category);
  const assets = project.assets || [];
  const cover = assets.find((asset) => asset.type.startsWith('image/'));
  const longDescription = project.description?.length > 180;
  return <article className="portfolio-card" aria-label={project.title}>
    <div className="portfolio-cover"><Icon name={project.driveUrl ? 'folder' : specialty?.icon || 'film'} size={39} />{cover && <img src={cover.url} alt={`Preview of ${project.title}`} loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}
      <span className="portfolio-source">{project.driveUrl ? <><Icon name="link" size={12} />Google Drive</> : assets.length ? <><Icon name="upload" size={12} />Uploaded project</> : 'Project portfolio'}</span>
    </div>
    <div className="portfolio-card-content"><div className="portfolio-meta"><span>{specialty?.role || 'Creative project'}</span>{project.projectDate && <span>{formatDate(project.projectDate, { year: 'numeric' })}</span>}</div>
      <h3>{project.title}</h3>{project.yourRole && <p className="portfolio-role">My role: {project.yourRole}</p>}
      {project.description && <><p className="portfolio-description">{longDescription && !expanded ? `${project.description.slice(0, 180).trimEnd()}…` : project.description}</p>{longDescription && <button className="text-button portfolio-read-more" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : 'Read more'}</button>}</>}
      {project.driveUrl && <a className="button button-outline button-small portfolio-drive-link" href={project.driveUrl} target="_blank" rel="noopener noreferrer">Open Google Drive<Icon name="arrowUpRight" size={15} /></a>}
      {assets.length > 0 && <div className="portfolio-files" aria-label="Project files">{assets.map((asset) => <a key={asset.id} href={asset.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${asset.name} in a new tab`}><Icon name={fileIcon(asset.type)} size={16} /><span>{asset.name}<small>{formatProjectFileSize(asset.size)}</small></span><Icon name="arrowUpRight" size={13} /></a>)}</div>}
      {showVisibility && <span className="portfolio-visibility"><Icon name={project.showOnProfile ? 'users' : 'shield'} size={13} />{project.showOnProfile ? 'Visible to clients on my gig profiles' : 'Only visible to me'}</span>}
      {children}
    </div>
  </article>;
}

export default function PortfolioProjects({ projects, sectionRef, onAdd, onEdit, onRemove }) {
  const [removingId, setRemovingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function remove(project) {
    setBusy(true); setError('');
    try { await onRemove(project.id); setRemovingId(null); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <section className="freelancer-portfolio" id="freelancer-projects" ref={sectionRef} aria-label="My portfolio projects">
    <div className="section-heading"><div><span className="eyebrow">YOUR WORK, IN THE SPOTLIGHT</span><h2>Projects<span>.</span></h2><p>Add your work directly, or share a Google Drive file or folder.</p></div><div className="portfolio-section-actions"><button className="button button-outline button-small" onClick={() => onAdd('drive')}><Icon name="link" size={15} />Add Google Drive link</button><button className="button button-primary button-small" onClick={() => onAdd('project')}><Icon name="plus" size={16} />Add project</button></div></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {projects.length ? <><p className="portfolio-count">{projects.length} {projects.length === 1 ? 'project' : 'projects'} in your portfolio</p><div className="portfolio-grid">{projects.slice().sort((a, b) => b.updatedAt - a.updatedAt).map((project) => <ProjectCard key={project.id} project={project} showVisibility>
      {removingId === project.id ? <div className="portfolio-remove-confirm"><p>Remove “{project.title}” and its uploaded files from your portfolio?</p><div><button className="button button-outline button-small" disabled={busy} onClick={() => setRemovingId(null)}>Keep project</button><button className="button button-dark button-small" disabled={busy} onClick={() => remove(project)}>{busy ? 'Removing…' : 'Remove project'}</button></div></div> : <div className="portfolio-card-actions"><button className="button button-outline button-small" aria-label={`Edit ${project.title}`} onClick={() => onEdit(project)}><Icon name="edit" size={14} />Edit project</button><button className="text-button" aria-label={`Remove ${project.title}`} onClick={() => { setRemovingId(project.id); setError(''); }}><Icon name="trash" size={14} />Remove</button></div>}
    </ProjectCard>)}</div></> : <div className="portfolio-empty"><span><Icon name="folder" size={34} /></span><div><h3>Give your favourite projects a home.</h3><p>Add a title, your role, and project files — or paste a Google Drive share link. Build a portfolio that tells your story.</p></div><button className="button button-outline button-small" onClick={() => onAdd('project')}>Add my first project<Icon name="arrowUpRight" size={16} /></button></div>}
  </section>;
}

export function PortfolioShowcase({ projects = [] }) {
  if (!projects.length) return null;
  return <section className="portfolio-showcase" aria-label="Freelancer project portfolio"><h5>Project portfolio</h5><p>Explore this freelancer’s work and project files.</p><div className="portfolio-grid">{projects.map((project) => <ProjectCard key={project.id} project={project} />)}</div></section>;
}

export function PortfolioProjectModal({ user, project, mode = 'project', onClose, onSave, onUpload, onRemoveFile, onDone }) {
  const [record, setRecord] = useState(project);
  const [files, setFiles] = useState([]);
  const [removedFiles, setRemovedFiles] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const driveMode = !project && mode === 'drive';
  const remainingAssets = (record?.assets || []).filter((asset) => !removedFiles.includes(asset.id));

  function chooseFiles(event) {
    const incoming = [...event.target.files];
    event.target.value = '';
    for (const file of incoming) {
      if (!projectFileType(file.name, file.type)) { setError('Choose a JPG, PNG, WebP, GIF, AVIF, MP4, WebM, MOV, or PDF file.'); return; }
      if (!file.size || file.size > MAX_PROJECT_FILE_SIZE) { setError('Choose a non-empty file up to 50 MB. Use a Google Drive link for larger projects.'); return; }
      if (file.name.length > 180) { setError('Please shorten the file name to 180 characters or fewer.'); return; }
    }
    const next = [...new Map([...files, ...incoming].map((file) => [`${file.name}:${file.size}:${file.lastModified}`, file])).values()];
    if (next.length + remainingAssets.length > MAX_PROJECT_FILES) { setError('A project can have up to 8 uploaded files.'); return; }
    setFiles(next); setError('');
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const values = { ...(record ? { id: record.id } : {}), title: data.get('title').trim(), category: data.get('category'), description: data.get('description').trim(), yourRole: data.get('yourRole').trim(), projectDate: data.get('projectDate'), driveUrl: data.get('driveUrl').trim(), showOnProfile: data.get('showOnProfile') === 'on' };
    const linkError = googleDriveLinkError(values.driveUrl);
    if (linkError) { setError(linkError); return; }
    if (driveMode && !values.driveUrl) { setError('Paste a Google Drive file or folder link.'); return; }
    setError(''); setBusy(true); setProgress('Saving project…');
    try {
      let saved = (await onSave(values)).portfolioProject;
      setRecord(saved);
      for (const fileId of removedFiles) {
        if (saved.assets.some((asset) => asset.id === fileId)) {
          setProgress('Updating project files…');
          saved = (await onRemoveFile(saved.id, fileId)).portfolioProject;
          setRecord(saved);
        }
        setRemovedFiles((current) => current.filter((id) => id !== fileId));
      }
      for (const [index, file] of files.entries()) {
        setProgress(`Uploading file ${index + 1} of ${files.length}…`);
        saved = (await onUpload(saved.id, file, projectFileType(file.name, file.type))).portfolioProject;
        setRecord(saved); setFiles((current) => current.filter((item) => item !== file));
      }
      onDone(Boolean(project));
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); setProgress(''); }
  }

  return <Modal title={project ? 'Keep your project in focus.' : driveMode ? 'Add a project from Google Drive.' : 'Your work deserves a spotlight.'} subtitle="Add project details, upload your work, or attach a Drive file or folder. Choose what clients can see." onClose={onClose} className="form-modal portfolio-form-modal">
    <form className="modal-form" onSubmit={submit}><fieldset className="portfolio-form-fields" disabled={busy}>
      <label htmlFor="portfolio-title">Project title<input id="portfolio-title" name="title" placeholder="e.g. A cinematic Jaipur wedding film" defaultValue={project?.title || ''} required minLength="3" maxLength="100" /></label>
      <div className="form-row"><label htmlFor="portfolio-category">Project specialty<select id="portfolio-category" name="category" defaultValue={project?.category || user.specialty || 'cinematography'}>{categories.slice(1).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label htmlFor="portfolio-date">Project date <small>(optional)</small><input id="portfolio-date" name="projectDate" type="date" max={dateKey()} defaultValue={project?.projectDate || ''} /></label></div>
      <label htmlFor="portfolio-role">Your role in this project<input id="portfolio-role" name="yourRole" placeholder="e.g. Cinematographer, editor, or drone pilot" maxLength="80" defaultValue={project?.yourRole || ''} /></label>
      <label htmlFor="portfolio-description">About this project<textarea id="portfolio-description" name="description" rows="3" maxLength="2000" placeholder="Share the story, deliverables, and what you brought to the project." defaultValue={project?.description || ''} /></label>
      <label htmlFor="portfolio-drive">Google Drive link{!driveMode && <small>(optional)</small>}<input id="portfolio-drive" name="driveUrl" type="url" placeholder="https://drive.google.com/file/d/…/view" required={driveMode} maxLength="2048" defaultValue={project?.driveUrl || ''} /><small>Paste a Drive file, folder, or Google document share link. Set its Drive sharing permissions for the people you want to share it with.</small></label>
      <div className="portfolio-upload"><label htmlFor="portfolio-files"><Icon name="upload" size={23} /><span>Upload project files<small>Photos, videos, or PDFs · up to 50 MB per file · {MAX_PROJECT_FILES} files per project</small></span></label><input id="portfolio-files" aria-label="Upload project files" type="file" multiple accept={acceptedProjectFileTypes.join(',')} onChange={chooseFiles} /></div>
      {record?.assets?.length > 0 && <div className="portfolio-selected-files">{record.assets.map((asset) => <div key={asset.id} className={`portfolio-selected-file ${removedFiles.includes(asset.id) ? 'pending-removal' : ''}`}><Icon name={fileIcon(asset.type)} size={17} /><span>{asset.name}<small>{removedFiles.includes(asset.id) ? 'Removed when you save' : `${formatProjectFileSize(asset.size)} · uploaded`}</small></span><button type="button" className="text-button" aria-label={`${removedFiles.includes(asset.id) ? 'Keep' : 'Remove'} ${asset.name}`} onClick={() => setRemovedFiles((current) => current.includes(asset.id) ? current.filter((id) => id !== asset.id) : [...current, asset.id])}>{removedFiles.includes(asset.id) ? 'Undo' : 'Remove'}</button></div>)}</div>}
      {files.length > 0 && <div className="portfolio-selected-files">{files.map((file, index) => <div className="portfolio-selected-file" key={`${file.name}-${index}`}><Icon name={fileIcon(projectFileType(file.name, file.type))} size={17} /><span>{file.name}<small>{formatProjectFileSize(file.size)} · ready to upload</small></span><button type="button" className="icon-button" aria-label={`Remove selected ${file.name}`} onClick={() => setFiles((current) => current.filter((item) => item !== file))}><Icon name="close" size={15} /></button></div>)}</div>}
      <label className="checkbox-label"><input type="checkbox" name="showOnProfile" defaultChecked={project?.showOnProfile ?? true} /><span><strong>Show this project to clients</strong><small>Display it on my gig profiles. Keep this unchecked for a personal project entry.</small></span><Icon name="users" size={21} /></label>
    </fieldset>{error && <p className="form-error" role="alert">{error}</p>}{busy && <p className="form-hint" role="status">{progress}</p>}<button className="button button-primary button-full" type="submit" disabled={busy}>{busy ? progress : project ? 'Save project changes' : 'Add to my projects'}<Icon name="check" size={17} /></button></form>
  </Modal>;
}
