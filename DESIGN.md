# PrepMaster student interface direction

## Product thesis

PrepMaster is a student examination-preparation product. The student-facing journey should feel like a well-composed study desk: focused, credible and calm, with the paper, answer sheet, course structure and academic materials providing the visual vocabulary.

## Visual language

- Canvas: restore the original near-black --bg-primary (#0f1115), charcoal surfaces and blue/violet radial page lighting from index.css.
- Surfaces: restore the pre-redesign dark translucent panel language: rgba(22, 24, 29, .6–.8), restrained white borders, 12–20px blur and quiet depth. Department, course, semester and subject selectors should feel like the original purple/blue glass cards, not warm-white reading surfaces or gold-filled panels.
- Brand emphasis: restore the original blue-to-violet accent gradient (#3b82f6 → #8b5cf6), with #8d7bff / #a78bfa for secondary violet details. Keep the current study-desk SVG, six domain illustrations, cap icon, avatars and all current drawable geometry; recolor only their accent strokes/fills to blue-violet where needed.
- Scope: the older purple visual language applies across the current student homepage/catalog and the shared app surfaces. Current component structure, routes, catalog queries, admin flows, authentication, exam-generation logic and Test Room behavior are retained. This is a visual-only restoration layer.
- Type: keep the existing Inter interface family. Use an Apple-informed hierarchy through readable 600–700 weights, measured tracking, compact display leading and clear body contrast; do not add a new font or imitate Apple's platform UI.
- Radius: soft but differentiated. Larger rounded surfaces for cards, fully rounded compact actions, and smaller radii for nested controls.
- Illustrations: preserve the custom exam-paper hero and six subject-specific line illustrations. They are PrepMaster-specific assets, not stock icons or generic AI-generated blobs.

## Layout

- Homepage hero: left-aligned student value proposition paired with the study-desk drawing.
- Departments: a consistent three-column desktop grid, two columns on tablet and one column on narrow phones. Six cards share equal dimensions at each breakpoint. Each card uses its own discipline illustration in a shared visual frame.
- Course list: a responsive, equal-height card grid with program name and semester count prominent.
- Semester/subject selection: clear two-step hierarchy with larger tap areas and explicit selected state.
- Contact: retain existing developer identities and links; soften the surfaces without adding new sections or social claims.

## Exam and Test Room experience

- The exam-generation selection flow and Test Room use the existing navbar's dark glass language: dense charcoal/blue-tinted translucency, strong readable fills, crisp white edges and restrained blue reflections. Avoid washed-out opacity.
- Exam type, generation mode and difficulty are tactile white Liquid Glass controls, with the auth experience's amber (#ffb454) and light-gold (#ffd08a) selected state. Primary setup actions use a white surface with an amber liquid-fill hover. These are never blue.
- In active exams, the timer/header and question navigator are functional glass layers. Question numbers are rounded bubbles; one Framer Motion layout pill moves between them with a spring transition. Current, answered and unanswered states remain distinct.
- Question and answer content uses a more opaque dark surface beneath the glass controls. The content remains readable while selection and navigation carry the fluid motion.
- Test Room setup, join, share and waiting lobby use the same white-and-amber treatment. Blue is reserved for the active-test question rail, current-question motion pill, and answer selection inside normal exams and Test Rooms. Host, warning and result states retain their semantic meaning.

## Motion language

Use the existing Framer Motion dependency. Motion is deliberate, brief and tied to an event:
- Hero: clipped line reveal with slight blur resolving to crisp text, staggered with supporting content.
- Domain/course cards: preserve the current staggered entrance, small hover lift and press feedback. Use the original blue/violet radial hover reflection and soft glass transition; avoid the newer gold shine sweep.
- Selection: smooth color/surface transition and a clear aria-pressed / aria-expanded state.
- Reduced motion: remove nonessential translation, blur, floating and stagger effects when prefers-reduced-motion is enabled.
- Avoid repeated fade-up on every section, elastic overshoot, perpetual decoration and animation that delays a click.

## Material and accessibility rules

Use the original dark glass material from the pre-redesign interface: a charcoal base, translucent blue/violet highlights, restrained blur and a narrow pale border. Use the blue-violet accent gradient for primary actions and selected controls; preserve blue for active exam progress/navigation. Do not introduce warm-white card fills or the newer gold-first treatment. Browsers without backdrop-filter, high-contrast mode and reduced-transparency preferences receive an opaque dark-violet fallback. Keep keyboard focus visible, text contrast strong and tap targets practical.

## Scope boundaries

This design contract applies to the student homepage, academic domain cards, course explorer, semester/subject selection, exam generation and difficulty selection, Test Room lobby, and active exam/Test Room question navigation. Dashboards and admin surfaces remain outside this change.

## Leaderboard-aligned course and subject browsers

**Added:** 2026-11-06. The course explorer and course subject selector use the same visual component language as the Leaderboards browser. This is a local extension of the shared student catalog direction, not a change to the broader homepage or active exam/Test Room palettes.

- **Palette:** use the Leaderboards tokens verbatim: muted violet `#75649b` with `rgba(117, 100, 155, .10)` fills and `rgba(117, 100, 155, .34)` borders; warm gold `#c8a35b` with `rgba(200, 163, 91, .12)` fills and `rgba(200, 163, 91, .42)` borders. Charcoal content surfaces continue to use the global `--bg-secondary` and `--bg-tertiary` tokens.
- **Components:** reuse the Leaderboard browser's `.lb-hero`, `.lb-hero__mark`, `.lb-back`, `.lb-browser`, `.lb-grid`, `.lb-choice`, `.lb-choice__icon`, `.lb-tag`, `.lb-loading`, `.lb-alert`, and `.lb-empty-state` styles. Course cards, semester cards, subject rows, exam options and mode/difficulty choices share the same surface, icon sizing, stroke weight and selected-state language.
- **Selection:** neutral choices use violet icon tiles and charcoal surfaces; selected choices use the gold soft fill and border. A selected state always includes `aria-pressed` or `aria-expanded`; it is not communicated by color alone.
- **Iconography:** use Lucide icons at 15–21 px with a consistent 1.8 stroke where practical. Course, semester, subject, exam, mode and difficulty icons are semantic; do not add decorative symbols.
- **Behavior and copy:** preserve all existing course names, semester/subject counts, exam-type labels, mode descriptions, difficulty descriptions, loading/error/empty messages, routes, query behavior and exam/Test Room state handling.
- **Responsive behavior:** keep the Leaderboard's 2-column course/subject grid and 3-column semester grid on wide layouts, then collapse at the same 900 px and 640 px breakpoints. Allow card copy to wrap; do not truncate course or subject names.

Apple-informed review lens (translated for this React web app): use familiar, responsive grids and clear visual hierarchy (`layout.md › Visual hierarchy`, `collections.md`); keep icon weight consistent with nearby labels (`icons.md`); ensure visible selected state and accessible control targets (`buttons.md` and `accessibility.md`). These are web-app usability principles, not native Apple component requirements.

