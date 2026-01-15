/**
 * AI Adapter for ASIP Pipeline
 *
 * Implements the AIOperations interface using Gemini API
 * Supports both blocking and async Deep Research for serverless compatibility
 */

import {
  executeDeepResearch as geminiDeepResearch,
  generateContent as geminiGenerateContent,
  createFileSearchStore,
  uploadToFileSearchStore,
  startDeepResearch,
  getInteractionStatus,
  deleteFileSearchStore,
  releaseDeepResearchSlot,
} from '@/lib/gemini/interactions';
import { AIOperations, DeepResearchHandle, DeepResearchStatus } from './pipeline-core';

/**
 * Create AI adapter using Gemini API
 */
export function createAIAdapter(): AIOperations {
  return {
    // Legacy blocking method (kept for compatibility with tests)
    async executeDeepResearch(params: {
      prompt: string;
      files: Array<{ name: string; content: string }>;
      storeName: string;
      onProgress?: (phase: string, detail: string) => void;
    }): Promise<string> {
      return geminiDeepResearch({
        prompt: params.prompt,
        files: params.files,
        storeName: params.storeName,
        onProgress: params.onProgress,
      });
    },

    /**
     * Start Deep Research asynchronously (returns immediately)
     * Use this for serverless environments with short timeouts
     */
    async startDeepResearchAsync(params: {
      prompt: string;
      files: Array<{ name: string; content: string }>;
      storeName: string;
    }): Promise<DeepResearchHandle> {
      console.log(`[AI Adapter] Starting async Deep Research: ${params.storeName}`);

      // 1. Create File Search Store
      const fileSearchStoreName = await createFileSearchStore(params.storeName);

      // 2. Upload files
      for (const file of params.files) {
        await uploadToFileSearchStore({
          storeName: fileSearchStoreName,
          content: file.content,
          displayName: file.name,
        });
      }

      // 3. Start Deep Research (returns immediately)
      const { interactionId } = await startDeepResearch({
        prompt: params.prompt,
        fileSearchStoreName,
      });

      console.log(`[AI Adapter] Deep Research started: ${interactionId}`);

      return {
        interactionId,
        fileSearchStoreName,
      };
    },

    /**
     * Check Deep Research status (non-blocking)
     */
    async checkDeepResearchStatus(handle: DeepResearchHandle): Promise<DeepResearchStatus> {
      console.log(`[AI Adapter] Checking Deep Research status: ${handle.interactionId}`);

      const status = await getInteractionStatus(handle.interactionId);

      if (status.status === 'completed') {
        const outputs = status.outputs || [];
        const finalOutput = outputs[outputs.length - 1];
        return {
          status: 'completed',
          result: finalOutput?.text || '',
        };
      }

      if (status.status === 'failed') {
        return {
          status: 'failed',
          error: status.error || 'Deep Research failed',
        };
      }

      return {
        status: status.status,
      };
    },

    /**
     * Cleanup Deep Research resources
     */
    async cleanupDeepResearch(handle: DeepResearchHandle): Promise<void> {
      console.log(`[AI Adapter] Cleaning up Deep Research: ${handle.fileSearchStoreName}`);
      releaseDeepResearchSlot();
      await deleteFileSearchStore(handle.fileSearchStoreName);
    },

    async generateContent(params: {
      prompt: string;
      systemInstruction?: string;
    }): Promise<string> {
      return geminiGenerateContent({
        prompt: params.prompt,
        systemInstruction: params.systemInstruction,
      });
    },
  };
}
