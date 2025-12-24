import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const DEEP_RESEARCH_AGENT = "deep-research-pro-preview-12-2025";
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log("=== Two-File Test with SHORT prompt ===");
  
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  
  console.log("1. Creating store...");
  const store = await (client as any).fileSearchStores.create({
    config: { displayName: `test-${Date.now()}` }
  });
  const storeName = store.name;
  console.log("   Store:", storeName);
  
  try {
    // Upload TWO files (like production)
    console.log("2. Uploading TWO files...");
    
    const tempFile1 = path.join(os.tmpdir(), "file1.txt");
    fs.writeFileSync(tempFile1, "ターゲット市場：半導体製造装置", 'utf-8');
    let op = await (client as any).fileSearchStores.uploadToFileSearchStore({
      file: tempFile1,
      fileSearchStoreName: storeName,
      config: { displayName: "target_specification" }
    });
    while (!op.done) {
      await sleep(2000);
      op = await (client as any).operations.get({ operation: op });
    }
    fs.unlinkSync(tempFile1);
    console.log("   Uploaded file 1");
    
    const tempFile2 = path.join(os.tmpdir(), "file2.txt");
    fs.writeFileSync(tempFile2, "技術資産リスト:\nCap-001: 窒化ケイ素\nCap-010: SiSiC製造技術", 'utf-8');
    op = await (client as any).fileSearchStores.uploadToFileSearchStore({
      file: tempFile2,
      fileSearchStoreName: storeName,
      config: { displayName: "technical_assets" }
    });
    while (!op.done) {
      await sleep(2000);
      op = await (client as any).operations.get({ operation: op });
    }
    fs.unlinkSync(tempFile2);
    console.log("   Uploaded file 2");
    
    // SHORT prompt (same length as successful test)
    console.log("3. Starting Deep Research with SHORT prompt...");
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
    
    console.log("4. Polling...");
    const startTime = Date.now();
    while (Date.now() - startTime < 5 * 60 * 1000) {
      await sleep(15000);
      const status = await (client as any).interactions.get(interaction.id);
      console.log("   Status:", status.status, `(${Math.floor((Date.now() - startTime) / 1000)}s)`);
      
      if (status.status === "completed") {
        console.log("\n=== COMPLETED ===");
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
