# ASIP (AGC Strategic Innovation Playbook)

## Overview
A web application for automating the "ASIP" business hypothesis generation process. Users can create projects, register input resources (target specifications and technical assets), and run a multi-step AI pipeline to generate and evaluate business hypotheses.

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
  - `indexInRun`: 0-based index within the run's `step2_2IndividualOutputs` array (enables correct Word download for hypotheses from any run)
- **hypothesis_runs**: ASIP execution history
  - Core fields: id, projectId, targetSpecId, technicalAssetsId, status, step outputs, integratedList
  - Job naming: `jobName` (default YYYYMMDDHHMM format), `loopIndex` for multi-loop batches
  - Loop tracking: `loopCount`, `currentLoop`, `totalLoops` for multi-loop execution
  - Individual reports: `step2_2IndividualOutputs` (jsonb array) stores each STEP2-2 hypothesis report separately for individual download
  - Execution timing: `executionTiming` (jsonb) tracks per-hypothesis and overall timing data

## ASIP Pipeline
The pipeline uses a fully parallel architecture: Step 2-2 runs in parallel for all hypotheses, then Steps 3→4→5 also run in parallel for all hypotheses.

### Pipeline Architecture (Fully Parallel Processing)
1. **Step 2-1 (発散・選定)**: One AI generates 30+ hypotheses and selects Top N using I/M/L/U criteria (weights: I:40%, M:30%, L:15%, U:15%)
2. **Step 2-2 (並列Deep Research)**: N個のDeep Research タスクが**並列**で実行
3. **Steps 3→4→5 (並列処理)**: 全仮説についてSteps 3→4→5を**並列**で実行
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
- **Step 5 TSV Aggregation**: Uses `aggregateStep5Outputs()` to dynamically extract header from first hypothesis output (new prompt design: each Step 5 outputs "header line + data line"), then combines all data rows
- 429エラー検出: レート制限エラーが発生した場合、明確なエラーメッセージを表示
- **Hypothesis Numbering**: Uses 1-based array index (`i + 1`) for consistent hypothesis numbering throughout all steps, not the `number` field from extracted hypotheses (which may be incorrect from AI extraction)

### Per-Hypothesis Prompts
- `STEP3_INDIVIDUAL_PROMPT`: Scientific evaluation for single hypothesis
- `STEP4_INDIVIDUAL_PROMPT`: Strategic audit for single hypothesis  
- `STEP5_INDIVIDUAL_PROMPT`: TSV row extraction for single hypothesis

### File Search Configuration (All Steps)
All steps (2-1, 2-2, 3, 4, 5) support configurable File Search (file attachment mode):
- **Settings Page**: "File Searchファイル添付設定" section with checkboxes per step
- **Default Behavior**:
  - Steps 2-1, 2-2: Use File Search by default (Deep Research agent requires it)
  - Steps 3, 4, 5: Use prompt embedding by default (faster, cheaper); File attachment is optional
- **File Attachment vs Prompt Embedding**:
  - Steps 2-1, 2-2: Always use Deep Research with File Search (uploads to fileSearchStores)
  - Steps 3, 4, 5: If files configured → Uses regular model (gemini-3-pro/flash) with file uploads (ai.files.upload)
  - Steps 3, 4, 5: If no files configured → Uses inline prompt embedding (generateWithPro/generateWithFlash)
- **Available Files by Step**:
  - Step 2-1: target_specification, technical_assets, previous_hypotheses
  - Step 2-2: target_specification, technical_assets, hypothesis_context
  - Step 3: target_specification, technical_assets, step2_2_report
  - Step 4: target_specification, technical_assets, step2_2_report, step3_output
  - Step 5: step2_2_report, step3_output, step4_output

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
- `server/gmethod-pipeline.ts` - ASIP AI pipeline execution
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
