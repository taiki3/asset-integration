import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, resources } from '@/lib/db/schema';
import { mockProjects, mockResources } from '@/lib/db/mock';
import { eq, and, isNull, desc } from 'drizzle-orm';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/projects/[id]/resources - List resources for a project
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const projectId = parseInt(id, 10);

    if (isNaN(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
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

    const projectResources = await db
      .select()
      .from(resources)
      .where(eq(resources.projectId, projectId))
      .orderBy(desc(resources.createdAt));

    return NextResponse.json(projectResources);
  } catch (error) {
    console.error('Failed to fetch resources:', error);
    return NextResponse.json(
      { error: 'Failed to fetch resources' },
      { status: 500 }
    );
  }
}

// POST /api/projects/[id]/resources - Create a new resource
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const projectId = parseInt(id, 10);
    const useMockDb = process.env.USE_MOCK_DB === 'true';

    if (isNaN(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
    }

    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type, name, content } = body;

    if (!type || !['target_spec', 'technical_assets'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid resource type' },
        { status: 400 }
      );
    }

    if (!name?.trim() || !content?.trim()) {
      return NextResponse.json(
        { error: 'Name and content are required' },
        { status: 400 }
      );
    }

    // Use mock data only if USE_MOCK_DB is true
    if (useMockDb) {
      const project = mockProjects.find(p => p.id === projectId && p.userId === user.id);
      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }

      const newResource = {
        id: mockResources.length + 1,
        projectId,
        type: type as 'target_spec' | 'technical_assets',
        name: name.trim(),
        content: content.trim(),
        createdAt: new Date(),
      };

      mockResources.push(newResource);
      return NextResponse.json(newResource, { status: 201 });
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
      .insert(resources)
      .values({
        projectId,
        type,
        name: name.trim(),
        content: content.trim(),
      })
      .returning();

    return NextResponse.json(resource, { status: 201 });
  } catch (error) {
    console.error('Failed to create resource:', error);
    return NextResponse.json(
      { error: 'Failed to create resource' },
      { status: 500 }
    );
  }
}
