/**
 * Check Deep Research status directly via Gemini API
 *
 * Usage:
 *   npx tsx scripts/check-deep-research.ts <interactionId>
 */

import '../src/lib/gemini/proxy-setup';
import { GoogleGenAI } from '@google/genai';

async function main() {
  const interactionId = process.argv[2];

  if (!interactionId) {
    console.error('Usage: npx tsx scripts/check-deep-research.ts <interactionId>');
    process.exit(1);
  }

  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    console.error('GOOGLE_GENAI_API_KEY is not set');
    process.exit(1);
  }

  const client = new GoogleGenAI({ apiKey });

  console.log(`Checking interaction: ${interactionId}`);

  try {
    const status = await (client as any).interactions.get(interactionId);

    console.log('\n=== Interaction Status ===');
    console.log('Status:', status.status);
    console.log('Created:', status.createTime);
    console.log('Updated:', status.updateTime);

    if (status.outputs && status.outputs.length > 0) {
      console.log('\n=== Outputs ===');
      console.log('Output count:', status.outputs.length);

      const lastOutput = status.outputs[status.outputs.length - 1];
      const text = lastOutput?.text || lastOutput?.content || '';
      console.log('Last output preview:', text.substring(0, 500) + (text.length > 500 ? '...' : ''));
      console.log('Last output length:', text.length, 'chars');
    }

    if (status.error) {
      console.log('\n=== Error ===');
      console.log(status.error);
    }
  } catch (error: any) {
    console.error('Failed to get interaction status:', error.message);
    process.exit(1);
  }
}

main();
