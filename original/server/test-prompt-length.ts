import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const DEEP_RESEARCH_AGENT = "deep-research-pro-preview-12-2025";
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log("=== Test prompt 100 chars ===");
  
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  
  console.log("1. Creating store...");
  const store = await (client as any).fileSearchStores.create({
    config: { displayName: `test-${Date.now()}` }
  });
  const storeName = store.name;
  console.log("   Store:", storeName);
  
  try {
    console.log("2. Uploading file...");
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
    console.log("   Uploaded");
    
    // Slightly longer prompt (around 100 chars)
    console.log("3. Starting Deep Research...");
    const prompt = "添付ファイルの技術資産を分析し、半導体市場向けの事業仮説を2件生成してください。技術的な実現可能性と成長市場であることが条件です。";
    console.log("   Prompt length:", prompt.length);
    
    const interaction = await (client as any).interactions.create({
      input: prompt,
      agent: DEEP_RESEARCH_AGENT,
      background: true,
      tools: [
        { type: 'file_search', file_search_store_names: [storeName] }
      ]
    });
    console.log("   SUCCESS! ID:", interaction.id);
    
  } finally {
    console.log("4. Cleanup...");
    await (client as any).fileSearchStores.delete({ name: storeName, config: { force: true } });
  }
  
  console.log("=== DONE ===");
}

main().catch(e => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
