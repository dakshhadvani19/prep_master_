import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
    currentUser: { uid: 'student-1', displayName: 'Student One', email: 'student@example.com' },
    getMyAttempts: vi.fn(),
    getMyTestRoomAttempts: vi.fn(),
    reconcileTestRoomAttempts: vi.fn(),
    evaluateExamAttempt: vi.fn(),
}));

vi.mock('../src/context/AuthContext', () => ({
    useAuth: () => ({ currentUser: mocks.currentUser }),
}));
vi.mock('../src/utils/supabaseExam', () => ({
    getMyAttempts: (...args) => mocks.getMyAttempts(...args),
    getMyTestRoomAttempts: (...args) => mocks.getMyTestRoomAttempts(...args),
    reconcileTestRoomAttempts: (...args) => mocks.reconcileTestRoomAttempts(...args),
    evaluateExamAttempt: (...args) => mocks.evaluateExamAttempt(...args),
}));

import Dashboard from '../src/pages/Dashboard.jsx';
function renderDashboard(){return render(<MemoryRouter><Dashboard /></MemoryRouter>);}

beforeEach(()=>{
    mocks.currentUser={uid:'student-1',displayName:'Student One',email:'student@example.com'};
    mocks.getMyAttempts.mockReset().mockResolvedValue({attempts:[{
        id:'exam-attempt-1',attempt_type:'exam',status:'submitted',subject_code:'CE101',
        subject_name:'Data Structures',exam_type:'MCQ',difficulty:'easy',
        questions:[{id:'q1',type:'mcq',text:'Question',options:['A','B','C','D']}],
        answers:{q1:1},score:8,total_marks:10,submitted_at:'2026-10-31T10:00:00.000Z',
    }],error:null});
    mocks.getMyTestRoomAttempts.mockReset().mockResolvedValue({attempts:[{
        id:'room-attempt-1',attempt_type:'test_room',status:'submitted',subject_code:'CE102',
        subject_name:'Operating Systems',exam_type:'MCQ',difficulty:'medium',
        questions:[{id:'q2',text:'Question 2',options:['A','B','C','D']}],answers:[2],
        score:1,total_marks:1,started_at:'2026-10-31T09:00:00.000Z',submitted_at:'2026-10-31T09:15:00.000Z',
    }],error:null});
    mocks.reconcileTestRoomAttempts.mockReset().mockResolvedValue({ok:true,error:null});
    mocks.evaluateExamAttempt.mockReset().mockResolvedValue({status:'pending'});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});

describe('student attempt history',()=>{
    it('shows the history loading state while the first persisted-attempt request is pending',async()=>{
        let finishReconciliation;
        mocks.reconcileTestRoomAttempts.mockReturnValue(new Promise(resolve=>{
            finishReconciliation=resolve;
        }));

        renderDashboard();
        expect(screen.getByText('Loading saved attempts…')).toBeInTheDocument();

        await act(async()=>{
            finishReconciliation({ok:true,error:null});
        });
        expect(await screen.findByText('Operating Systems')).toBeInTheDocument();
    });

    it('loads only the two persisted attempt sources and marks Test Room cards',async()=>{
        window.localStorage.setItem('prepmaster_exam_history_v1:student-1',JSON.stringify([{id:'legacy-local',subjectName:'Legacy local attempt'}]));
        renderDashboard();
        expect(await screen.findByText('Operating Systems')).toBeInTheDocument();
        expect(screen.getByText('Data Structures')).toBeInTheDocument();
        expect(screen.getByText('Test Room',{selector:'.attempt-source-badge'})).toBeInTheDocument();
        expect(window.localStorage.getItem('prepmaster_exam_history_v1:student-1')).toBeNull();
        expect(screen.queryByText('Legacy local attempt')).toBeNull();
        expect(mocks.reconcileTestRoomAttempts).toHaveBeenCalledTimes(1);
        expect(mocks.getMyAttempts).toHaveBeenCalledWith(100);
        expect(mocks.getMyTestRoomAttempts).toHaveBeenCalledWith(100);
        expect(screen.getByText('Completed attempts').parentElement.querySelector('strong')).toHaveTextContent('2');
        const reviewLinks = screen.getAllByRole('link',{name:/review answers/i}).map(link => link.getAttribute('href'));
        expect(reviewLinks).toContain('/review/room-attempt-1?attemptType=test_room');
        expect(reviewLinks).toContain('/review/exam-attempt-1?attemptType=exam');
    });
    it('shows the same Review Answers action for an objective attempt when its score is not available yet',async()=>{
        mocks.getMyAttempts.mockResolvedValue({attempts:[{
            id:'objective-without-score',attempt_type:'exam',status:'submitted',subject_code:'CE201',
            subject_name:'Fundamentals of Machine Learning',exam_type:'mid-2',difficulty:'medium',
            questions:[{id:'mcq-1',type:'mcq',text:'Question',options:['A','B','C','D']}],
            answers:{'mcq-1':2},score:null,total_marks:30,review_status:'ready',
            submitted_at:'2026-11-06T10:02:00.000Z',
        }],error:null});
        mocks.getMyTestRoomAttempts.mockResolvedValue({attempts:[],error:null});

        renderDashboard();

        expect(await screen.findByText('Fundamentals of Machine Learning')).toBeInTheDocument();
        expect(screen.getByText('Answers submitted')).toBeInTheDocument();
        expect(screen.queryByText('Theory answers')).toBeNull();
        expect(screen.getByRole('link',{name:/review answers/i}))
            .toHaveAttribute('href','/review/objective-without-score?attemptType=exam');
    });

    it('does not describe an unfinished attempt as submitted or expose its review before timeout',async()=>{
        mocks.getMyAttempts.mockResolvedValue({attempts:[{
            id:'objective-in-progress',attempt_type:'exam',status:'in_progress',subject_code:'CE204',
            subject_name:'Fundamentals of Machine Learning',exam_type:'mid-2',difficulty:'medium',
            time_minutes:45,questions:[{id:'mcq-1',type:'mcq',text:'Question',options:['A','B','C','D']}],
            answers:{'mcq-1':2},score:null,total_marks:30,review_status:'ready',
            started_at:'2026-11-22T10:00:00.000Z',
        }],error:null});
        mocks.getMyTestRoomAttempts.mockResolvedValue({attempts:[],error:null});

        renderDashboard();

        expect(await screen.findByText('In progress')).toBeInTheDocument();
        expect(screen.queryByText('Answers submitted')).toBeNull();
        expect(screen.queryByRole('link',{name:/review answers/i})).toBeNull();
    });

    it('shows Review Answers after an expired attempt is auto-submitted by the API',async()=>{
        mocks.getMyAttempts.mockResolvedValue({attempts:[{
            id:'objective-auto-submitted',attempt_type:'exam',status:'auto_submitted',subject_code:'CE205',
            subject_name:'Fundamentals of Machine Learning',exam_type:'mid-2',difficulty:'medium',
            time_minutes:45,questions:[{id:'mcq-1',type:'mcq',text:'Question',options:['A','B','C','D']}],
            answers:{'mcq-1':2},score:0,total_marks:30,review_status:'ready',
            started_at:'2026-11-06T04:32:40.000Z',submitted_at:'2026-11-06T05:17:40.000Z',
        }],error:null});
        mocks.getMyTestRoomAttempts.mockResolvedValue({attempts:[],error:null});

        renderDashboard();

        expect(await screen.findByText('Auto-submitted')).toBeInTheDocument();
        expect(screen.getByRole('link',{name:/review answers/i}))
            .toHaveAttribute('href','/review/objective-auto-submitted?attemptType=exam');
    });

    it('shows the same Review Answers action for a theory attempt while evaluation is pending',async()=>{
        mocks.getMyAttempts.mockResolvedValue({attempts:[{
            id:'theory-pending',attempt_type:'exam',status:'submitted',subject_code:'CE202',
            subject_name:'Data Structures',exam_type:'mid-1',difficulty:'medium',
            questions:[{id:'theory-1',type:'subjective',text:'Explain the concept.',marks:4}],
            answers:{'theory-1':'My submitted answer'},score:null,total_marks:30,review_status:'pending',
            submitted_at:'2026-11-06T10:02:00.000Z',
        }],error:null});
        mocks.getMyTestRoomAttempts.mockResolvedValue({attempts:[],error:null});

        renderDashboard();

        expect(await screen.findByRole('link',{name:/review answers/i}))
            .toHaveAttribute('href','/review/theory-pending?attemptType=exam');
        expect(await screen.findByText('Evaluating answers')).toBeInTheDocument();
        expect(mocks.evaluateExamAttempt).toHaveBeenCalledWith('theory-pending');
    });

    it('keeps Review Answers available for a theory attempt whose rubric is unavailable',async()=>{
        mocks.getMyAttempts.mockResolvedValue({attempts:[{
            id:'theory-no-rubric',attempt_type:'exam',status:'submitted',subject_code:'CE203',
            subject_name:'Computer Networks',exam_type:'mid-1',difficulty:'medium',
            questions:[{id:'theory-2',type:'subjective',text:'Explain the concept.',marks:4}],
            answers:{'theory-2':'My submitted answer'},score:null,total_marks:30,review_status:'unavailable',
            submitted_at:'2026-11-06T10:02:00.000Z',
        }],error:null});
        mocks.getMyTestRoomAttempts.mockResolvedValue({attempts:[],error:null});

        renderDashboard();

        expect(await screen.findByText('Rubric unavailable')).toBeInTheDocument();
        expect(screen.getByRole('link',{name:/review answers/i}))
            .toHaveAttribute('href','/review/theory-no-rubric?attemptType=exam');
    });

    it('does not show local history when persisted attempt retrieval fails',async()=>{
        window.localStorage.setItem('prepmaster_exam_history_v1:student-1',JSON.stringify([{id:'legacy-local',subjectName:'Legacy local attempt'}]));
        mocks.getMyAttempts.mockResolvedValue({attempts:[],error:'request failed'});
        mocks.getMyTestRoomAttempts.mockResolvedValue({attempts:[],error:null});
        renderDashboard();
        expect(await screen.findByText('Attempt history unavailable')).toBeInTheDocument();
        expect(screen.queryByText('Legacy local attempt')).toBeNull();
        expect(window.localStorage.getItem('prepmaster_exam_history_v1:student-1')).toBeNull();
    });
});
