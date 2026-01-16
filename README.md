# License Checker

A comprehensive GitHub Action that scans your project dependencies for license compliance, detects potential license conflicts, and generates detailed reports. Perfect for ensuring your project meets license requirements and avoiding legal issues.

## Features

- 🔍 **Multi-Package Manager Support**: Works with npm, yarn, and pnpm
- 📋 **Flexible License Policies**: Configure allowed and blocked licenses
- 📊 **Multiple Report Formats**: JSON, Markdown table, and SARIF output
- 🚨 **GitHub Integration**: Automatically create issues for violations
- ⚡ **Fast & Reliable**: Efficiently scans dependencies with comprehensive error handling
- 🛡️ **Security Focused**: Follows GitHub security best practices

## Usage

### Basic Usage

```yaml
name: License Compliance Check
on:
  pull_request:
  push:
    branches: [main]

jobs:
  license-check:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Check licenses
        uses: ./
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          allowed-licenses: 'MIT,Apache-2.0,BSD-3-Clause'
          blocked-licenses: 'GPL-3.0,AGPL-3.0'
```

### Advanced Configuration

```yaml
- name: Comprehensive License Check
  uses: ./
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    allowed-licenses: 'MIT,Apache-2.0,BSD-2-Clause,BSD-3-Clause,ISC,0BSD'
    blocked-licenses: 'GPL-3.0,AGPL-3.0,GPL-2.0,LGPL-3.0'
    fail-on-blocked: 'true'
    include-dev-dependencies: 'false'
    output-format: 'sarif'
    create-issue: 'true'
    package-manager: 'npm'
```

## Inputs

| Name | Description | Required | Default |
|------|-------------|----------|--------|
| `github-token` | GitHub token for accessing repository and creating issues/comments | ✅ | |
| `allowed-licenses` | Comma-separated list of allowed license types | ❌ | `MIT,Apache-2.0,BSD-2-Clause,BSD-3-Clause,ISC,0BSD` |
| `blocked-licenses` | Comma-separated list of blocked license types | ❌ | `GPL-3.0,AGPL-3.0,GPL-2.0,LGPL-3.0` |
| `fail-on-blocked` | Whether to fail the action when blocked licenses are found | ❌ | `true` |
| `include-dev-dependencies` | Whether to include dev dependencies in the scan | ❌ | `false` |
| `output-format` | Output format: `json`, `table`, or `sarif` | ❌ | `table` |
| `create-issue` | Create GitHub issue for license violations | ❌ | `false` |
| `package-manager` | Package manager to use: `npm`, `yarn`, `pnpm`, or `auto` | ❌ | `auto` |

## Outputs

| Name | Description |
|------|-------------|
| `violations-count` | Number of license violations found |
| `allowed-count` | Number of dependencies with allowed licenses |
| `unknown-count` | Number of dependencies with unknown or missing licenses |
| `report-path` | Path to the generated license report file |
| `has-violations` | Boolean indicating if any license violations were found |

## Examples

### Example 1: Basic License Compliance

Check for common permissive licenses and block copyleft licenses:

```yaml
name: License Check
on: [pull_request]

jobs:
  license:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm install
      - uses: ./
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          allowed-licenses: 'MIT,Apache-2.0,BSD-3-Clause'
          blocked-licenses: 'GPL-3.0,AGPL-3.0'
```

### Example 2: Enterprise Compliance with SARIF Output

Generate SARIF reports for GitHub Security tab integration:

```yaml
name: Enterprise License Compliance
on:
  schedule:
    - cron: '0 9 * * 1' # Weekly on Mondays
  workflow_dispatch:

jobs:
  compliance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm ci
      - name: License Compliance Check
        uses: ./
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          allowed-licenses: 'MIT,Apache-2.0,BSD-2-Clause,BSD-3-Clause,ISC'
          blocked-licenses: 'GPL-2.0,GPL-3.0,AGPL-3.0,LGPL-2.1,LGPL-3.0'
          output-format: 'sarif'
          create-issue: 'true'
          include-dev-dependencies: 'true'
          fail-on-blocked: 'true'
      - name: Upload SARIF results
        uses: github/codeql-action/upload-sarif@v2
        if: always()
        with:
          sarif_file: license-report.sarif
```

### Example 3: Yarn/PNPM Projects

Explicitly specify package manager for non-npm projects:

```yaml
- uses: ./
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    package-manager: 'yarn'
    allowed-licenses: 'MIT,Apache-2.0'
```

### Example 4: Custom License Policy

Define your organization's specific license policy:

```yaml
- uses: ./
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    allowed-licenses: 'MIT,Apache-2.0,BSD-2-Clause,BSD-3-Clause,ISC,0BSD,Unlicense'
    blocked-licenses: 'GPL-2.0,GPL-3.0,AGPL-1.0,AGPL-3.0,LGPL-2.1,LGPL-3.0,MPL-2.0'
    fail-on-blocked: 'false'
    create-issue: 'true'
```

## Report Formats

### Table Format (Default)
Generates a human-readable Markdown report with violations, unknown licenses, and allowed licenses in separate sections.

### JSON Format
Structured JSON output perfect for integration with other tools:
```json
{
  "timestamp": "2026-01-01T12:00:00.000Z",
  "summary": {
    "total": 150,
    "violations": 2,
    "allowed": 145,
    "unknown": 3
  },
  "violations": [...],
  "allowed": [...],
  "unknown": [...]
}
```

### SARIF Format
Security Analysis Results Interchange Format for GitHub Security tab integration and enterprise security tools.

## Supported Package Managers

- **npm**: Uses `npm list --json`
- **Yarn**: Uses `yarn list --json` 
- **pnpm**: Uses `pnpm list --json`
- **Auto-detect**: Automatically detects based on lock files

## License Detection

The action detects licenses through multiple methods:

1. **package.json**: Checks the `license` field
2. **License files**: Scans common license files (LICENSE, LICENSE.txt, etc.)
3. **Content analysis**: Analyzes license file content for common patterns

## Common License Identifiers

### Permissive Licenses (Usually Allowed)
- `MIT` - MIT License
- `Apache-2.0` - Apache License 2.0
- `BSD-2-Clause` - BSD 2-Clause License
- `BSD-3-Clause` - BSD 3-Clause License
- `ISC` - ISC License
- `0BSD` - BSD Zero Clause License

### Copyleft Licenses (Often Restricted)
- `GPL-2.0` - GNU General Public License v2.0
- `GPL-3.0` - GNU General Public License v3.0
- `AGPL-3.0` - GNU Affero General Public License v3.0
- `LGPL-2.1` - GNU Lesser General Public License v2.1
- `LGPL-3.0` - GNU Lesser General Public License v3.0

## Troubleshooting

### Common Issues

**"No supported package manager found"**
- Ensure you have a `package.json` file
- Run `npm install`, `yarn install`, or `pnpm install` before the action
- Specify the package manager explicitly with the `package-manager` input

**"Failed to get dependencies"**
- Make sure dependencies are installed
- Check that the specified package manager is available
- Verify the lockfile exists for the package manager

**"Unknown license detected"**
- Some packages may not have proper license metadata
- Check the package's repository manually
- Consider adding the license to your allowed list if it's acceptable

### Debug Mode

Enable debug logging by setting the `ACTIONS_STEP_DEBUG` secret to `true` in your repository settings.

## Security

This action follows security best practices:
- No hardcoded secrets or tokens
- Input validation and sanitization
- Safe file system operations
- No arbitrary code execution
- Minimal required permissions

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

### Development Setup

```bash
git clone https://github.com/your-org/license-checker
cd license-checker
npm install
npm test
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have questions:

1. Check the [troubleshooting section](#troubleshooting)
2. Search existing [GitHub issues](../../issues)
3. Create a new issue with detailed information

---

**Made with ❤️ for the open source community**