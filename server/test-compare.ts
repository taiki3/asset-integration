import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const DEEP_RESEARCH_AGENT = "deep-research-pro-preview-12-2025";
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log("=== Comparison Test ===");
  
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  
  // 1. Create store - with SAME displayName format as working test
  console.log("1. Creating store...");
  const store = await (client as any).fileSearchStores.create({
    config: { displayName: `test-${Date.now()}` }
  });
  const storeName = store.name;
  console.log("   Store:", storeName);
  
  try {
    // 2. Upload files - SAME as production
    console.log("2. Uploading files...");
    
    const targetSpec = `ターゲット市場：半導体製造装置（EUV・NIL）分野
対象業界：半導体製造装置メーカー、デバイスメーカー
主要課題：高精度・高信頼性部品への需要増加
成長見込み：年率15%成長`;

    const technicalAssets = `技術資産リスト:
Cap-001: 窒化ケイ素(Si3N4)焼結体 - 高強度・高靭性セラミック
Cap-010: 反応含浸SiSiC製造技術 - 大型複雑形状に対応
Cap-013: CVD-SiC成膜技術 - 高純度・高密度コーティング
Cap-023: Y2O3セラミックス - 耐プラズマ性に優れる`;

    // Upload target spec
    const tempFile1 = path.join(os.tmpdir(), "target_specification.txt");
    fs.writeFileSync(tempFile1, targetSpec, 'utf-8');
    
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
    console.log("   Uploaded target_specification");
    
    // Upload technical assets
    const tempFile2 = path.join(os.tmpdir(), "technical_assets.txt");
    fs.writeFileSync(tempFile2, technicalAssets, 'utf-8');
    
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
    console.log("   Uploaded technical_assets");
    
    // 3. Start Deep Research - LONG prompt
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
4. 顧客の解決不能な課題: 顧客が従来技術では解決できなかった物理的トレードオフ
5. 素材が活躍する舞台: 技術がどのような場面で活用されるか
6. 素材の役割: 技術がどのようにトレードオフを解決するか

【条件】
1. 技術的な実現可能性が高いこと
2. 成長市場であること
3. 競合他社がまだ参入していないニッチ領域であること

【重要】
- 調査した情報源と根拠を明記してください
- 具体的な市場規模や成長率などの数値データがあれば含めてください
- 各仮説について、なぜその技術資産が競争優位性を持つのか説明してください`;

    console.log("   Prompt length:", prompt.length, "chars");
    
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
  console.error("Stack:", e.stack);
  process.exit(1);
});
