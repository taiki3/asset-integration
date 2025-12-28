/**
 * Gemini Interactions API Wrapper
 *
 * This module provides a clean interface for working with the Gemini Interactions API,
 * specifically designed for serverless environments where long-running tasks need to be
 * executed asynchronously using the background=true mode.
 */

import { getGeminiClient, MODELS } from './client';

export interface InteractionResult {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  outputs?: Array<{
    type: string;
    text?: string;
  }>;
  error?: string;
}

/**
 * Start a Deep Research task in background mode
 * Returns immediately with an interaction ID for polling
 */
export async function startDeepResearch(params: {
  prompt: string;
  fileSearchStoreName?: string;
}): Promise<{ interactionId: string }> {
  const client = getGeminiClient();

  const tools: Array<{ type: string; file_search_store_names?: string[] }> = [];

  if (params.fileSearchStoreName) {
    tools.push({
      type: 'file_search',
      file_search_store_names: [params.fileSearchStoreName],
    });
  }

  const interaction = await (client as any).interactions.create({
    input: params.prompt,
    agent: MODELS.DEEP_RESEARCH,
    background: true,
    ...(tools.length > 0 && { tools }),
  });

  return { interactionId: interaction.id };
}

/**
 * Start a standard model interaction in background mode
 * Useful for long-running tasks that may timeout in serverless
 */
export async function startInteraction(params: {
  prompt: string;
  model?: 'pro' | 'flash';
  systemInstruction?: string;
  tools?: Array<{ type: string; [key: string]: any }>;
}): Promise<{ interactionId: string }> {
  const client = getGeminiClient();
  const model = params.model === 'flash' ? MODELS.FLASH : MODELS.PRO;

  const interaction = await (client as any).interactions.create({
    model,
    input: params.prompt,
    background: true,
    ...(params.systemInstruction && {
      system_instruction: params.systemInstruction,
    }),
    ...(params.tools && { tools: params.tools }),
  });

  return { interactionId: interaction.id };
}

/**
 * Check the status of an interaction
 */
export async function getInteractionStatus(
  interactionId: string
): Promise<InteractionResult> {
  const client = getGeminiClient();

  const interaction = await (client as any).interactions.get(interactionId);

  return {
    id: interaction.id,
    status: interaction.status,
    outputs: interaction.outputs,
    error: interaction.error,
  };
}

/**
 * Get the text output from a completed interaction
 */
export function extractTextOutput(result: InteractionResult): string | null {
  if (!result.outputs || result.outputs.length === 0) {
    return null;
  }

  const textOutput = result.outputs.find((o) => o.type === 'text');
  return textOutput?.text || null;
}

/**
 * Create a File Search Store and upload files
 */
export async function createFileSearchStore(
  displayName: string
): Promise<string> {
  const client = getGeminiClient();

  const store = await (client as any).fileSearchStores.create({
    config: { displayName },
  });

  return store.name;
}

/**
 * Upload text content to a File Search Store
 */
export async function uploadToFileSearchStore(params: {
  storeName: string;
  content: string;
  displayName: string;
}): Promise<void> {
  const client = getGeminiClient();

  // Create a temporary file in memory as a Blob
  const blob = new Blob([params.content], { type: 'text/plain' });
  const file = new File([blob], `${params.displayName}.txt`, {
    type: 'text/plain',
  });

  let operation = await (client as any).fileSearchStores.uploadToFileSearchStore({
    file,
    fileSearchStoreName: params.storeName,
    config: { displayName: params.displayName },
  });

  // Poll until upload completes
  while (!operation.done) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    operation = await (client as any).operations.get({ operation });
  }
}

/**
 * Delete a File Search Store
 */
export async function deleteFileSearchStore(storeName: string): Promise<void> {
  const client = getGeminiClient();

  try {
    await (client as any).fileSearchStores.delete({
      name: storeName,
      config: { force: true },
    });
  } catch (e) {
    console.warn(`Failed to delete file search store: ${storeName}`, e);
  }
}

/**
 * Run a quick synchronous generation (for small tasks)
 * Use this only for tasks that complete quickly (<10s)
 */
export async function generateContent(params: {
  prompt: string;
  model?: 'pro' | 'flash';
  systemInstruction?: string;
}): Promise<string> {
  const client = getGeminiClient();
  const model = params.model === 'flash' ? MODELS.FLASH : MODELS.PRO;

  const interaction = await (client as any).interactions.create({
    model,
    input: params.prompt,
    ...(params.systemInstruction && {
      system_instruction: params.systemInstruction,
    }),
  });

  const textOutput = interaction.outputs?.find(
    (o: { type: string }) => o.type === 'text'
  );
  return textOutput?.text || '';
}
