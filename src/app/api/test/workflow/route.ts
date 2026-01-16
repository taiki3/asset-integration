import { NextRequest, NextResponse } from 'next/server';
import { generateContent } from '@/lib/gemini/interactions';

// Test endpoint for workflow - NO AUTH for testing only
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, useRealAPI } = body;

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    if (!useRealAPI) {
      // Mock response for testing without API key
      return NextResponse.json({
        status: 'success',
        result: {
          text: `Mock response for: ${prompt}\n\n仮説1: AIを活用した業務自動化により、生産性を30%向上\n仮説2: 機械学習モデルの導入で、予測精度を50%改善\n仮説3: データ分析基盤の構築により、意思決定速度を2倍に`,
          model: 'mock',
        },
      });
    }

    // Check if API key is configured
    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey || apiKey === 'your-gemini-api-key-here') {
      return NextResponse.json({
        status: 'error',
        error: 'GOOGLE_GENAI_API_KEY not configured',
        help: 'Please set your Gemini API key in .env.local',
      });
    }

    // Generate content using real API
    try {
      const text = await generateContent({
        prompt,
      });

      return NextResponse.json({
        status: 'success',
        result: {
          text,
        },
      });
    } catch (apiError: any) {
      return NextResponse.json({
        status: 'error',
        error: 'API call failed',
        details: apiError?.message || 'Unknown error',
        help: 'Check your API key and quota',
      });
    }
  } catch (error) {
    console.error('Test workflow error:', error);
    return NextResponse.json(
      { 
        status: 'error',
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Test GET endpoint to check if API is configured
export async function GET() {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  const isConfigured = apiKey && apiKey !== 'your-gemini-api-key-here';

  return NextResponse.json({
    status: 'ready',
    apiConfigured: isConfigured,
    message: isConfigured 
      ? 'API is configured and ready' 
      : 'Please configure GOOGLE_GENAI_API_KEY in .env.local',
    testEndpoint: '/api/test/workflow',
    usage: 'POST { "prompt": "your prompt", "useRealAPI": true }',
  });
}