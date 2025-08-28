#!/usr/bin/env node

/**
 * BandSync Test Automation Runner
 * Comprehensive test execution with reporting and CI integration
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '../..');

class TestRunner {
  constructor(options = {}) {
    this.options = {
      parallel: options.parallel ?? true,
      coverage: options.coverage ?? true,
      bail: options.bail ?? false,
      verbose: options.verbose ?? true,
      outputFormat: options.outputFormat || 'detailed', // 'detailed', 'summary', 'ci'
      ...options
    };
    
    this.results = {
      startTime: Date.now(),
      endTime: null,
      totalDuration: 0,
      suites: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        coverage: null
      }
    };
  }

  /**
   * Run all BandSync tests with comprehensive reporting
   */
  async runAll() {
    console.log('🎵 BandSync Test Automation Runner');
    console.log('=====================================');
    console.log(`Started at: ${new Date().toISOString()}`);
    console.log();

    try {
      // Pre-flight checks
      await this.preflightChecks();
      
      // Define test suites in execution order
      const testSuites = [
        {
          name: 'Unit Tests - Mobile Hooks',
          pattern: '__tests__/unit/mobile/*.test.js',
          timeout: 30000,
          critical: true
        },
        {
          name: 'Unit Tests - Server Logic',
          pattern: '__tests__/unit/server/*.test.js',
          timeout: 45000,
          critical: true
        },
        {
          name: 'Integration Tests - Multi-Device Sync',
          pattern: '__tests__/integration/multi-device-sync.test.js',
          timeout: 120000,
          critical: true
        },
        {
          name: 'Performance Benchmarks',
          pattern: '__tests__/performance/*.test.js',
          timeout: 180000,
          critical: false
        },
        {
          name: 'Network Condition Tests',
          pattern: '__tests__/integration/network-conditions.test.js',
          timeout: 240000,
          critical: false
        }
      ];

      // Run test suites
      for (const suite of testSuites) {
        const result = await this.runTestSuite(suite);
        this.results.suites.push(result);
        
        // Fail fast on critical suite failures
        if (this.options.bail && result.failed > 0 && suite.critical) {
          console.log(`\n❌ Critical test suite failed, stopping execution`);
          break;
        }
      }

      // Generate final report
      this.results.endTime = Date.now();
      this.results.totalDuration = this.results.endTime - this.results.startTime;
      
      await this.generateReport();
      await this.handleResults();

    } catch (error) {
      console.error('❌ Test runner failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Run specific test types
   */
  async runUnit() {
    return this.runTestPattern('__tests__/unit/**/*.test.js', 'Unit Tests');
  }

  async runIntegration() {
    return this.runTestPattern('__tests__/integration/**/*.test.js', 'Integration Tests');
  }

  async runPerformance() {
    return this.runTestPattern('__tests__/performance/**/*.test.js', 'Performance Tests');
  }

  async runSync() {
    return this.runTestPattern('--testNamePattern="synchronization|sync"', 'Synchronization Tests');
  }

  /**
   * Pre-flight system checks
   */
  async preflightChecks() {
    console.log('🔍 Running pre-flight checks...');
    
    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.substring(1).split('.')[0]);
    if (majorVersion < 18) {
      throw new Error(`Node.js 18+ required, found ${nodeVersion}`);
    }

    // Check dependencies
    try {
      await fs.access(path.join(rootDir, 'node_modules'));
    } catch {
      throw new Error('Dependencies not installed. Run "npm install" first.');
    }

    // Check for required test files
    const requiredDirs = ['__tests__/unit', '__tests__/integration', '__tests__/performance'];
    for (const dir of requiredDirs) {
      try {
        await fs.access(path.join(rootDir, dir));
      } catch {
        throw new Error(`Required test directory missing: ${dir}`);
      }
    }

    console.log('✅ Pre-flight checks passed');
    console.log();
  }

  /**
   * Run a specific test suite
   */
  async runTestSuite(suite) {
    console.log(`📋 Running: ${suite.name}`);
    console.log(`   Pattern: ${suite.pattern}`);
    console.log(`   Timeout: ${suite.timeout}ms`);
    
    const startTime = Date.now();
    
    try {
      const result = await this.executeJest(suite.pattern, {
        timeout: suite.timeout,
        bail: this.options.bail && suite.critical
      });

      const duration = Date.now() - startTime;
      
      const suiteResult = {
        name: suite.name,
        pattern: suite.pattern,
        duration,
        critical: suite.critical,
        ...result
      };

      // Log results
      if (result.success) {
        console.log(`✅ ${suite.name} completed in ${this.formatDuration(duration)}`);
        console.log(`   Tests: ${result.passed} passed, ${result.failed} failed, ${result.total} total`);
      } else {
        console.log(`❌ ${suite.name} failed in ${this.formatDuration(duration)}`);
        console.log(`   Tests: ${result.passed} passed, ${result.failed} failed, ${result.total} total`);
        if (result.error) {
          console.log(`   Error: ${result.error}`);
        }
      }
      console.log();

      return suiteResult;

    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`💥 ${suite.name} crashed in ${this.formatDuration(duration)}`);
      console.log(`   Error: ${error.message}`);
      console.log();

      return {
        name: suite.name,
        pattern: suite.pattern,
        duration,
        critical: suite.critical,
        success: false,
        total: 0,
        passed: 0,
        failed: 1,
        skipped: 0,
        error: error.message
      };
    }
  }

  /**
   * Execute Jest with specific pattern and options
   */
  async executeJest(pattern, options = {}) {
    const jestArgs = [
      '--testPathPattern=' + pattern,
      '--testTimeout=' + (options.timeout || 30000)
    ];

    if (this.options.coverage) {
      jestArgs.push('--coverage');
    }

    if (this.options.verbose) {
      jestArgs.push('--verbose');
    }

    if (options.bail || this.options.bail) {
      jestArgs.push('--bail');
    }

    if (this.options.parallel) {
      jestArgs.push('--maxWorkers=50%');
    } else {
      jestArgs.push('--runInBand');
    }

    // Add JSON reporter for programmatic parsing
    jestArgs.push('--json');

    return new Promise((resolve, reject) => {
      const jest = spawn('npx', ['jest', ...jestArgs], {
        cwd: rootDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      jest.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      jest.stderr.on('data', (data) => {
        stderr += data.toString();
        // Show real-time output in verbose mode
        if (this.options.verbose && this.options.outputFormat !== 'ci') {
          process.stderr.write(data);
        }
      });

      jest.on('close', (code) => {
        try {
          // Parse Jest JSON output
          const lines = stdout.trim().split('\n');
          const jsonLine = lines.find(line => line.startsWith('{') && line.includes('"success"'));
          
          if (jsonLine) {
            const results = JSON.parse(jsonLine);
            resolve({
              success: results.success,
              total: results.numTotalTests,
              passed: results.numPassedTests,
              failed: results.numFailedTests,
              skipped: results.numPendingTests,
              coverage: results.coverageMap || null,
              testResults: results.testResults
            });
          } else {
            // Fallback parsing if JSON output is not available
            resolve({
              success: code === 0,
              total: 0,
              passed: code === 0 ? 1 : 0,
              failed: code === 0 ? 0 : 1,
              skipped: 0,
              error: stderr || 'Unknown error'
            });
          }
        } catch (error) {
          reject(new Error(`Failed to parse test results: ${error.message}`));
        }
      });

      jest.on('error', (error) => {
        reject(error);
      });

      // Handle timeout
      if (options.timeout) {
        setTimeout(() => {
          jest.kill('SIGKILL');
          reject(new Error(`Test suite timed out after ${options.timeout}ms`));
        }, options.timeout + 10000); // Add buffer
      }
    });
  }

  /**
   * Run test pattern directly
   */
  async runTestPattern(pattern, name) {
    const suite = {
      name,
      pattern,
      timeout: 120000,
      critical: true
    };

    return this.runTestSuite(suite);
  }

  /**
   * Generate comprehensive test report
   */
  async generateReport() {
    // Calculate summary statistics
    this.results.summary = this.results.suites.reduce((summary, suite) => {
      summary.total += suite.total;
      summary.passed += suite.passed;
      summary.failed += suite.failed;
      summary.skipped += suite.skipped;
      return summary;
    }, { total: 0, passed: 0, failed: 0, skipped: 0 });

    const reportData = {
      timestamp: new Date().toISOString(),
      duration: this.results.totalDuration,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      },
      summary: this.results.summary,
      suites: this.results.suites.map(suite => ({
        name: suite.name,
        duration: suite.duration,
        success: suite.success,
        critical: suite.critical,
        tests: {
          total: suite.total,
          passed: suite.passed,
          failed: suite.failed,
          skipped: suite.skipped
        },
        error: suite.error || null
      })),
      recommendations: this.generateRecommendations()
    };

    // Write detailed report
    const reportPath = path.join(rootDir, 'test-reports');
    await fs.mkdir(reportPath, { recursive: true });
    
    await fs.writeFile(
      path.join(reportPath, `test-report-${Date.now()}.json`),
      JSON.stringify(reportData, null, 2)
    );

    // Write summary report
    await fs.writeFile(
      path.join(reportPath, 'latest-summary.json'),
      JSON.stringify({
        timestamp: reportData.timestamp,
        success: this.results.summary.failed === 0,
        duration: reportData.duration,
        summary: reportData.summary
      }, null, 2)
    );

    // Generate human-readable report
    await this.generateTextReport(reportData, reportPath);

    return reportData;
  }

  /**
   * Generate human-readable text report
   */
  async generateTextReport(reportData, reportPath) {
    const lines = [];
    
    lines.push('BandSync Test Execution Report');
    lines.push('==============================');
    lines.push('');
    lines.push(`Execution Time: ${reportData.timestamp}`);
    lines.push(`Total Duration: ${this.formatDuration(reportData.duration)}`);
    lines.push(`Environment: Node ${reportData.environment.nodeVersion} on ${reportData.environment.platform}`);
    lines.push('');
    
    // Summary
    lines.push('SUMMARY');
    lines.push('-------');
    lines.push(`Total Tests: ${reportData.summary.total}`);
    lines.push(`✅ Passed: ${reportData.summary.passed}`);
    lines.push(`❌ Failed: ${reportData.summary.failed}`);
    lines.push(`⏭️  Skipped: ${reportData.summary.skipped}`);
    lines.push(`📊 Success Rate: ${((reportData.summary.passed / reportData.summary.total) * 100).toFixed(1)}%`);
    lines.push('');

    // Suite details
    lines.push('TEST SUITES');
    lines.push('-----------');
    
    reportData.suites.forEach(suite => {
      const status = suite.success ? '✅' : '❌';
      const critical = suite.critical ? '[CRITICAL]' : '[OPTIONAL]';
      lines.push(`${status} ${suite.name} ${critical}`);
      lines.push(`   Duration: ${this.formatDuration(suite.duration)}`);
      lines.push(`   Tests: ${suite.tests.passed}/${suite.tests.total} passed`);
      
      if (suite.error) {
        lines.push(`   Error: ${suite.error}`);
      }
      
      lines.push('');
    });

    // Recommendations
    if (reportData.recommendations.length > 0) {
      lines.push('RECOMMENDATIONS');
      lines.push('---------------');
      
      reportData.recommendations.forEach((rec, index) => {
        lines.push(`${index + 1}. ${rec.title}`);
        lines.push(`   ${rec.description}`);
        lines.push('');
      });
    }

    await fs.writeFile(
      path.join(reportPath, 'latest-report.txt'),
      lines.join('\n')
    );
  }

  /**
   * Generate actionable recommendations based on test results
   */
  generateRecommendations() {
    const recommendations = [];
    
    // Check for failed critical suites
    const failedCritical = this.results.suites.filter(s => !s.success && s.critical);
    if (failedCritical.length > 0) {
      recommendations.push({
        title: 'Critical Test Failures',
        priority: 'high',
        description: `${failedCritical.length} critical test suite(s) failed. These must be fixed before deployment: ${failedCritical.map(s => s.name).join(', ')}`
      });
    }

    // Check performance test results
    const perfSuite = this.results.suites.find(s => s.name.includes('Performance'));
    if (perfSuite && !perfSuite.success) {
      recommendations.push({
        title: 'Performance Issues Detected',
        priority: 'medium',
        description: 'Performance benchmarks failed. Review latency measurements and consider optimization strategies.'
      });
    }

    // Check for slow tests
    const slowSuites = this.results.suites.filter(s => s.duration > 60000); // 1 minute
    if (slowSuites.length > 0) {
      recommendations.push({
        title: 'Slow Test Execution',
        priority: 'low',
        description: `${slowSuites.length} test suite(s) took longer than 1 minute. Consider optimizing test setup or running in parallel.`
      });
    }

    // Check success rate
    const successRate = (this.results.summary.passed / this.results.summary.total) * 100;
    if (successRate < 95 && successRate >= 90) {
      recommendations.push({
        title: 'Test Reliability Concern',
        priority: 'medium',
        description: `Success rate is ${successRate.toFixed(1)}%. Consider investigating intermittent failures.`
      });
    } else if (successRate < 90) {
      recommendations.push({
        title: 'Poor Test Reliability',
        priority: 'high',
        description: `Success rate is only ${successRate.toFixed(1)}%. Significant testing issues need attention.`
      });
    }

    return recommendations;
  }

  /**
   * Handle test results and determine exit code
   */
  async handleResults() {
    const { summary } = this.results;
    
    console.log('📊 FINAL RESULTS');
    console.log('================');
    console.log(`Total Duration: ${this.formatDuration(this.results.totalDuration)}`);
    console.log(`Tests: ${summary.passed}/${summary.total} passed (${((summary.passed / summary.total) * 100).toFixed(1)}%)`);
    
    if (summary.failed === 0) {
      console.log('🎉 All tests passed!');
      
      // Check for performance concerns
      const perfWarnings = this.results.suites.filter(s => 
        s.name.includes('Performance') && s.duration > 120000
      );
      
      if (perfWarnings.length > 0) {
        console.log('⚠️  Performance tests took longer than expected');
      }
      
      process.exit(0);
    } else {
      console.log(`❌ ${summary.failed} test(s) failed`);
      
      // Show critical failures
      const criticalFailures = this.results.suites.filter(s => !s.success && s.critical);
      if (criticalFailures.length > 0) {
        console.log('\n🚨 CRITICAL FAILURES:');
        criticalFailures.forEach(suite => {
          console.log(`   - ${suite.name}: ${suite.error || 'Tests failed'}`);
        });
      }
      
      process.exit(1);
    }
  }

  /**
   * Utility method to format duration
   */
  formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }

  /**
   * Generate CI-friendly output
   */
  generateCIOutput() {
    const { summary } = this.results;
    
    // GitHub Actions / Generic CI output
    console.log(`::notice::BandSync Tests: ${summary.passed}/${summary.total} passed`);
    
    if (summary.failed > 0) {
      console.log(`::error::${summary.failed} test(s) failed`);
    }

    // Set environment variables for CI
    process.env.BANDSYNC_TEST_TOTAL = summary.total.toString();
    process.env.BANDSYNC_TEST_PASSED = summary.passed.toString();
    process.env.BANDSYNC_TEST_FAILED = summary.failed.toString();
    process.env.BANDSYNC_TEST_SUCCESS_RATE = ((summary.passed / summary.total) * 100).toFixed(1);
  }
}

// CLI Interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const command = args[0] || 'all';
  
  const options = {
    parallel: !args.includes('--no-parallel'),
    coverage: !args.includes('--no-coverage'),
    bail: args.includes('--bail'),
    verbose: !args.includes('--quiet'),
    outputFormat: args.includes('--ci') ? 'ci' : 'detailed'
  };

  const runner = new TestRunner(options);

  switch (command) {
    case 'all':
      runner.runAll();
      break;
    case 'unit':
      runner.runUnit();
      break;
    case 'integration':
      runner.runIntegration();
      break;
    case 'performance':
      runner.runPerformance();
      break;
    case 'sync':
      runner.runSync();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Available commands: all, unit, integration, performance, sync');
      process.exit(1);
  }
}

export default TestRunner;