import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('Error: GEMINI_API_KEY is not set');
  process.exit(1);
}

const client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

async function waitForOperation(operation: any): Promise<void> {
  while (!operation.done) {
    console.log('  Waiting for indexing...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    operation = await (client as any).operations.get({ operation });
  }
  console.log('  Indexing complete.');
}

async function main() {
  try {
    console.log('=== Creating File Search Store ===');
    const fileSearchStore = await (client as any).fileSearchStores.create({
      config: { displayName: 'deepresearch-nostream-test' }
    });
    console.log(`Store created: ${fileSearchStore.name}`);

    const filesToUpload = [
      { path: 'attached_assets/tech_prop_1766596107480.md', displayName: 'tech_prop.md' },
      { path: 'attached_assets/target_1766596107481.md', displayName: 'target.md' },
    ];

    for (const file of filesToUpload) {
      console.log(`\n=== Uploading ${file.displayName} ===`);
      const operation = await (client as any).fileSearchStores.uploadToFileSearchStore({
        file: file.path,
        fileSearchStoreName: fileSearchStore.name!,
        config: {
          displayName: file.displayName,
          mimeType: 'text/plain',
        }
      });
      await waitForOperation(operation);
    }

    const promptPath = 'attached_assets/prompt_1766596107482.md';
    const promptContent = fs.readFileSync(promptPath, 'utf-8');
    console.log('\n=== Prompt loaded ===');
    console.log(`Prompt length: ${promptContent.length} chars`);

    console.log('\n=== Starting Deep Research (NO STREAM) ===');
    
    let interaction;
    try {
      interaction = await (client as any).interactions.create({
        input: promptContent,
        agent: 'deep-research-pro-preview-12-2025',
        background: true,
        tools: [
          {
            type: 'file_search',
            file_search_store_names: [fileSearchStore.name!]
          }
        ],
        agent_config: {
          type: 'deep-research',
          thinking_summaries: 'auto'
        }
      });
      console.log(`Interaction created: ${interaction.id}`);
    } catch (apiError: any) {
      console.error('API Error:', apiError.message);
      console.error('Error details:', JSON.stringify(apiError, null, 2));
      throw apiError;
    }

    console.log('\n=== Polling for completion ===');
    const startTime = Date.now();
    const maxPollTime = 2 * 60 * 1000;
    
    while (Date.now() - startTime < maxPollTime) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      try {
        const currentStatus = await (client as any).interactions.get(interaction.id);
        console.log(`Status: ${currentStatus.status} (${Math.floor((Date.now() - startTime) / 1000)}s)`);
        
        if (currentStatus.status === 'completed') {
          console.log('\n=== Research Complete ===');
          const outputs = currentStatus.outputs || [];
          const finalOutput = outputs[outputs.length - 1];
          console.log('Output length:', finalOutput?.text?.length || 0);
          break;
        } else if (currentStatus.status === 'failed') {
          console.error('Research Failed:', currentStatus.error);
          break;
        }
      } catch (pollError: any) {
        console.warn('Poll error:', pollError.message);
      }
    }

    console.log('\n=== Cleaning up ===');
    await (client as any).fileSearchStores.delete({
      name: fileSearchStore.name!,
      config: { force: true }
    });
    console.log('Done.');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
