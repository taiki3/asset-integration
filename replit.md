# G-Method Platform

## Overview
A web application for automating the "G-Method" business hypothesis generation process. Users can create projects, register input resources (target specifications and technical assets), and run a multi-step AI pipeline to generate and evaluate business hypotheses.

## Project Architecture

### Frontend (React + TypeScript)
- **Framework**: React with Vite, TypeScript, TanStack Query
- **Styling**: Tailwind CSS with shadcn/ui components
- **Routing**: wouter
- **Key Pages**:
  - `/` - Dashboard with project list
  - `/projects/:id` - Project workspace with 3-section layout

### Backend (Node.js + Express)
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **AI Integration**: Google Gemini via Replit AI Integrations

### Database Schema
- **projects**: Project management (id, name, description, createdAt, deletedAt)
  - Soft delete: Uses `deletedAt` timestamp for logical deletion (preserves data integrity)
  - Rename: Projects can be renamed inline via pencil icon
- **resources**: Input data storage (id, projectId, type, name, content, createdAt)
  - Types: `target_spec` (target specifications) and `technical_assets` (technical asset lists)
- **hypotheses**: Generated hypothesis storage
  - Soft delete: Uses `deletedAt` timestamp for logical deletion
  - Deleted hypotheses are excluded from display and dedup checks during new generation
- **hypothesis_runs**: G-Method execution history
  - Core fields: id, projectId, targetSpecId, technicalAssetsId, status, step outputs, integratedList
  - Job naming: `jobName` (default YYYYMMDDHHMM format), `loopIndex` for multi-loop batches
  - Loop tracking: `loopCount`, `currentLoop`, `totalLoops` for multi-loop execution
  - Individual reports: `step2_2IndividualOutputs` (jsonb array) stores each STEP2-2 hypothesis report separately for individual download

## G-Method Pipeline
The pipeline consists of 4 steps (numbered 2-5):

### Step 2 - Three-Phase Deep Research Architecture
Step 2 uses a sophisticated 3-phase parallel architecture:
1. **Step 2-1 (発散・選定)**: One AI generates 30+ hypotheses and selects Top N using I/M/L/U criteria (weights: I:40%, M:30%, L:15%, U:15%)
2. **Step 2-2 (個別深掘り)**: N separate Deep Research tasks run sequentially. Each AI analyzes one hypothesis in depth.
3. **Step 2-3 (統合)**: Gemini 3.0 Pro merges all N individual reports into a unified final report. Reports are summarized before merging to stay within token limits.

Key implementation details:
- `extractHypothesesFromStep2_1()`: Robust parser with multi-attempt extraction, regex fallback, and strict count validation
- `summarizeReportForMerge()`: Reduces each report to 800-1200 chars before merging
- `mergeIndividualReports()`: Combines summaries using Gemini 3.0 Pro with reference deduplication
- 429エラー検出: レート制限エラーが発生した場合、明確なエラーメッセージを表示

### Other Steps
2. **Step 3 - Scientific Evaluation**: Evaluate hypotheses for scientific and economic validity
3. **Step 4 - Strategic Audit**: Assess competitive catch-up difficulty and make/buy decisions
4. **Step 5 - Integration**: Generate final TSV data with all hypothesis information

## API Endpoints

### Projects
- `GET /api/projects` - List all projects (excludes soft-deleted)
- `GET /api/projects/:id` - Get single project
- `POST /api/projects` - Create project
- `PATCH /api/projects/:id` - Update project (rename)
- `DELETE /api/projects/:id` - Soft delete project (sets deletedAt)

### Resources
- `GET /api/projects/:projectId/resources` - List resources for project
- `POST /api/projects/:projectId/resources` - Create resource
- `DELETE /api/projects/:projectId/resources/:id` - Delete resource

### Hypothesis Runs
- `GET /api/projects/:projectId/runs` - List runs for project
- `POST /api/projects/:projectId/runs` - Start new run
- `GET /api/runs/:id` - Get run details
- `POST /api/runs/:id/resume-interrupted` - Resume an interrupted run from where it stopped
- `GET /api/runs/:id/download?format=tsv|xlsx` - Download results
- `GET /api/runs/:id/download-step2-word` - Download STEP2 report as Word document
- `GET /api/runs/:id/individual-reports` - List available STEP2-2 individual hypothesis reports
- `GET /api/runs/:id/download-individual-report/:hypothesisIndex` - Download individual hypothesis report as Word document

### Run Status Types
- `pending` - Waiting to start
- `running` - Currently executing
- `paused` - User paused execution
- `completed` - Successfully finished
- `error` - Failed with an error
- `interrupted` - Stopped due to server restart (SIGTERM from platform)

### Resume Feature
When a run is interrupted (status `interrupted`), users can click "途中から再開" to resume from the last completed step. The system uses `resumeCount` to track how many times a run has been resumed.

## Running the Application
```bash
npm run dev        # Start development server
npm run db:push    # Push database schema changes
```

## Key Files
- `shared/schema.ts` - Database schema and TypeScript types
- `server/routes.ts` - API route definitions
- `server/storage.ts` - Database operations
- `server/gmethod-pipeline.ts` - G-Method AI pipeline execution
- `server/prompts.ts` - Gemini prompts for each step
- `client/src/pages/Dashboard.tsx` - Main dashboard
- `client/src/pages/ProjectWorkspace.tsx` - Project workspace
- `client/src/components/PromptManual.tsx` - Prompt placeholder documentation

## Prompt Manual
Accessible from Settings page header. Documents for each step:
- Model used (deep-research-pro-preview or gemini-3-pro-preview)
- Data flow (File Search uploads vs. direct prompt embedding)
- File uploads (target_specification, technical_assets, hypothesis_context, previous_hypotheses)
- Placeholders with sources ({HYPOTHESIS_COUNT}, {PREVIOUS_HYPOTHESES}, {STEP2_OUTPUT}, etc.)

## Design System
- Typography: IBM Plex Sans (body), IBM Plex Mono (code/data)
- Uses Carbon Design System principles for data-intensive enterprise applications
- Dark mode support via theme toggle
