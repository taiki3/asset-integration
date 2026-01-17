#!/usr/bin/env npx tsx
/**
 * Create a new run via Supabase REST API
 *
 * Usage:
 *   npx tsx scripts/create-run.ts
 *   npx tsx scripts/create-run.ts --env production
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ProxyAgent, fetch } from 'undici';

// Load .env.remote from project root
const envPath = resolve(__dirname, '..', '.env.remote');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        process.env[key] = valueParts.join('=');
      }
    }
  }
} catch {
  // .env.remote not found
}

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

async function fetchFromSupabase<T>(
  supabaseUrl: string,
  serviceRoleKey: string,
  path: string,
  options?: { method?: string; body?: unknown }
): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    dispatcher,
    method: options?.method || 'GET',
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error: ${response.status} - ${error}`);
  }

  return response.json() as T;
}

interface Project {
  id: number;
  name: string;
}

interface Resource {
  id: number;
  project_id: number;
  type: string;
  name: string;
}

interface Run {
  id: number;
  job_name: string;
  status: string;
}

async function main() {
  const args = process.argv.slice(2);
  const envIndex = args.indexOf('--env');
  const env = envIndex !== -1 ? args[envIndex + 1] : 'staging';

  const prefix = env === 'production' ? 'PRODUCTION' : 'STAGING';
  const supabaseUrl = process.env[`${prefix}_SUPABASE_URL`];
  const serviceRoleKey = process.env[`${prefix}_SUPABASE_SERVICE_ROLE_KEY`];
  const vercelUrl = process.env[`${prefix}_VERCEL_URL`];
  const cronSecret = process.env[`${prefix}_CRON_SECRET`];

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(`Error: ${prefix}_SUPABASE_URL and ${prefix}_SUPABASE_SERVICE_ROLE_KEY are required`);
    process.exit(1);
  }

  console.log(`\n🔗 Connecting to ${env.toUpperCase()}...\n`);

  // List projects
  const projects = await fetchFromSupabase<Project[]>(supabaseUrl, serviceRoleKey, 'projects?select=id,name&deleted_at=is.null&order=id.desc&limit=5');
  console.log('=== Projects ===');
  for (const p of projects) {
    console.log(`  ${p.id}: ${p.name}`);
  }

  if (projects.length === 0) {
    console.log('No projects found');
    process.exit(1);
  }

  // Use project with resources (prompt for choice or use last one with resources)
  let projectId = projects[0].id;

  // Check if --project arg provided
  const projectArgIndex = args.indexOf('--project');
  if (projectArgIndex !== -1) {
    projectId = parseInt(args[projectArgIndex + 1], 10);
  }
  console.log(`\nUsing project ${projectId}: ${projects[0].name}`);

  // List resources for project
  const resources = await fetchFromSupabase<Resource[]>(supabaseUrl, serviceRoleKey, `resources?project_id=eq.${projectId}&select=id,project_id,type,name`);
  console.log('\n=== Resources ===');
  let targetSpecId: number | null = null;
  let technicalAssetsId: number | null = null;
  for (const r of resources) {
    console.log(`  ${r.id}: [${r.type}] ${r.name}`);
    if (r.type === 'target_spec' && !targetSpecId) targetSpecId = r.id;
    if (r.type === 'technical_assets' && !technicalAssetsId) technicalAssetsId = r.id;
  }

  if (!targetSpecId || !technicalAssetsId) {
    console.log('\nMissing target_spec or technical_assets resource');
    process.exit(1);
  }

  // Generate job name
  const now = new Date();
  const jobName = `${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}-cli`;

  console.log(`\nCreating run: ${jobName}`);
  console.log(`  targetSpecId: ${targetSpecId}`);
  console.log(`  technicalAssetsId: ${technicalAssetsId}`);

  // Create run
  const [run] = await fetchFromSupabase<Run[]>(supabaseUrl, serviceRoleKey, 'runs', {
    method: 'POST',
    body: {
      project_id: projectId,
      job_name: jobName,
      target_spec_id: targetSpecId,
      technical_assets_id: technicalAssetsId,
      hypothesis_count: 3,
      loop_count: 1,
      model_choice: 'pro',
      status: 'pending',
      current_step: 0,
      current_loop: 1,
      loop_index: 0,
    },
  });

  console.log(`\n✅ Created run ${run.id}: ${run.job_name}`);

  // Trigger process endpoint
  if (vercelUrl && cronSecret) {
    console.log(`\nTriggering process endpoint...`);
    try {
      const response = await fetch(`${vercelUrl}/api/runs/${run.id}/process`, {
        dispatcher,
        method: 'POST',
        headers: {
          'x-cron-secret': cronSecret,
          'x-vercel-protection-bypass': process.env[`${prefix}_VERCEL_BYPASS_SECRET`] || '',
          'Content-Type': 'application/json',
        },
      });
      console.log(`  Response: ${response.status}`);
      if (response.ok) {
        const body = await response.json();
        console.log(`  Body: ${JSON.stringify(body)}`);
      }
    } catch (err) {
      console.log(`  Error: ${err}`);
    }
  } else {
    console.log(`\nNo VERCEL_URL or CRON_SECRET set - run will need to be triggered manually`);
  }

  console.log(`\nMonitor with: npx tsx scripts/check-runs.ts --run-id ${run.id}`);
}

main().catch(console.error);
