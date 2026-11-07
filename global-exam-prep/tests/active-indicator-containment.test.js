import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path) => readFileSync(path.replace(/^\.\.\//, ''), 'utf8');
const srcRoot = 'src';

function readAllSource(directory = srcRoot) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = directory + '/' + entry.name;
        if (entry.isDirectory()) return readAllSource(path);
        return /\.(?:js|jsx|ts|tsx)$/.test(entry.name) ? [readFileSync(path, 'utf8')] : [];
    }).join('\n');
}

describe('contained active indicators', () => {
    it('does not use shared Framer Motion layout IDs anywhere in the app source', () => {
        expect(readAllSource()).not.toMatch(/\blayoutId\s*=/);
    });

    it('keeps the navbar pill inside the hovered or active route item', () => {
        const layout = source('../src/components/Layout.jsx');
        const css = source('../src/components/Layout.css');
        expect(layout).not.toMatch(/layoutId\s*=/);
        expect(layout).toContain('className="nav-active-pill"');
        expect(css).toContain('.nav-desktop-item .nav-active-pill');
    });

    it('keeps the authentication tab fill on its own active button', () => {
        expect(source('../src/pages/Signup.jsx')).not.toMatch(/layoutId\s*=/);
        expect(source('../src/pages/Auth.css')).toContain('.segment-btn.active::before');
    });

    it('keeps exam and Test Room active question fills local to each button', () => {
        expect(source('../src/pages/ExamPortal.jsx')).not.toMatch(/layoutId\s*=/);
        expect(source('../src/pages/TestRoomPage.jsx')).not.toMatch(/layoutId\s*=/);
        const css = source('../src/pages/ExamExperience.css');
        expect(css).toContain('.pm-exam-question-pill[aria-current="step"]');
        expect(css).toContain('background: linear-gradient(135deg, #1d4ed8, #3b82f6)');
        expect(css).not.toContain('.pm-exam-question-active-pill');
        expect(css).not.toContain('.pm-room-question-active-pill');
    });
});
