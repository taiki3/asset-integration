import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { stepFileAttachments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { AVAILABLE_FILES_BY_STEP, AVAILABLE_STEPS } from '@/lib/prompts/defaults';

interface RouteContext {
  params: Promise<{ step: string }>;
}

// GET /api/file-attachments/[step] - Get file attachment settings for a step
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

    // Get current attachment settings
    const [existing] = await db
      .select()
      .from(stepFileAttachments)
      .where(eq(stepFileAttachments.stepNumber, stepNumber));

    const availableFiles = AVAILABLE_FILES_BY_STEP[stepNumber] || [];
    const attachedFiles = existing?.attachedFiles || [];

    return NextResponse.json({
      stepNumber,
      availableFiles,
      attachedFiles,
    });
  } catch (error) {
    console.error('Error fetching file attachments:', error);
    return NextResponse.json(
      { error: '添付ファイル設定の取得に失敗しました' },
      { status: 500 }
    );
  }
}

// PUT /api/file-attachments/[step] - Update file attachment settings
export async function PUT(
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
    const { attachedFiles } = body;

    if (!Array.isArray(attachedFiles)) {
      return NextResponse.json(
        { error: 'attachedFiles は配列である必要があります' },
        { status: 400 }
      );
    }

    // Validate that all attached files are available for this step
    const availableFileIds = (AVAILABLE_FILES_BY_STEP[stepNumber] || []).map(f => f.id);
    const invalidFiles = attachedFiles.filter(id => !availableFileIds.includes(id));

    if (invalidFiles.length > 0) {
      return NextResponse.json(
        { error: `無効なファイルID: ${invalidFiles.join(', ')}` },
        { status: 400 }
      );
    }

    // Check if record exists
    const [existing] = await db
      .select()
      .from(stepFileAttachments)
      .where(eq(stepFileAttachments.stepNumber, stepNumber));

    let result;
    if (existing) {
      // Update existing record
      [result] = await db
        .update(stepFileAttachments)
        .set({
          attachedFiles,
          updatedAt: new Date(),
        })
        .where(eq(stepFileAttachments.stepNumber, stepNumber))
        .returning();
    } else {
      // Create new record
      [result] = await db
        .insert(stepFileAttachments)
        .values({
          stepNumber,
          attachedFiles,
        })
        .returning();
    }

    return NextResponse.json({
      stepNumber: result.stepNumber,
      availableFiles: AVAILABLE_FILES_BY_STEP[stepNumber] || [],
      attachedFiles: result.attachedFiles,
    });
  } catch (error) {
    console.error('Error updating file attachments:', error);
    return NextResponse.json(
      { error: '添付ファイル設定の更新に失敗しました' },
      { status: 500 }
    );
  }
}
