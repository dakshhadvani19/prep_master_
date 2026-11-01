import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { domains } from '../data/mockData';
import { examPrompts } from '../data/examPrompts';
import { findSubjectContext } from '../utils/subjectResolver';
import { getSubjectExamInfo } from '../utils/subjectExamPolicy';
import { extractTextFromFile, MAX_PDF_PAGES } from '../utils/fileParser';
import { countReadableTextChars, prepareUploadContext, UPLOAD_CONTEXT_MAX_CHARS, UPLOAD_MCQ_CONTEXT_MAX_CHARS } from '../utils/uploadContext';
import { generateQuestionsFromText } from '../utils/geminiQuestions';
import { Clock, AlertCircle, CheckCircle, ChevronLeft, ArrowRight, ArrowLeft, Upload, Cpu, BookOpen, FileText, X, Loader } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

import { resolveSyllabus, validateSyllabusRecord } from '../utils/syllabusLoader';
import { EXAM_CONFIG, normalizeExamType, fitContext, contentToString, buildBalancedObjectiveSource } from '../utils/contextFitter';
import { stripReviewMetadata, validateExam } from '../utils/examValidation';
import {
    saveExamAttempt,
    submitExamAttempt,
    fetchActiveUploadedSyllabus,
} from '../utils/supabaseExam';


// Allocate an exact exam question count across syllabus batches. Largest-remainder
// allocation avoids rounding each batch independently and generating too many/few.
function allocateBatchCounts(batches, totalCount) {
    if (!batches.length) return [];
  ¶»§q«^