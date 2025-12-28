import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const DEEP_RESEARCH_AGENT = "deep-research-pro-preview-12-2025";
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function testPrompt(client: any, prompt: string, label: string): Promise<string> {
  const store = await (client as any).fileSearchStores.create({
    config: { displayName: `test-${Date.now()}` }
  });
  const storeName = store.name;
  
  try {
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
    
    await (client as any).interactions.create({
      input: prompt,
      agent: DEEP_RESEARCH_AGENT,
      background: true,
      tools: [{ type: 'file_search', file_search_store_names: [storeName] }]
    });
    return `SUCCESS`;
  } catch (e: any) {
    return e.message?.includes("503") ? "503" : 
           e.message?.includes("400") ? "400" : e.message.substring(0, 50);
  } finally {
    await (client as any).fileSearchStores.delete({ name: storeName, config: { force: true } });
  }
}

async function main() {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  
  // Test 1: 長いプロンプト、改行なし
  const prompt1 = "添付ファイルの技術資産を分析し、半導体市場向けの事業仮説を2件生成してください。各仮説には仮説タイトル、対象業界、事業概要を含めてください。条件は技術的実現可能性が高いことです。";
  console.log(`Test 1: ${prompt1.length} chars, NO newlines`);
  console.log("Result:", await testPrompt(client, prompt1, "no-newline"));
  
  await sleep(65000);
  
  // Test 2: 同等の長さ、改行あり
  const prompt2 = `添付ファイルを分析し、事業仮説を生成。

条件：技術的実現可能性が高い。`;
  console.log(`\nTest 2: ${prompt2.length} chars, WITH newlines`);
  console.log("Result:", await testPrompt(client, prompt2, "with-newline"));
}

main().catch(e => console.error("ERROR:", e.message));
