import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const DEEP_RESEARCH_AGENT = "deep-research-pro-preview-12-2025";
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function testFileSize(client: any, fileSize: number): Promise<boolean> {
  const store = await (client as any).fileSearchStores.create({
    config: { displayName: `test-${Date.now()}` }
  });
  const storeName = store.name;
  
  try {
    // Generate content of specified size
    const content = "技術資産データ。".repeat(Math.ceil(fileSize / 8)).substring(0, fileSize);
    
    const tempFile = path.join(os.tmpdir(), "file.txt");
    fs.writeFileSync(tempFile, content, 'utf-8');
    console.log(`   Actual file size: ${fs.statSync(tempFile).size} bytes`);
    
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
    
    // Short prompt
    const prompt = "添付ファイルを分析し、事業仮説を1件生成。";
    
    await (client as any).interactions.create({
      input: prompt,
      agent: DEEP_RESEARCH_AGENT,
      background: true,
      tools: [{ type: 'file_search', file_search_store_names: [storeName] }]
    });
    return true;
  } catch (e: any) {
    console.log(`   Error: ${e.message}`);
    return false;
  } finally {
    await (client as any).fileSearchStores.delete({ name: storeName, config: { force: true } });
  }
}

async function main() {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  
  // Binary search: 成功=15B, 本番=40KB
  // Test: 10KB
  console.log("Test: 10KB file");
  console.log("Result:", await testFileSize(client, 10000) ? "SUCCESS" : "FAILED");
}

main().catch(e => console.error("ERROR:", e.message));
