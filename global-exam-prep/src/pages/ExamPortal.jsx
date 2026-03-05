import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { examPrompts, domains } from '../data/mockData';
import { generateExamQuestions } from '../data/questionGenerator';
import { Clock, AlertCircle, CheckCircle, ChevronLeft, ArrowRight, ArrowLeft } from 'lucide-react';

export default function ExamPortal() {
    const { subjectId, examType, difficulty } = useParams();
    const navigate = useNavigate();

    const [examState, setExamState] = useState('intro'); // intro, active, submitted
    const [timeLeft, setTimeLeft] = useState(0);

    // Find subject details
    let subjectDetail = null;
    domains.forEach(d => {
        d.courses.forEach(c => {
            const s = c.subjects.find(sub => sub.id === subjectId);
            if (s) subjectDetail = s;
        });
    });

    const examInfo = examPrompts[examType];

    useEffect(() => {
        if (examInfo) {
            setTimeLeft(examInfo.timeMinutes * 60);
        }
    }, [examInfo]);

    useEffect(() => {
        let timer;
        if (examState === 'active' && timeLeft > 0) {
            timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
        } else if (timeLeft === 0 && examState === 'active') {
            // Only auto-submit if we were counting down (not on initial 0)
            setExamState({ status: 'submitted', score: 0 });
        }
        return () => clearInterval(timer);
    }, [examState, timeLeft]);

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

    const startExam = () => setExamState('active');

    const submitExam = (answers, questions) => {
        let score = 0;
        if (examInfo.type === 'objective') {
            const marksPerQ = examInfo.totalMarks / questions.length;
            questions.forEach(q => {
                if (answers[q.id] !== undefined && answers[q.id] == q.answer) {
                    score += marksPerQ;
                }
            });
            score = Math.round(score);
        }

        // Save local history
        const history = JSON.parse(localStorage.getItem('userExamHistory') || '[]');
        history.push({
            id: Date.now(),
            date: new Date().toISOString(),
            subjectId,
            examType,
            difficulty,
            type: examInfo.type,
            score: examInfo.type === 'objective' ? score : null,
            totalMarks: examInfo.totalMarks
        });
        localStorage.setItem('userExamHistory', JSON.stringify(history));

        setExamState({ status: 'submitted', score });
    };

    return (
        <div className="container animate-fade-in" style={{ maxWidth: '1000px' }}>
            {examState === 'intro' && (
                <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', marginTop: '2rem' }}>
                    <button
                        onClick={() => navigate(-1)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            color: 'var(--text-secondary)',
                            marginBottom: '2rem',
                            fontSize: '0.9rem'
                        }}
                    >
                        <ChevronLeft size={16} /> Back to Subject
                    </button>

                    <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>{examInfo.title}</h1>
                    <h2 style={{ fontSize: '1.25rem', color: 'var(--accent-primary)', marginBottom: '2rem' }}>{subjectDetail.title}</h2>

                    <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: '3rem',
                        margin: '2rem 0 3rem 0'
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                            <Clock size={32} color="var(--text-secondary)" />
                            <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{examInfo.timeMinutes} Minutes</div>
                            <div style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>Duration</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                            <CheckCircle size={32} color="var(--success)" />
                            <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{examInfo.totalMarks} Marks</div>
                            <div style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>Total Score</div>
                        </div>
                    </div>

                    <div style={{
                        background: 'var(--bg-tertiary)',
                        padding: '1.5rem',
                        borderRadius: 'var(--radius-md)',
                        textAlign: 'left',
                        marginBottom: '3rem'
                    }}>
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

                    <button
                        onClick={startExam}
                        style={{
                            background: 'var(--accent-gradient)',
                            color: 'white',
                            padding: '1rem 3rem',
                            borderRadius: 'var(--radius-full)',
                            fontSize: '1.1rem',
                            fontWeight: 600,
                            boxShadow: 'var(--shadow-glow)'
                        }}
                    >
                        I am Ready, Start Exam
                    </button>
                </div>
            )}

            {examState === 'active' && (
                <ActiveExamInterface
                    examType={examType}
                    examInfo={examInfo}
                    subjectId={subjectId}
                    difficulty={difficulty || 'medium'}
                    timeLeft={timeLeft}
                    formatTime={formatTime}
                    onSubmit={submitExam}
                />
            )}

            {examState?.status === 'submitted' && (
                <div className="glass-panel" style={{ padding: '4rem 2rem', textAlign: 'center', marginTop: '4rem' }}>
                    <div style={{
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
                                Auto-Grade Score: {examState.score !== undefined ? examState.score : '--'} / {examInfo.totalMarks}
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

// Sub-component for the active exam interface
function ActiveExamInterface({ examType, examInfo, subjectId, difficulty, timeLeft, formatTime, onSubmit }) {
    const isObjective = examInfo.type === 'objective';
    const [currentQ, setCurrentQ] = useState(0);
    const [answers, setAnswers] = useState({});

    const [questions] = useState(() => generateExamQuestions(subjectId, examType, difficulty));

    const q = questions[currentQ];

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem', marginTop: '1rem' }}>

            {/* Top Bar */}
            <div className="glass-panel" style={{
                padding: '1rem 2rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                position: 'sticky',
                top: '80px',
                zIndex: 40
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
                    style={{
                        background: 'var(--success)',
                        color: 'white',
                        padding: '0.5rem 1.5rem',
                        borderRadius: 'var(--radius-full)',
                        fontWeight: 600,
                        fontSize: '0.9rem'
                    }}
                >
                    Submit Exam
                </button>
            </div>

            {/* Main Content */}
            <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>

                {/* Navigation Sidebar */}
                <div className="glass-panel" style={{ width: '250px', padding: '1.5rem', maxHeight: 'calc(100vh - 150px)', overflowY: 'auto' }}>
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
