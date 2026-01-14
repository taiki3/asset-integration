/**
 * AI Adapter for ASIP Pipeline
 *
 * Implements the AIOperations interface using Gemini API
 */

import {
  executeDeepResearch as geminiDeepResearch,
  generateContent as geminiGenerateContent,
} from '@/lib/gemini/interactions';
import { AIOperations } from './pipeline-core';

/**
 * Create AI adapter using Gemini API
 */
export function createAIAdapter(): AIOperations {
  return {
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
