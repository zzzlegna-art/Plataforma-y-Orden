// Nexora AI Developer
// Code Relationship Analyzer
//
// Builds relationships between indexed files, modules and dependencies.
// This layer is intentionally read-only. It prepares context for future AI analysis.

export type CodeNode = {
  path: string;
  type: string;
};

export type CodeRelation = {
  from: string;
  to: string;
  relation: string;
};

export function analyzeRelationships(nodes: CodeNode[]): CodeRelation[] {
  const relations: CodeRelation[] = [];

  for (const node of nodes) {
    if (node.path.includes('components')) {
      relations.push({
        from: node.path,
        to: 'frontend',
        relation: 'belongs_to'
      });
    }

    if (node.path.includes('functions')) {
      relations.push({
        from: node.path,
        to: 'backend',
        relation: 'belongs_to'
      });
    }
  }

  return relations;
}
