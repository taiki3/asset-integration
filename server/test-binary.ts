import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const DEEP_RESEARCH_AGENT = "deep-research-pro-preview-12-2025";
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function testPrompt(client: any, prompt: string): Promise<boolean> {
  const store = await (client as any).fileSearchStores.create({
    config: { displayName: `test-${Date.now()}` }
  });
  const storeName = store.name;
  
  try {
    const tempFile = path.join(os.tmpdir(), "file.txt");
    fs.writeFileSync(tempFile, "技術資産：CVD-SiC", 'utf-8');
    let op = await (client as any).fileSearchStores.uploadToFileSearchStore({
      file: tempFile,
      fileSearchStoreName: storeName,
      config: { displayName: "test" }
    });
    while (!op.done) {
      await sleep(2000);
      op = await (client as any).operations.get({ operation: op });
    }
    fs.unlinkSync(tempFile);
    
    await (client as any).interactions.create({
      input: prompt,
      agent: DEEP_RESEARCH_AGENT,
      background: true,
      tools: [{ type: 'file_search', file_search_store_names: [storeName] }]
    });
    return true;
  } catch (e) {
    return false;
  } finally {
    await (client as any).fileSearchStores.delete({ name: storeName, config: { force: true } });
  }
}

async function main() {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  
  // Test prompts with different lengths
  
  // Test 1: 90文字の単一行
  const test1 = "添付ファイルの技術資産を分析し、半導体市場向けの事業仮説を2件生成してください。各仮説には仮説タイトル、対象業界、事業概要、顧客の課題を含めてください。";
  console.log(`Test 1 (${test1.length} chars, single line):`, test1.substring(0, 50) + "...");
  console.log("Result:", await testPrompt(client, test1) ? "SUCCESS" : "FAILED");
  
  console.log("Waiting 60s for rate limit...");
  await sleep(60000);
  
  // Test 2: 改行を含む短いプロンプト
  const test2 = `添付ファイルを分析し、事業仮説を生成。

条件：成長市場であること。`;
  console.log(`\nTest 2 (${test2.length} chars, with newlines):`, JSON.stringify(test2.substring(0, 50)));
  console.log("Result:", await testPrompt(client, test2) ? "SUCCESS" : "FAILED");
}

main().catch(e => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
