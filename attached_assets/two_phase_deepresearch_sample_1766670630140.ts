/**
 * Google Gemini Deep Research API - 2段階実行サンプル
 * 
 * このサンプルは、Deep Research APIを使用して2段階の分析を行う方法を示します：
 * - Step 1: 発散的思考で複数の仮説を生成し、最適な1つを選定
 * - Step 2: 選定された仮説を深掘りし、詳細な事業化戦略を構築
 * 
 * 必要な環境変数:
 * - GEMINI_API_KEY: Google Gemini APIキー
 * - HTTPS_PROXY/HTTP_PROXY: プロキシ環境の場合に設定（オプション）
 * 
 * 使用方法:
 * 1. .envファイルにGEMINI_API_KEY=your-api-keyを設定
 * 2. npx tsx two_phase_deepresearch_sample.ts で実行
 * 
 * 注意事項:
 * - Deep Researchは20-60分かかる長時間処理です
 * - File Search機能を使用するため、ファイルは一時的にGoogleのサーバーにアップロードされます
 * - 処理完了後、アップロードしたファイルは自動的に削除されます
 */

import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

// ===== 設定定数 =====
const CONFIG = {
  // Deep Research エージェント名（2024年12月時点の最新版）
  AGENT: 'deep-research-pro-preview-12-2025',
  
  // ポーリング間隔（秒）- APIの状態確認頻度
  POLLING_INTERVAL: 30,
  
  // タイムアウト時間（分）- 通常20-60分で完了
  TIMEOUT_MINUTES: 90,
  
  // デバッグモード - 詳細なログを出力
  DEBUG: false
};

// ===== プロキシ設定 =====
/**
 * 企業内などプロキシ環境で実行する場合の設定
 * 環境変数 HTTPS_PROXY または HTTP_PROXY が設定されている場合に自動的に適用
 */
const setupProxy = () => {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (proxyUrl) {
    console.log(`🌐 プロキシを使用: ${proxyUrl}`);
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
  }
};

// ===== APIクライアント初期化 =====
/**
 * Google Gemini APIクライアントを初期化
 * 環境変数からAPIキーを読み込み
 */
const initializeClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('❌ GEMINI_API_KEY が .env ファイルに設定されていません');
  }
  return new GoogleGenAI({ apiKey });
};

// ===== File Search Store へのファイルアップロード =====
/**
 * Deep ResearchのFile Search機能で使用するファイルをアップロード
 * @param client - Google Gemini APIクライアント
 * @param storeName - File Search Storeの名前
 * @param files - アップロードするファイルの配列
 */
const uploadFilesToStore = async (
  client: GoogleGenAI,
  storeName: string,
  files: Array<{ path: string; name: string; description: string }>
) => {
  console.log('\n📤 File Search Store にファイルをアップロード中...');
  
  for (const file of files) {
    console.log(`  • ${file.name}: ${file.description}`);
    
    // ファイルの存在確認
    if (!fs.existsSync(file.path)) {
      throw new Error(`ファイルが見つかりません: ${file.path}`);
    }
    
    // ファイルをアップロード（非同期処理）
    let operation = await client.fileSearchStores.uploadToFileSearchStore({
      file: file.path,
      fileSearchStoreName: storeName,
      config: {
        displayName: file.name,
        mimeType: 'text/plain', // 注意: text/markdown は使用できない
      }
    });

    // アップロードとインデックス作成の完了を待機
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      operation = await client.operations.get({ operation });
    }
    console.log(`    ✓ ${file.name} のインデックス作成完了`);
  }
};

// ===== Deep Research実行（ポーリングモード） =====
/**
 * Deep Researchをバックグラウンドで実行し、定期的に状態を確認
 * @param client - Google Gemini APIクライアント
 * @param prompt - 分析指示プロンプト
 * @param storeName - File Search Storeの名前
 * @returns 生成されたレポートのテキスト
 */
const runDeepResearch = async (
  client: GoogleGenAI,
  prompt: string,
  storeName: string
): Promise<string> => {
  console.log('\n🚀 Deep Research を開始（バックグラウンド実行）...');
  
  // Deep Research インタラクションを作成
  // 注意: agent_configはsnake_case（agentConfigではない）
  let interaction = await client.interactions.create({
    input: prompt,
    agent: CONFIG.AGENT,
    background: true, // バックグラウンド実行（長時間処理のため）
    tools: [{
      type: 'file_search',
      file_search_store_names: [storeName]
    }],
    agent_config: {
      type: 'deep-research'
    }
  } as any);

  console.log(`📌 インタラクションID: ${interaction.id}`);
  console.log('⏳ 結果を待機中（20-60分かかる場合があります）...\n');

  const startTime = Date.now();
  const timeoutMs = CONFIG.TIMEOUT_MINUTES * 60 * 1000;

  // ポーリングループ - 定期的に状態を確認
  while (true) {
    interaction = await client.interactions.get(interaction.id!);
    const elapsedMinutes = Math.round((Date.now() - startTime) / 1000 / 60);
    
    console.log(`[${elapsedMinutes}分経過] ステータス: ${interaction.status}`);

    if (interaction.status === 'completed') {
      console.log('\n✅ Research が正常に完了しました！');
      break;
    } else if (interaction.status === 'failed') {
      console.error('\n❌ Research が失敗しました');
      throw new Error('Research failed');
    }

    // タイムアウトチェック
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`タイムアウト: ${CONFIG.TIMEOUT_MINUTES}分を超えました`);
    }

    // 次のポーリングまで待機
    await new Promise(resolve => setTimeout(resolve, CONFIG.POLLING_INTERVAL * 1000));
  }

  // 結果の取得
  const outputs = (interaction as any).outputs;
  if (outputs && outputs.length > 0) {
    return outputs[outputs.length - 1].text || '';
  }
  
  throw new Error('完了したインタラクションに出力が見つかりません');
};

// ===== Step 1: 発散・選定フェーズ =====
/**
 * 複数の技術仮説を生成し、最も有望な1つを選定
 * @param client - Google Gemini APIクライアント
 * @param resourceDir - リソースファイルのディレクトリ
 * @returns Step 1の結果（監査ストリップ）
 */
const runStep1 = async (
  client: GoogleGenAI,
  resourceDir: string
): Promise<string> => {
  console.log('\n' + '='.repeat(60));
  console.log('📊 STEP 1: 発散・選定フェーズ（監査ストリップ）');
  console.log('='.repeat(60));
  
  // File Search Store を作成
  const store = await client.fileSearchStores.create({
    config: { displayName: 'deepresearch-step1-store' }
  });
  const storeName = store.name;
  console.log(`📦 Store を作成: ${storeName}`);

  try {
    // アップロードするファイルの定義
    const files = [
      {
        path: path.join(resourceDir, 'tech_prop.md'),
        name: 'tech_prop.md',
        description: '技術資産リスト（Cap-ID）- 保有する技術や特許'
      },
      {
        path: path.join(resourceDir, 'target.md'),
        name: 'target.md',
        description: 'ターゲット市場の課題（MKT-ID）- 解決すべき技術的課題'
      }
    ];

    // ファイルをアップロード
    await uploadFilesToStore(client, storeName, files);

    // Step 1用のプロンプト
    const step1Prompt = `
【重要】File Search機能でアップロードされたファイルを必ず読み込んで活用してください：
1. tech_prop.md: 技術資産リスト（Cap-ID）
2. target.md: ターゲット市場の課題（MKT-ID）

これらのファイルから技術資産と市場課題を抽出し、30件以上のアイデアを発散的に生成した後、
以下の評価基準で最も有望な1つ（Top 1）を選定してください：

評価基準（I/M/L/U）:
- Impact: 市場インパクトの大きさ
- Moat: 競争優位性・模倣困難性
- Leverage: 既存資産の活用度
- Urgency: 市場の緊急度

出力形式:
1. 監査ストリップ（選定結果の要約テーブル）
2. Top 1の詳細（技術的メカニズム、KPI）
3. 選定理由（なぜこの仮説が最も有望か）

必ず実際のCap-IDとMKT-IDを使用して具体的な分析を行ってください。
`;

    console.log(`📝 プロンプトを準備: ${step1Prompt.length} 文字`);

    // Deep Research 実行
    const result = await runDeepResearch(client, step1Prompt, storeName);

    // 結果を保存
    const outputDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = path.join(outputDir, `step1_result_${timestamp}.md`);
    fs.writeFileSync(outputPath, result, 'utf-8');
    
    // Step 2用にも保存
    fs.writeFileSync(path.join(outputDir, 'step1_latest.md'), result, 'utf-8');
    
    console.log(`📄 Step 1 結果を保存: ${outputPath} (${result.length} 文字)`);
    
    return result;
  } finally {
    // クリーンアップ - アップロードしたファイルを削除
    await client.fileSearchStores.delete({
      name: storeName,
      config: { force: true }
    });
    console.log('🧹 Step 1 の一時ファイルを削除しました');
  }
};

// ===== Step 2: 収束・深掘りフェーズ =====
/**
 * Step 1で選定された仮説を深掘りし、詳細な事業化戦略を構築
 * @param client - Google Gemini APIクライアント
 * @param step1Result - Step 1の結果
 * @param resourceDir - リソースファイルのディレクトリ
 * @returns Step 2の結果（詳細レポート）
 */
const runStep2 = async (
  client: GoogleGenAI,
  step1Result: string,
  resourceDir: string
): Promise<string> => {
  console.log('\n' + '='.repeat(60));
  console.log('📋 STEP 2: 収束・深掘りフェーズ（詳細レポート）');
  console.log('='.repeat(60));
  
  // File Search Store を作成
  const store = await client.fileSearchStores.create({
    config: { displayName: 'deepresearch-step2-store' }
  });
  const storeName = store.name;
  console.log(`📦 Store を作成: ${storeName}`);

  try {
    // Step 1の結果を一時ファイルとして保存
    const outputDir = path.join(process.cwd(), 'output');
    const step1Path = path.join(outputDir, 'step1_latest.md');
    
    // アップロードするファイルの定義（Step 1の結果 + 元のファイル）
    const files = [
      {
        path: step1Path,
        name: 'step1_result.md',
        description: 'Step 1の分析結果（選定されたチャンピオン仮説）'
      },
      {
        path: path.join(resourceDir, 'tech_prop.md'),
        name: 'tech_prop.md',
        description: '技術資産リスト（Cap-ID）'
      },
      {
        path: path.join(resourceDir, 'target.md'),
        name: 'target.md',
        description: 'ターゲット市場の課題（MKT-ID）'
      }
    ];

    // ファイルをアップロード
    await uploadFilesToStore(client, storeName, files);

    // Step 2用のプロンプト
    const step2Prompt = `
【重要】File Search機能でアップロードされたファイルを必ず読み込んで活用してください：
1. step1_result.md: Step 1で選定されたチャンピオン仮説
2. tech_prop.md: 技術資産の詳細情報
3. target.md: 市場課題の詳細情報

Step 1で選ばれたチャンピオン仮説について、以下の観点で詳細な事業化戦略レポートを作成してください：

必須の章立て（各章1500-2500文字）:
1. エグゼクティブサマリー
   - The Shift: 市場の構造的変化
   - The Pain: 解決すべき本質的課題
   - The Solution: 提案する解決策
   - The Value: 創出される価値

2. 事業機会を創出する構造的変曲点（Why Now?）
   - なぜ今この技術が必要なのか
   - 市場・技術・規制の変化

3. 市場機会とエコシステム分析
   - TAM/SAM/SOMの定量評価
   - 競合分析と差別化要因
   - パートナーシップ戦略

4. 技術的ボトルネックと未解決の顧客課題
   - 既存技術では解決できない理由
   - 物理的・化学的な制約

5. チャンピオン仮説の詳細
   - 物理化学的メカニズム
   - 技術的実現可能性
   - 競争優位性の源泉

6. 事業化戦略とロードマップ
   - Phase 1 (0-2年): 技術実証
   - Phase 2 (2-5年): 製品化
   - Phase 3 (5-10年): 市場展開

7. リスク分析と対策
   - 技術リスク
   - 市場リスク
   - 事業リスク

8. 参考文献（20件以上）
   - 学術論文
   - 特許情報
   - 市場レポート

各章では具体的な数値、データ、エビデンスを含めて説得力のある内容にしてください。
`;

    console.log(`📝 プロンプトを準備: ${step2Prompt.length} 文字`);

    // Deep Research 実行
    const result = await runDeepResearch(client, step2Prompt, storeName);

    // 結果を保存
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = path.join(outputDir, `step2_result_${timestamp}.md`);
    fs.writeFileSync(outputPath, result, 'utf-8');
    fs.writeFileSync(path.join(outputDir, 'step2_latest.md'), result, 'utf-8');
    
    console.log(`📄 Step 2 結果を保存: ${outputPath} (${result.length} 文字)`);
    
    return result;
  } finally {
    // クリーンアップ
    await client.fileSearchStores.delete({
      name: storeName,
      config: { force: true }
    });
    console.log('🧹 Step 2 の一時ファイルを削除しました');
  }
};

// ===== メイン処理 =====
/**
 * 2段階のDeep Researchを順次実行
 */
const main = async () => {
  console.log('🎯 Google Gemini Deep Research API - 2段階分析サンプル');
  console.log('=' + '='.repeat(59));
  console.log('');
  console.log('このプログラムは以下の2段階で高度な技術戦略分析を行います：');
  console.log('- Step 1: 技術資産と市場課題から最適な事業仮説を選定');
  console.log('- Step 2: 選定された仮説の詳細な事業化戦略を構築');
  console.log('');
  console.log('⚠️  注意: 各ステップは20-60分かかる場合があります');
  console.log('');

  const overallStartTime = Date.now();
  
  try {
    // プロキシ設定（必要な場合）
    setupProxy();

    // APIクライアント初期化
    const client = initializeClient();
    console.log('✅ API クライアントを初期化しました');

    // リソースディレクトリの確認
    const resourceDir = path.join(process.cwd(), 'resource');
    if (!fs.existsSync(resourceDir)) {
      throw new Error(`リソースディレクトリが見つかりません: ${resourceDir}`);
    }

    // Step 1 実行
    const step1StartTime = Date.now();
    const step1Result = await runStep1(client, resourceDir);
    
    const step1Duration = Math.round((Date.now() - step1StartTime) / 1000);
    console.log(`\n⏱️  Step 1 実行時間: ${Math.floor(step1Duration / 60)}分${step1Duration % 60}秒`);
    
    // Step 2 実行
    const step2StartTime = Date.now();
    const step2Result = await runStep2(client, step1Result, resourceDir);
    
    const step2Duration = Math.round((Date.now() - step2StartTime) / 1000);
    console.log(`\n⏱️  Step 2 実行時間: ${Math.floor(step2Duration / 60)}分${step2Duration % 60}秒`);
    
    // 統合レポート作成
    const outputDir = path.join(process.cwd(), 'output');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const integratedReport = `# Deep Research 2段階分析 統合レポート
    
実行日時: ${new Date().toISOString()}
総実行時間: ${Math.round((Date.now() - overallStartTime) / 1000 / 60)}分

## Step 1: 発散・選定フェーズ（監査ストリップ）

${step1Result}

${'='.repeat(80)}

## Step 2: 収束・深掘りフェーズ（詳細レポート）

${step2Result}
`;
    
    const integratedPath = path.join(outputDir, `integrated_report_${timestamp}.md`);
    fs.writeFileSync(integratedPath, integratedReport, 'utf-8');
    console.log(`\n📊 統合レポートを保存: ${integratedPath}`);
    
    // 全体の実行時間
    const totalDuration = Math.round((Date.now() - overallStartTime) / 1000);
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 2段階 Deep Research が正常に完了しました！');
    console.log(`⏱️  総実行時間: ${Math.floor(totalDuration / 60)}分${totalDuration % 60}秒`);
    console.log('');
    console.log('📁 出力ファイル:');
    console.log(`   - Step 1 結果: output/step1_latest.md`);
    console.log(`   - Step 2 結果: output/step2_latest.md`);
    console.log(`   - 統合レポート: ${path.basename(integratedPath)}`);
    console.log('=' + '='.repeat(59));

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    
    const duration = Math.round((Date.now() - overallStartTime) / 1000);
    console.log(`⏱️  エラーまでの実行時間: ${Math.floor(duration / 60)}分${duration % 60}秒`);
    
    throw error;
  }
};

// ===== プログラムのエントリーポイント =====
main().catch(error => {
  console.error('\n💥 致命的なエラー:', error);
  process.exit(1);
});

// TypeScriptモジュールとしてエクスポート（他のファイルから使用する場合）
export { main, runStep1, runStep2, CONFIG };