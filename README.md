# PrepMaster

PrepMaster is a student exam-preparation web application.

## Application

The Vite/React application and Vercel serverless API live in global-exam-prep/.

For local development:

```bash
cd global-exam-prep
npm ci
npm run dev
```

For a production build:

```bash
npm run build
```

## Project references

- docs/ — system documentation, implementation notes, and archived source references.
- SRS/ — Software Requirements Specification and diagrams.

The production syllabus files are served from global-exam-prep/public/syllabus/. Supabase migrations remain under global-exam-prep/supabase/migrations/; they describe the live database schema and are not part of the Vite client bundle.

Environment variables are documented in global-exam-prep/.env.example and configured in the deployment environment. Never commit real secrets.
