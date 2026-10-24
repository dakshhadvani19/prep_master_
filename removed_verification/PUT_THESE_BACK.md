# Groq exam-response verification (removed from live app)

Verification of Groq exam **content** (duplicates, option quality, difficulty wrappers, blueprint `validateExam`) is archived here so a real exam can run on Groq output as returned.

## Restore onto GitHub `main` (current production generator)

These match `origin/main` at `879a2f9` before verification was disabled:

```bash
APP=global-exam-prep

cp removed_verification/github_main/$APP/src/utils/geminiQuestions.js  $APP/src/utils/geminiQuestions.js
cp removed_verification/github_main/$APP/src/utils/examValidation.js   $APP/src/utils/examValidation.js
cp removed_verification/github_main/$APP/src/pages/ExamPortal.jsx      $APP/src/pages/ExamPortal.jsx
cp removed_verification/github_main/$APP/tests/examValidation.test.js  $APP/tests/examValidation.test.js
```

## Earlier uniqueness-layer archive (Arena session)

```bash
cp removed_verification/global-exam-prep/src/utils/questionUniqueness.js $APP/src/utils/questionUniqueness.js
cp removed_verification/global-exam-prep/src/utils/geminiQuestions.js    $APP/src/utils/geminiQuestions.js
cp removed_verification/global-exam-prep/tests/question-uniqueness.test.js $APP/tests/question-uniqueness.test.js
# optional:
cp removed_verification/global-exam-prep/api/ai.js $APP/api/ai.js
```

Do not mix the two restores unless you intend to. `github_main/` is the one that belongs on current GitHub `main`.
