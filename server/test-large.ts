import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const DEEP_RESEARCH_AGENT = "deep-research-pro-preview-12-2025";
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function testFileSize(client: any, charCount: number): Promise<string> {
  const store = await (client as any).fileSearchStores.create({
    config: { displayName: `test-${Date.now()}` }
  });
  const storeName = store.name;
  
  try {
    const content = "技術資産データ。".repeat(Math.ceil(charCount / 8)).substring(0, charCount);
    
    const tempFile = path.join(os.tmpdir(), "file.txt");
    fs.writeFileSync(tempFile, content, 'utf-8');
    const byteSize = fs.statSync(tempFile).size;
    
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
      input: "添付ファイルを分析し、事業仮説を生成。",
      agent: DEEP_RESEARCH_AGENT,
      background: true,
      tools: [{ type: 'file_search', file_search_store_names: [storeName] }]
    });
    return `SUCCESS (${charCount} chars, ${byteSize} bytes)`;
  } catch (e: any) {
    const msg = e.message?.includes("503") ? "503" : 
                e.message?.includes("400") ? "400" : e.message.substring(0, 100);
    return `FAILED: ${msg}`;
  } finally {
    await (client as any).fileSearchStores.delete({ name: storeName, config: { force: true } });
  }
}

async function main() {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  
  // 5000文字
  console.log("Test: 5000 chars");
  console.log(await testFileSize(client, 5000));
  
  await sleep(65000);
  
  // 10000文字
  console.log("\nTest: 10000 chars");
  console.log(await testFileSize(client, 10000));
  
  await sleep(65000);
  
  // 30000文字 (本番に近い)
  console.log("\nTest: 30000 chars");
  console.log(await testFileSize(client, 30000));
}

main().catch(e => console.error("ERROR:", e.message));
