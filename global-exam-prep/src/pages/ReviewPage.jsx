import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle, XCircle, MinusCircle, BarChart2, BookOpen, Loader, AlertCircle, RefreshCw } from 'lucide-react';
import { domains } from '../data/mockData';
import { examPrompts } from '../data/examPrompts';
import { findSubjectContext } from '../utils/subjectResolver';
import {
    filterReviewQuestionIndices,
    getReviewOptionState,
    getReviewStatus,
} from '../utils/reviewAnswerStatus';
import { useAuth } from '../context/AuthContext';
import { getExamAttemptReview, getTestRoomAttemptReview, evaluateExamAttempt } from '../utils/supabaseExam';
import AttemptSourceBadge from '../components/AttemptSourceBadge';

function withEvaluationResult(record, result) {
    if (!record || !result) return record;
    if (result.status === 'completed' && result.result) {
        return {
            ...record, evaluationStatus: 'completed', evaluationError: '', evaluationResult: result.result,
            score: Number(result.result.totalAwardedMarks), totalMarks: Number(result.result.totalPossibleMarks),
        };
    }
    if (result.status === 'failed') {
        return { ...record, evaluationStatus: 'failed', evaluationError: result.error || 'The automated marker could not complete this attempt.' };
    }
    return { ...record, evaluationStatus: result.status || 'evaluating' };
}
async function waitForTheoryEvaluation(attemptId, initialRecord, isCancelled) {
    let current = initialRecord;
    for (let index = 0; index < 30; index += 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (isCancelled()) return current;
        const latest = await getExamAttemptReview(attemptId);
        if (latest.record) current = latest.record;
        if (['completed', 'failed', 'unavailable'].includes(current?.evaluationStatus)) return current;
    }
    return current;
}

function ModelAnswerContent({ answer, format }) {
    const lines = String(answer || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (format === 'comparison') {
        const rows = lines.filter(line => line.startsWith('|')).map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
        const dataRows = rows.filter(row => !row.every(cell => /^:?-{3,}:?$/.test(cell)));
        if (dataRows.length >= 2) {
            const [header, ...body] = dataRows;
            return (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.96rem', lineHeight: 1.55 }}>
                        <thead><tr>{header.map((cell, index) => <th key={index} style={{ padding: '0.8rem', textAlign: 'left', color: 'var(--text-primary)', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--glass-border)' }}>{cell}</th>)}</tr></thead>
                        <tbody>{body.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index} style={{ padding: '0.8rem', verticalAlign: 'top', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>{cell}</td>)}</tr>)}</tbody>
                    </table>
                </div>
            );
        }
    }
    const points = lines.map(line => line.replace(/^(?:\d+[.)]|[-*•])\s*/, '').trim()).filter(Boolean);
    const isPointList = points.length > 1 && lines.every(line => /^(?:\d+[.)]|[-*•])\s+/.test(line));
    if (isPointList) {
        return <ol style={{ margin: 0, paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.55rem', color: 'var(--text-secondary)', fontSize: '0.98rem', lineHeight: 1.65 }}>{points.map((point, index) => <li key={index} style={{ paddingLeft: '0.3rem' }}>{point}</li>)}</ol>;
    }
    return <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', fontSize: '0.98rem', lineHeight: 1.7 }}>{answer}</div>;
}

function RubricStatus({ status }) {
    const config = status === 'met'
        ? { label: 'Met', color: 'var(--success)', background: 'rgba(16,185,129,0.12)' }
        : status === 'partial'
            ? { label: 'Partial', color: 'var(--warning)', background: 'rgba(245,158,11,0.12)' }
            : { label: 'Not met', color: 'var(--danger)', background: 'rgba(239,68,68,0.10)' };
    return <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0.25rem 0.65rem', borderRadius: 'var(--radius-full)', background: config.background, color: config.color, fontSize: '0.82rem', fontWeight: 700 }}>{config.label}</span>;
}
export default function ReviewPage() {
    const { historyId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const requestedAttemptType = new URLSearchParams(location.search).get('attemptType');
    const [currentQ, setCurrentQ] = useState(0);
    const [activeFilter, setActiveFilter] = useState(null);
    const [record, setRecord] = useState(null);
    const [loadingRecord, setLoadingRecord] = useState(true);
    const [evaluationLoading, setEvaluationLoading] = useState(false);
    const [evaluationError, setEvaluationError] = useState('');
    const { currentUser } = useAuth();

    // Reviews load only from owner-authenticated durable attempt APIs.
    useEffect(() => {
        let cancelled=false;
        async function loadRecord(){
            setCurrentQ(0);setActiveFilter(null);setLoadingRecord(true);setEvaluationLoading(false);setEvaluationError('');
            if(!currentUser?.uid){setRecord(null);setLoadingRecord(false);return;}
            try{
                let savedReview=null;
                if(requestedAttemptType==='test_room')savedReview=(await getTestRoomAttemptReview(historyId)).record;
                else if(requestedAttemptType==='exam')savedReview=(await getExamAttemptReview(historyId)).record;
                else{
                    const [examResult,roomResult]=await Promise.all([getExamAttemptReview(historyId),getTestRoomAttemptReview(historyId)]);
                    savedReview=examResult.record||roomResult.record;
                }
                if(!savedReview){if(!cancelled)setRecord(null);return;}
                let current=savedReview;
                if(savedReview.type==='theory' && ['pending','evaluating'].includes(savedReview.evaluationStatus)){
                    if(!cancelled)setEvaluationLoading(true);
                    if(['pending','evaluating'].includes(savedReview.evaluationStatus)){
                        const result=await evaluateExamAttempt(historyId);
                        current=withEvaluationResult(current,result);
                    }
                    if(current.evaluationStatus==='evaluating' || current.evaluationStatus==='pending'){
                        current=await waitForTheoryEvaluation(historyId,current,()=>cancelled);
                    }
                }
                if(!cancelled){
                    setRecord(current);
                    setEvaluationError(current.evaluationStatus==='failed' ? current.evaluationError || 'The automated marker could not complete this attempt.' : '');
                }
            }finally{if(!cancelled){setLoadingRecord(false);setEvaluationLoading(false);}}
        }
        loadRecord().catch(error=>{
            console.error('[review] Failed to load persisted answer review:',error);
            if(!cancelled){setRecord(null);setLoadingRecord(false);}
        });
        return ()=>{cancelled=true;};
    },[currentUser?.uid,historyId,requestedAttemptType]);

    // Summary stats - MUST be above conditional returns to satisfy React Hook rules
    const stats = useMemo(() => {
        if (!record || !Array.isArray(record.questions)) {
            return { correct: 0, wrong: 0, unattempted: 0, attempted: 0 };
        }

        const userAnswers = record.userAnswers || {};
        const isObjective = record.type === 'objective';
        const counts = { correct: 0, wrong: 0, unattempted: 0, attemptedWithoutKey: 0 };

        record.questions.forEach((question) => {
            const status = getReviewStatus(question, userAnswers, isObjective);
            if (status === 'correct' || status === 'wrong' || status === 'unattempted') counts[status] += 1;
            else if (status === 'attempted') counts.attemptedWithoutKey += 1;
        });

        return {
            correct: counts.correct,
            wrong: counts.wrong,
            unattempted: counts.unattempted,
            attempted: counts.correct + counts.wrong + counts.attemptedWithoutKey,
        };
    }, [record]);

    const visibleQuestionIndices = useMemo(() => (
        filterReviewQuestionIndices(
            record?.questions,
            record?.userAnswers || {},
            record?.type === 'objective',
            activeFilter,
        )
    ), [record, activeFilter]);

    const retryEvaluation = async () => {
        setEvaluationLoading(true);
        setEvaluationError('');
        try {
            let updated = record;
            const result = await evaluateExamAttempt(historyId);
            updated = withEvaluationResult(updated, result);
            if (updated?.evaluationStatus === 'evaluating' || updated?.evaluationStatus === 'pending') {
                updated = await waitForTheoryEvaluation(historyId, updated, () => false);
            }
            setRecord(updated);
            setEvaluationError(updated?.evaluationStatus === 'failed' ? updated.evaluationError || 'The automated marker could not complete this attempt.' : '');
        } catch (error) {
            setEvaluationError(error.message || 'The evaluation could not be retried.');
        } finally {
            setEvaluationLoading(false);
        }
    };

    if (loadingRecord) {
        return (
            <div className="container animate-fade-in" style={{ maxWidth: '700px', textAlign: 'center', marginTop: '5rem' }}>
                <Loader size={36} color="var(--accent-primary)" style={{ margin: '0 auto 1rem auto', display: 'block', animation: 'spin 1s linear infinite' }} />
                <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>{evaluationLoading ? 'Evaluating your answers against the marking rubric...' : 'Loading review...'}</p>
            </div>
        );
    }

    if (!record || !record.questions) {
        return (
            <div className="container animate-fade-in" style={{ maxWidth: '700px', textAlign: 'center', marginTop: '5rem' }}>
                <BookOpen size={48} style={{ color: 'var(--text-secondary)', margin: '0 auto 1.5rem auto', display: 'block' }} />
                <h2 style={{ marginBottom: '1rem' }}>Review Not Available</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                    This saved attempt could not be found, is not finalized, or its answer review is unavailable.
                </p>
                <button
                    onClick={() => navigate('/dashboard')}
                    style={{
                        background: 'var(--accent-gradient)',
                        color: 'white',
                        padding: '0.75rem 2rem',
                        borderRadius: 'var(--radius-full)',
                        fontWeight: 600,
                        cursor: 'pointer',
                    }}
                >
                    Back to Dashboard
                </button>
            </div>
        );
    }
    if (record.type === 'theory' && record.evaluationStatus !== 'completed') {
        const isFailed = record.evaluationStatus === 'failed';
        const unavailable = record.evaluationStatus === 'unavailable';
        return (
            <div className='container animate-fade-in' style={{ maxWidth: '760px', marginTop: '4rem' }}>
                <div className='glass-panel' style={{ padding: '2.5rem', textAlign: 'center' }}>
                    {isFailed || unavailable ? (
                        <AlertCircle size={42} color={isFailed ? 'var(--danger)' : 'var(--text-secondary)'} style={{ margin: '0 auto 1rem auto' }} />
                    ) : (
                        <Loader size={42} color='var(--accent-primary)' style={{ margin: '0 auto 1rem auto', animation: 'spin 1s linear infinite' }} />
                    )}
                    <h2 style={{ fontSize: '1.45rem', marginBottom: '0.7rem' }}>
                        {unavailable ? 'Marking rubric unavailable' : isFailed ? 'Evaluation could not be completed' : 'Evaluating your answers'}
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.65, maxWidth: '580px', margin: '0 auto 1.5rem' }}>
                        {unavailable
                            ? 'This attempt does not contain a complete saved marking rubric, so an accurate rubric-based review cannot be produced.'
                            : isFailed
                                ? evaluationError || record.evaluationError || 'The automated marker could not complete this attempt. You can retry the evaluation.'
                                : 'Your submitted answers are being checked against each question’s saved marking criteria. The review will open when all rubric marks have been verified.'}
                    </p>
                    {isFailed && (
                        <button type='button' onClick={retryEvaluation} disabled={evaluationLoading} style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.55rem',
                            padding: '0.75rem 1.35rem', borderRadius: 'var(--radius-full)',
                            background: 'var(--accent-primary)', color: 'white', fontSize: '0.95rem', fontWeight: 700,
                            opacity: evaluationLoading ? 0.65 : 1, cursor: evaluationLoading ? 'wait' : 'pointer',
                        }}>
                            {evaluationLoading ? <Loader size={17} /> : <RefreshCw size={17} />}
                            {evaluationLoading ? 'Retrying evaluation...' : 'Retry evaluation'}
                        </button>
                    )}
                    {!isFailed && !unavailable && (
                        <div role='status' aria-live='polite' style={{ color: 'var(--text-tertiary)', fontSize: '0.88rem' }}>
                            {record.evaluationStatus === 'evaluating' ? 'Evaluation is in progress.' : 'Preparing the evaluation request.'}
                        </div>
                    )}
                    <button type='button' onClick={() => navigate('/dashboard')} style={{
                        display: 'block', margin: '1.5rem auto 0', color: 'var(--text-secondary)',
                        fontSize: '0.9rem', textDecoration: 'underline',
                    }}>Back to Performance History</button>
                </div>
            </div>
        );
    }

    if (record.type === 'theory' && record.evaluationStatus !== 'completed') {
        const failed = record.evaluationStatus === 'failed';
        const unavailable = record.evaluationStatus === 'unavailable';
        return (
            <div className='container animate-fade-in' style={{ maxWidth: '760px', marginTop: '4rem' }}>
                <div className='glass-panel' style={{ padding: '2.5rem', textAlign: 'center' }}>
                    {failed || unavailable ? <AlertCircle size={42} color={failed ? 'var(--danger)' : 'var(--text-secondary)'} style={{ margin: '0 auto 1rem' }} /> : <Loader size={42} color='var(--accent-primary)' style={{ margin: '0 auto 1rem', animation: 'spin 1s linear infinite' }} />}
                    <h2 style={{ fontSize: '1.45rem', marginBottom: '0.7rem' }}>
                        {unavailable ? 'Marking rubric unavailable' : failed ? 'Evaluation could not be completed' : 'Evaluating your answers'}
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.65, maxWidth: '580px', margin: '0 auto 1.5rem' }}>
                        {unavailable
                            ? 'This attempt does not contain a complete saved marking rubric, so a reliable rubric-based review cannot be produced.'
                            : failed
                                ? evaluationError || record.evaluationError || 'The automated marker could not complete this attempt. You can retry the evaluation.'
                                : 'Your submitted answers are being checked against the saved marking criteria. The review will open when the marks and explanations are ready.'}
                    </p>
                    {failed && (
                        <button type='button' onClick={retryEvaluation} disabled={evaluationLoading} style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.55rem', padding: '0.75rem 1.35rem',
                            borderRadius: 'var(--radius-full)', background: 'var(--accent-primary)', color: 'white',
                            fontSize: '0.95rem', fontWeight: 700, opacity: evaluationLoading ? 0.65 : 1,
                            cursor: evaluationLoading ? 'wait' : 'pointer',
                        }}>
                            {evaluationLoading ? <Loader size={17} /> : <RefreshCw size={17} />}
                            {evaluationLoading ? 'Retrying evaluation...' : 'Retry evaluation'}
                        </button>
                    )}
                    {!failed && !unavailable && <div role='status' aria-live='polite' style={{ color: 'var(--text-tertiary)', fontSize: '0.88rem' }}>Evaluation status: {record.evaluationStatus || 'pending'}</div>}
                    <button type='button' onClick={() => navigate('/dashboard')} style={{ display: 'block', margin: '1.5rem auto 0', color: 'var(--text-secondary)', fontSize: '0.9rem', textDecoration: 'underline' }}>Back to Performance History</button>
                </div>
            </div>
        );
    }
    const questions = record.questions;
    const userAnswers = record.userAnswers || {};
    const isObjective = record.type === 'objective';
    const examInfo = examPrompts[record.examType];

    // Get subject name
    const getSubjectName = (subjectId) => (
        findSubjectContext(domains, subjectId).subject?.title
        || (subjectId && !/^unknown$/i.test(String(subjectId)) ? String(subjectId) : 'Unknown Subject')
    );

    // Per-question status helpers
    const getStatus = (question) => getReviewStatus(question, userAnswers, isObjective);

    const displayQuestionIndex = visibleQuestionIndices.includes(currentQ)
        ? currentQ
        : (visibleQuestionIndices[0] ?? -1);
    const currentVisiblePosition = visibleQuestionIndices.indexOf(displayQuestionIndex);
    const q = displayQuestionIndex >= 0 ? questions[displayQuestionIndex] : null;
    const qStatus = q ? getStatus(q) : 'unattempted';
    const userAnswer = q ? userAnswers[q.id] : undefined;
    const evaluationResult = record.evaluationResult || null;
    const questionEvaluation = !isObjective && q
        ? evaluationResult?.questions?.find(item => item.questionId === q.id)
        : null;

    function applyQuestionFilter(filter) {
        const nextFilter = filter === 'all' ? null : filter;
        setActiveFilter(nextFilter);
        const nextIndices = filterReviewQuestionIndices(
            questions,
            userAnswers,
            isObjective,
            nextFilter,
        );
        setCurrentQ(nextIndices[0] ?? 0);
    }

    // Color mapping
    const statusColors = {
        correct: { bg: 'rgba(16,185,129,0.15)', border: 'var(--success)', text: 'var(--success)' },
        wrong: { bg: 'rgba(239,68,68,0.15)', border: 'var(--danger)', text: 'var(--danger)' },
        unattempted: { bg: 'rgba(107,114,128,0.1)', border: 'rgba(255,255,255,0.1)', text: 'var(--text-tertiary)' },
        attempted: { bg: 'rgba(59,130,246,0.15)', border: 'var(--accent-primary)', text: 'var(--accent-primary)' },
    };

    const resolvedSubjectName = record.subjectName && !/^unknown subject$/i.test(record.subjectName)
        ? record.subjectName
        : getSubjectName(record.subjectId);

    return (
        <div className="container animate-fade-in" style={{ maxWidth: '1100px' }}>
            {/* Back Button */}
            <button
                onClick={() => navigate('/dashboard')}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem', cursor: 'pointer' }}
            >
                <ArrowLeft size={16} /> Back to Performance History
            </button>

            {/* Header */}
            <div className="glass-panel" style={{ padding: '1.5rem 2rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <h1 style={{ fontSize: '1.6rem', marginBottom: '0.25rem' }}>{resolvedSubjectName}</h1>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            {record.examTitle || examInfo?.title || record.examType} &bull; <span style={{ textTransform: 'capitalize' }}>{record.difficulty}</span> &bull; {new Date(record.date).toLocaleDateString()}
                            {record.attemptType === 'test_room' && <> &bull; {String(record.status || '').replaceAll('_', ' ')}</>}
                        </p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                        <AttemptSourceBadge attemptType={record.attemptType} />
                        {!isObjective && record.evaluationResult && (
                            <div style={{ background: 'var(--bg-tertiary)', padding: '0.75rem 1.25rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--glass-border)', textAlign: 'right' }}>
                                <div style={{ fontSize: '1.7rem', fontWeight: 800, color: 'var(--accent-primary)', fontVariantNumeric: 'tabular-nums' }}>
                                    {record.evaluationResult.totalAwardedMarks}<span style={{ fontSize: '1rem', color: 'var(--text-secondary)', fontWeight: 400 }}> / {record.evaluationResult.totalPossibleMarks}M</span>
                                </div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI-assisted score</div>
                            </div>
                        )}
                        {!isObjective && !record.evaluationResult && examInfo?.totalMarks > 0 && (
                            <span style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem' }}>
                                {examInfo.totalMarks}M Total
                            </span>
                        )}
                        {isObjective && record.score !== null && <div style={{ background: 'var(--bg-tertiary)', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--glass-border)', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-primary)' }}>{record.score}<span style={{ fontSize: '1rem', color: 'var(--text-secondary)', fontWeight: 400 }}> / {record.totalMarks}M</span></div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Final Score</div>
                        </div>}
                    </div>
                </div>
            </div>

            {!isObjective && evaluationResult && (
                <section className='glass-panel' aria-label='Overall theory evaluation' style={{ padding: '1.5rem 1.8rem', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                        <div>
                            <h2 style={{ fontSize: '1.18rem', marginBottom: '0.3rem' }}>AI-assisted rubric evaluation</h2>
                            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>Marks are awarded against the saved criteria for each question.</p>
                        </div>
                        <span style={{ color: 'var(--success)', fontWeight: 700, fontSize: '0.9rem' }}>Evaluation complete</span>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.7, marginBottom: '1rem' }}>{evaluationResult.overallFeedback}</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                        {evaluationResult.strengths?.length > 0 && (
                            <div style={{ padding: '1rem', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 'var(--radius-md)' }}>
                                <h3 style={{ fontSize: '0.92rem', color: 'var(--success)', marginBottom: '0.55rem' }}>What you did well</h3>
                                <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)', fontSize: '0.94rem', lineHeight: 1.6 }}>{evaluationResult.strengths.map((item, index) => <li key={index} style={{ marginBottom: '0.25rem' }}>{item}</li>)}</ul>
                            </div>
                        )}
                        {evaluationResult.improvementAreas?.length > 0 && (
                            <div style={{ padding: '1rem', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 'var(--radius-md)' }}>
                                <h3 style={{ fontSize: '0.92rem', color: 'var(--warning)', marginBottom: '0.55rem' }}>What to improve</h3>
                                <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)', fontSize: '0.94rem', lineHeight: 1.6 }}>{evaluationResult.improvementAreas.map((item, index) => <li key={index} style={{ marginBottom: '0.25rem' }}>{item}</li>)}</ul>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* Stats Bar */}
            {isObjective && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                    {[
                        { filter: 'all', label: 'Total Questions', value: questions.length, icon: BarChart2, color: 'var(--accent-primary)', bg: 'rgba(59,130,246,0.1)' },
                        { filter: 'attempted', label: 'Attempted', value: stats.attempted, icon: CheckCircle, color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
                        { filter: 'correct', label: 'Correct', value: stats.correct, icon: CheckCircle, color: 'var(--success)', bg: 'rgba(16,185,129,0.1)' },
                        { filter: 'wrong', label: 'Wrong', value: stats.wrong, icon: XCircle, color: 'var(--danger)', bg: 'rgba(239,68,68,0.1)' },
                        { filter: 'unattempted', label: 'Unattempted', value: stats.unattempted, icon: MinusCircle, color: 'var(--text-tertiary)', bg: 'rgba(107,114,128,0.1)' },
                    ].map(({ filter, label, value, icon: Icon, color, bg }) => {
                        void Icon; // ESLint's no-unused-vars rule does not count JSX-only references.
                        const selected = filter === 'all' ? activeFilter === null : activeFilter === filter;
                        const disabled = filter === 'all' && activeFilter === null;
                        return (
                            <button
                                key={label}
                                type="button"
                                className="glass-panel"
                                aria-pressed={selected}
                                disabled={disabled}
                                onClick={() => applyQuestionFilter(filter)}
                                style={{
                                    padding: '1.25rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '1rem',
                                    textAlign: 'left',
                                    cursor: disabled ? 'default' : 'pointer',
                                    border: selected ? `1px solid ${color}` : '1px solid var(--glass-border)',
                                    background: selected ? bg : 'var(--bg-secondary)',
                                    opacity: disabled ? 0.8 : 1,
                                    transition: 'border-color 0.15s ease, background-color 0.15s ease',
                                }}
                            >
                                <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Icon size={20} color={color} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Main Review Area */}
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>

                {/* Question Palette */}
                <div className="glass-panel" style={{ width: '100%', maxWidth: '240px', minWidth: '200px', padding: '1.25rem', flex: '0 0 auto' }}>
                    <h3 style={{ fontSize: '0.95rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>Question Palette</h3>
                    {activeFilter && (
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginBottom: '0.75rem', textTransform: 'capitalize' }}>
                            {activeFilter} · {visibleQuestionIndices.length} questions
                        </p>
                    )}
                    {isObjective && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
                            {[
                                { label: '● Correct', color: 'var(--success)' },
                                { label: '● Wrong', color: 'var(--danger)' },
                                { label: '● Unattempted', color: 'var(--text-tertiary)' },
                            ].map(({ label, color }) => (
                                <div key={label} style={{ fontSize: '0.76rem', color, fontWeight: 500 }}>{label}</div>
                            ))}
                        </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
                        {visibleQuestionIndices.map((questionIndex) => {
                            const question = questions[questionIndex];
                            const s = getStatus(question);
                            const c = statusColors[s];
                            return (
                                <button
                                    key={question.id ?? questionIndex}
                                    aria-label={`Question ${questionIndex + 1} - ${s}`}
                                    aria-current={displayQuestionIndex === questionIndex ? 'true' : undefined}
                                    onClick={() => setCurrentQ(questionIndex)}
                                    style={{
                                        aspectRatio: '1',
                                        borderRadius: 'var(--radius-sm)',
                                        background: c.bg,
                                        color: c.text,
                                        fontWeight: 700,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        border: `2px solid ${c.border}`,
                                        fontSize: '0.8rem',
                                        outline: displayQuestionIndex === questionIndex ? `2px solid ${c.border}` : 'none',
                                        outlineOffset: '2px',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                    }}
                                >
                                    {questionIndex + 1}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Question Detail */}
                <div className="glass-panel" style={{ flex: 1, padding: '2rem', minWidth: '280px', display: 'flex', flexDirection: 'column' }}>
                    {!q ? (
                        <div role="status" style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            No questions match this filter.
                        </div>
                    ) : (<>
                    {/* Q Number + Status */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <h2 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                            Question {displayQuestionIndex + 1} of {questions.length}
                        </h2>
                        {!isObjective && q?.marks != null && (
                            <span style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem' }}>
                                {q.marks}M
                            </span>
                        )}
                        {isObjective && (
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                padding: '0.35rem 0.85rem',
                                borderRadius: 'var(--radius-full)',
                                fontSize: '0.8rem', fontWeight: 700,
                                background: statusColors[qStatus].bg,
                                color: statusColors[qStatus].text,
                                border: `1px solid ${statusColors[qStatus].border}`,
                                textTransform: 'capitalize',
                            }}>
                                {qStatus === 'correct' && <CheckCircle size={14} />}
                                {qStatus === 'wrong' && <XCircle size={14} />}
                                {qStatus === 'unattempted' && <MinusCircle size={14} />}
                                {qStatus}
                            </span>
                        )}
                    </div>

                    {/* Question Text */}
                    <div style={{
                        fontSize: '1.05rem', lineHeight: 1.7, marginBottom: '2rem',
                        padding: '1.25rem', background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)',
                        color: 'var(--text-primary)',
                    }}>
                        {q.text}
                    </div>

                    {/* MCQ Options */}
                    {isObjective && q.options && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
                            {q.options.map((opt, idx) => {
                                const { isCorrect, isUserChoice, isWrongChoice } = getReviewOptionState(idx, q.answer, userAnswer);

                                let bg = 'var(--bg-tertiary)';
                                let border = 'var(--glass-border)';
                                let textColor = 'var(--text-primary)';
                                let icon = null;

                                if (isCorrect) {
                                    bg = 'rgba(16,185,129,0.12)';
                                    border = 'var(--success)';
                                    textColor = 'var(--success)';
                                    icon = <CheckCircle size={18} color="var(--success)" style={{ flexShrink: 0 }} />;
                                } else if (isWrongChoice) {
                                    bg = 'rgba(239,68,68,0.12)';
                                    border = 'var(--danger)';
                                    textColor = 'var(--danger)';
                                    icon = <XCircle size={18} color="var(--danger)" style={{ flexShrink: 0 }} />;
                                }

                                return (
                                    <div key={idx} style={{
                                        display: 'flex', alignItems: 'center', gap: '1rem',
                                        padding: '1rem 1.25rem',
                                        background: bg,
                                        border: `1px solid ${border}`,
                                        borderRadius: 'var(--radius-md)',
                                        color: textColor,
                                        fontWeight: isCorrect || isUserChoice ? 600 : 400,
                                        transition: 'all 0.2s',
                                    }}>
                                        <span style={{
                                            width: 28, height: 28, borderRadius: '50%',
                                            background: isCorrect ? 'rgba(16,185,129,0.2)' : isWrongChoice ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
                                            border: `1px solid ${border}`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '0.8rem', fontWeight: 700, flexShrink: 0,
                                        }}>
                                            {String.fromCharCode(65 + idx)}
                                        </span>
                                        <span style={{ flex: 1, fontSize: '0.95rem' }}>{opt}</span>
                                        {icon}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Subjective — show user's written answer */}
                    {!isObjective && (
                        <div style={{ marginBottom: '2rem' }}>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Answer</div>
                            <div style={{
                                padding: '1.25rem', background: 'var(--bg-tertiary)',
                                border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)',
                                color: userAnswer ? 'var(--text-primary)' : 'var(--text-tertiary)',
                                lineHeight: 1.7, fontSize: '0.95rem', minHeight: '100px',
                                whiteSpace: 'pre-wrap',
                            }}>
                                {userAnswer || 'No answer provided.'}
                            </div>
                        </div>
                    )}

                    {!isObjective && questionEvaluation && (
                        <section aria-label='Question marking rubric' style={{ marginBottom: '2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                                <div>
                                    <h3 style={{ fontSize: '1.15rem', marginBottom: '0.25rem' }}>Marking rubric</h3>
                                    <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>How the marks for this answer were awarded</p>
                                </div>
                                <div style={{ padding: '0.55rem 0.9rem', borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)', border: '1px solid var(--glass-border)', fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                                    {questionEvaluation.awardedMarks} / {questionEvaluation.maxMarks}M
                                </div>
                            </div>
                            {questionEvaluation.feedback && (
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.98rem', lineHeight: 1.65, marginBottom: '1rem' }}>{questionEvaluation.feedback}</p>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                {questionEvaluation.criteria?.map((criterion, criterionIndex) => (
                                    <article key={criterion.criterionIndex ?? criterionIndex} style={{ padding: '1.15rem 1.2rem', border: '1px solid var(--glass-border)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.65rem' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                <h4 style={{ fontSize: '1rem', lineHeight: 1.45 }}>{criterion.criterion || `Rubric criterion ${criterionIndex + 1}`}</h4>
                                                <RubricStatus status={criterion.status} />
                                            </div>
                                            <strong style={{ color: criterion.awardedMarks >= criterion.maxMarks ? 'var(--success)' : criterion.awardedMarks > 0 ? 'var(--warning)' : 'var(--danger)', fontSize: '0.95rem', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                                {criterion.awardedMarks} / {criterion.maxMarks}M
                                            </strong>
                                        </div>
                                        {criterion.feedback && <p style={{ color: 'var(--text-secondary)', fontSize: '0.94rem', lineHeight: 1.6, marginBottom: '0.8rem' }}>{criterion.feedback}</p>}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                            {criterion.keyPoints?.map((point, pointIndex) => {
                                                const pointColor = point.status === 'met' ? 'var(--success)' : point.status === 'partial' ? 'var(--warning)' : 'var(--danger)';
                                                const PointIcon = point.status === 'met' ? CheckCircle : point.status === 'partial' ? AlertCircle : XCircle;
                                                return (
                                                    <div key={point.keyPointIndex ?? pointIndex} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', padding: '0.75rem 0.85rem', borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                                                            <PointIcon size={17} color={pointColor} style={{ flexShrink: 0, marginTop: '0.15rem' }} />
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <p style={{ color: 'var(--text-primary)', fontSize: '0.94rem', lineHeight: 1.55 }}>{point.text}</p>
                                                                <p style={{ color: pointColor, fontSize: '0.82rem', fontWeight: 700, marginTop: '0.2rem', textTransform: 'capitalize' }}>{point.status === 'met' ? 'Credit awarded' : point.status === 'partial' ? 'Partial credit' : 'Credit not awarded'}</p>
                                                            </div>
                                                        </div>
                                                        {point.evidenceQuote && (
                                                            <blockquote style={{ margin: '0.2rem 0 0 1.55rem', paddingLeft: '0.75rem', borderLeft: '2px solid var(--accent-primary)', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.55 }}>
                                                                Your answer: “{point.evidenceQuote}”
                                                            </blockquote>
                                                        )}
                                                        {point.feedback && <p style={{ marginLeft: '1.55rem', color: 'var(--text-tertiary)', fontSize: '0.9rem', lineHeight: 1.5 }}>{point.feedback}</p>}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </section>
                    )}
                    {!isObjective && q.answer && (
                        <section aria-label='Model answer' style={{ marginBottom: '2rem', padding: '1.3rem 1.4rem', background: 'var(--bg-tertiary)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)' }}>
                            <h3 style={{ fontSize: '1.08rem', marginBottom: '0.8rem' }}>Model answer</h3>
                            <ModelAnswerContent answer={q.answer} format={q.answerFormat} />
                        </section>
                    )}

                    {/* Navigation */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '1.5rem', borderTop: '1px solid var(--glass-border)', marginTop: 'auto' }}>
                        <button
                            onClick={() => {
                                const previousIndex = visibleQuestionIndices[currentVisiblePosition - 1];
                                if (previousIndex !== undefined) setCurrentQ(previousIndex);
                            }}
                            disabled={currentVisiblePosition <= 0}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.75rem 1.5rem',
                                background: 'var(--bg-tertiary)',
                                borderRadius: 'var(--radius-full)',
                                opacity: currentVisiblePosition <= 0 ? 0.4 : 1,
                                cursor: currentVisiblePosition <= 0 ? 'not-allowed' : 'pointer',
                                color: 'var(--text-primary)',
                                fontWeight: 500,
                                border: '1px solid var(--glass-border)',
                            }}
                        >
                            <ArrowLeft size={16} /> Previous
                        </button>
                        <button
                            onClick={() => {
                                const nextIndex = visibleQuestionIndices[currentVisiblePosition + 1];
                                if (nextIndex !== undefined) setCurrentQ(nextIndex);
                            }}
                            disabled={currentVisiblePosition < 0 || currentVisiblePosition >= visibleQuestionIndices.length - 1}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.75rem 1.5rem',
                                background: 'var(--accent-primary)',
                                color: 'white',
                                borderRadius: 'var(--radius-full)',
                                opacity: currentVisiblePosition < 0 || currentVisiblePosition >= visibleQuestionIndices.length - 1 ? 0.4 : 1,
                                cursor: currentVisiblePosition < 0 || currentVisiblePosition >= visibleQuestionIndices.length - 1 ? 'not-allowed' : 'pointer',
                                fontWeight: 500,
                            }}
                        >
                            Next <ArrowRight size={16} />
                        </button>
                    </div>
                    </>)}
                </div>
            </div>
        </div>
    );
}
