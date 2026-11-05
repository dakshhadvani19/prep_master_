# PrepMaster student interface direction

## Product thesis

PrepMaster is a student examination-preparation product. The student-facing journey should feel like a well-composed study desk: focused, credible and calm, with the paper, answer sheet, course structure and academic materials providing the visual vocabulary.

## Visual language

- Canvas: retain the existing near-black --bg-primary (#0f1115) and charcoal surface tokens.
- Surfaces: keep the near-black canvas and established softly squared geometry. Department, program, semester and subject selectors use a soft Liquid Glass material derived from the navbar's own surface (rgba(15, 17, 21, 0.85) with a 16px backdrop blur): translucent graphite with a faint cool-gray/lavender cast, readable white text and a narrow translucent rim. The card fill must remain soft, never bright white. Do not use heavy drop shadows; depth should come from translucency, backdrop blur and a quiet inner edge. Contact cards remain quieter.
- Brand emphasis: the student homepage keeps its white/cool-neutral study-desk objects and line art over the graphite canvas. Use a slightly lighter local gold pair — #ffc06a and #ffd696 — for the graduation-cap mark, selected/hover edges, short title emphasis and small illustration details. Gold remains an accent, not a large surface fill. These local homepage values do not redefine global app tokens.
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
- Domain/course cards: one staggered entrance when the grid enters view; a small, smooth lift on hover and gentle compression on press. Their Liquid Glass field responds to hover/focus with a slow, restrained fluid gradient shift and a brief soft refraction pass; it is not an always-running decoration. Keep the surface readable and shadow-free.
- Selection: smooth color/surface transition and a clear aria-pressed / aria-expanded state.
- Reduced motion: remove nonessential translation, blur, floating and stagger effects when prefers-reduced-motion is enabled.
- Avoid repeated fade-up on every section, elastic overshoot, perpetual decoration and animation that delays a click.

## Material and accessibility rules

Use Apple-informed material principles rather than copying native Liquid Glass literally. Match the navbar's dark translucent graphite base, then add only a restrained cool-gray/lavender light field so the card reads as glass instead of a flat fill. Use backdrop blur, one narrow outer edge and one subtle inner highlight; do not stack multiple glass layers or add drop-shadow elevation. The liquid response is interaction-driven: a slow moving light field and a single soft refraction pass on hover/focus, never a perpetual sweep. Browsers without backdrop-filter, high-contrast mode and reduced-transparency preferences receive an opaque graphite fallback. Selected semesters and expanded subjects use a lightly gold-tinted smoked surface plus a distinct edge, with aria-pressed / aria-expanded preserving the state semantically. Keep keyboard focus visible, text contrast strong and tap targets practical.

## Scope boundaries

This design contract applies to the student homepage, academic domain cards, course explorer, semester/subject selection, exam generation and difficulty selection, Test Room lobby, and active exam/Test Room question navigation. Dashboards and admin surfaces remain outside this change.
