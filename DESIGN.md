# PrepMaster student interface direction

## Product thesis

PrepMaster is a student examination-preparation product. The student-facing journey should feel like a well-composed study desk: focused, credible and calm, with the paper, answer sheet, course structure and academic materials providing the visual vocabulary.

## Visual language

- Canvas: retain the existing near-black --bg-primary (#0f1115) and charcoal surface tokens.
- Surfaces: keep the near-black canvas and established softly squared geometry. Department, program, semester and subject selectors use a smoked-glass material: translucent graphite with a cool gray / faint lavender cast, moderate backdrop blur, a crisp pale edge and a restrained inner highlight. The fill must remain dark enough for white text and should feel soft rather than bright or washed out. Use gold only for meaningful hover/selected emphasis. Do not add moving reflection sweeps or animated refraction. Contact cards remain quieter.
- Brand emphasis: the student homepage now uses a white-first object palette over the unchanged graphite canvas. The exam paper, answer sheet, pencil, department line illustrations, headings and primary action are white or cool-neutral. Keep warm amber --gold (#ffb454) and --gold-bright (#ffd08a) for small illustration details, fine edge highlights, focus accents and reflected glow/shadows; do not turn large objects or text into gold surfaces.
- Scope: the white/cool-neutral object treatment remains in the hero study-desk illustration and department line art. Smoked-glass selector cards apply only to the student homepage's department grid and its department → program → semester → subject browsing path. The contact section, exam configuration, Test Room, dashboards and admin screens are unchanged.
- Existing global blue and violet tokens are not redefined. The homepage's gold is a local light/shadow accent, not a new global action color.
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
- Domain/course cards: one staggered entrance when the grid enters view; slight lift on hover, gentle compression on press. Keep card surfaces crisp and solid rather than translucent or reflective.
- Selection: smooth color/surface transition and a clear aria-pressed / aria-expanded state.
- Reduced motion: remove nonessential translation, blur, floating and stagger effects when prefers-reduced-motion is enabled.
- Avoid repeated fade-up on every section, elastic overshoot, perpetual decoration and animation that delays a click.

## Material and accessibility rules

Use Apple-informed material principles rather than copying native Liquid Glass literally. These selector cards are interactive controls, so use a controlled frosted treatment rather than clear glass: enough opacity and blur to keep the labels readable, with content still recognizably on a near-black canvas. Keep one clear material layer per card; do not stack glass on glass. Browsers without backdrop-filter, high-contrast mode and reduced-transparency preferences receive an opaque graphite fallback. Selected semesters and expanded subjects use a warmer gold-tinted smoked surface plus a distinct edge, with aria-pressed / aria-expanded preserving the state semantically. Keep keyboard focus visible, text contrast strong and tap targets practical.

## Scope boundaries

This design contract applies to the student homepage, academic domain cards, course explorer, semester/subject selection, exam generation and difficulty selection, Test Room lobby, and active exam/Test Room question navigation. Dashboards and admin surfaces remain outside this change.
