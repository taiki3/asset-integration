/**
 * Deep Research API Test
 * 本番コードと同じ共有モジュールを使用してテスト
 */

import { GoogleGenAI } from "@google/genai";
import { executeFullDeepResearch } from "./deep-research";

async function runTest() {
  console.log("=== Deep Research API Integration Test ===\n");
  
  if (!process.env.GEMINI_API_KEY) {
    console.error("ERROR: GEMINI_API_KEY not set");
    process.exit(1);
  }
  
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  // Test with minimal data (same structure as production)
  const testParams = {
    client,
    targetSpec: `ターゲット市場：半導体製造装置（EUV・NIL）分野
対象業界：半導体製造装置メーカー、デバイスメーカー
主要課題：高精度・高信頼性部品への需要増加
成長見込み：年率15%成長`,
    technicalAssets: `技術資産リスト:
Cap-001: 窒化ケイ素(Si3N4)焼結体 - 高強度・高靭性セラミック
Cap-010: 反応含浸SiSiC製造技術 - 大型複雑形状に対応
Cap-013: CVD-SiC成膜技術 - 高純度・高密度コーティング
Cap-023: Y2O3セラミックス - 耐プラズマ性に優れる`,
    hypothesisCount: 2,
    runId: 0, // Test mode
    onProgress: (phase: string, detail: string) => {
      console.log(`[Progress] ${phase}: ${detail}`);
    }
  };
  
  console.log("Test config:");
  console.log(`  Target spec length: ${testParams.targetSpec.length} chars`);
  console.log(`  Technical assets length: ${testParams.technicalAssets.length} chars`);
  console.log(`  Hypothesis count: ${testParams.hypothesisCount}`);
  console.log();
  
  try {
    const report = await executeFullDeepResearch(testParams);
    
    console.log("\n=== TEST PASSED ===");
    console.log(`Report length: ${report.length} chars`);
    console.log("\nReport preview (first 500 chars):");
    console.log(report.substring(0, 500));
    console.log("\n...\n");
    
    process.exit(0);
  } catch (e: any) {
    console.error("\n=== TEST FAILED ===");
    console.error("Error:", e.message);
    if (e.stack) {
      console.error("Stack:", e.stack);
    }
    process.exit(1);
  }
}

runTest();
