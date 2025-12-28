/**
 * Deep Research API Module
 * File Search Store + Deep Research の共通実装
 * 本番コードとテストで共通して使用する
 */

import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export const DEEP_RESEARCH_AGENT = "deep-research-pro-preview-12-2025";

// Rate limiting: 1 request per minute
const DEEP_RESEARCH_MIN_INTERVAL_MS = 60 * 1000;
let lastDeepResearchRequestTime: number = 0;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function waitForDeepResearchRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastDeepResearchRequestTime;
  
  if (lastDeepResearchRequestTime > 0 && timeSinceLastRequest < DEEP_RESEARCH_MIN_INTERVAL_MS) {
    const waitTime = DEEP_RESEARCH_MIN_INTERVAL_MS - timeSinceLastRequest;
    console.log(`[Rate Limit] Waiting ${Math.ceil(waitTime / 1000)}s before next Deep Research request...`);
    await sleep(waitTime);
  }
  
  lastDeepResearchRequestTime = Date.now();
}

export async function createFileSearchStore(client: GoogleGenAI, displayName: string): Promise<string> {
  console.log(`[DeepResearch] Creating File Search Store: ${displayName}`);
  const store = await (client as any).fileSearchStores.create({
    config: { displayName }
  });
  console.log(`[DeepResearch] Store created: ${store.name}`);
  return store.name;
}

export async function uploadTextToFileSearchStore(
  client: GoogleGenAI,
  storeName: string,
  content: string,
  displayName: string
): Promise<string> {
  const tempDir = os.tmpdir();
  const safeFileName = displayName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const tempFile = path.join(tempDir, `${safeFileName}.txt`);
  fs.writeFileSync(tempFile, content, 'utf-8');

  try {
    let operation = await (client as any).fileSearchStores.uploadToFileSearchStore({
      file: tempFile,
      fileSearchStoreName: storeName,
      config: { displayName }
    });

    while (!operation.done) {
      console.log(`[DeepResearch] Waiting for ${displayName} upload...`);
      await sleep(3000);
      operation = await (client as any).operations.get({ operation });
    }
    console.log(`[DeepResearch] Uploaded: ${displayName} (${content.length} chars)`);
    return displayName;
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

export async function deleteFileSearchStore(client: GoogleGenAI, storeName: string): Promise<void> {
  try {
    await (client as any).fileSearchStores.delete({
      name: storeName,
      config: { force: true }
    });
    console.log(`[DeepResearch] Store deleted: ${storeName}`);
  } catch (e: any) {
    console.warn(`[DeepResearch] Failed to delete store: ${e.message}`);
  }
}

export interface DeepResearchConfig {
  prompt: string;
  fileSearchStoreName: string;
}

export async function startDeepResearch(
  client: GoogleGenAI,
  config: DeepResearchConfig
): Promise<string> {
  console.log(`[DeepResearch] Starting with prompt: "${config.prompt.substring(0, 100)}..." (${config.prompt.length} chars)`);
  console.log(`[DeepResearch] File Search Store: ${config.fileSearchStoreName}`);
  
  await waitForDeepResearchRateLimit();
  
  const interaction = await (client as any).interactions.create({
    input: config.prompt,
    agent: DEEP_RESEARCH_AGENT,
    background: true,
    tools: [
      { type: 'file_search', file_search_store_names: [config.fileSearchStoreName] }
    ]
  });
  
  console.log(`[DeepResearch] Started. Interaction ID: ${interaction.id}`);
  return interaction.id;
}

export async function pollDeepResearchCompletion(
  client: GoogleGenAI,
  interactionId: string,
  options: {
    maxTimeMs?: number;
    pollIntervalMs?: number;
    onProgress?: (status: string, elapsedSec: number) => void;
  } = {}
): Promise<string> {
  const { 
    maxTimeMs = 30 * 60 * 1000, 
    pollIntervalMs = 15000,
    onProgress 
  } = options;
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxTimeMs) {
    await sleep(pollIntervalMs);
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    
    try {
      const status = await (client as any).interactions.get(interactionId);
      console.log(`[DeepResearch] [${elapsed}s] Status: ${status.status}`);
      
      if (onProgress) {
        onProgress(status.status, elapsed);
      }
      
      if (status.status === "completed") {
        const outputs = status.outputs || [];
        const finalOutput = outputs[outputs.length - 1];
        return finalOutput?.text || "";
      } else if (status.status === "failed") {
        throw new Error(`Deep Research failed: ${status.error || "Unknown error"}`);
      }
    } catch (e: any) {
      if (e.message?.includes("Deep Research failed")) {
        throw e;
      }
      console.warn(`[DeepResearch] [${elapsed}s] Poll error (continuing): ${e.message}`);
    }
  }
  
  throw new Error("Deep Research timed out");
}

/**
 * Build the instruction document to upload (contains detailed task instructions)
 */
export function buildInstructionDocument(hypothesisCount: number, hasPreviousHypotheses: boolean): string {
  return `【タスク】
添付された「technical_assets」の技術資産を分析し、「target_specification」で指定された市場において、現在のトレンドと照らし合わせて、${hypothesisCount}件の新しい事業仮説を生成してください。

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
${hasPreviousHypotheses ? '4. 過去に生成した仮説と重複しないこと（previous_hypotheses参照）' : ''}

【重要】
- 調査した情報源と根拠を明記してください
- 具体的な市場規模や成長率などの数値データがあれば含めてください
- 各仮説について、なぜその技術資産が競争優位性を持つのか説明してください`;
}

/**
 * Full Deep Research flow - used by both production and test
 */
export interface FullDeepResearchParams {
  client: GoogleGenAI;
  targetSpec: string;
  technicalAssets: string;
  previousHypotheses?: string;
  hypothesisCount: number;
  runId?: number;
  onProgress?: (phase: string, detail: string) => void;
}

export async function executeFullDeepResearch(params: FullDeepResearchParams): Promise<string> {
  const { client, targetSpec, technicalAssets, previousHypotheses, hypothesisCount, runId = 0, onProgress } = params;
  const logPrefix = runId ? `[Run ${runId}]` : '[Test]';
  
  let fileSearchStoreName: string | null = null;
  
  try {
    // 1. Create File Search Store
    onProgress?.("uploading_files", "データをFile Searchストアにアップロード中...");
    fileSearchStoreName = await createFileSearchStore(
      client,
      `gmethod-run-${runId}-${Date.now()}`
    );
    console.log(`${logPrefix} Created File Search Store: ${fileSearchStoreName}`);
    
    // 2. Upload data files
    await uploadTextToFileSearchStore(client, fileSearchStoreName, targetSpec, "target_specification");
    console.log(`${logPrefix} Uploaded target specification`);
    
    await uploadTextToFileSearchStore(client, fileSearchStoreName, technicalAssets, "technical_assets");
    console.log(`${logPrefix} Uploaded technical assets`);
    
    if (previousHypotheses) {
      await uploadTextToFileSearchStore(client, fileSearchStoreName, previousHypotheses, "previous_hypotheses");
      console.log(`${logPrefix} Uploaded previous hypotheses`);
    }
    
    // 3. Upload detailed instructions as a file (CRITICAL: keeps prompt short)
    const instructions = buildInstructionDocument(hypothesisCount, !!previousHypotheses);
    await uploadTextToFileSearchStore(client, fileSearchStoreName, instructions, "task_instructions");
    console.log(`${logPrefix} Uploaded task instructions (${instructions.length} chars)`);
    
    // 4. Send prompt to Deep Research agent
    const shortPrompt = "task_instructionsの指示に従い事業仮説を生成してください。";
    console.log(`${logPrefix} Prompt: "${shortPrompt}"`);
    
    // 5. Start Deep Research
    onProgress?.("deep_research_starting", "Deep Research エージェントを起動中...");
    const interactionId = await startDeepResearch(client, {
      prompt: shortPrompt,
      fileSearchStoreName
    });
    console.log(`${logPrefix} Deep Research started. Interaction ID: ${interactionId}`);
    
    // 6. Poll for completion
    onProgress?.("deep_research_running", "Deep Research エージェントが調査中です...");
    const report = await pollDeepResearchCompletion(client, interactionId, {
      onProgress: (status, elapsed) => {
        onProgress?.("deep_research_running", `Deep Research 実行中... (${elapsed}秒経過)`);
      }
    });
    
    console.log(`${logPrefix} Deep Research completed. Report length: ${report.length} chars`);
    return report;
    
  } finally {
    // Cleanup
    if (fileSearchStoreName) {
      await deleteFileSearchStore(client, fileSearchStoreName);
    }
  }
}
