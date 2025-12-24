import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

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
    operation = await client.operations.get({ operation });
  }
  console.log('  Indexing complete.');
}

async function main() {
  try {
    // 1. Create File Search Store
    console.log('=== Creating File Search Store ===');
    const fileSearchStore = await (client as any).fileSearchStores.create({
      config: { displayName: 'deepresearch-test-store' }
    });
    console.log(`Store created: ${fileSearchStore.name}`);

    // 2. Upload files to File Search Store
    const resourceDir = path.join(process.cwd(), 'resource');
    const filesToUpload = [
      { name: 'tech_prop.md', mimeType: 'text/plain' },
      { name: 'target.md', mimeType: 'text/plain' },
    ];

    for (const file of filesToUpload) {
      const filePath = path.join(resourceDir, file.name);
      console.log(`\n=== Uploading ${file.name} ===`);

      const operation = await (client as any).fileSearchStores.uploadToFileSearchStore({
        file: filePath,
        fileSearchStoreName: fileSearchStore.name!,
        config: {
          displayName: file.name,
          mimeType: file.mimeType,
        }
      });

      await waitForOperation(operation);
    }

    // 3. Read prompt from prompt.md
    const promptPath = path.join(resourceDir, 'prompt.md');
    const promptContent = fs.readFileSync(promptPath, 'utf-8');
    console.log('\n=== Prompt loaded from prompt.md ===');
    console.log(`Prompt length: ${promptContent.length} chars, ${Buffer.byteLength(promptContent, 'utf-8')} bytes`);

    // 4. Start Deep Research with File Search
    console.log('\n=== Starting Deep Research ===');
    const interaction = await (client as any).interactions.create({
      input: promptContent,
      agent: 'deep-research-pro-preview-12-2025',
      background: true,
      tools: [
        {
          type: 'file_search',
          file_search_store_names: [fileSearchStore.name!]
        }
      ]
    });

    console.log(`Interaction created: ${interaction.id}`);
    console.log('SUCCESS - No 400 error!');

    // 5. Cleanup
    console.log('\n=== Cleaning up ===');
    await (client as any).fileSearchStores.delete({
      name: fileSearchStore.name!,
      config: { force: true }
    });
    console.log('File Search Store deleted.');

  } catch (error: any) {
    console.error('Error:', error.message);
    if (error.message?.includes('400')) {
      console.error('GOT 400 ERROR');
    }
    process.exit(1);
  }
}

main();
