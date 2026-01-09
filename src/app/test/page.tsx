'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

export default function TestPage() {
  const [prompt, setPrompt] = useState(
    'AGCのガラス技術を活用した新規事業アイデアを5つ提案してください。それぞれのアイデアについて、市場規模、技術的実現可能性、競合優位性を含めて説明してください。'
  );
  const [useRealAPI, setUseRealAPI] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const testWorkflow = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/test/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, useRealAPI }),
      });

      const data = await response.json();
      
      if (data.status === 'error') {
        setError(data.error + (data.help ? `\n${data.help}` : ''));
      } else {
        setResult(data.result);
      }
    } catch (err) {
      setError('Network error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const checkAPIStatus = async () => {
    try {
      const response = await fetch('/api/test/workflow');
      const data = await response.json();
      alert(data.message);
    } catch (err) {
      alert('Failed to check API status');
    }
  };

  return (
    <div className="container mx-auto max-w-4xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>ASIP Workflow Test</CardTitle>
          <CardDescription>
            Gemini APIの動作確認とワークフローのテスト
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="test" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="test">APIテスト</TabsTrigger>
              <TabsTrigger value="info">設定情報</TabsTrigger>
            </TabsList>

            <TabsContent value="test" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="prompt">プロンプト</Label>
                <Textarea
                  id="prompt"
                  placeholder="仮説生成のプロンプトを入力..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={6}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="use-real-api"
                  checked={useRealAPI}
                  onCheckedChange={setUseRealAPI}
                />
                <Label htmlFor="use-real-api">
                  実際のGemini APIを使用 (APIキーが必要)
                </Label>
              </div>

              <Button
                onClick={testWorkflow}
                disabled={loading || !prompt}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    処理中...
                  </>
                ) : (
                  'テスト実行'
                )}
              </Button>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>エラー</AlertTitle>
                  <AlertDescription className="whitespace-pre-wrap">
                    {error}
                  </AlertDescription>
                </Alert>
              )}

              {result && (
                <Alert variant="default" className="bg-green-50 border-green-200">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertTitle>成功</AlertTitle>
                  <AlertDescription>
                    <div className="mt-2 space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Model: {result.model}
                      </p>
                      <div className="bg-white p-4 rounded-md border">
                        <pre className="whitespace-pre-wrap text-sm">
                          {result.text}
                        </pre>
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>

            <TabsContent value="info" className="space-y-4">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2">環境設定</h3>
                  <Button onClick={checkAPIStatus} variant="outline">
                    API設定を確認
                  </Button>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-2">設定手順</h3>
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    <li>Google AI Studioでアカウントを作成</li>
                    <li>APIキーを取得</li>
                    <li>.env.localファイルに設定:
                      <pre className="bg-muted p-2 rounded mt-1">
                        GOOGLE_GENAI_API_KEY=your-api-key-here
                      </pre>
                    </li>
                    <li>Dockerコンテナを再起動</li>
                  </ol>
                </div>

                <Alert>
                  <AlertDescription>
                    <strong>Note:</strong> APIキーなしでもモックモードで動作確認できます。
                  </AlertDescription>
                </Alert>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}