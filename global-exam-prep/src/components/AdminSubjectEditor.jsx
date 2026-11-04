import { useMemo, useRef, useState } from 'react';
import { AlertCircle, BookOpen, CheckCircle2, FilePlus2, Trash2, UploadCloud } from 'lucide-react';
import { supabase } from '../supabase.js';

const BUCKET = 'admin-course-files';
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MIME_BY_EXTENSION = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

async function getSession() {
    if (!supabase) throw new Error('Supabase is not configured on this deployment.');
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.access_token) {
        throw new Error('Your session has expired. Sign in again before editing subjects.');
    }
    return data.session;
}

async function callAdminApi(session, payload) {
    const response = await fetch('/api/admin-subjects', {
        method: 'POST',
        headers: {
            Authorization: 'Bearer ' + session.access_token,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    let result = {};
    try { result = await response.json(); } catch { /* handled below */ }
    if (!response.ok) {
        const error = new Error(result.error || 'The subject operation failed. Please retry.');
        error.status = response.status;
        throw error;
    }
    return result;
}

export default function AdminSubjectEditor({ course, semester, subjects = [], onChanged, initialMode = 'add', initialSubjectId = '', onEditorStateChange }) {
    const [mode, setMode] = useState(initialMode);
    const [subjectName, setSubjectName] = useState('');
    const [subjectCode, setSubjectCode] = useState('');
    const [isDepartmental, setIsDepartmental] = useState('false');
    const [syllabusFile, setSyllabusFile] = useState(null);
    const [removeId, setRemoveId] = useState(initialSubjectId);
    const [confirmRemove, setConfirmRemove] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const fileInputRef = useRef(null);

    const sortedSubjects = useMemo(
        () => [...subjects].sort((a, b) => a.subjectName.localeCompare(b.subjectName)),
        [subjects],
    );
    const selectedForRemoval = sortedSubjects.find(item => String(item.subjectId) === String(removeId)) || null;

    function switchMode(nextMode) {
        setMode(nextMode);
        setRemoveId('');
        setError('');
        setNotice('');
        setConfirmRemove(false);
        onEditorStateChange?.({ mode: nextMode, subjectId: '' });
    }

    async function addSubject(event) {
        event.preventDefault();
        setError('');
        setNotice('');
        if (!subjectName.trim()) return setError('Enter the subject name.');
        if (!subjectCode.trim()) return setError('Enter the official subject code from the syllabus.');
        if (!syllabusFile) return setError('Choose the syllabus PDF or DOCX file.');

        const extension = syllabusFile.name.split('.').pop()?.toLowerCase();
        if (!['pdf', 'docx'].includes(extension)) return setError('Syllabus files must be PDF or DOCX.');
        if (syllabusFile.size < 1 || syllabusFile.size > MAX_FILE_BYTES) {
            return setError('The syllabus must be larger than 0 bytes and no larger than 20 MB.');
        }

        setBusy(true);
        let objectPath = '';
        let apiSubmitted = false;
        try {
            const session = await getSession();
            const objectId = crypto.randomUUID();
            objectPath = 'subjects/new/' + session.user.id + '/' + objectId + '.' + extension;
            const mimeType = MIME_BY_EXTENSION[extension];
            const { error: storageError } = await supabase.storage
                .from(BUCKET)
                .upload(objectPath, syllabusFile, {
                    contentType: mimeType,
                    cacheControl: '3600',
                    upsert: false,
                });
            if (storageError) throw new Error(storageError.message || 'The syllabus could not be uploaded.');

            setNotice('Syllabus uploaded. Extracting its text and saving the new subject…');
            apiSubmitted = true;
            const result = await callAdminApi(session, {
                action: 'add',
                courseId: course.courseId,
                semester,
                subjectName: subjectName.trim(),
                subjectCode: subjectCode.trim(),
                isDepartmentalSubject: isDepartmental === 'true',
                fileName: syllabusFile.name,
                mimeType,
                sizeBytes: syllabusFile.size,
                objectPath,
            });

            setSubjectName('');
            setSubjectCode('');
            setIsDepartmental('false');
            setSyllabusFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
            setNotice(result.restored
                ? 'Subject restored. Its original Subject ID and historical records are preserved: ' + result.subjectId
                : 'Subject added successfully. Its syllabus text was extracted and saved. Subject ID: ' + result.subjectId);
            await onChanged?.();
        } catch (requestError) {
            if (objectPath && !apiSubmitted) {
                try { await supabase.storage.from(BUCKET).remove([objectPath]); } catch { /* Retry cleanup is safe if Storage is unavailable. */ }
            }
            setError(requestError.message || 'The subject could not be added.');
            setNotice('');
        } finally {
            setBusy(false);
        }
    }

    async function removeSubject() {
        if (!selectedForRemoval) return setError('Select a subject to remove.');
        setBusy(true);
        setError('');
        setNotice('');
        try {
            const session = await getSession();
            await callAdminApi(session, {
                action: 'remove',
                subjectId: selectedForRemoval.subjectId,
                courseId: course.courseId,
                semester,
            });
            setRemoveId('');
            setConfirmRemove(false);
            setNotice('Subject archived from the active catalog. Its Subject ID, exam attempts, results and question-bank history are preserved.');
            await onChanged?.();
        } catch (requestError) {
            setError(requestError.message || 'The subject could not be removed.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="ac-editor">
            <div className="ac-editor__tabs" role="tablist" aria-label="Subject operation">
                <button type="button" role="tab" aria-selected={mode === 'add'} className={mode === 'add' ? 'is-active' : ''} onClick={() => switchMode('add')}>
                    <FilePlus2 size={16} /> Add subject
                </button>
                <button type="button" role="tab" aria-selected={mode === 'remove'} className={mode === 'remove' ? 'is-active' : ''} onClick={() => switchMode('remove')}>
                    <Trash2 size={16} /> Remove subject
                </button>
            </div>

            {error && <div className="ac-editor__message is-error" role="alert"><AlertCircle size={17} /><span>{error}</span></div>}
            {notice && <div className="ac-editor__message is-success" role="status"><CheckCircle2 size={17} /><span>{notice}</span></div>}

            {mode === 'add' ? (
                <form className="ac-editor__form" onSubmit={addSubject}>
                    <div className="ac-editor__intro">
                        <div className="ac-detail-icon"><BookOpen size={21} /></div>
                        <div>
                            <h3>Add a subject to {course.courseName}</h3>
                            <p>Semester {semester}. The syllabus is extracted and attached when you save.</p>
                        </div>
                    </div>

                    <div className="ac-editor__grid">
                        <label className="ac-editor__field">
                            <span>Subject name <b>*</b></span>
                            <input value={subjectName} onChange={event => setSubjectName(event.target.value)} maxLength={180} placeholder="Enter the official subject name" required />
                        </label>
                        <label className="ac-editor__field">
                            <span>Official subject code <b>*</b></span>
                            <input value={subjectCode} onChange={event => setSubjectCode(event.target.value)} maxLength={40} placeholder="For example, 09CE3102" required />
                            <small>Used to assign the canonical Subject ID.</small>
                        </label>
                        <label className="ac-editor__field">
                            <span>Departmental subject <b>*</b></span>
                            <select value={isDepartmental} onChange={event => setIsDepartmental(event.target.value)}>
                                <option value="false">No — non-departmental</option>
                                <option value="true">Yes — departmental</option>
                            </select>
                        </label>
                    </div>

                    <label className="ac-editor__field ac-editor__file">
                        <span>Syllabus file <b>*</b></span>
                        <span className="ac-editor__file-control">
                            <UploadCloud size={19} />
                            <span><strong>{syllabusFile?.name || 'Choose a syllabus PDF or DOCX'}</strong><small>Text-readable files only · Up to 20 MB</small></span>
                            <input ref={fileInputRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={event => setSyllabusFile(event.target.files?.[0] || null)} />
                        </span>
                    </label>

                    <div className="ac-editor__footer">
                        <span>The backend checks the file, extracts up to 30,000 characters, and saves the text with the subject.</span>
                        <button type="submit" className="ac-btn ac-btn--primary" disabled={busy}>{busy ? 'Adding subject…' : 'Add subject'}</button>
                    </div>
                </form>
            ) : (
                <section className="ac-editor__remove">
                    <div className="ac-editor__intro">
                        <div className="ac-detail-icon is-danger"><Trash2 size={20} /></div>
                        <div>
                            <h3>Remove a subject</h3>
                            <p>Only subjects without exam history, leaderboard results, or published question banks can be removed.</p>
                        </div>
                    </div>
                    {sortedSubjects.length === 0 ? (
                        <div className="ac-empty-state"><BookOpen size={26} /><strong>No subjects in this semester</strong><span>Add the first subject using the Add subject option.</span></div>
                    ) : (
                        <>
                            <label className="ac-editor__field">
                                <span>Choose subject to remove</span>
                                <select value={removeId} onChange={event => {
                                    const nextSubjectId = event.target.value;
                                    setRemoveId(nextSubjectId);
                                    setConfirmRemove(false);
                                    setError('');
                                    onEditorStateChange?.({ mode: 'remove', subjectId: nextSubjectId });
                                }}>
                                    <option value="">Select a subject</option>
                                    {sortedSubjects.map(item => <option key={item.subjectId} value={String(item.subjectId)}>{item.subjectName} · {item.subjectId}</option>)}
                                </select>
                            </label>
                            {selectedForRemoval && (
                                <div className="ac-editor__selected">
                                    <div><strong>{selectedForRemoval.subjectName}</strong><small>Subject ID {selectedForRemoval.subjectId}</small></div>
                                    {!confirmRemove ? (
                                        <button type="button" className="ac-btn ac-btn--danger" disabled={busy} onClick={() => setConfirmRemove(true)}>Remove subject</button>
                                    ) : (
                                        <div className="ac-editor__confirm">
                                            <span>This removes the subject and its attached syllabus record. It cannot be undone.</span>
                                            <button type="button" className="ac-btn ac-btn--secondary" onClick={() => setConfirmRemove(false)} disabled={busy}>Cancel</button>
                                            <button type="button" className="ac-btn ac-btn--danger" onClick={removeSubject} disabled={busy}>{busy ? 'Removing…' : 'Confirm removal'}</button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </section>
            )}
        </div>
    );
}
