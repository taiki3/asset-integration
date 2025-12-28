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
    operation = await (client as any).operations.get({ operation });
  }
  console.log('  Indexing complete.');
}

async function main() {
  try {
    console.log('=== Creating File Search Store ===');
    const fileSearchStore = await (client as any).fileSearchStores.create({
      config: { displayName: 'deepresearch-test-store' }
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

    console.log('\n=== Starting Deep Research ===');
    const stream = await (client as any).interactions.create({
      input: promptContent,
      agent: 'deep-research-pro-preview-12-2025',
      background: true,
      stream: true,
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

    let interactionId: string | undefined;

    console.log('\n=== Research Output ===\n');

    for await (const chunk of stream as AsyncIterable<any>) {
      console.log(`[Event: ${chunk.event_type}]`);

      if (chunk.event_type === 'interaction.start') {
        interactionId = chunk.interaction?.id;
        console.log(`[Interaction started: ${interactionId}]\n`);
      }

      if (chunk.event_type === 'content.delta') {
        if (chunk.delta?.type === 'text') {
          process.stdout.write(chunk.delta.text);
        } else if (chunk.delta?.type === 'thought_summary') {
          console.log(`\n[Thought]: ${chunk.delta.content?.text}\n`);
        } else {
          console.log(`[Delta type: ${chunk.delta?.type}]`);
        }
      } else if (chunk.event_type === 'interaction.complete') {
        console.log('\n\n=== Research Complete ===');
        if (chunk.interaction?.outputs) {
          console.log('\n=== Final Outputs ===');
          for (const output of chunk.interaction.outputs) {
            console.log(output.text || JSON.stringify(output));
          }
        }
      }
    }

    console.log('\n=== Cleaning up ===');
    await (client as any).fileSearchStores.delete({
      name: fileSearchStore.name!,
      config: { force: true }
    });
    console.log('File Search Store deleted.');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
