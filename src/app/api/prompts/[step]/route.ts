import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { promptVersions } from '@/lib/db/schema';
import { eq, desc, and, max } from 'drizzle-orm';
import { DEFAULT_PROMPTS, STEP_NAMES, AVAILABLE_STEPS } from '@/lib/prompts/defaults';

interface RouteContext {
  params: Promise<{ step: string }>;
}

// GET /api/prompts/[step] - Get prompt data for a step
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { step } = await context.params;
    const stepNumber = parseInt(step, 10);

    if (!AVAILABLE_STEPS.includes(stepNumber as typeof AVAILABLE_STEPS[number])) {
      return NextResponse.json(
        { error: '無効なステップ番号です' },
        { status: 400 }
      );
    }

    // Get all versions for this step
    const versions = await db
      .select()
      .from(promptVersions)
      .where(eq(promptVersions.stepNumber, stepNumber))
      .orderBy(desc(promptVersions.version));

    // Find active version
    const activeVersion = versions.find(v => v.isActive);

    return NextResponse.json({
      stepNumber,
      stepName: STEP_NAMES[stepNumber] || `Step ${stepNumber}`,
      defaultPrompt: DEFAULT_PROMPTS[stepNumber] || '',
      versions,
      activeVersion: activeVersion?.version || null,
      activeId: activeVersion?.id || null,
    });
  } catch (error) {
    console.error('Error fetching prompt:', error);
    return NextResponse.json(
      { error: 'プロンプトの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// POST /api/prompts/[step] - Create new prompt version
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { step } = await context.params;
    const stepNumber = parseInt(step, 10);

    if (!AVAILABLE_STEPS.includes(stepNumber as typeof AVAILABLE_STEPS[number])) {
      return NextResponse.json(
        { error: '無効なステップ番号です' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { content } = body;

    if (!content || typeof content !== 'string' || content.trim() === '') {
      return NextResponse.json(
        { error: 'プロンプト内容が必要です' },
        { status: 400 }
      );
    }

    // Get max version number for this step
    const result = await db
      .select({ maxVersion: max(promptVersions.version) })
      .from(promptVersions)
      .where(eq(promptVersions.stepNumber, stepNumber));

    const nextVersion = (result[0]?.maxVersion ?? 0) + 1;

    // Deactivate all existing versions for this step
    await db
      .update(promptVersions)
      .set({ isActive: false })
      .where(eq(promptVersions.stepNumber, stepNumber));

    // Create new version and activate it
    const [created] = await db
      .insert(promptVersions)
      .values({
        stepNumber,
        version: nextVersion,
        content: content.trim(),
        isActive: true,
      })
      .returning();

    return NextResponse.json(created);
  } catch (error) {
    console.error('Error creating prompt version:', error);
    return NextResponse.json(
      { error: 'プロンプトの保存に失敗しました' },
      { status: 500 }
    );
  }
}
