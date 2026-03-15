import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const workflowsDir = path.join(repoRoot, '.github', 'workflows');
const canonicalSecrets = new Set([
  'EC2_PORT',
  'EC2_SSH_HOST',
  'EC2_SSH_USER',
  'EC2_SSH_KEY',
]);
const requiredDeployWorkflowSecrets = [
  'EC2_PORT',
  'EC2_SSH_HOST',
  'EC2_SSH_USER',
  'EC2_SSH_KEY',
];
const secretPattern = /secrets\.([A-Z0-9_]+)/g;

type SecretRef = {
  filePath: string;
  secretName: string;
  lineNumber: number;
  lineText: string;
};

function getWorkflowFiles(): string[] {
  return readdirSync(workflowsDir)
    .map((name) => path.join(workflowsDir, name))
    .filter((filePath) => statSync(filePath).isFile())
    .filter((filePath) => filePath.endsWith('.yml') || filePath.endsWith('.yaml'));
}

function findSecretRefs(filePath: string): SecretRef[] {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const refs: SecretRef[] = [];

  lines.forEach((lineText, index) => {
    for (const match of lineText.matchAll(secretPattern)) {
      refs.push({
        filePath,
        secretName: match[1],
        lineNumber: index + 1,
        lineText: lineText.trim(),
      });
    }
  });

  return refs;
}

function formatRef(ref: SecretRef): string {
  return `${path.relative(repoRoot, ref.filePath).replace(/\\/g, '/')}:${ref.lineNumber} ${ref.lineText}`;
}

function main(): void {
  const workflowFiles = getWorkflowFiles();
  const allRefs = workflowFiles.flatMap(findSecretRefs);
  const nonCanonicalRefs = allRefs.filter((ref) => ref.secretName.startsWith('EC2_') && !canonicalSecrets.has(ref.secretName));

  if (nonCanonicalRefs.length > 0) {
    console.error('Found non-canonical EC2 secret references in workflows:');
    for (const ref of nonCanonicalRefs) {
      console.error(`- ${formatRef(ref)} uses ${ref.secretName}`);
    }
    process.exit(1);
  }

  const deployWorkflowPath = path.join(workflowsDir, 'deploy.yml');
  const deployRefs = findSecretRefs(deployWorkflowPath);
  const deploySecretNames = new Set(deployRefs.map((ref) => ref.secretName));
  const missingSecrets = requiredDeployWorkflowSecrets.filter((secretName) => !deploySecretNames.has(secretName));

  if (missingSecrets.length > 0) {
    console.error(`Deploy workflow is missing canonical secret references: ${missingSecrets.join(', ')}`);
    process.exit(1);
  }

  console.log('PASS: workflow secret references match the canonical GitHub Actions secret contract');
}

main();