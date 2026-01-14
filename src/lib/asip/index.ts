/**
 * ASIP Pipeline Module
 *
 * This module provides the ASIP (AGC Strategic Innovation Playbook) pipeline
 * for generating and evaluating business hypotheses using AI.
 */

// Main pipeline exports
export { startSimplePipeline, getRunStatus } from './simple-pipeline';

// Core pipeline (for testing and custom implementations)
export {
  runPipeline,
  processStep2_2,
  processSteps3to5,
  structureHypothesesWithAI,
  type DatabaseOperations,
  type AIOperations,
  type PipelineDependencies,
  type RunData,
  type ResourceData,
  type HypothesisData,
  type RunStatus,
  type HypothesisProcessingStatus,
  type ProgressInfo,
} from './pipeline-core';

// Adapters
export { createDatabaseAdapter } from './db-adapter';
export { createAIAdapter } from './ai-adapter';

// Utilities
export {
  generateUUID,
  parseHypothesesFromOutput,
  extractJsonFromResponse,
  isHypothesesResponse,
  validateAndCleanHypotheses,
  buildHypothesisContext,
  truncateText,
  type ParsedHypothesis,
  type HypothesesResponse,
} from './utils';

// Prompts
export {
  STEP2_1_PROMPT,
  STEP2_2_PROMPT,
  STEP3_PROMPT,
  STEP4_PROMPT,
  STEP5_PROMPT,
  buildInstructionDocument,
  formatPrompt,
} from './prompts';

// Errors
export {
  ASIPError,
  RunNotFoundError,
  MissingResourceError,
  HypothesisNotFoundError,
  DeepResearchError,
  ContentGenerationError,
  HypothesisParsingError,
  RateLimitError,
  TimeoutError,
  isASIPError,
  getErrorMessage,
  wrapError,
} from './errors';
