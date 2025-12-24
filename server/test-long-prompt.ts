import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const DEEP_RESEARCH_AGENT = "deep-research-pro-preview-12-2025";
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log("=== One-File Test with LONG prompt ===");
  
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  
  console.log("1. Creating store...");
  const store = await (client as any).fileSearchStores.create({
    config: { displayName: `test-${Date.now()}` }
  });
  const storeName = store.name;
  console.log("   Store:", storeName);
  
  try {
    // Upload ONE file
    console.log("2. Uploading ONE file...");
    
    const tempFile1 = path.join(os.tmpdir(), "file1.txt");
    fs.writeFileSync(tempFile1, "技術資産：CVD-SiC", 'utf-8');
    let op = await (client as any).fileSearchStores.uploadToFileSearchStore({
      file: tempFile1,
      fileSearchStoreName: storeName,
      config: { displayName: "test" }
    });
    while (!op.done) {
      await sleep(2000);
      op = await (client as any).operations.get({ operation: op });
    }
    fs.unlinkSync(tempFile1);
    console.log("   Uploaded");
    
    // LONG prompt
    console.log("3. Starting Deep Research with LONG prompt...");
    const prompt = `あなたは事業仮説を生成するための専門リサーチャーです。

添付されたファイルを参照してください：
- target_specification: ターゲット市場・分野の仕様書
- technical_assets: 利用可能な技術資産のリスト

【タスク】
添付された「technical_assets」の技術資産を分析し、「target_specification」で指定された市場において、現在のトレンドと照らし合わせて、2件の新しい事業仮説を生成してください。

【各仮説に必要な要素】
1. 仮説タイトル: 具体的で分かりやすいタイトル
2. 業界・分野: 対象となる業界と分野
3. 事業仮説概要: 事業の概要説明

【条件】
1. 技術的な実現可能性が高いこと
2. 成長市場であること`;

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
    
    // Don't need to poll, just confirm the creation worked
    console.log("   Stopping early - creation succeeded!");
    
  } finally {
    console.log("4. Cleanup...");
    await (client as any).fileSearchStores.delete({ name: storeName, config: { force: true } });
  }
  
  console.log("\n=== DONE ===");
}

main().catch(e => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
