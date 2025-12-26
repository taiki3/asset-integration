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
The pipeline uses a hybrid parallel/sequential architecture: Step 2-2 runs in parallel for all hypotheses, then Steps 3→4→5 are processed sequentially for each.

### Pipeline Architecture (Parallel Step 2-2 + Sequential Steps 3-5)
1. **Step 2-1 (発散・選定)**: One AI generates 30+ hypotheses and selects Top N using I/M/L/U criteria (weights: I:40%, M:30%, L:15%, U:15%)
2. **Step 2-2 (並列Deep Research)**: N個のDeep Research タスクが**並列**で実行
3. **Steps 3→4→5 (順次処理)**: 各仮説について順次実行
   - **Step 3**: Scientific/economic evaluation (Dr. Kill-Switch)
   - **Step 4**: Strategic audit (War Gaming Mode)
   - **Step 5**: TSV row extraction for this hypothesis
4. **Aggregation**: All individual outputs are combined into final reports and TSV

Key implementation details:
- `extractHypothesesFromStep2_1()`: Robust parser with multi-attempt extraction, regex fallback, and strict count validation
- `executeStep2_2ForHypothesis()`: Executes Step 2-2 Deep Research for a single hypothesis (can run in parallel)
- `processSteps3to5ForHypothesis()`: Executes Steps 3→4→5 sequentially for a single hypothesis
- `executeStep3Individual()`, `executeStep4Individual()`, `executeStep5Individual()`: Per-hypothesis step execution functions
- Individual outputs stored in jsonb arrays: `step2_2IndividualOutputs`, `step3IndividualOutputs`, `step4IndividualOutputs`, `step5IndividualOutputs`
- Final TSV is built by aggregating all individual Step 5 outputs with a header row
- 429エラー検出: レート制限エラーが発生した場合、明確なエラーメッセージを表示

### Per-Hypothesis Prompts
- `STEP3_INDIVIDUAL_PROMPT`: Scientific evaluation for single hypothesis
- `STEP4_INDIVIDUAL_PROMPT`: Strategic audit for single hypothesis  
- `STEP5_INDIVIDUAL_PROMPT`: TSV row extraction for single hypothesis

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

## File Search Configuration
Each step can be configured to attach specific files to File Search:
- **Settings Page**: "File Searchファイル添付設定" section with checkboxes per step
- **step_file_attachments table**: Stores per-step file attachment configurations
- **API Endpoints**: 
  - GET `/api/file-attachments/:stepNumber` - Get available files and current settings
  - PUT `/api/file-attachments/:stepNumber` - Update attachment settings
- **Pipeline Integration**: `getFileAttachments()` helper reads DB settings with backward-compatible defaults
- **Coexistence**: File Search attachments work alongside placeholder embedding (both can be used together)

## Design System
- Typography: IBM Plex Sans (body), IBM Plex Mono (code/data)
- Uses Carbon Design System principles for data-intensive enterprise applications
- Dark mode support via theme toggle
