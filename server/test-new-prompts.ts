import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('Error: GEMINI_API_KEY is not set');
  process.exit(1);
}

const client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForOperation(operation: any): Promise<void> {
  while (!operation.done) {
    console.log('  Waiting for indexing...');
    await sleep(3000);
    operation = await (client as any).operations.get({ operation });
  }
  console.log('  Indexing complete.');
}

async function main() {
  try {
    // Load prompts from attached_assets
    const prompt2_1 = fs.readFileSync('attached_assets/prompt2-1_1766670630142.md', 'utf-8');
    const prompt2_2 = fs.readFileSync('attached_assets/prompt2-2_1766670630141.md', 'utf-8');
    
    console.log('=== Prompts Loaded ===');
    console.log(`Prompt 2-1 length: ${prompt2_1.length} chars`);
    console.log(`Prompt 2-2 length: ${prompt2_2.length} chars`);
    
    // Create File Search Store
    console.log('\n=== Creating File Search Store ===');
    const fileSearchStore = await (client as any).fileSearchStores.create({
      config: { displayName: 'test-new-prompts' }
    });
    console.log(`Store created: ${fileSearchStore.name}`);

    // Create sample data files
    const sampleTarget = `【市場・顧客ニーズ】
半導体製造装置向け高純度部材市場
- 顧客: 半導体製造装置メーカー (Applied Materials, Lam Research, Tokyo Electron)
- 課題: プラズマエッチングプロセスでの部材損耗による歩留まり低下`;

    const sampleTech = `【技術シーズ】
Cap-01: CVD-SiC (化学気相成長炭化ケイ素) - 高純度、耐プラズマ性
Cap-02: 精密加工技術 - ミクロン精度の形状制御
Cap-03: 表面処理技術 - 低パーティクル特性`;

    const tempDir = os.tmpdir();
    const targetFile = path.join(tempDir, 'target.txt');
    const techFile = path.join(tempDir, 'tech.txt');
    
    fs.writeFileSync(targetFile, sampleTarget);
    fs.writeFileSync(techFile, sampleTech);
    
    console.log('\n=== Uploading target_specification ===');
    let op = await (client as any).fileSearchStores.uploadToFileSearchStore({
      file: targetFile,
      fileSearchStoreName: fileSearchStore.name!,
      config: { displayName: 'target.md' }
    });
    await waitForOperation(op);

    console.log('\n=== Uploading technical_assets ===');
    op = await (client as any).fileSearchStores.uploadToFileSearchStore({
      file: techFile,
      fileSearchStoreName: fileSearchStore.name!,
      config: { displayName: 'tech_prop.md' }
    });
    await waitForOperation(op);

    fs.unlinkSync(targetFile);
    fs.unlinkSync(techFile);

    // Test Step 2-1 prompt
    console.log('\n=== Testing Step 2-1 Prompt ===');
    console.log(`Prompt preview: ${prompt2_1.substring(0, 150)}...`);
    
    try {
      const interaction = await (client as any).interactions.create({
        input: prompt2_1,
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
      console.log(`✅ Step 2-1 started successfully! Interaction ID: ${interaction.id}`);
    } catch (apiError: any) {
      console.error('❌ Step 2-1 API Error:', apiError.message);
      console.error('Error details:', JSON.stringify(apiError, null, 2));
    }

    // Cleanup
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
