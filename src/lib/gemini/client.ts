import { GoogleGenerativeAI } from '@google/generative-ai';
import './proxy-setup';

let client: GoogleGenerativeAI | null = null;

export function getGeminiClient(): GoogleGenerativeAI {
  if (!client) {
    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_GENAI_API_KEY is not set');
    }
    
    client = new GoogleGenerativeAI(apiKey);
  }
  return client;
}

export const MODELS = {
  PRO: 'gemini-3-pro-preview',
  FLASH: 'gemini-3-flash-preview',
  DEEP_RESEARCH: 'deep-research-pro-preview-12-2025',
} as const;
