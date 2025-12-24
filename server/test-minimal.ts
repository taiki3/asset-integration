import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const DEEP_RESEARCH_AGENT = "deep-research-pro-preview-12-2025";
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log("=== Minimal Deep Research Test ===");
  
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  
  // 1. Create store
  console.log("1. Creating store...");
  const store = await (client as any).fileSearchStores.create({
    config: { displayName: `test-${Date.now()}` }
  });
  const storeName = store.name;
  console.log("   Store:", storeName);
  
  try {
    // 2. Upload file
    console.log("2. Uploading file...");
    const tempFile = path.join(os.tmpdir(), "test.txt");
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
    console.log("   Uploaded");
    fs.unlinkSync(tempFile);
    
    // 3. Start Deep Research - exact same format as working test
    console.log("3. Starting Deep Research...");
    const prompt = "添付ファイルの技術資産を分析し、半導体市場向けの事業仮説を1件生成してください。";
    console.log("   Prompt:", prompt);
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
    
    // 4. Poll (max 5 min)
    console.log("4. Polling...");
    const startTime = Date.now();
    while (Date.now() - startTime < 5 * 60 * 1000) {
      await sleep(15000);
      const status = await (client as any).interactions.get(interaction.id);
      console.log("   Status:", status.status, `(${Math.floor((Date.now() - startTime) / 1000)}s)`);
      
      if (status.status === "completed") {
        console.log("\n=== COMPLETED ===");
        const outputs = status.outputs || [];
        console.log("Preview:", outputs[outputs.length - 1]?.text?.substring(0, 300));
        break;
      } else if (status.status === "failed") {
        console.log("FAILED:", status.error);
        break;
      }
    }
    
  } finally {
    console.log("5. Cleanup...");
    await (client as any).fileSearchStores.delete({ name: storeName, config: { force: true } });
  }
  
  console.log("\n=== DONE ===");
}

main().catch(e => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
