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
    fs.writeFileSync(tempFile, "技術資産データ", 'utf-8');
    let op = await (client as any).fileSearchStores.uploadToFileSearchStore({
      file: tempFile,
      fileSearchStoreName: storeName,
      config: { displayName: "data" }
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
    return "SUCCESS";
  } catch (e: any) {
    return e.message?.includes("400") ? "400" : e.message.substring(0, 50);
  } finally {
    await (client as any).fileSearchStores.delete({ name: storeName, config: { force: true } });
  }
}

async function main() {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  
  // ドキュメントの例に近いフォーマット（英語、約200バイト）
  const prompt1 = "Research the technical assets in attached files and generate 2 business hypotheses for semiconductor equipment market. Include hypothesis title, industry, and summary.";
  const bytes1 = Buffer.byteLength(prompt1, 'utf-8');
  console.log(`Test 1: English, ${prompt1.length} chars, ${bytes1} bytes`);
  console.log("Result:", await testPrompt(client, prompt1, "english"));
  
  await sleep(65000);
  
  // 同等のバイト数で日本語
  const prompt2 = "添付ファイルの技術資産を分析し、半導体製造装置市場向けの事業仮説を2件生成。仮説タイトル、業界、概要を含める。";
  const bytes2 = Buffer.byteLength(prompt2, 'utf-8');
  console.log(`\nTest 2: Japanese, ${prompt2.length} chars, ${bytes2} bytes`);
  console.log("Result:", await testPrompt(client, prompt2, "japanese"));
}

main().catch(e => console.error("ERROR:", e.message));
