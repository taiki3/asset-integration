import { STEP2_PROMPT } from "./prompts";

// Build STEP2 prompt with file references for Deep Research (same as in gmethod-pipeline.ts)
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

// Test
console.log("=== Testing buildStep2Prompt ===\n");

const prompt = buildStep2Prompt(5, "target_specification", "technical_assets");
console.log(`Prompt length: ${prompt.length} chars, ${Buffer.byteLength(prompt, 'utf-8')} bytes\n`);
console.log("=== Full Prompt ===\n");
console.log(prompt);
