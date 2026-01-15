// Mock database for development without actual DB connection
export const mockProjects = [
  {
    id: 1,
    userId: 'mock-user-001',
    name: 'サンプルプロジェクト1',
    description: 'AI仮説生成のデモプロジェクト',
    createdAt: new Date('2025-12-01'),
    updatedAt: new Date('2025-12-01'),
    deletedAt: null,
  },
  {
    id: 2,
    userId: 'mock-user-001',
    name: 'サンプルプロジェクト2',
    description: '技術革新の評価プロジェクト',
    createdAt: new Date('2025-12-15'),
    updatedAt: new Date('2025-12-15'),
    deletedAt: null,
  }
];

export const mockRuns = [
  {
    id: 1,
    projectId: 1,
    targetSpecId: 1,
    technicalAssetsId: 2,
    jobName: 'AI最適化システム分析',
    hypothesisCount: 5,
    loopCount: 1,
    loopIndex: 0,
    modelChoice: 'pro' as const,
    status: 'completed' as const,
    currentStep: 5,
    currentLoop: 1,
    geminiInteractions: [],
    completedAt: new Date('2025-12-20T10:05:00'),
    createdAt: new Date('2025-12-20T10:00:00'),
    updatedAt: new Date('2025-12-20T10:05:00'),
    errorMessage: null,
    // Legacy step outputs (for backward compatibility)
    step1Output: '市場分析完了',
    step2Output: 'ターゲット特定完了',
    step3Output: '技術評価完了',
    step4Output: 'ギャップ分析完了',
    step5Output: '仮説生成完了',
    // New detailed step outputs
    step2_1Output: '市場分析詳細',
    step2_2IndividualOutputs: ['深掘り調査1', '深掘り調査2'],
    step2_2IndividualTitles: ['テーマ1', 'テーマ2'],
    step3IndividualOutputs: ['技術評価1', '技術評価2'],
    step4IndividualOutputs: ['ギャップ分析1', 'ギャップ分析2'],
    step5IndividualOutputs: ['仮説1', '仮説2'],
    integratedList: null,
    progressInfo: null,
    executionTiming: null,
    debugPrompts: null,
  }
];

export const mockHypotheses = [
  {
    id: '550e8400-e29b-41d4-a716-446655440000',
    runId: 1,
    content: 'AIを活用した自動最適化システムにより、生産性を30%向上させることができる',
    evaluation: '実現可能性: 高、インパクト: 大、リスク: 中',
    createdAt: new Date('2025-12-20T10:05:00'),
  }
];

export const mockResources = [
  {
    id: 1,
    projectId: 1,
    type: 'target_spec' as const,
    name: 'ターゲット仕様1',
    content: '高効率な生産システムの実現',
    createdAt: new Date('2025-12-01'),
  },
  {
    id: 2,
    projectId: 1,
    type: 'technical_assets' as const,
    name: '技術資産1',
    content: 'AI最適化アルゴリズム',
    createdAt: new Date('2025-12-01'),
  }
];

// Mock database implementation
export const mockDb = {
  select() {
    return {
      from(table: any) {
        // Drizzle table objects have Symbol keys
        const drizzleBaseName = table?.[Symbol.for('drizzle:BaseName')];
        const tableName = drizzleBaseName || 'unknown';
        console.log('[Mock DB] Table name:', tableName);
        return {
          where(condition: any) {
            return {
              orderBy(ordering: any) {
                console.log('[Mock DB] OrderBy called for:', tableName);
                // Return mock projects for the projects table
                if (tableName === 'projects' || tableName.includes('projects')) {
                  const result = mockProjects.filter(p => p.userId === 'mock-user-001' && !p.deletedAt);
                  console.log('[Mock DB] Returning projects:', result);
                  return Promise.resolve(result);
                }
                return Promise.resolve([]);
              },
              limit(n: number) {
                console.log('[Mock DB] Limit called for:', tableName);
                if (tableName === 'runs') {
                  return Promise.resolve(mockRuns.filter(r => r.projectId === 1).slice(0, n));
                }
                if (tableName === 'resources') {
                  return Promise.resolve(mockResources.filter(r => r.projectId === 1));
                }
                return Promise.resolve([]);
              }
            };
          },
          limit(n: number) {
            return {
              where(condition: any) {
                console.log('[Mock DB] Limit->Where called for:', tableName);
                if (tableName === 'runs') {
                  return Promise.resolve(mockRuns.filter(r => r.projectId === 1).slice(0, n));
                }
                return Promise.resolve([]);
              }
            };
          },
          // Add support for direct where without limit
          execute() {
            console.log('[Mock DB] Execute called for:', tableName);
            if (tableName === 'projects') {
              const projectId = 1; // Default to project 1 for now
              return Promise.resolve(mockProjects.filter(p => p.id === projectId));
            }
            if (tableName === 'resources') {
              return Promise.resolve(mockResources);
            }
            if (tableName === 'runs') {
              return Promise.resolve(mockRuns);
            }
            return Promise.resolve([]);
          }
        };
      }
    };
  },
  
  insert(table: any) {
    return {
      values(data: any) {
        return {
          returning() {
            // Return the inserted data with an ID
            const newItem = { ...data, id: Date.now() };
            return Promise.resolve([newItem]);
          }
        };
      }
    };
  },

  update(table: any) {
    return {
      set(data: any) {
        return {
          where(condition: any) {
            return {
              returning() {
                return Promise.resolve([data]);
              }
            };
          }
        };
      }
    };
  },

  delete(table: any) {
    return {
      where(condition: any) {
        return Promise.resolve({ rowCount: 1 });
      }
    };
  }
};