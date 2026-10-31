import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
    currentUser: { uid: 'student-1', displayName: 'Student One', email: 'student@example.com' },
    getMyAttempts: vi.fn(),
    getMyTestRoomAttempts: vi.fn(),
    reconcileTestRoomAttempts: vi.fn(),
}));

vi.mock('../src/context/AuthContext', () => ({
    useAuth: () => ({ currentUser: mocks.currentUser }),
}));
vi.mock('../src/utils/supabaseExam', () => ({
    getMyAttempts: (...args) => mocks.getMyAttempts(...args),
    getMyTestRoomAttempts: (...args) => mocks.getMyTestRoomAttempts(...args),
    reconcileTestRoomAttempts: (...args) => mocks.reconcileTestRoomAttempts(...args),
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
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});

describe('student attempt history',()=>{
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
        expect(screen.getByRole('link',{name:/review answers/i})).toHaveAttribute('href','/review/room-attempt-1?attemptType=test_room');
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
