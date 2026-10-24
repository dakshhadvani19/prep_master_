import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { examPrompts, domains } from '../data/mockData';
import { findSubjectContext } from '../utils/subjectResolver';
import { universitySyllabus } from '../data/universitySyllabus';
import { pdfSyllabus } from '../data/pdfSyllabus';
import { extractTextFromFile } from '../utils/fileParser';
import { generateQuestionsFromText } from '../utils/geminiQuestions';
import { fetchSyllabus } from '../utils/syllabusStorage';
import predictedSyllabus from '../data/predicted_ai_syllabus.json';
import { Clock, AlertCircle, CheckCircle, ChevronLeft, ArrowRight, ArrowLeft, Upload, Cpu, BookOpen, FileText, X, Loader } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { saveExamHistory } from '../utils/examHistoryStorage';

import { resolveSyllabus, validateSyllabusRecord } from '../utils/syllabusLoader';
import { fitContext, contentToString } from '../utils/contextFitter';
import { stripReviewMetadata, validateExam } from '../utils/examValidation';
import {
    saveExamAttempt,
    updateAttemptAnswers,
    submitExamAttempt,
    saveExamGrade,
} from '../utils/supabaseExam';


// Allocate an exact exam question count across syllabus batches. Largest-remainder
// allocation avoids rounding each batch independently and generating too many/few.
function allocateBatchCounts(batches, totalCount) {
    if (!batches.length) return [];
    const totalWeight = batches.reduce((sum, batch) => sum + Math.max(0, batch.charCount || 0), 0);
    const weights = batches.map(batch => totalWeight > 0 ? Math.max(0, batch.charCount || 0) / totalWeight : 1 / batches.length);
    const exact = weights.map(weight => weight * totalCount);
    const counts = exact.map(Math.floor);
    const remaining = totalCount - counts.reduce((sum, count) => sum + count, 0);
    const order = exact.map((value, index) => ({ index, remainder: value - Math.floor(value) }))
        .sort((a, b) => b.remainder - a.remainder);
    for (let i = 0; i < remaining; i++) counts[order[i % order.length].index]++;
    return counts;
}

export default function ExamPortal() {
    const { subjectId, examType, difficulty } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { currentUser } = useAuth();

    const [examState, setExamState] = useState('intro'); // intro, active, submitted
    const [timeLeft, setTimeLeft] = useState(0);
    const [showWarning, setShowWarning] = useState(false);
    const [switchCount, setSwitchCount] = useState(0);
    const [forceSubmit, setForceSubmit] = useState(false);

    // Upload mode state
    // Default to 'auto' mode if none provided (prevents showing the old mode selection screen)
    const [examMode, setExamMode] = useState(location.state?.examMode || 'auto'); // 'auto' | 'upload'
    const [uploadedFiles, setUploadedFiles] = useState([]);
    const [uploadError, setUploadError] = useState('');
    const [uploadProcessing, setUploadProcessing] = useState(false);
    const [uploadProgress, setUploadProgress] = useState('');
    const [aiQuestions, setAiQuestions] = useState(null); // null = use auto-generated
    const [retryCountdown, setRetryCountdown] = useState(0); // seconds until retry allowed
    const fileInputRef = useRef(null);

    const [autoProcessing, setAutoProcessing] = useState(false);
    const [autoError, setAutoError] = useState('');

    // Supabase attempt tracking
    const [attemptId, setAttemptId] = useState(null);
    const [supabaseError, setSupabaseError] = useState('');

    // Network / connectivity
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [networkWarning, setNetworkWarning] = useState(false);

    // Numeric catalog SubjectIds resolve through the bridge; legacy source IDs still match mockData.
    const subjectContext = findSubjectContext(domains, subjectId);
    const subjectDetail = subjectContext.subject;
    const courseDetail = subjectContext.course;
    const domainDetail = subjectContext.domain;
    const sourceSubjectId = subjectContext.sourceSubjectId || subjectId;

    const examInfo = examPrompts[examType];

    const contextPrefix = domainDetail && courseDetail ? `Academic Context: 
- Domain: ${domainDetail.title}
- Course: ${courseDetail.title}
- Subject: ${subjectDetail.title} (${subjectId})\n\n` : '';

    // Static question counts for the AI (25/30/40 for MCQs; 4/7 for theory).
    // Not shown to the user in pre-exam UI, per request.
    const examCount = examInfo?.type === 'objective' ? 30 : (examType === 'final' ? 13 : 7);

    useEffect(() => {
        if (examInfo) {
            setTimeLeft(examInfo.timeMinutes * 60);
        }
    }, [examInfo]);

    useEffect(() => {
        let timer;
        if (examState === 'active' && timeLeft > 0 && !showWarning) {
            timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
        } else if (timeLeft === 0 && examState === 'active') {
            // Time's up — trigger auto-submit via ActiveExamInterface
            setForceSubmit(true);
        }
        return () => clearInterval(timer);
    }, [examState, timeLeft, showWarning]);

    // Tab/window switch detection — only fires during active exam
    useEffect(() => {
        if (examState !== 'active') return;

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') return; // they left
            // They came back — show warning
            setSwitchCount(prev => prev + 1);
            setShowWarning(true);
        };

        // Right-click during exam — show warning immediately
        const handleContextMenu = () => {
            setSwitchCount(prev => prev + 1);
            setShowWarning(true);
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        document.addEventListener('contextmenu', handleContextMenu);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            document.removeEventListener('contextmenu', handleContextMenu);
        };
    }, [examState]);

    // Network / connectivity handling — preserve answers, warn when offline
    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            setNetworkWarning(false);
        };
        const handleOffline = () => {
            setIsOnline(false);
            setNetworkWarning(true);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Persist answers to Supabase attempt as the student works (idempotent upsert).
    // Only while exam is active and we have an attempt id. Answers live in the
    // ActiveExamInterface component; this effect is a no-op hook kept for
    // future integration — the actual per-answer sync lives inside
    // ActiveExamInterface where `answers` state is defined.
    useEffect(() => {
        // Intentionally minimal: sync handled in ActiveExamInterface.
    }, [examState, attemptId, isOnline]);

    if (!examInfo || !subjectDetail) {
        return <div className="container" style={{ textAlign: 'center', marginTop: '4rem' }}><h2>Exam details not found</h2></div>;
    }

    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h}h ${m}m ${s}s`;
        return `${m}m ${s}s`;
    };

    const startExam = async () => {
        if (examMode === 'auto') {
            setAutoProcessing(true);
            setAutoError('');
            setSupabaseError('');
            try {
                // \u2500\u2500 Syllabus dataset integration \u2500\u2500
                // Resolve the syllabus record from the static dataset by subject code.
                let syllabusRecord = null;
                let syllabusSource = 'none';
                try {
                    const branchName = courseDetail?.title?.replace(/^(B\.Tech|Diploma|BCA|MCA)\s*[-–:]\s*/i, '');
                    const resolved = await resolveSyllabus(sourceSubjectId, {
                        courseOrBranch: branchName,
                        department: domainDetail?.title,
                        subjectName: subjectDetail?.title,
                        preferTheory: true,
                    });
                    if (resolved) {
                        const check = validateSyllabusRecord(resolved.record);
                        if (check.valid) {
                            syllabusRecord = resolved.record;
                            syllabusSource = resolved.entry.path;
                        } else {
                            console.warn('Syllabus record validation failed:', check.reason);
                        }
                    }
                } catch (err) {
                    console.warn('Could not load syllabus from dataset:', err.message);
                }

                if (!syllabusRecord) {
                    throw new Error(
                        'Syllabus content not available for subject "' + sourceSubjectId + '". ' +
                        'Please contact your administrator to upload the subject syllabus.'
                    );
                }

                // \u2500\u2500 Context fitting: scope selection + batching under 6,000-char cap \u2500\u2500
                const { batches, coveragePlan, config } = fitContext(syllabusRecord, examType);

                // Build academic context prefix for the model
                const contextPrefixText = domainDetail && courseDetail
                    ? 'Academic Context:\n- Domain: ' + domainDetail.title + '\n- Course: ' + courseDetail.title + '\n- Subject: ' + subjectDetail.title + ' (' + sourceSubjectId + ')\n- Syllabus: ' + syllabusSource + '\n- Exam: ' + examInfo.title + ' (' + config.type + ', ' + config.totalMarks + ' marks, ' + config.timeMinutes + ' min)\n\n'
                    : '';

                // \u2500\u2500 Generate per batch, combine, validate \u2500\u2500
                const allQuestions = [];
                const chapters = Array.isArray(syllabusRecord.chapters) ? syllabusRecord.chapters : [];
                const MAX_SOURCE_CHARS = 6000;
                const isObj = examInfo.type === 'objective';
                const targetQuestionCount = config.questionCount;
                const batchCounts = allocateBatchCounts(batches, targetQuestionCount);
                // Keep each Groq response small enough to avoid token-limit truncation.
                // This is the key protection against a 30-question prompt returning only ~10.
                const maxQuestionsPerRequest = isObj ? 5 : 3;
                const generationTasks = [];
                let markCursor = 0;
                batches.forEach((batch, batchIndex) => {
                    let remaining = batchCounts[batchIndex];
                    while (remaining > 0) {
                        const count = Math.min(maxQuestionsPerRequest, remaining);
                        const markSequence = isObj ? null : config.markSequence.slice(markCursor, markCursor + count);
                        generationTasks.push({ batch, batchIndex, batchCount: count, markSequence });
                        markCursor += count;
                        remaining -= count;
                    }
                });

                for (const [requestIndex, task] of generationTasks.entries()) {
                    const { batch, batchIndex, batchCount, markSequence } = task;
                    const batchParts = batch.chapterIndices.map((ci) => {
                        const ch = chapters[ci];
                        if (!ch) return '';
                        return 'CHAPTER: ' + (ch.chapter_name || 'Chapter ' + (ci + 1)) + '\n' + contentToString(ch.content) + '\n';
                    });
                    let batchText = contextPrefixText + 'Study Material / Syllabus Chapters:\n\n' + batchParts.join('\n---\n');

                    // Enforce 6,000-char cap explicitly (truncation note is never silent)
                    if (batchText.length > MAX_SOURCE_CHARS) {
                        batchText = batchText.slice(0, MAX_SOURCE_CHARS);
                        batchText += '\n\n[NOTE: SOURCE EXCERPT TRUNCATED. Treat only the visible material as evidence; do not make claims about what omitted text does or does not contain.]';
                    }

                    // generateQuestionsFromText already retries malformed/incomplete responses.
                    // Never substitute generic fallback questions: a failed batch invalidates the exam.
                    try {
                        const batchQuestions = await generateQuestionsFromText({
                            text: batchText,
                            difficulty,
                            count: batchCount,
                            isObjective: isObj,
                            marksForQuestions: markSequence,
                        });
                        if (batchQuestions.length !== batchCount) {
                            throw new Error('Expected ' + batchCount + ' questions from request ' + requestIndex + ', received ' + batchQuestions.length + '.');
                        }
                        allQuestions.push(...batchQuestions);
                    } catch (err) {
                        console.error('Question generation failed for request ' + requestIndex + ' (source batch ' + batchIndex + '):', err.message);
                        throw new Error('Could not generate a complete valid exam. ' + err.message);
                    }
                }

                if (allQuestions.length !== targetQuestionCount) {
                    throw new Error('Generated ' + allQuestions.length + ' questions; this exam requires exactly ' + targetQuestionCount + '. Please retry.');
                }

                // \u2500\u2500 Combined validation against the exam blueprint \u2500\u2500
                // Give questions globally unique IDs (each AI batch starts at ai_q0).
                // Apply the exact theory marking blueprint after combining all batches.
                allQuestions.forEach((question, index) => {
                    question.id = `ai_q${index}`;
                    if (!isObj) question.marks = config.markSequence[index];
                });

                const validation = validateExam(allQuestions, config, coveragePlan);
                if (!validation.valid) {
                    throw new Error('Generated exam failed blueprint validation: ' + validation.errors.join(', '));
                }

                // Keep grading/review metadata server-side; only the display-safe fields go to the UI.
                const studentSafeQuestions = stripReviewMetadata(allQuestions);
                setAiQuestions(studentSafeQuestions);

                // \u2500\u2500 Persist attempt to Supabase \u2500\u2500
                try {
                    const attemptPayload = {
                        subjectCode: sourceSubjectId,
                        subjectName: subjectDetail.title,
                        examType,
                        questions: studentSafeQuestions,
                        totalMarks: config.totalMarks,
                        timeMinutes: config.timeMinutes,
                    };
                    const result = await saveExamAttempt(attemptPayload);
                    if (result.error) {
                        setSupabaseError(result.error);
                    } else if (result.id) {
                        setAttemptId(result.id);
                    }
                } catch (supabaseErr) {
                    setSupabaseError(supabaseErr.message || 'Supabase unavailable');
                }

                setExamState('active');
            } catch (err) {
                if (err.retryAfter) {
                    setRetryCountdown(err.retryAfter + 3);
                } else {
                    setAutoError(err.message);
                }
            } finally {
                setAutoProcessing(false);
            }
        } else {
            // Upload mode — questions come from uploaded files
            setExamState('active');
        }
    };

    // Countdown timer for rate limit cool-down
    useEffect(() => {
        if (retryCountdown <= 0) return;
        const t = setInterval(() => setRetryCountdown(prev => Math.max(0, prev - 1)), 1000);
        return () => clearInterval(t);
    }, [retryCountdown]);
    const handleFiles = (files) => {
        const validExts = ['pdf', 'pptx', 'csv', 'txt'];
        const valid = Array.from(files).filter(f => validExts.includes(f.name.split('.').pop().toLowerCase()));
        const invalid = Array.from(files).filter(f => !validExts.includes(f.name.split('.').pop().toLowerCase()));
        if (invalid.length > 0) {
            setUploadError(`Unsupported file(s): ${invalid.map(f => f.name).join(', ')}. Only PDF, PPTX, CSV, TXT allowed.`);
        } else {
            setUploadError('');
        }
        setUploadedFiles(prev => [...prev, ...valid].slice(0, 3)); // max 3 files
    };

    const removeFile = (idx) => setUploadedFiles(prev => prev.filter((_, i) => i !== idx));

    const processFilesAndStartExam = async () => {
        if (uploadedFiles.length === 0) {
            setUploadError('Please upload at least one file.');
            return;
        }
        setUploadProcessing(true);
        setUploadError('');
        try {
            // Extract text from all files
            const allTexts = [];
            for (const file of uploadedFiles) {
                setUploadProgress(`Extracting text from ${file.name}...`);
                const text = await extractTextFromFile(file);
                allTexts.push(`=== ${file.name} ===\n${text}`);
            }
            const combinedText = allTexts.join('\n\n');
            if (combinedText.trim().length < 100) {
                throw new Error('Not enough text extracted from files. Please check your files have readable text.');
            }
            setUploadProgress('Asking AI to generate questions... (may take up to 60s if rate-limited, please wait)');
            const isObj = examInfo.type === 'objective';
            const examCount = isObj ? 30 : (examType === 'final' ? 13 : 7);
            const theoryMarks = examType === 'final'
                ? [1, 4, 1, 8, 4, 2, 8, 4, 8, 4, 8, 4, 4]
                : [1, 4, 1, 8, 4, 8, 4];

            const questions = await generateQuestionsFromText({
                text: combinedText,
                difficulty,
                count: examCount,
                isObjective: isObj,
                marksForQuestions: isObj ? null : theoryMarks,
            });
            const blueprintQuestions = isObj
                ? questions
                : questions.map((question, index) => ({ ...question, marks: theoryMarks[index] }));
            setAiQuestions(blueprintQuestions);
            setExamState('active');
        } catch (err) {
            if (err.retryAfter) {
                setUploadError('');
                setRetryCountdown(err.retryAfter + 3); // +3s buffer
            } else {
                setUploadError(err.message);
            }
        } finally {
            setUploadProcessing(false);
            setUploadProgress('');
        }
    };

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');

    const submitExam = async (answers, questions) => {
        if (!examInfo || !questions || isSubmitting) return;
        if (!currentUser) {
            navigate('/signup?mode=login', { state: { from: location }, replace: true });
            return;
        }

        try {
            setIsSubmitting(true);
            setSubmitError('');

            let score = null; // Theory responses are not auto-graded.
            let actualTotalMarks = examInfo.totalMarks;

            if (examInfo.type === 'objective') {
                score = 0;
                actualTotalMarks = questions.length; // 1 Mark per question safely
                questions.forEach(q => {
                    if (answers[q.id] !== undefined && answers[q.id] == q.answer) {
                        score += 1;
                    }
                });
            } else {
                // For theory, calculate actual sum of marks defined in questions
                const sum = questions.reduce((acc, current) => acc + (current.marks || 0), 0);
                if (sum > 0) actualTotalMarks = sum;
            }

            const percentage = examInfo.type === 'objective' && actualTotalMarks > 0
                ? Math.round((score / actualTotalMarks) * 100)
                : null;

            // ── Persist to Supabase (idempotent: only in_progress → submitted) ──
            let submitResult = { ok: false, error: null, alreadySubmitted: false };
            if (attemptId) {
                submitResult = await submitExamAttempt(attemptId, score, answers);
                if (submitResult.error && !submitResult.alreadySubmitted) {
                    throw new Error(submitResult.error);
                }
            }

            // Save grade record
            if (attemptId && submitResult.ok && examInfo.type === 'objective') {
                try {
                    await saveExamGrade(attemptId, {
                        score,
                        totalMarks: actualTotalMarks,
                        percentage,
                        grade: percentage >= 80 ? 'Distinction' : percentage >= 60 ? 'First Class' : percentage >= 40 ? 'Second Class' : 'Fail',
                    });
                } catch (gradeErr) {
                    // Grade save is non-fatal; attempt is already recorded
                    console.warn('Grade save failed:', gradeErr.message);
                }
            }

            // Also keep local history for offline fallback / dashboard display
            const questionSnapshot = questions.map(q => ({
                id: q.id,
                text: q.text || "",
                options: q.options || null,
                answer: q.answer !== undefined ? q.answer : null,
                marks: q.marks || null,
            }));

            const sanitizedAnswers = {};
            questions.forEach(q => {
                const val = answers[q.id];
                sanitizedAnswers[q.id] = val !== undefined ? val : "";
            });

            saveExamHistory(currentUser.uid, {
                id: Date.now(),
                date: new Date().toISOString(),
                subjectId: sourceSubjectId || "unknown",
                examType: examType || "unknown",
                difficulty: difficulty || "medium",
                type: examInfo.type,
                score: examInfo.type === 'objective' ? score : null,
                totalMarks: actualTotalMarks,
                questions: questionSnapshot,
                userAnswers: sanitizedAnswers,
            });

            setExamState('submitted');
            navigate('/dashboard', { state: { justSubmitted: true, score, totalMarks: actualTotalMarks } });

        } catch (err) {
            console.error("Submission failed:", err);
            setSubmitError("Failed to submit exam. Please try again — your answers are preserved.");
            setIsSubmitting(false);
        }
    };

    return (
        <div className="container animate-fade-in" style={{ maxWidth: '1000px' }}>

            {/* ── Tab-Switch Warning Modal ── */}
            {showWarning && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9999,
                    background: 'rgba(0,0,0,0.85)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1.5rem',
                    animation: 'fadeIn 0.25s ease',
                }}>
                    <div style={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid rgba(239,68,68,0.35)',
                        borderRadius: 'var(--radius-xl)',
                        padding: '2.5rem 3rem',
                        maxWidth: '480px',
                        width: '100%',
                        textAlign: 'center',
                        boxShadow: '0 0 60px rgba(239,68,68,0.2), 0 25px 50px rgba(0,0,0,0.6)',
                        animation: 'fadeIn 0.35s cubic-bezier(0.34,1.56,0.64,1)',
                    }}>
                        {/* Emoji icon */}
                        <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🎯</div>

                        <h2 style={{
                            fontSize: '1.5rem',
                            fontWeight: 800,
                            marginBottom: '0.75rem',
                            background: 'linear-gradient(135deg,#f97316,#ef4444)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                        }}>
                            {switchCount === 1
                                ? 'Welcome Back!'
                                : switchCount === 2
                                    ? 'Hey, Again?'
                                    : 'Seriously Now…'}
                        </h2>

                        <p style={{
                            color: 'var(--text-secondary)',
                            lineHeight: 1.7,
                            fontSize: '1rem',
                            marginBottom: '0.5rem',
                        }}>
                            {switchCount === 1
                                ? 'Be honest with yourself — don\'t try to find answers on the Internet. Real growth comes from testing what you truly know.'
                                : switchCount === 2
                                    ? 'Switching tabs again won\'t help you learn. Challenge yourself — your future self will thank you!'
                                    : 'Every time you cheat yourself, you miss a chance to grow. Close those other tabs and give this your honest best. 💪'}
                        </p>

                        {switchCount > 1 && (
                            <p style={{ color: 'var(--warning)', fontSize: '0.82rem', marginBottom: '0.25rem', fontWeight: 600 }}>
                                Tab switches detected: {switchCount}
                            </p>
                        )}

                        <button
                            onClick={() => setShowWarning(false)}
                            style={{
                                marginTop: '1.75rem',
                                background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)',
                                color: 'white',
                                padding: '0.875rem 3rem',
                                borderRadius: 'var(--radius-full)',
                                fontWeight: 700,
                                fontSize: '1rem',
                                cursor: 'pointer',
                                border: 'none',
                                transition: 'all 0.2s',
                                boxShadow: '0 8px 20px rgba(59,130,246,0.4)',
                            }}
                            onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 25px rgba(59,130,246,0.55)'; }}
                            onMouseOut={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(59,130,246,0.4)'; }}
                        >
                            Got it, I'll be honest ✓
                        </button>
                    </div>
                </div>
            )}

            {/* ── Network / Connectivity Warning ── */}
            {!isOnline && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    zIndex: 10000,
                    background: 'rgba(239,68,68,0.95)',
                    color: 'white',
                    padding: '0.75rem 1rem',
                    textAlign: 'center',
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                }}>
                    ⚠️ You are offline. Your answers are preserved locally and will sync when you reconnect. Do not close this tab.
                </div>
            )}

            {!isOnline && networkWarning && (
                <div style={{
                    position: 'fixed',
                    top: 60,
                    left: 0,
                    right: 0,
                    zIndex: 9999,
                    background: 'rgba(251,191,36,0.95)',
                    color: '#713f12',
                    padding: '0.75rem 1rem',
                    textAlign: 'center',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                }}>
                    Reconnecting… your answers are safe. You can resume when the connection returns.
                </div>
            )}



            {/* ── STEP 2: File Upload UI ── */}
            {examState === 'intro' && examMode === 'upload' && (
                <div className="glass-panel" style={{ padding: '2.5rem', marginTop: '2rem', maxWidth: '680px', margin: '2rem auto 0' }}>
                    <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.9rem' }}>
                        <ChevronLeft size={16} /> Back to Subject
                    </button>

                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                            <Upload size={30} color="#8b5cf6" />
                        </div>
                        <h2 style={{ fontSize: '1.6rem', marginBottom: '0.5rem' }}>Upload Study Material</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>AI will read your files and generate a <strong style={{ color: 'var(--text-primary)' }}>Dynamic Set</strong> of questions at <strong style={{ color: 'var(--text-primary)', textTransform: 'capitalize' }}>{difficulty}</strong> difficulty.</p>
                    </div>

                    {/* Drag & Drop Zone */}
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#8b5cf6'; e.currentTarget.style.background = 'rgba(139,92,246,0.08)'; }}
                        onDragLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                        onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'var(--bg-tertiary)'; handleFiles(e.dataTransfer.files); }}
                        style={{
                            border: '2px dashed rgba(255,255,255,0.1)', borderRadius: 'var(--radius-lg)',
                            background: 'var(--bg-tertiary)', padding: '2.5rem',
                            textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s',
                            marginBottom: '1.25rem',
                        }}
                    >
                        <BookOpen size={36} color="var(--text-tertiary)" style={{ margin: '0 auto 1rem', display: 'block' }} />
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 500 }}>Drag & drop files here, or click to browse</p>
                        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>Supported: PDF, PPTX, CSV, TXT &bull; Max 10 MB per file &bull; Up to 3 files</p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,.pptx,.csv,.txt"
                            multiple
                            style={{ display: 'none' }}
                            onChange={e => handleFiles(e.target.files)}
                        />
                    </div>

                    {/* Uploaded Files List */}
                    {uploadedFiles.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
                            {uploadedFiles.map((file, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 'var(--radius-md)' }}>
                                    <FileText size={18} color="#8b5cf6" style={{ flexShrink: 0 }} />
                                    <span style={{ flex: 1, fontSize: '0.9rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', flexShrink: 0 }}>{(file.size / 1024).toFixed(0)} KB</span>
                                    <button onClick={() => removeFile(idx)} style={{ color: 'var(--danger)', cursor: 'pointer', display: 'flex', flexShrink: 0 }}><X size={16} /></button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Error */}
                    {uploadError && (
                        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-md)', padding: '0.875rem 1rem', color: '#fca5a5', fontSize: '0.875rem', marginBottom: '1.25rem', display: 'flex', gap: '0.5rem' }}>
                            <AlertCircle size={17} style={{ flexShrink: 0, marginTop: '1px' }} /> {uploadError}
                        </div>
                    )}

                    {/* Processing State */}
                    {uploadProcessing && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#8b5cf6', padding: '0.875rem 1rem', background: 'rgba(139,92,246,0.08)', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
                            <Loader size={18} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} /> {uploadProgress || 'Processing...'}
                        </div>
                    )}

                    {/* Rate-limit countdown banner */}
                    {retryCountdown > 0 && (
                        <div style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 'var(--radius-md)', padding: '0.875rem 1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#fbbf24', fontSize: '0.9rem', fontWeight: 500 }}>
                            <Loader size={17} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                            AI rate limit cooling down — button re-enables in <strong style={{ fontVariantNumeric: 'tabular-nums' }}>&nbsp;{retryCountdown}s</strong>
                        </div>
                    )}


                    <button
                        onClick={processFilesAndStartExam}
                        disabled={uploadProcessing || uploadedFiles.length === 0 || retryCountdown > 0}
                        style={{
                            width: '100%', padding: '1rem', borderRadius: 'var(--radius-full)',
                            background: (uploadProcessing || uploadedFiles.length === 0 || retryCountdown > 0) ? 'var(--bg-tertiary)' : 'linear-gradient(135deg,#8b5cf6,#3b82f6)',
                            color: (uploadProcessing || uploadedFiles.length === 0 || retryCountdown > 0) ? 'var(--text-tertiary)' : 'white',
                            fontWeight: 700, fontSize: '1rem', cursor: (uploadProcessing || uploadedFiles.length === 0 || retryCountdown > 0) ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
                        }}
                    >
                        {uploadProcessing
                            ? <><Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> Generating Questions...</>
                            : retryCountdown > 0
                                ? <><Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> Retry in {retryCountdown}s...</>
                                : <><Cpu size={18} /> Generate Questions &amp; Start Exam</>}
                    </button>

                    <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                </div>
            )}

            {/* ── STEP 3: Exam Intro (Auto mode) ── */}
            {examState === 'intro' && examMode === 'auto' && (
                <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', marginTop: '2rem' }}>
                    <button
                        onClick={() => navigate(-1)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.9rem' }}
                    >
                        <ChevronLeft size={16} /> Back
                    </button>

                    <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>{examInfo.title}</h1>
                    <h2 style={{ fontSize: '1.25rem', color: 'var(--accent-primary)', marginBottom: '2rem' }}>{subjectDetail.title}</h2>

                    <div style={{ display: 'flex', justifyContent: 'center', gap: '3rem', margin: '2rem 0 3rem 0' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                            <Clock size={32} color="var(--text-secondary)" />
                            <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{examInfo.timeMinutes} Minutes</div>
                            <div style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>Duration</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                            <CheckCircle size={32} color="var(--success)" />
                            <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>
                                {examInfo.type === 'objective' ? `Dynamic Set` : `${examInfo.totalMarks} Marks`}
                            </div>
                            <div style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>
                                {examInfo.type === 'objective' ? 'Total Questions' : 'Total Score'}
                            </div>
                        </div>
                    </div>

                    <div style={{ background: 'var(--bg-tertiary)', padding: '1.5rem', borderRadius: 'var(--radius-md)', textAlign: 'left', marginBottom: '3rem' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                            <AlertCircle size={20} color="var(--warning)" /> Instructions
                        </h3>
                        <ul style={{ color: 'var(--text-secondary)', paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <li>Ensure you have a stable internet connection before starting.</li>
                            <li>Once started, the timer cannot be paused.</li>
                            <li>{examInfo.type === 'objective' ? 'Select the best possible answer for each question.' : 'Provide detailed and well-structured answers.'}</li>
                            <li>Do not refresh the page or you risk losing your progress.</li>
                        </ul>
                    </div>

                    {autoError && (
                        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-md)', padding: '0.875rem 1rem', color: '#fca5a5', fontSize: '0.875rem', marginBottom: '1.25rem', display: 'flex', gap: '0.5rem', textAlign: 'left' }}>
                            <AlertCircle size={17} style={{ flexShrink: 0, marginTop: '1px' }} /> {autoError}
                        </div>
                    )}

                    {retryCountdown > 0 && (
                        <div style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 'var(--radius-md)', padding: '0.875rem 1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#fbbf24', fontSize: '0.9rem', fontWeight: 500, textAlign: 'left' }}>
                            <Loader size={17} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                            AI rate limit cooling down — Please wait <strong style={{ fontVariantNumeric: 'tabular-nums' }}>&nbsp;{retryCountdown}s</strong> before generating your live exam.
                        </div>
                    )}


                    <button
                        onClick={startExam}
                        disabled={autoProcessing || retryCountdown > 0}
                        style={{
                            width: '100%',
                            background: (autoProcessing || retryCountdown > 0) ? 'var(--bg-tertiary)' : 'var(--accent-gradient)',
                            color: (autoProcessing || retryCountdown > 0) ? 'var(--text-tertiary)' : 'white',
                            padding: '1rem 3rem',
                            borderRadius: 'var(--radius-full)',
                            fontSize: '1.1rem',
                            fontWeight: 600,
                            boxShadow: (autoProcessing || retryCountdown > 0) ? 'none' : 'var(--shadow-glow)',
                            cursor: (autoProcessing || retryCountdown > 0) ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
                        }}
                    >
                        {autoProcessing
                                ? <><Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> Building Live AI Exam...</>
                                : retryCountdown > 0
                                    ? <><Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> Retry in {retryCountdown}s...</>
                                    : <><Cpu size={18} /> I am Ready, Generate Live AI Exam</>}
                    </button>
                    <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                </div>
            )}

            {examState === 'active' && (
                <ActiveExamInterface
                    examType={examType}
                    examInfo={examInfo}
                    subjectId={sourceSubjectId}
                    difficulty={difficulty || 'medium'}
                    timeLeft={timeLeft}
                    formatTime={formatTime}
                    onSubmit={submitExam}
                    aiQuestions={aiQuestions}
                    isSubmitting={isSubmitting}
                    submitError={submitError}
                    forceSubmit={forceSubmit}
                    attemptId={attemptId}
                />
            )}

            {examState === 'submitted' && (
                <div className="glass-panel" style={{ padding: '4rem 2rem', textAlign: 'center', marginTop: '4rem' }}>
                    <div style={{
                        animation: 'fadeIn 0.6s ease-out both',
                        width: '80px',
                        height: '80px',
                        borderRadius: '50%',
                        background: 'rgba(16, 185, 129, 0.1)',
                        color: 'var(--success)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 2rem auto'
                    }}>
                        <CheckCircle size={48} />
                    </div>
                    <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>Exam Submitted Successfully</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: '500px', margin: '0 auto 1.5rem auto' }}>
                        Your responses for {subjectDetail.title} ({examInfo.title}) have been recorded.
                    </p>

                    {examInfo.type === 'objective' && (
                        <div style={{
                            background: 'var(--bg-tertiary)',
                            padding: '1.5rem',
                            borderRadius: 'var(--radius-md)',
                            display: 'inline-block',
                            marginBottom: '3rem'
                        }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
                                Auto-Grade Score: {examState.score !== undefined ? examState.score : '--'} / {examCount}
                            </div>
                        </div>
                    )}

                    <button
                        onClick={() => navigate('/dashboard')}
                        style={{
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--glass-border)',
                            color: 'var(--text-primary)',
                            padding: '0.75rem 2rem',
                            borderRadius: 'var(--radius-full)',
                            fontWeight: 500,
                            cursor: 'pointer'
                        }}
                    >
                        Return to Dashboard
                    </button>
                </div>
            )}
        </div>
    );
}

function ActiveExamInterface({ examType, examInfo, subjectId, difficulty, timeLeft, formatTime, onSubmit, aiQuestions, isSubmitting, submitError, forceSubmit, attemptId }) {
    // Determine objective vs subjective purely based on the original examType mode.
    const isObjective = examInfo.type === 'objective';
    const [currentQ, setCurrentQ] = useState(0);
    const [answers, setAnswers] = useState({});

    const [questions] = useState(() => Array.isArray(aiQuestions) ? aiQuestions : []);

    // Periodic answer sync to Supabase (idempotent upsert, preserves answers on network interruption)
    useEffect(() => {
        if (!attemptId) return;
        const timer = setTimeout(async () => {
            try {
                const { updateAttemptAnswers } = await import('../utils/supabaseExam');
                await updateAttemptAnswers(attemptId, answers);
            } catch {
                // Supabase unavailable or offline — answers remain in React state
            }
        }, 3000);
        return () => clearTimeout(timer);
    }, [attemptId, answers]);

    // Auto-submit when timer expires (forceSubmit set by parent)
    useEffect(() => {
        if (forceSubmit && !isSubmitting) {
            onSubmit(answers, questions);
        }
    }, [forceSubmit]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!questions.length) {
        return (
            <div className="container" style={{ textAlign: 'center', marginTop: '4rem' }}>
                <h2>Validated question set unavailable</h2>
                <p>The exam cannot start with template-only questions. Return to setup and generate the question set again.</p>
            </div>
        );
    }

    const q = questions[currentQ];

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem', marginTop: '1rem' }}>

            {/* Top Bar */}
            <div className="glass-panel" style={{
                padding: '0.875rem 1.25rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                position: 'sticky',
                top: '64px',
                zIndex: 40,
                gap: '0.75rem',
                flexWrap: 'wrap',
            }}>
                <div style={{ fontWeight: 600 }}>{examInfo.title}</div>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    color: timeLeft < 300 ? 'var(--danger)' : 'var(--accent-primary)',
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums'
                }}>
                    <Clock size={20} />
                    {formatTime(timeLeft)}
                </div>
                <button
                    onClick={() => onSubmit(answers, questions)}
                    disabled={isSubmitting}
                    style={{
                        background: isSubmitting ? 'var(--bg-tertiary)' : 'var(--success)',
                        color: isSubmitting ? 'var(--text-tertiary)' : 'white',
                        padding: '0.5rem 1.5rem',
                        borderRadius: 'var(--radius-full)',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        cursor: isSubmitting ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}
                >
                    {isSubmitting ? (
                        <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Submitting...</>
                    ) : (
                        'Submit Exam'
                    )}
                </button>
            </div>

            {submitError && (
                <div style={{
                    gridColumn: '1 / -1',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem 1rem',
                    color: '#fca5a5',
                    fontSize: '0.875rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '1rem'
                }}>
                    <AlertCircle size={18} /> {submitError}
                </div>
            )}

            {/* Main Content */}
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>

                {/* Navigation Sidebar */}
                <div className="glass-panel" style={{ width: '100%', maxWidth: '250px', minWidth: '200px', padding: '1.25rem', maxHeight: 'calc(100vh - 150px)', overflowY: 'auto', flex: '0 0 auto' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>Questions Palette</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                        {questions.map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => setCurrentQ(idx)}
                                style={{
                                    aspectRatio: '1',
                                    borderRadius: 'var(--radius-sm)',
                                    background: currentQ === idx ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                                    color: currentQ === idx ? 'white' : 'var(--text-primary)',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    border: currentQ === idx ? 'none' : '1px solid var(--border-color)',
                                    fontSize: '0.85rem'
                                }}
                            >
                                {idx + 1}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Question Area */}
                <div className="glass-panel" style={{ flex: 1, padding: '2.5rem', minHeight: '500px', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
                        <h2 style={{ fontSize: '1.5rem' }}>Question {currentQ + 1} of {questions.length}</h2>
                        {!isObjective && <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>[{q.marks} Marks]</span>}
                    </div>

                    <div style={{ fontSize: '1.1rem', marginBottom: '2.5rem', lineHeight: 1.6 }}>
                        {q.text}
                    </div>

                    {/* Answer Area */}
                    <div style={{ flex: 1 }}>
                        {isObjective ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {q.options.map((opt, i) => (
                                    <label key={i} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '1rem',
                                        padding: '1.25rem',
                                        background: 'var(--bg-tertiary)',
                                        border: `1px solid ${answers[q.id] === i ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                                        borderRadius: 'var(--radius-md)',
                                        cursor: 'pointer',
                                        transition: 'border-color var(--transition-fast)'
                                    }}>
                                        <input
                                            type="radio"
                                            name={`q${q.id}`}
                                            value={i}
                                            checked={answers[q.id] === i}
                                            onChange={() => setAnswers(prev => ({ ...prev, [q.id]: i }))}
                                            style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }}
                                        />
                                        <span style={{ fontSize: '1.05rem' }}>{opt}</span>
                                    </label>
                                ))}
                            </div>
                        ) : (
                            <textarea
                                value={answers[q.id] || ''}
                                onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                placeholder="Type your comprehensive answer here..."
                                style={{
                                    width: '100%',
                                    height: '300px',
                                    background: 'var(--bg-tertiary)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: 'var(--radius-md)',
                                    color: 'var(--text-primary)',
                                    padding: '1.5rem',
                                    fontSize: '1rem',
                                    fontFamily: 'inherit',
                                    resize: 'vertical',
                                    outline: 'none'
                                }}
                            />
                        )}
                    </div>

                    {/* Bottom Actions */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3rem', paddingTop: '2rem', borderTop: '1px solid var(--glass-border)' }}>
                        <button
                            onClick={() => setCurrentQ(prev => Math.max(0, prev - 1))}
                            disabled={currentQ === 0}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.75rem 1.5rem',
                                background: 'var(--bg-tertiary)',
                                borderRadius: 'var(--radius-full)',
                                opacity: currentQ === 0 ? 0.5 : 1,
                                cursor: currentQ === 0 ? 'not-allowed' : 'pointer',
                                color: 'var(--text-primary)'
                            }}
                        >
                            <ArrowLeft size={18} /> Previous
                        </button>
                        <button
                            onClick={() => setCurrentQ(prev => Math.min(questions.length - 1, prev + 1))}
                            disabled={currentQ === questions.length - 1}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.75rem 1.5rem',
                                background: 'var(--accent-primary)',
                                color: 'white',
                                borderRadius: 'var(--radius-full)',
                                opacity: currentQ === questions.length - 1 ? 0.5 : 1,
                                cursor: currentQ === questions.length - 1 ? 'not-allowed' : 'pointer'
                            }}
                        >
                            Next <ArrowRight size={18} />
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}