import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as tus from 'tus-js-client';
import {
    AlertCircle, CheckCircle2, CloudUpload, FileText, RefreshCw,
    ShieldCheck, UploadCloud, X,
} from 'lucide-react';
import { supabase } from '../supabase.js';
import { getSubjectExamInfo } from '../utils/subjectExamPolicy.js';
import './AdminCourseUploads.css';

const BUCKET = 'admin-course-files';
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MIME_BY_EXTENSION = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    csv: 'text/csv',
};

function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024 * 1024) return Math.max(1, Math.round(value / 1024)) + ' KB';
    return (value / (1024 * 1024)).toFixed(1) + ' MB';
}

function statusLabel(upload) {
    if (upload.status === 'active' && upload.is_active) return 'Active syllabus';
    const labels = {
        uploading: 'Upload incomplete',
        validating: 'Validating',
        needs_confirmation: 'Ready to activate',
        validated_waiting_phase3: 'Validated Â· Ready to parse',
        needs_review: 'Admin review required',
        published: 'Published question bank',
        active: 'Active syllabus',
        superseded: 'Previous version',
        failed: 'Validation failed',
    };
    return labels[upload.status] || 'Unknown status';
}

function dateLabel(value) {
    if (!value) return '';
    const d¶»§q«^