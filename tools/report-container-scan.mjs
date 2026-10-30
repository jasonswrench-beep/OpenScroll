/** Summarize the full final-image scan without hiding findings with no published fix. */
import assert from 'node:assert/strict';
import { readFile, appendFile } from 'node:fs/promises';

const report = JSON.parse(await readFile(process.argv[2], 'utf8'));
assert.equal(report.SchemaVersion, 2, 'Unsupported Trivy report format.');
assert.ok(Array.isArray(report.Results) && report.Results.some(result => result.Class === 'os-pkgs'),
  'The final-image scan must include its installed OS packages.');
assert.ok(report.Results.some(result => result.Class === 'lang-pkgs' && result.Type === 'node-pkg' &&
  result.Packages?.some(pkg => /^\/?app\/node_modules\//.test(pkg.FilePath ?? ''))),
  'The final-image scan must include its installed Node application packages.');
const findings = report.Results.flatMap(result => (result.Vulnerabilities ?? []).map(finding => ({
  ...finding, target: result.Target,
})));
const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];
const rows = severities.map(severity => {
  const matches = findings.filter(finding => finding.Severity === severity);
  return `| ${severity} | ${matches.length} | ${matches.filter(finding => finding.FixedVersion).length} |`;
});
const blocking = findings.filter(finding => ['CRITICAL', 'HIGH'].includes(finding.Severity) && finding.FixedVersion);
const summary = [
  '### Final application image vulnerability scan', '',
  'Full Trivy OS and application inventory is attached as an artifact.', '',
  '| Severity | Findings | Published fix |', '| --- | ---: | ---: |', ...rows, '',
  `${blocking.length} high/critical findings have a published fix. These fail this check.`,
  'Findings without a published fix remain visible for review. Counts do not establish application reachability or exploitability.', '',
].join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
if (blocking.length) {
  console.error(blocking.map(finding => `${finding.VulnerabilityID}: ${finding.PkgName} ${finding.InstalledVersion} -> ${finding.FixedVersion} (${finding.target})`).join('\n'));
  process.exitCode = 1;
}
