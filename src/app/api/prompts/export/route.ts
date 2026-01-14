import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { promptVersions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { DEFAULT_PROMPTS, STEP_NAMES, AVAILABLE_STEPS } from '@/lib/prompts/defaults';

interface ExportedPrompt {
  stepNumber: number;
  stepName: string;
  isCustom: boolean;
  version: number | null;
  content: string;
}

// GET /api/prompts/export - Export all prompts
export async function GET() {
  try {
    const exportedPrompts: ExportedPrompt[] = [];

    for (const stepNumber of AVAILABLE_STEPS) {
      // Get active version for this step
      const [activeVersion] = await db
        .select()
        .from(promptVersions)
        .where(
          and(
            eq(promptVersions.stepNumber, stepNumber),
            eq(promptVersions.isActive, true)
          )
        );

      exportedPrompts.push({
        stepNumber,
        stepName: STEP_NAMES[stepNumber] || `Step ${stepNumber}`,
        isCustom: !!activeVersion,
        version: activeVersion?.version || null,
        content: activeVersion?.content || DEFAULT_PROMPTS[stepNumber] || '',
      });
    }

    return NextResponse.json(exportedPrompts);
  } catch (error) {
    console.error('Error exporting prompts:', error);
    return NextResponse.json(
      { error: 'プロンプトのエクスポートに失敗しました' },
      { status: 500 }
    );
  }
}
