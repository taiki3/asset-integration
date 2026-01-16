/**
 * Gemini API Wrapper with Deep Research Support
 *
 * This module provides:
 * - Deep Research Agent (file search + background processing)
 * - Standard Gemini API generation
 * - File Search Store management
 */

// Ensure proxy is set up before any API calls
import './proxy-setup';
import { GoogleGenAI } from '@google/genai';
import { getGeminiClient, MODELS } from './client';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Deep Research Agent model
export const DEEP_RESEARCH_AGENT = 'deep-research-pro-preview-12-2025';

// Rate limiting: 10 requests per minute for Deep Research
const DEEP_RESEARCH_MAX_CONCURRENT = 10;
const DEEP_RESEARCH_MIN_INTERVAL_MS = 6 * 1000; // 6 seconds between requests (10/min)
let lastDeepResearchRequestTime: number = 0;
let activeDeepResearchCount: number = 0;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Get the @google/genai client (different from @google/generative-ai)
function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_GENAI_API_KEY is not set');
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * Wait for Deep Research rate limit (10 requests/min)
 */
export async function waitForDeepResearchRateLimit(): Promise<void> {
  // Wait if we're at max concurrent requests
  while (activeDeepResearchCount >= DEEP_RESEARCH_MAX_CONCURRENT) {
    console.log(`[DeepResearch] At max concurrent (${activeDeepResearchCount}/${DEEP_RESEARCH_MAX_CONCURRENT}), waiting...`);
    await sleep(5000);
  }

  // Ensure minimum interval between requests
  const now = Date.now();
  const timeSinceLastRequest = now - lastDeepResearchRequestTime;

  if (lastDeepResearchRequestTime > 0 && timeSinceLastRequest < DEEP_RESEARCH_MIN_INTERVAL_MS) {
    const waitTime = DEEP_RESEARCH_MIN_INTERVAL_MS - timeSinceLastRequest;
    console.log(`[DeepResearch] Rate limit: waiting ${Math.ceil(waitTime / 1000)}s...`);
    await sleep(waitTime);
  }

  lastDeepResearchRequestTime = Date.now();
  activeDeepResearchCount++;
}

/**
 * Release a Deep Research slot
 */
export function releaseDeepResearchSlot(): void {
  if (activeDeepResearchCount > 0) {
    activeDeepResearchCount--;
  }
}

/**
 * Create a File Search Store
 */
export async function createFileSearchStore(displayName: string): Promise<string> {
  console.log(`[DeepResearch] Creating File Search Store: ${displayName}`);
  const client = getGenAIClient();

  const store = await (client as any).fileSearchStores.create({
    config: { displayName }
  });

  console.log(`[DeepResearch] Store created: ${store.name}`);
  return store.name;
}

/**
 * Upload text content to File Search Store
 */
export async function uploadToFileSearchStore(params: {
  storeName: string;
  content: string;
  displayName: string;
}): Promise<string> {
  const { storeName, content, displayName } = params;
  const client = getGenAIClient();

  // Write content to temp file
  const tempDir = os.tmpdir();
  const safeFileName = displayName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const tempFile = path.join(tempDir, `${safeFileName}_${Date.now()}.txt`);
  fs.writeFileSync(tempFile, content, 'utf-8');

  try {
    let operation = await (client as any).fileSearchStores.uploadToFileSearchStore({
      file: tempFile,
      fileSearchStoreName: storeName,
      config: { displayName }
    });

    // Wait for upload to complete
    while (!operation.done) {
      console.log(`[DeepResearch] Waiting for ${displayName} upload...`);
      await sleep(3000);
      operation = await (client as any).operations.get({ operation });
    }

    console.log(`[DeepResearch] Uploaded: ${displayName} (${content.length} chars)`);
    return displayName;
  } finally {
    // Clean up temp file
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

/**
 * Delete a File Search Store
 */
export async function deleteFileSearchStore(storeName: string): Promise<void> {
  try {
    const client = getGenAIClient();
    await (client as any).fileSearchStores.delete({
      name: storeName,
      config: { force: true }
    });
    console.log(`[DeepResearch] Store deleted: ${storeName}`);
  } catch (e: any) {
    console.warn(`[DeepResearch] Failed to delete store: ${e.message}`);
  }
}

/**
 * Start a Deep Research task (returns immediately, runs in background)
 */
export async function startDeepResearch(params: {
  prompt: string;
  fileSearchStoreName: string;
}): Promise<{ interactionId: string }> {
  console.log(`[DeepResearch] Starting: "${params.prompt.substring(0, 100)}..."`);
  console.log(`[DeepResearch] File Search Store: ${params.fileSearchStoreName}`);

  await waitForDeepResearchRateLimit();

  const client = getGenAIClient();
  const interaction = await (client as any).interactions.create({
    input: params.prompt,
    agent: DEEP_RESEARCH_AGENT,
    background: true,
    tools: [
      { type: 'file_search', file_search_store_names: [params.fileSearchStoreName] }
    ]
  });

  console.log(`[DeepResearch] Started. Interaction ID: ${interaction.id}`);
  return { interactionId: interaction.id };
}

/**
 * Get the status of a Deep Research interaction
 */
export async function getInteractionStatus(interactionId: string): Promise<{
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  outputs?: Array<{ type: string; text?: string }>;
  error?: string;
}> {
  const client = getGenAIClient();
  const status = await (client as any).interactions.get(interactionId);

  // Map status
  let mappedStatus: 'pending' | 'in_progress' | 'completed' | 'failed';
  switch (status.status) {
    case 'completed':
      mappedStatus = 'completed';
      break;
    case 'failed':
      mappedStatus = 'failed';
      break;
    case 'running':
    case 'in_progress':
      mappedStatus = 'in_progress';
      break;
    default:
      mappedStatus = 'pending';
  }

  return {
    status: mappedStatus,
    outputs: status.outputs?.map((o: any) => ({
      type: o.type || 'text',
      text: o.text || o.content,
    })),
    error: status.error,
  };
}

/**
 * Poll Deep Research until completion
 */
export async function pollDeepResearchCompletion(
  interactionId: string,
  options: {
    maxTimeMs?: number;
    pollIntervalMs?: number;
    onProgress?: (status: string, elapsedSec: number) => void;
  } = {}
): Promise<string> {
  const {
    maxTimeMs = 30 * 60 * 1000, // 30 minutes max
    pollIntervalMs = 15000,      // 15 seconds between polls
    onProgress
  } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < maxTimeMs) {
    await sleep(pollIntervalMs);
    const elapsed = Math.floor((Date.now() - startTime) / 1000);

    try {
      const status = await getInteractionStatus(interactionId);
      console.log(`[DeepResearch] [${elapsed}s] Status: ${status.status}`);

      if (onProgress) {
        onProgress(status.status, elapsed);
      }

      if (status.status === 'completed') {
        const outputs = status.outputs || [];
        const finalOutput = outputs[outputs.length - 1];
        return finalOutput?.text || '';
      } else if (status.status === 'failed') {
        throw new Error(`Deep Research failed: ${status.error || 'Unknown error'}`);
      }
    } catch (e: any) {
      if (e.message?.includes('Deep Research failed')) {
        throw e;
      }
      console.warn(`[DeepResearch] [${elapsed}s] Poll error (continuing): ${e.message}`);
    }
  }

  throw new Error('Deep Research timed out');
}

/**
 * Execute a complete Deep Research workflow (blocking)
 */
export async function executeDeepResearch(params: {
  prompt: string;
  files: Array<{ name: string; content: string }>;
  storeName?: string;
  onProgress?: (phase: string, detail: string) => void;
}): Promise<string> {
  const { prompt, files, onProgress } = params;
  const storeName = params.storeName || `deep-research-${Date.now()}`;

  let fileSearchStoreName: string | null = null;

  try {
    // 1. Create File Search Store
    onProgress?.('creating_store', 'Creating File Search Store...');
    fileSearchStoreName = await createFileSearchStore(storeName);

    // 2. Upload files
    onProgress?.('uploading_files', `Uploading ${files.length} files...`);
    for (const file of files) {
      await uploadToFileSearchStore({
        storeName: fileSearchStoreName,
        content: file.content,
        displayName: file.name,
      });
    }

    // 3. Start Deep Research
    onProgress?.('starting', 'Starting Deep Research Agent...');
    const { interactionId } = await startDeepResearch({
      prompt,
      fileSearchStoreName,
    });

    // 4. Poll for completion
    onProgress?.('running', 'Deep Research running...');
    const result = await pollDeepResearchCompletion(interactionId, {
      onProgress: (status, elapsed) => {
        onProgress?.('running', `Deep Research ${status} (${elapsed}s elapsed)`);
      }
    });

    onProgress?.('completed', 'Deep Research completed');
    return result;

  } finally {
    // Release rate limit slot
    releaseDeepResearchSlot();

    // Cleanup File Search Store
    if (fileSearchStoreName) {
      await deleteFileSearchStore(fileSearchStoreName);
    }
  }
}

/**
 * Start a standard interaction (non-Deep Research)
 */
export async function startInteraction(params: {
  prompt: string;
  model?: 'pro' | 'flash';
  systemInstruction?: string;
}): Promise<{ interactionId: string; result: string }> {
  // For standard interactions, we just generate directly
  const result = await generateContent({
    prompt: params.prompt,
    systemInstruction: params.systemInstruction,
  });

  return {
    interactionId: `sync-${Date.now()}`,
    result,
  };
}

/**
 * Direct content generation using standard Gemini API
 */
export async function generateContent(params: {
  prompt: string;
  model?: string;
  systemInstruction?: string;
}): Promise<string> {
  const client = getGeminiClient();

  try {
    const actualModelName = params.model || process.env.GOOGLE_GENAI_MODEL || MODELS.PRO;
    const model = client.getGenerativeModel({
      model: actualModelName,
      systemInstruction: params.systemInstruction,
    });

    const result = await model.generateContent(params.prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Gemini API error:', error);
    throw new Error(`Failed to generate content: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
