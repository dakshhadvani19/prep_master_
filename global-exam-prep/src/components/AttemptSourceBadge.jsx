import './AttemptSourceBadge.css';

export default function AttemptSourceBadge({ attemptType }) {
    if (attemptType !== 'test_room') return null;
    return <span className="attempt-source-badge">Test Room</span>;
}
