import { GoogleGenAI } from '@google/genai';
import { STEP2_DEEP_RESEARCH_PROMPT } from './prompts';

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
      config: { displayName: 'deepresearch-prod-test' }
    });
    console.log(`Store created: ${fileSearchStore.name}`);

    const filesToUpload = [
      { path: 'attached_assets/tech_prop_1766596107480.md', displayName: 'technical_assets' },
      { path: 'attached_assets/target_1766596107481.md', displayName: 'target_specification' },
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

    console.log('\n=== Using STEP2_DEEP_RESEARCH_PROMPT ===');
    console.log(`Prompt length: ${STEP2_DEEP_RESEARCH_PROMPT.length} chars`);

    console.log('\n=== Starting Deep Research ===');
    
    try {
      const interaction = await (client as any).interactions.create({
        input: STEP2_DEEP_RESEARCH_PROMPT,
        agent: 'deep-research-pro-preview-12-2025',
        background: true,
        tools: [
          {
            type: 'file_search',
            file_search_store_names: [fileSearchStore.name!]
          }
        ],
        agent_config: {
          type: 'deep-research'
        }
      });
      console.log(`Interaction created: ${interaction.id}`);
      console.log('SUCCESS! The prompt works.');
    } catch (apiError: any) {
      console.error('API Error:', apiError.message);
      console.error('Error details:', JSON.stringify(apiError, null, 2));
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
