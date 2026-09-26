/**
 * PrepMaster admin controller — decorative SVG for the command-center hero.
 * Abstract nodes only. No live data. Hidden on small screens via CSS.
 */
export default function AdminController() {
    return (
        <svg
            className="admin-ctrl"
            viewBox="0 0 420 220"
            role="img"
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                <linearGradient id="ac-ring" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#8d7bff" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#ffb454" stopOpacity="0.85" />
                </linearGradient>
            </defs>

            <g className="admin-ctrl__web" fill="none" stroke="rgba(141,123,255,0.28)" strokeWidth="1.2">
                <path className="admin-ctrl__spoke" d="M210 110 L78 42" />
                <path className="admin-ctrl__spoke" d="M210 110 L210 28" />
                <path className="admin-ctrl__spoke" d="M210 110 L342 42" />
                <path className="admin-ctrl__spoke" d="M210 110 L64 148" />
                <path className="admin-ctrl__spoke" d="M210 110 L356 148" />
                <path className="admin-ctrl__spoke" d="M210 110 L210 196" />
            </g>

            <circle className="admin-ctrl__orbit" cx="210" cy="110" r="46" fill="none" stroke="url(#ac-ring)" strokeWidth="1.4" strokeDasharray="4 6" />
            <circle className="admin-ctrl__core" cx="210" cy="110" r="22" fill="rgba(22,24,29,0.92)" stroke="#ffb454" strokeWidth="1.5" />
            <circle cx="210" cy="110" r="6" fill="#ffb454" />

            <g className="admin-ctrl__node" transform="translate(62 26)">
                <rect width="32" height="32" rx="8" fill="#16181d" stroke="#8d7bff" />
                <path d="M10 24 V10 h9 a4 4 0 0 1 0 8 H10" fill="none" stroke="#8d7bff" strokeWidth="1.6" />
            </g>
            <g className="admin-ctrl__node" transform="translate(194 12)">
                <rect width="32" height="32" rx="8" fill="#16181d" stroke="#8d7bff" />
                <path d="M8 22 h16 M10 10 h12 v8 H10 z" fill="none" stroke="#8d7bff" strokeWidth="1.6" />
            </g>
            <g className="admin-ctrl__node" transform="translate(326 26)">
                <rect width="32" height="32" rx="8" fill="#16181d" stroke="#ffb454" />
                <path d="M16 8 l8 14 H8 z" fill="none" stroke="#ffb454" strokeWidth="1.6" />
            </g>
            <g className="admin-ctrl__node" transform="translate(48 132)">
                <rect width="32" height="32" rx="8" fill="#16181d" stroke="#8d7bff" />
                <circle cx="12" cy="13" r="3.2" fill="none" stroke="#8d7bff" strokeWidth="1.5" />
                <circle cx="20" cy="13" r="3.2" fill="none" stroke="#8d7bff" strokeWidth="1.5" />
                <path d="M7 24 a8 6 0 0 1 18 0" fill="none" stroke="#8d7bff" strokeWidth="1.5" />
            </g>
            <g className="admin-ctrl__node" transform="translate(340 132)">
                <rect width="32" height="32" rx="8" fill="#16181d" stroke="#8d7bff" />
                <path d="M8 22 l8-12 8 12 H8z" fill="none" stroke="#8d7bff" strokeWidth="1.6" />
            </g>
            <g className="admin-ctrl__node" transform="translate(194 180)">
                <rect width="32" height="32" rx="8" fill="#16181d" stroke="#ffb454" />
                <path d="M10 20 h12 M16 8 v8 M11 12 h10" fill="none" stroke="#ffb454" strokeWidth="1.6" />
            </g>
        </svg>
    );
}
