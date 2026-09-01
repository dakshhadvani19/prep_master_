import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { domains } from '../data/mockData';
import { uploadSyllabusPDF, listAllSyllabuses, deleteSyllabus } from '../utils/syllabusStorage';
import { Upload, Trash2, CheckCircle, AlertCircle, Loader, BookOpen, Search } from 'lucide-react';

// Flatten all subjects into a lookup: subjectId → { subjectTitle, courseId, courseTitle, domainTitle }
function buildSubjectMap() {
    const map = {};
    domains.forEach(domain => {
        domain.courses.forEach(course => {
            course.subjects.forEach(subject => {
                map[subject.id] = {
                    subjectId: subject.id,
                    subjectTitle: subject.title,
                    courseId: course.id,
                    courseTitle: course.title,
                    domainTitle: domain.title,
                    sem: subject.sem,
                };
            });
        });
    });
    return map;
}

export default function SyllabusAdmin() {
    const { currentUser, isAdmin, authLoading } = useAuth();
    const navigate = useNavigate();
    const fileInputRef = useRef(null);

    const [uploaded, setUploaded] = useState([]); // list from Firestore
    const [loadingList, setLoadingList] = useState(true);

    // Upload form state
    const [search, setSearch] = useState('');
    const [selectedSubject, setSelectedSubject] = useState(null); // from subjectMap
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState('');
    const [uploadError, setUploadError] = useState('');
    const [uploadSuccess, setUploadSuccess] = useState('');

    const [deletingId, setDeletingId] = useState(null);

    const subjectMap = buildSubjectMap();

    // Only redirect once auth check is fully complete
    useEffect(() => {
        if (!authLoading && !isAdmin) {
            navigate('/', { replace: true });
        }
    }, [authLoading, isAdmin, navigate]);

    useEffect(() => {
        if (authLoading || !isAdmin) return;
        loadList();
    }, [authLoading, isAdmin]);

    async function loadList() {
        setLoadingList(true);
        try {
            const data = await listAllSyllabuses();
            setUploaded(data.sort((a, b) => b.uploadedAt?.localeCompare(a.uploadedAt)));
        } catch (e) {
            console.error('Failed to load syllabuses', e);
        } finally {
            setLoadingList(false);
        }
    }

    // Build filtered subject list for the search dropdown
    const allSubjects = Object.values(subjectMap);
    const filteredSubjects = search.trim().length > 1
        ? allSubjects.filter(s =>
            s.subjectTitle.toLowerCase().includes(search.toLowerCase()) ||
            s.courseTitle.toLowerCase().includes(search.toLowerCase()) ||
            s.subjectId.toLowerCase().includes(search.toLowerCase())
        ).slice(0, 20)
        : [];

    // Set containing courseId__subjectId for already-uploaded subjects
    const uploadedSet = new Set(uploaded.map(u => `${u.courseId}__${u.subjectId}`));

    async function handleUpload() {
        if (!selectedSubject) { setUploadError('Select a subject first.'); return; }
        if (!file) { setUploadError('Choose a PDF file.'); return; }
        if (!file.name.endsWith('.pdf')) { setUploadError('Only PDF files are supported.'); return; }

        setUploading(true);
        setUploadError('');
        setUploadSuccess('');

        try {
            await uploadSyllabusPDF({
                file,
                subjectId: selectedSubject.subjectId,
                courseId: selectedSubject.courseId,
                subjectTitle: selectedSubject.subjectTitle,
                courseTitle: selectedSubject.courseTitle,
                uploaderUid: currentUser.uid,
                onProgress: setUploadProgress,
            });
            setUploadSuccess(`Syllabus for "${selectedSubject.subjectTitle}" uploaded successfully!`);
            setSelectedSubject(null);
            setFile(null);
            setSearch('');
            if (fileInputRef.current) fileInputRef.current.value = '';
            await loadList();
        } catch (e) {
            setUploadError(e.message || 'Upload failed. Try again.');
        } finally {
            setUploading(false);
            setUploadProgress('');
        }
    }

    async function handleDelete(item) {
        const key = `${item.courseId}__${item.subjectId}`;
        if (!window.confirm(`Delete syllabus for "${item.subjectTitle}" (${item.courseTitle})? This cannot be undone.`)) return;
        setDeletingId(key);
        try {
            await deleteSyllabus(item.subjectId, item.courseId, item.pdfStoragePath);
            await loadList();
        } catch (e) {
            alert('Delete failed: ' + e.message);
        } finally {
            setDeletingId(null);
        }
    }

    if (authLoading) return (
        <div style={{ textAlign: 'center', padding: '6rem' }}>
            <Loader size={28} className="spin" />
        </div>
    );

    if (!isAdmin) return null;

    return (
        <div className="container" style={{ maxWidth: '900px', padding: '2rem 1.5rem' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                Syllabus Admin
            </h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem' }}>
                Upload PDF syllabuses for subjects. When a user generates an exam, these PDFs are used as the topic source.
            </p>

            {/* Upload Form */}
            <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Upload size={18} /> Upload New Syllabus
                </h2>

                {/* Subject search */}
                <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.4rem', fontSize: '0.9rem' }}>
                    Search Subject
                </label>
                <div style={{ position: 'relative', marginBottom: '1rem' }}>
                    <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input
                        type="text"
                        value={selectedSubject ? `${selectedSubject.subjectTitle} — ${selectedSubject.courseTitle}` : search}
                        onChange={e => { setSearch(e.target.value); setSelectedSubject(null); }}
                        onFocus={() => { if (selectedSubject) { setSearch(''); setSelectedSubject(null); } }}
                        placeholder="Type subject name, course, or ID..."
                        style={{
                            width: '100%', padding: '0.6rem 0.75rem 0.6rem 2.25rem',
                            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                            borderRadius: 'var(--radius)', color: 'var(--text-primary)',
                            fontSize: '0.95rem', boxSizing: 'border-box',
                        }}
                    />
                    {filteredSubjects.length > 0 && !selectedSubject && (
                        <div style={{
                            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                            background: 'var(--bg-primary)', border: '1px solid var(--border)',
                            borderRadius: 'var(--radius)', maxHeight: '240px', overflowY: 'auto',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                        }}>
                            {filteredSubjects.map(s => {
                                const alreadyUploaded = uploadedSet.has(`${s.courseId}__${s.subjectId}`);
                                return (
                                    <div
                                        key={`${s.courseId}__${s.subjectId}`}
                                        onClick={() => { setSelectedSubject(s); setSearch(''); }}
                                        style={{
                                            padding: '0.6rem 1rem', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            borderBottom: '1px solid var(--border)',
                                            transition: 'background 0.15s',
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <div>
                                            <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{s.subjectTitle}</div>
                                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                                {s.courseTitle} · Sem {s.sem} · {s.subjectId}
                                            </div>
                                        </div>
                                        {alreadyUploaded && (
                                            <span style={{ fontSize: '0.75rem', color: '#22c55e', fontWeight: 600, marginLeft: '0.5rem', whiteSpace: 'nowrap' }}>
                                                ✓ Uploaded
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* File picker */}
                <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.4rem', fontSize: '0.9rem' }}>
                    PDF File
                </label>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={e => setFile(e.target.files[0] || null)}
                    style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}
                />

                {uploadError && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f87171', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                        <AlertCircle size={16} /> {uploadError}
                    </div>
                )}
                {uploadSuccess && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#22c55e', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                        <CheckCircle size={16} /> {uploadSuccess}
                    </div>
                )}
                {uploading && uploadProgress && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                        <Loader size={16} className="spin" /> {uploadProgress}
                    </div>
                )}

                <button
                    onClick={handleUpload}
                    disabled={uploading || !selectedSubject || !file}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                        background: 'var(--accent-gradient)', color: 'white',
                        padding: '0.6rem 1.5rem', borderRadius: 'var(--radius-full)',
                        fontWeight: 600, fontSize: '0.9rem', border: 'none', cursor: 'pointer',
                        opacity: (uploading || !selectedSubject || !file) ? 0.5 : 1,
                    }}
                >
                    {uploading ? <><Loader size={15} className="spin" /> Uploading...</> : <><Upload size={15} /> Upload Syllabus</>}
                </button>
            </div>

            {/* Uploaded List */}
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <BookOpen size={18} /> Uploaded Syllabuses ({uploaded.length})
            </h2>

            {loadingList ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                    <Loader size={24} className="spin" />
                </div>
            ) : uploaded.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
                    No syllabuses uploaded yet.
                </p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {uploaded.map(item => {
                        const key = `${item.courseId}__${item.subjectId}`;
                        const isDeleting = deletingId === key;
                        return (
                            <div key={key} className="glass-card" style={{
                                padding: '1rem 1.25rem',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
                            }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{item.subjectTitle}</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                                        {item.courseTitle} · ID: {item.subjectId}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                                        {item.pdfFileName} · {new Date(item.uploadedAt).toLocaleDateString()}
                                        {' · '}
                                        <span style={{ color: '#22c55e' }}>
                                            {Math.round(item.extractedText?.length / 1000)}k chars extracted
                                        </span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    {item.pdfURL && (
                                        <a
                                            href={item.pdfURL}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{
                                                fontSize: '0.8rem', color: 'var(--accent-primary)',
                                                textDecoration: 'none', whiteSpace: 'nowrap',
                                            }}
                                        >
                                            View PDF
                                        </a>
                                    )}
                                    <button
                                        onClick={() => handleDelete(item)}
                                        disabled={isDeleting}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                                            background: 'rgba(239,68,68,0.15)', color: '#f87171',
                                            border: '1px solid rgba(239,68,68,0.3)',
                                            padding: '0.35rem 0.75rem', borderRadius: 'var(--radius)',
                                            fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                                            opacity: isDeleting ? 0.5 : 1,
                                        }}
                                    >
                                        {isDeleting ? <Loader size={13} className="spin" /> : <Trash2 size={13} />}
                                        {isDeleting ? 'Deleting...' : 'Delete'}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
