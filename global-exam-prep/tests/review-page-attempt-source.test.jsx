import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks=vi.hoisted(()=>({
    currentUser:{uid:'student-1'},
    getExamAttemptReview:vi.fn(),
    getTestRoomAttemptReview:vi.fn(),
}));
vi.mock('../src/context/AuthContext',()=>({useAuth:()=>({currentUser:mocks.currentUser})}));
vi.mock('../src/utils/supabaseExam',()=>({
    getExamAttemptReview:(...args)=>mocks.getExamAttemptReview(...args),
    getTestRoomAttemptReview:(...args)=>mocks.getTestRoomAttemptReview(...args),
}));
import ReviewPage from '../src/pages/ReviewPage.jsx';

const roomRecord={
    id:'room-attempt-1',date:'2026-10-31T10:00:00.000Z',subjectId:'CE102',
    subjectName:'Operating Systems',examType:'MCQ',difficulty:'medium',type:'objective',
    score:1,totalMarks:1,
    questions:[{id:'q1',text:'What is an OS?',options:['A','B','C','D'],answer:2}],
    userAnswers:{q1:2},attemptType:'test_room',status:'submitted',
};
function renderReview(path){
    return render(<MemoryRouter initialEntries={[path]}><Routes>
        <Route path="/review/:historyId" element={<ReviewPage />} />
    </Routes></MemoryRouter>);
}
beforeEach(()=>{
    mocks.currentUser={uid:'student-1'};
    mocks.getExamAttemptReview.mockReset().mockResolvedValue({record:null,error:null});
    mocks.getTestRoomAttemptReview.mockReset().mockResolvedValue({record:roomRecord,error:null});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});

describe('answer review attempt source',()=>{
    it('loads a Test Room review from its dedicated endpoint and displays its source badge',async()=>{
        renderReview('/review/room-attempt-1?attemptType=test_room');
        expect(await screen.findByText('Question 1 of 1')).toBeInTheDocument();
        expect(screen.getByText('Test Room',{selector:'.attempt-source-badge'})).toBeInTheDocument();
        expect(mocks.getTestRoomAttemptReview).toHaveBeenCalledWith('room-attempt-1');
        expect(mocks.getExamAttemptReview).not.toHaveBeenCalled();
    });
    it('loads a normal exam review only from the normal attempt endpoint when specified',async()=>{
        mocks.getExamAttemptReview.mockResolvedValue({record:{...roomRecord,id:'exam-attempt-1',attemptType:'exam'},error:null});
        renderReview('/review/exam-attempt-1?attemptType=exam');
        expect(await screen.findByText('Question 1 of 1')).toBeInTheDocument();
        expect(mocks.getExamAttemptReview).toHaveBeenCalledWith('exam-attempt-1');
        expect(mocks.getTestRoomAttemptReview).not.toHaveBeenCalled();
        expect(screen.queryByText('Test Room',{selector:'.attempt-source-badge'})).toBeNull();
    });
});
