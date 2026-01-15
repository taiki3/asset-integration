#!/usr/bin/env npx tsx
/**
 * Check runs status via Supabase REST API (HTTPS/443)
 *
 * Usage:
 *   # Add credentials to .env.remote (gitignored)
 *   # Then run:
 *
 *   # Check staging (default)
 *   npx tsx scripts/check-runs.ts
 *   npx tsx scripts/check-runs.ts --run-id 123
 *
 *   # Check production
 *   npx tsx scripts/check-runs.ts --env production
 *   npx tsx scripts/check-runs.ts --env production --run-id 123
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
  // .env.remote not found, continue with existing env vars
}

interface Run {
  id: number;
  project_id: number;
  job_name: string | null;
  status: string;
  current_step: number;
  error_message: string | null;
  progress_info: unknown;
  created_at: string | null;
  completed_at: string | null;
  step2_1_output: string | null;
}

interface Hypothesis {
  id: number;
  uuid: string;
  run_id: number;
  display_title: string | null;
  processing_status: string | null;
  error_message: string | null;
}

// Setup proxy if available
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

async function fetchFromSupabase<T>(
  supabaseUrl: string,
  serviceRoleKey: string,
  path: string
): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    dispatcher,
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error: ${response.status} - ${error}`);
  }

  return response.json() as T;
}

async function main() {
  const args = process.argv.slice(2);
  const envIndex = args.indexOf('--env');
  const env = envIndex !== -1 ? args[envIndex + 1] : 'staging';

  if (!['staging', 'production'].includes(env)) {
    console.error(`Error: Invalid environment "${env}". Use "staging" or "production".`);
    process.exit(1);
  }

  const prefix = env === 'production' ? 'PRODUCTION' : 'STAGING';
  const supabaseUrl = process.env[`${prefix}_SUPABASE_URL`];
  const serviceRoleKey = process.env[`${prefix}_SUPABASE_SERVICE_ROLE_KEY`];

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(`Error: ${prefix}_SUPABASE_URL and ${prefix}_SUPABASE_SERVICE_ROLE_KEY are required`);
    console.log('\nAdd to .env.remote:');
    console.log(`  ${prefix}_SUPABASE_URL=https://xxx.supabase.co`);
    console.log(`  ${prefix}_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key`);
    process.exit(1);
  }

  console.log(`\n🔗 Connecting to ${env.toUpperCase()} via REST API...\n`);

  const runIdIndex = args.indexOf('--run-id');
  const runId = runIdIndex !== -1 ? parseInt(args[runIdIndex + 1], 10) : null;

  try {
    if (runId) {
      // Get specific run
      const runs = await fetchFromSupabase<Run[]>(
        supabaseUrl,
        serviceRoleKey,
        `runs?id=eq.${runId}&select=*`
      );

      if (runs.length === 0) {
        console.log(`Run ${runId} not found`);
        process.exit(1);
      }

      const run = runs[0];
      console.log('=== Run Details ===');
      console.log(`ID: ${run.id}`);
      console.log(`Job Name: ${run.job_name}`);
      console.log(`Status: ${run.status}`);
      console.log(`Current Step: ${run.current_step}`);
      console.log(`Error: ${run.error_message || '(none)'}`);
      console.log(`Progress Info: ${JSON.stringify(run.progress_info, null, 2)}`);
      console.log(`Created: ${run.created_at}`);
      console.log(`Completed: ${run.completed_at || '(not completed)'}`);
      console.log(`Step 2-1 Output Length: ${run.step2_1_output?.length || 0} chars`);

      // Get hypotheses for this run
      const hypotheses = await fetchFromSupabase<Hypothesis[]>(
        supabaseUrl,
        serviceRoleKey,
        `hypotheses?run_id=eq.${runId}&select=*`
      );

      if (hypotheses.length > 0) {
        console.log('\n=== Hypotheses ===');
        for (const h of hypotheses) {
          console.log(`  - ${h.display_title || '(no title)'} [${h.processing_status}] ${h.error_message ? `Error: ${h.error_message}` : ''}`);
        }
      }
    } else {
      // List recent runs
      const runs = await fetchFromSupabase<Run[]>(
        supabaseUrl,
        serviceRoleKey,
        'runs?select=*&order=created_at.desc&limit=10'
      );

      console.log('=== Recent Runs (last 10) ===');
      console.log('ID\tStatus\t\tStep\tJob Name\t\t\tCreated\t\t\t\tError');
      console.log('-'.repeat(120));

      for (const run of runs) {
        const status = run.status.padEnd(10);
        const step = String(run.current_step).padEnd(4);
        const jobName = (run.job_name || '').slice(0, 25).padEnd(25);
        const created = run.created_at?.slice(0, 19) || '';
        const error = run.error_message?.slice(0, 30) || '';
        console.log(`${run.id}\t${status}\t${step}\t${jobName}\t${created}\t${error}`);
      }

      console.log('\nTo see details for a specific run:');
      console.log(`  npx tsx scripts/check-runs.ts${env === 'production' ? ' --env production' : ''} --run-id <ID>`);
    }
  } catch (error) {
    console.error('API error:', error);
    process.exit(1);
  }
}

main();
