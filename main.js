const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class LicenseChecker {
  constructor() {
    this.allowedLicenses = new Set();
    this.blockedLicenses = new Set();
    this.violations = [];
    this.allowed = [];
    this.unknown = [];
    this.packageManager = 'npm';
  }

  parseInput(input, defaultValue = '') {
    const value = core.getInput(input) || defaultValue;
    return value.split(',').map(item => item.trim()).filter(item => item.length > 0);
  }

  detectPackageManager() {
    const packageManager = core.getInput('package-manager');
    
    if (packageManager && packageManager !== 'auto') {
      return packageManager;
    }

    // Auto-detect package manager
    if (fs.existsSync('yarn.lock')) {
      return 'yarn';
    } else if (fs.existsSync('pnpm-lock.yaml')) {
      return 'pnpm';
    } else if (fs.existsSync('package-lock.json') || fs.existsSync('package.json')) {
      return 'npm';
    }
    
    throw new Error('No supported package manager found (npm, yarn, or pnpm)');
  }

  async getDependencies() {
    const includeDevDeps = core.getInput('include-dev-dependencies') === 'true';
    let command;
    
    try {
      switch (this.packageManager) {
        case 'yarn':
          command = `yarn list --json ${includeDevDeps ? '' : '--production'}`;
          break;
        case 'pnpm':
          command = `pnpm list --json ${includeDevDeps ? '' : '--prod'}`;
          break;
        case 'npm':
        default:
          command = `npm list --json ${includeDevDeps ? '' : '--production'}`;
          break;
      }

      core.info(`Running command: ${command}`);
      const output = execSync(command, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      
      let dependencies;
      if (this.packageManager === 'yarn') {
        // Parse yarn's line-delimited JSON output
        const lines = output.trim().split('\n');
        const dataLine = lines.find(line => {
          try {
            const parsed = JSON.parse(line);
            return parsed.type === 'tree';
          } catch {
            return false;
          }
        });
        
        if (dataLine) {
          const parsed = JSON.parse(dataLine);
          dependencies = this.flattenYarnDependencies(parsed.data);
        } else {
          dependencies = {};
        }
      } else {
        const parsed = JSON.parse(output);
        dependencies = this.flattenNpmDependencies(parsed.dependencies || {});
      }

      return dependencies;
    } catch (error) {
      core.warning(`Failed to get dependencies with ${this.packageManager}: ${error.message}`);
      
      // Fallback: try to parse package.json directly
      if (fs.existsSync('package.json')) {
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        const deps = { ...packageJson.dependencies };
        if (includeDevDeps) {
          Object.assign(deps, packageJson.devDependencies);
        }
        return deps;
      }
      
      throw error;
    }
  }

  flattenNpmDependencies(deps, result = {}) {
    for (const [name, info] of Object.entries(deps)) {
      if (typeof info === 'object' && info.version) {
        result[name] = info.version;
        if (info.dependencies) {
          this.flattenNpmDependencies(info.dependencies, result);
        }
      }
    }
    return result;
  }

  flattenYarnDependencies(tree, result = {}) {
    if (tree.name && tree.name !== 'workspace-aggregator-') {
      const name = tree.name.split('@')[0] || tree.name;
      if (name && !result[name]) {
        result[name] = 'unknown';
      }
    }
    
    if (tree.children) {
      tree.children.forEach(child => {
        this.flattenYarnDependencies(child, result);
      });
    }
    
    return result;
  }

  async getLicenseInfo(packageName) {
    try {
      // Try to get license from package.json in node_modules
      const packageJsonPath = path.join('node_modules', packageName, 'package.json');
      
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        if (packageJson.license) {
          return typeof packageJson.license === 'string' 
            ? packageJson.license 
            : packageJson.license.type || 'Unknown';
        }
        
        if (packageJson.licenses && packageJson.licenses[0]) {
          return packageJson.licenses[0].type || 'Unknown';
        }
      }
      
      // Fallback: try common license files
      const licenseFiles = ['LICENSE', 'LICENSE.txt', 'LICENSE.md', 'LICENCE', 'COPYING'];
      const packageDir = path.join('node_modules', packageName);
      
      for (const fileName of licenseFiles) {
        const licensePath = path.join(packageDir, fileName);
        if (fs.existsSync(licensePath)) {
          const licenseContent = fs.readFileSync(licensePath, 'utf8').substring(0, 500);
          return this.detectLicenseFromContent(licenseContent);
        }
      }
      
      return 'Unknown';
    } catch (error) {
      core.debug(`Error getting license for ${packageName}: ${error.message}`);
      return 'Unknown';
    }
  }

  detectLicenseFromContent(content) {
    const upperContent = content.toUpperCase();
    
    if (upperContent.includes('MIT LICENSE')) return 'MIT';
    if (upperContent.includes('APACHE LICENSE')) return 'Apache-2.0';
    if (upperContent.includes('BSD LICENSE')) return 'BSD-3-Clause';
    if (upperContent.includes('GPL')) return 'GPL';
    if (upperContent.includes('MOZILLA PUBLIC LICENSE')) return 'MPL-2.0';
    
    return 'Unknown';
  }

  categorizeLicense(packageName, license) {
    const normalizedLicense = license.toUpperCase().replace(/[\s-_.]/g, '');
    
    // Check for exact matches and variations
    const isAllowed = this.allowedLicenses.has(license) || 
                     Array.from(this.allowedLicenses).some(allowed => 
                       normalizedLicense.includes(allowed.toUpperCase().replace(/[\s-_.]/g, ''))  
                     );
                     
    const isBlocked = this.blockedLicenses.has(license) ||
                     Array.from(this.blockedLicenses).some(blocked => 
                       normalizedLicense.includes(blocked.toUpperCase().replace(/[\s-_.]/g, ''))
                     );

    const entry = {
      name: packageName,
      license: license,
      normalizedLicense: normalizedLicense
    };

    if (isBlocked) {
      this.violations.push(entry);
    } else if (isAllowed) {
      this.allowed.push(entry);
    } else {
      this.unknown.push(entry);
    }
  }

  generateReport(format) {
    const timestamp = new Date().toISOString();
    const totalPackages = this.violations.length + this.allowed.length + this.unknown.length;
    
    switch (format.toLowerCase()) {
      case 'json':
        return JSON.stringify({
          timestamp,
          summary: {
            total: totalPackages,
            violations: this.violations.length,
            allowed: this.allowed.length,
            unknown: this.unknown.length
          },
          violations: this.violations,
          allowed: this.allowed,
          unknown: this.unknown
        }, null, 2);
        
      case 'sarif':
        return this.generateSarifReport();
        
      case 'table':
      default:
        return this.generateTableReport();
    }
  }

  generateTableReport() {
    let report = '# License Compliance Report\n\n';
    
    report += `**Total Dependencies:** ${this.violations.length + this.allowed.length + this.unknown.length}\n`;
    report += `**License Violations:** ${this.violations.length}\n`;
    report += `**Allowed Licenses:** ${this.allowed.length}\n`;
    report += `**Unknown Licenses:** ${this.unknown.length}\n\n`;
    
    if (this.violations.length > 0) {
      report += '## ❌ License Violations\n\n';
      report += '| Package | License | Status |\n';
      report += '|---------|---------|--------|\n';
      this.violations.forEach(pkg => {
        report += `| ${pkg.name} | ${pkg.license} | ❌ BLOCKED |\n`;
      });
      report += '\n';
    }
    
    if (this.unknown.length > 0) {
      report += '## ⚠️ Unknown Licenses\n\n';
      report += '| Package | License | Status |\n';
      report += '|---------|---------|--------|\n';
      this.unknown.forEach(pkg => {
        report += `| ${pkg.name} | ${pkg.license} | ⚠️ REVIEW REQUIRED |\n`;
      });
      report += '\n';
    }
    
    if (this.allowed.length > 0) {
      report += '## ✅ Allowed Licenses\n\n';
      report += '| Package | License | Status |\n';
      report += '|---------|---------|--------|\n';
      this.allowed.forEach(pkg => {
        report += `| ${pkg.name} | ${pkg.license} | ✅ ALLOWED |\n`;
      });
    }
    
    return report;
  }

  generateSarifReport() {
    const rules = [];
    const results = [];
    
    if (this.violations.length > 0) {
      rules.push({
        id: 'license-violation',
        name: 'Blocked License Detected',
        shortDescription: { text: 'Package uses a blocked license' },
        fullDescription: { text: 'This package uses a license that has been marked as blocked.' },
        help: { text: 'Consider replacing this package or getting approval for the license.' }
      });
      
      this.violations.forEach(pkg => {
        results.push({
          ruleId: 'license-violation',
          level: 'error',
          message: { text: `Package '${pkg.name}' uses blocked license '${pkg.license}'` },
          locations: [{
            physicalLocation: {
              artifactLocation: { uri: 'package.json' },
              region: { startLine: 1, startColumn: 1 }
            }
          }]
        });
      });
    }
    
    return JSON.stringify({
      version: '2.1.0',
      $schema: 'https://schemastore.azurewebsites.net/schemas/json/sarif-2.1.0.json',
      runs: [{
        tool: {
          driver: {
            name: 'License Checker',
            version: '1.0.0',
            informationUri: 'https://github.com/marketplace/actions/license-checker',
            rules
          }
        },
        results
      }]
    }, null, 2);
  }

  async createGitHubIssue(token) {
    if (this.violations.length === 0) {
      core.info('No license violations found, skipping issue creation');
      return;
    }
    
    const octokit = github.getOctokit(token);
    const context = github.context;
    
    const title = `License Compliance Issue: ${this.violations.length} violation(s) detected`;
    const body = this.generateTableReport() + '\n\n---\n*This issue was automatically created by the License Checker action.*';
    
    try {
      const { data: issue } = await octokit.rest.issues.create({
        ...context.repo,
        title,
        body,
        labels: ['security', 'license-compliance']
      });
      
      core.info(`Created issue #${issue.number}: ${issue.html_url}`);
    } catch (error) {
      core.warning(`Failed to create issue: ${error.message}`);
    }
  }
}

async function run() {
  try {
    const checker = new LicenseChecker();
    
    // Parse inputs
    const token = core.getInput('github-token', { required: true });
    const allowedLicensesInput = checker.parseInput('allowed-licenses', 'MIT,Apache-2.0,BSD-2-Clause,BSD-3-Clause,ISC,0BSD');
    const blockedLicensesInput = checker.parseInput('blocked-licenses', 'GPL-3.0,AGPL-3.0,GPL-2.0,LGPL-3.0');
    const failOnBlocked = core.getInput('fail-on-blocked') === 'true';
    const outputFormat = core.getInput('output-format') || 'table';
    const createIssue = core.getInput('create-issue') === 'true';
    
    // Validate inputs
    if (!token) {
      throw new Error('GitHub token is required');
    }
    
    if (!['json', 'table', 'sarif'].includes(outputFormat.toLowerCase())) {
      throw new Error('Output format must be one of: json, table, sarif');
    }
    
    // Initialize license sets
    allowedLicensesInput.forEach(license => checker.allowedLicenses.add(license));
    blockedLicensesInput.forEach(license => checker.blockedLicenses.add(license));
    
    core.info(`Allowed licenses: ${Array.from(checker.allowedLicenses).join(', ')}`);
    core.info(`Blocked licenses: ${Array.from(checker.blockedLicenses).join(', ')}`);
    
    // Detect package manager and get dependencies
    checker.packageManager = checker.detectPackageManager();
    core.info(`Detected package manager: ${checker.packageManager}`);
    
    const dependencies = await checker.getDependencies();
    const dependencyNames = Object.keys(dependencies);
    
    if (dependencyNames.length === 0) {
      core.warning('No dependencies found');
      core.setOutput('violations-count', '0');
      core.setOutput('allowed-count', '0');
      core.setOutput('unknown-count', '0');
      core.setOutput('has-violations', 'false');
      return;
    }
    
    core.info(`Found ${dependencyNames.length} dependencies to check`);
    
    // Check licenses for each dependency
    for (const packageName of dependencyNames) {
      core.debug(`Checking license for: ${packageName}`);
      const license = await checker.getLicenseInfo(packageName);
      checker.categorizeLicense(packageName, license);
    }
    
    // Generate report
    const report = checker.generateReport(outputFormat);
    const reportPath = `license-report.${outputFormat === 'sarif' ? 'sarif' : outputFormat === 'json' ? 'json' : 'md'}`;
    
    fs.writeFileSync(reportPath, report);
    core.info(`License report saved to: ${reportPath}`);
    
    // Set outputs
    core.setOutput('violations-count', checker.violations.length.toString());
    core.setOutput('allowed-count', checker.allowed.length.toString());
    core.setOutput('unknown-count', checker.unknown.length.toString());
    core.setOutput('report-path', reportPath);
    core.setOutput('has-violations', (checker.violations.length > 0).toString());
    
    // Log summary
    core.info(`\n=== License Check Summary ===`);
    core.info(`Total packages: ${dependencyNames.length}`);
    core.info(`✅ Allowed: ${checker.allowed.length}`);
    core.info(`❌ Violations: ${checker.violations.length}`);
    core.info(`⚠️  Unknown: ${checker.unknown.length}`);
    
    if (checker.violations.length > 0) {
      core.warning(`Found ${checker.violations.length} license violation(s):`);
      checker.violations.forEach(pkg => {
        core.warning(`  - ${pkg.name}: ${pkg.license}`);
      });
    }
    
    if (checker.unknown.length > 0) {
      core.warning(`Found ${checker.unknown.length} package(s) with unknown licenses:`);
      checker.unknown.forEach(pkg => {
        core.warning(`  - ${pkg.name}: ${pkg.license}`);
      });
    }
    
    // Create GitHub issue if requested
    if (createIssue && checker.violations.length > 0) {
      await checker.createGitHubIssue(token);
    }
    
    // Fail if violations found and fail-on-blocked is true
    if (failOnBlocked && checker.violations.length > 0) {
      throw new Error(`License compliance check failed: ${checker.violations.length} violation(s) found`);
    }
    
    core.info('License check completed successfully');
    
  } catch (error) {
    core.error(`License check failed: ${error.message}`);
    core.setFailed(error.message);
  }
}

run();