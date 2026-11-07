import { LoaderCircle } from 'lucide-react';
import './PageLoading.css';

export default function PageLoading({ message = 'Loading page…' }) {
    return (
        <div className="pm-page-loading" role="status" aria-live="polite">
            <LoaderCircle className="pm-page-loading__icon" size={30} strokeWidth={1.8} aria-hidden="true" />
            <span>{message}</span>
        </div>
    );
}
