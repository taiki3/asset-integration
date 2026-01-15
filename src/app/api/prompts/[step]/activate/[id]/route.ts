import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { promptVersions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

interface RouteContext {
  params: Promise<{ step: string; id: string }>;
}

// POST /api/prompts/[step]/activate/[id] - Activate a specific version
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { step, id } = await context.params;
    const stepNumber = parseInt(step, 10);
    const versionId = parseInt(id, 10);

    if (isNaN(stepNumber) || isNaN(versionId)) {
      return NextResponse.json(
        { error: '無効なパラメータです' },
        { status: 400 }
      );
    }

    // Verify the version exists and belongs to the correct step
    const [targetVersion] = await db
      .select()
      .from(promptVersions)
      .where(eq(promptVersions.id, versionId));

    if (!targetVersion) {
      return NextResponse.json(
        { error: 'バージョンが見つかりません' },
        { status: 404 }
      );
    }

    if (targetVersion.stepNumber !== stepNumber) {
      return NextResponse.json(
        { error: 'ステップ番号が一致しません' },
        { status: 400 }
      );
    }

    // Deactivate all versions for this step
    await db
      .update(promptVersions)
      .set({ isActive: false })
      .where(eq(promptVersions.stepNumber, stepNumber));

    // Activate the target version
    const [updated] = await db
      .update(promptVersions)
      .set({ isActive: true })
      .where(eq(promptVersions.id, versionId))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error activating prompt version:', error);
    return NextResponse.json(
      { error: 'バージョンの適用に失敗しました' },
      { status: 500 }
    );
  }
}
