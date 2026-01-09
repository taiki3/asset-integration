import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, resources } from '@/lib/db/schema';
import { mockProjects, mockResources } from '@/lib/db/mock';
import { eq, and, isNull } from 'drizzle-orm';

interface RouteContext {
  params: Promise<{ id: string; resourceId: string }>;
}

// GET /api/projects/[id]/resources/[resourceId] - Get a single resource
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id, resourceId } = await context.params;
    const projectId = parseInt(id, 10);
    const resId = parseInt(resourceId, 10);

    if (isNaN(projectId) || isNaN(resId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify project ownership
    const [project] = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.userId, user.id),
          isNull(projects.deletedAt)
        )
      );

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const [resource] = await db
      .select()
      .from(resources)
      .where(
        and(
          eq(resources.id, resId),
          eq(resources.projectId, projectId)
        )
      );

    if (!resource) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
    }

    return NextResponse.json(resource);
  } catch (error) {
    console.error('Failed to fetch resource:', error);
    return NextResponse.json(
      { error: 'Failed to fetch resource' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id]/resources/[resourceId] - Delete a resource
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id, resourceId } = await context.params;
    const projectId = parseInt(id, 10);
    const resId = parseInt(resourceId, 10);
    const isMockMode = process.env.NEXT_PUBLIC_MOCK_AUTH === 'true';

    if (isNaN(projectId) || isNaN(resId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // In mock mode, handle deletion
    if (isMockMode) {
      const project = mockProjects.find(p => p.id === projectId && p.userId === user.id);
      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }

      const resourceIndex = mockResources.findIndex(r => r.id === resId && r.projectId === projectId);
      if (resourceIndex === -1) {
        return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
      }

      mockResources.splice(resourceIndex, 1);
      return NextResponse.json({ success: true });
    }

    // Verify project ownership
    const [project] = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.userId, user.id),
          isNull(projects.deletedAt)
        )
      );

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Verify resource exists and belongs to project
    const [resource] = await db
      .select()
      .from(resources)
      .where(
        and(
          eq(resources.id, resId),
          eq(resources.projectId, projectId)
        )
      );

    if (!resource) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
    }

    await db.delete(resources).where(eq(resources.id, resId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete resource:', error);
    return NextResponse.json(
      { error: 'Failed to delete resource' },
      { status: 500 }
    );
  }
}
