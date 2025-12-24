import { GoogleGenAI } from "@google/genai";
import { STEP2_PROMPT } from "./prompts";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const DEEP_RESEARCH_AGENT = "deep-research-pro-preview-12-2025";
const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

function buildStep2Prompt(
  hypothesisCount: number,
  targetSpecFile: string,
  technicalAssetsFile: string,
  previousHypothesesFile?: string
): string {
  let prompt = STEP2_PROMPT
    .replace(/\{HYPOTHESIS_COUNT\}/g, hypothesisCount.toString())
    .replace("{TARGET_SPEC}", `添付ファイル「${targetSpecFile}」の内容を参照してください。`)
    .replace("{TECHNICAL_ASSETS}", `添付ファイル「${technicalAssetsFile}」の内容を参照してください。`);
  
  if (previousHypothesesFile) {
    prompt = prompt.replace("{PREVIOUS_HYPOTHESES}", `添付ファイル「${previousHypothesesFile}」の内容を参照してください。`);
  } else {
    prompt = prompt.replace("{PREVIOUS_HYPOTHESES}", "なし（初回実行）");
  }
  
  return prompt;
}

async function uploadTextToStore(storeName: string, content: string, displayName: string) {
  const tempFile = path.join(os.tmpdir(), `${displayName}.txt`);
  fs.writeFileSync(tempFile, content, 'utf-8');
  try {
    let op = await (client as any).fileSearchStores.uploadToFileSearchStore({
      file: tempFile,
      fileSearchStoreName: storeName,
      config: { displayName }
    });
    while (!op.done) {
      await new Promise(r => setTimeout(r, 3000));
      op = await (client as any).operations.get({ operation: op });
    }
    console.log(`  Uploaded: ${displayName}`);
  } finally {
    fs.unlinkSync(tempFile);
  }
}

async function main() {
  console.log("=== Full Integration Test ===\n");
  
  // Create store
  const store = await (client as any).fileSearchStores.create({
    config: { displayName: `test-${Date.now()}` }
  });
  console.log(`Created store: ${store.name}\n`);
  
  try {
    // Upload test data
    await uploadTextToStore(store.name, "半導体製造装置市場向け新規素材ビジネス", "target_specification");
    await uploadTextToStore(store.name, "高純度セラミックス材料、ナノ粒子合成技術、薄膜形成技術", "technical_assets");
    
    // Build prompt
    const prompt = buildStep2Prompt(5, "target_specification", "technical_assets");
    console.log(`\nPrompt: ${prompt.length} chars, ${Buffer.byteLength(prompt, 'utf-8')} bytes`);
    
    // Call Deep Research API
    console.log("\nCalling Deep Research API...");
    const interaction = await (client as any).interactions.create({
      input: prompt,
      agent: DEEP_RESEARCH_AGENT,
      background: true,
      tools: [{ type: 'file_search', file_search_store_names: [store.name] }]
    });
    
    console.log(`\nSUCCESS! Interaction ID: ${interaction.id}`);
    console.log("No 400 error - full STEP2 prompt works with file_search!");
    
  } finally {
    await (client as any).fileSearchStores.delete({ name: store.name, config: { force: true } });
    console.log("\nCleaned up store.");
  }
}

main().catch(e => {
  console.error("ERROR:", e.message);
  if (e.message?.includes("400")) console.error("GOT 400 ERROR!");
  process.exit(1);
});
