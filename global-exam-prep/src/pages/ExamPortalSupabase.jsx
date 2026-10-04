import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
    AlertCircle, ArrowLeft, ArrowRight, CheckCircle, ChevronLeft,
    Clock, Cpu, FileText, Loader, Upload
} from 'lucide-react';
import { examPrompts, domains } from '../data/mockData';
import { findSubjectContext } from '../utils/subjectResolver';
import { generateExamQuestions } from '../data/questionGenerator';
import { universitySyllabus } from '../data/universitySyllabus';
import { pdfSyllabus } from '../data/pdfSyllabus';
import { extractTextFromFile } from '../utils/fileParser';
import { generateQuestionsFromText } from '../utils/geminiQuestions';
import { fetchSyllabus } from '../utils/syllabusStorage';
import predictedSyllabus from '../data/predicted_ai_syllabus.json';
import { useAuth } from '../context/AuthContext';
import { requireSupabase } from '../supabase';

const MAX_UPLOADS = 3;
const VALID_EXTENSIONS = ['pdf', 'pptx', 'csv', 'txt'];

export default function ExamPortal() {
    const { subjectId, examType, difficulty = 'medium' } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { currentUser } = useAuth();

    const context = findSubjectContext(domains, subjectId);
    const subjectDetail = context.subject;
    const courseDetail = context.course;
    const domainDetail = context.domain;
    const sourceSubjectId = context.sourceSubjectId || subjectId;
    const examInfo = examPrompts[examType];

    const [examState, setExamState] = useState('intro');
    const [questions, setQuestions] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const [answers, setAnswers] = useState({});
    const [currentQ, setCurrentQ] = useState(0);
    const [examMode] = useState(location.state?.examMode || 'auto');

    const [processing, setProcessing] = useState(false);
    const [progress, setProgress] = useState('');
    const [error, setError] = useState('');
    const [retryCountdown, setRetryCountdown] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [score, setScore] = useState(null);

    const [uploadedFiles, setUploadedFiles] = useState([]);
    const fileInputRef = useRef(null);

    const [switchCount, setSwitchCount] = useState(0);
    const [showWarning, setShowWarning] = useState(false);

    const examCount = examInfo?.type === 'objective'
        ? (difficulty === 'hard' ? 40 : difficulty === 'medium' ? 30 : 25)
        : (examType === 'final' ? 7 : 4);

    useEffect(() => {
        if (examInfo) setTimeLeft(examInfo.timeMinutes * 60);
    }, [examInfo]);

    useEffect(() => {
        if (retryCountdown <= 0) return undefined;
        const timer = setInterval(() => {
            setRetryCountdown(value => Math.max(0, value - 1));
        }, 1000);
        return () => clearInterval(timer);
    }, [retryCountdown]);

    useEffect(() => {
        if (examState !== 'active') return undefined;

        if (timeLeft <= 0) {
            handleSubmit();
            return undefined;
        }

        const timer = setInterval(() => setTimeLeft(value => value - 1), 1000);
        return () => clearInterval(timer);
    }, [examState, timeLeft]);

    useEffect(() => {
        if (examState !== 'active') return undefined;

        const onVisibility = () => {
            if (document.visibilityState === 'visible') {
                setSwitchCount(value => value + 1);
                setShowWarning(true);
            }
        };
        const onContextMenu = event => {
            event.preventDefault();
            setSwitchCount(value => value + 1);
            setShowWarning(true);
        };

        document.addEventListener('visibilitychange', onVisibility);
        document.addEventListener('contextmenu', onContextMenu);
        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            document.removeEventListener('contextmenu', onContextMenu);
        };
    }, [examState]);

    if (!examInfo || !subjectDetail) {
        return (
            <div className="container" style={{ textAlign: 'center', marginTop: '4rem' }}>
                <h2>Exam details not found</h2>
            </div>
        );
    }

    const contextPrefix = domainDetail && courseDetail
        ? `Academic Context:
- Domain: ${domainDetail.title}
- Course: ${courseDetail.title}
- Subject: ${subjectDetail.title} (${subjectId})

`
        : '';

    const formatTime = seconds => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
    };

    const buildAutoExam = async () => {
        setProcessing(true);
        setError('');
        try {
            const syllabus = universitySyllabus[sourceSubjectId];
            let syllabusText = contextPrefix;

            if (pdfSyllabus[sourceSubjectId]) {
                syllabusText += `Provided Study Material/Syllabus content:
${pdfSyllabus[sourceSubjectId]}`;
            } else {
                const stored = await fetchSyllabus(sourceSubjectId, courseDetail?.id);
                if (stored?.extractedText) {
                    syllabusText += `Provided Study Material/Syllabus content:
${stored.extractedText}`;
                } else if (syllabus) {
                    syllabusText += 'Syllabus Breakdown:\n';
                    syllabus.chapters.forEach(chapter => {
                        syllabusText += `Chapter: ${chapter.title}\nConcepts: ${chapter.concepts.join(', ')}\n\n`;
                    });
                } else if (predictedSyllabus?.[sourceSubjectId]) {
                    const predicted = predictedSyllabus[sourceSubjectId];
                    syllabusText += `You MUST base the generated questions strictly on the following specific topics for this subject (Aligned with ${predicted.aiPromptContext}):
${predicted.topics.map(topic => `- ${topic}`).join('\n')}`;
                } else {
                    syllabusText += 'Generate questions comprehensively covering the standard university curriculum for this subject. Keep every question relevant to the specified academic level.';
                }
            }

            const generated = await generateQuestionsFromText({
                text: syllabusText,
                difficulty,
                count: examCount,
                isObjective: examInfo.type === 'objective',
            });

            setQuestions(generated);
            setTimeLeft(examInfo.timeMinutes * 60);
            setExamState('active');
        } catch (err) {
            if (err.retryAfter) {
                setRetryCountdown(err.retryAfter + 3);
                setError('');
            } else {
                setError(err.message || 'Could not generate the exam.');
            }
        } finally {
            setProcessing(false);
        }
    };

    const handleFiles = files => {
        const valid = Array.from(files).filter(file =>
            VALID_EXTENSIONS.includes(file.name.split('.').pop().toLowerCase())
        );
        const invalid = Array.from(files).filter(file =>
            !VALID_EXTENSIONS.includes(file.name.split('.').pop().toLowerCase())
        );

        setError(
            invalid.length
                ? `Unsupported file(s): ${invalid.map(file => file.name).join(', ')}. Only PDF, PPTX, CSV and TXT are allowed.`
                : ''
        );
        setUploadedFiles(previous => [...previous, ...valid].slice(0, MAX_UPLOADS));
    };

    const buildUploadExam = async () => {
        if (!uploadedFiles.length) {
            setError('Please upload at least one file.');
            return;
        }

        setProcessing(true);
        setError('');
        try {
            const texts = [];
            for (const file of uploadedFiles) {
                setProgress(`Extracting text from ${file.name}...`);
                const text = await extractTextFromFile(file);
                texts.push(`=== ${file.name} ===\n${text}`);
            }

            const combinedText = texts.join('\n\n');
            if (combinedText.trim().length < 100) {
                throw new Error('Not enough readable text was extracted from the uploaded files.');
            }

            setProgress('Asking AI to generate questions...');
            const generated = await generateQuestionsFromText({
                text: combinedText,
                difficulty,
                count: examCount,
                isObjective: examInfo.type === 'objective',
            });

            setQuestions(generated);
            setTimeLeft(examInfo.timeMinutes * 60);
            setExamState('active');
        } catch (err) {
            if (err.retryAfter) {
                setRetryCountdown(err.retryAfter + 3);
            } else {
                setError(err.message || 'Could not generate the exam.');
            }
        } finally {
            setProcessing(false);
            setProgress('');
        }
    };

    async function handleSubmit() {
        if (!questions?.length || submitting) return;

        if (!currentUser) {
            navigate('/signup?mode=login', { state: { from: location }, replace: true });
            return;
        }

        setSubmitting(true);
        setError('');

        try {
            let earned = 0;
            let totalMarks = examInfo.totalMarks;

            if (examInfo.type === 'objective') {
                totalMarks = questions.length;
                questions.forEach(question => {
                    if (answers[question.id] !== undefined && answers[question.id] == question.answer) {
                        earned += 1;
                    }
                });
            } else {
                const calculated = questions.reduce((sum, question) => sum + (question.marks || 0), 0);
                if (calculated > 0) totalMarks = calculated;
            }

            const questionSnapshot = questions.map(question => ({
                id: question.id,
                text: question.text || '',
                options: question.options || null,
                answer: question.answer !== undefined ? question.answer : null,
                marks: question.marks || null,
            }));

            const sanitizedAnswers = {};
            questions.forEach(question => {
                sanitizedAnswers[question.id] = answers[question.id] !== undefined ? answers[question.id] : '';
            });

            const record = {
                id: Date.now(),
                auth_uid: currentUser.uid,
                date: new Date().toISOString(),
                subject_id: String(sourceSubjectId || 'unknown'),
                exam_type: String(examType || 'unknown'),
                difficulty: String(difficulty || 'medium'),
                type: examInfo.type,
                score: examInfo.type === 'objective' ? earned : null,
                total_marks: totalMarks,
                questions: questionSnapshot,
                user_answers: sanitizedAnswers,
            };

            const { error: saveError } = await requireSupabase()
                .from('exam_history')
                .insert(record);

            if (saveError) throw saveError;

            setScore(earned);
            setExamState('submitted');
            setSubmitting(false);

            // Navigate immediately after the database confirms the write.
            navigate('/dashboard', { state: { justSubmitted: true }, replace: true });
        } catch (err) {
            console.error('Submission failed:', err);
            setError('Failed to save exam results. Please check your connection and try again.');
            setSubmitting(false);
        }
    }

    if (examState === 'intro') {
        return (
            <div className="container animate-fade-in" style={{ maxWidth: '850px', paddingTop: '2rem' }}>
                <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                    <ChevronLeft size={16} /> Back
                </button>

                <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center' }}>
                    <h1 style={{ fontSize: '2.2rem', marginBottom: '0.75rem' }}>{examInfo.title}</h1>
                    <h2 style={{ fontSize: '1.15rem', color: 'var(--accent-primary)', marginBottom: '2rem' }}>{subjectDetail.title}</h2>

                    <div style={{ display: 'flex', justifyContent: 'center', gap: '3rem', marginBottom: '2rem' }}>
                        <div><Clock size={28} /><div>{examInfo.timeMinutes} Minutes</div></div>
                        <div><CheckCircle size={28} /><div>{examInfo.type === 'objective' ? 'Dynamic Set' : `${examInfo.totalMarks} Marks`}</div></div>
                    </div>

                    {examMode === 'upload' && (
                        <div style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>
                                <FileText size={16} style={{ verticalAlign: 'middle' }} /> Study Material
                            </label>
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                accept=".pdf,.pptx,.csv,.txt"
                                onChange={event => handleFiles(event.target.files)}
                            />
                            {uploadedFiles.length > 0 && (
                                <ul>
                                    {uploadedFiles.map((file, index) => (
                                        <li key={`${file.name}-${index}`}>
                                            {file.name}
                                            <button onClick={() => setUploadedFiles(files => files.filter((_, i) => i !== index))}>Remove</button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {error && (
                        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-md)', padding: '0.8rem', marginBottom: '1rem', color: '#fca5a5', textAlign: 'left' }}>
                            <AlertCircle size={16} style={{ verticalAlign: 'middle' }} /> {error}
                        </div>
                    )}

                    {progress && (
                        <div style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                            <Loader size={16} className="spin" /> {progress}
                        </div>
                    )}

                    {retryCountdown > 0 && (
                        <div style={{ color: 'var(--warning)', marginBottom: '1rem' }}>
                            AI rate limit cooldown: {retryCountdown}s
                        </div>
                    )}

                    <button
                        onClick={examMode === 'upload' ? buildUploadExam : buildAutoExam}
                        disabled={processing || retryCountdown > 0}
                        style={{
                            width: '100%',
                            background: processing ? 'var(--bg-tertiary)' : 'var(--accent-gradient)',
                            color: 'white',
                            padding: '1rem 2rem',
                            borderRadius: 'var(--radius-full)',
                            fontWeight: 700,
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '0.5rem',
                            cursor: processing ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {processing
                            ? <><Loader size={18} className="spin" /> Generating...</>
                            : examMode === 'upload'
                                ? <><Upload size={18} /> Generate From Material</>
                                : <><Cpu size={18} /> Generate Live AI Exam</>}
                    </button>
                </div>
            </div>
        );
    }

    if (examState === 'submitted') {
        return (
            <div className="container animate-fade-in" style={{ maxWidth: '700px', textAlign: 'center', marginTop: '4rem' }}>
                <div className="glass-panel" style={{ padding: '4rem 2rem' }}>
                    <CheckCircle size={64} color="var(--success)" style={{ marginBottom: '1rem' }} />
                    <h1>Exam Submitted Successfully</h1>
                    {examInfo.type === 'objective' && <p>Score: {score} / {questions?.length}</p>}
                    <button onClick={() => navigate('/dashboard')} style={{ marginTop: '1.5rem' }}>
                        Return to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    const question = questions?.[currentQ];
    if (!question) return null;

    return (
        <div className="container animate-fade-in" style={{ maxWidth: '1100px', paddingTop: '1rem' }}>
            {showWarning && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
                }}>
                    <div className="glass-panel" style={{ maxWidth: '480px', padding: '2.5rem', textAlign: 'center' }}>
                        <AlertCircle size={48} color="var(--warning)" />
                        <h2>Stay on the exam</h2>
                        <p>Tab switches detected: {switchCount}. Continue without leaving the exam.</p>
                        <button onClick={() => setShowWarning(false)}>Continue</button>
                    </div>
                </div>
            )}

            <div className="glass-panel" style={{ padding: '0.9rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', position: 'sticky', top: '64px', zIndex: 40 }}>
                <strong>{examInfo.title}</strong>
                <span style={{ color: timeLeft < 300 ? 'var(--danger)' : 'var(--accent-primary)', fontWeight: 700 }}>
                    <Clock size={18} style={{ verticalAlign: 'middle' }} /> {formatTime(timeLeft)}
                </span>
                <button onClick={handleSubmit} disabled={submitting}>
                    {submitting ? 'Submitting...' : 'Submit Exam'}
                </button>
            </div>

            {error && (
                <div style={{ marginTop: '1rem', color: '#fca5a5' }}>
                    <AlertCircle size={16} style={{ verticalAlign: 'middle' }} /> {error}
                </div>
            )}

            <div className="glass-panel" style={{ marginTop: '1.5rem', padding: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                    <h2>Question {currentQ + 1} of {questions.length}</h2>
                    {!examInfo.type || examInfo.type === 'subjective' ? <span>[{question.marks} Marks]</span> : null}
                </div>

                <div style={{ fontSize: '1.1rem', lineHeight: 1.7, marginBottom: '2rem' }}>
                    {question.text}
                </div>

                {examInfo.type === 'objective' ? (
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                        {question.options.map((option, index) => (
                            <label key={index} style={{
                                display: 'flex', gap: '0.75rem', alignItems: 'center',
                                padding: '1rem', border: `1px solid ${answers[question.id] === index ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                                borderRadius: 'var(--radius-md)', cursor: 'pointer'
                            }}>
                                <input
                                    type="radio"
                                    name={`question-${question.id}`}
                                    checked={answers[question.id] === index}
                                    onChange={() => setAnswers(previous => ({ ...previous, [question.id]: index }))}
                                />
                                {option}
                            </label>
                        ))}
                    </div>
                ) : (
                    <textarea
                        value={answers[question.id] || ''}
                        onChange={event => setAnswers(previous => ({ ...previous, [question.id]: event.target.value }))}
                        placeholder="Type your answer here..."
                        style={{ width: '100%', minHeight: '300px', padding: '1rem' }}
                    />
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem' }}>
                    <button onClick={() => setCurrentQ(value => Math.max(0, value - 1))} disabled={currentQ === 0}>
                        <ArrowLeft size={16} /> Previous
                    </button>
                    <button onClick={() => setCurrentQ(value => Math.min(questions.length - 1, value + 1))} disabled={currentQ === questions.length - 1}>
                        Next <ArrowRight size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
