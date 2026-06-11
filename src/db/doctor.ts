import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import * as readline from 'readline';
import postgres from 'postgres';

// ANSI console colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(msg: string) {
  console.log(msg);
}

function success(msg: string) {
  log(`${colors.green}[✓] ${msg}${colors.reset}`);
}

function warn(msg: string) {
  log(`${colors.yellow}[!] ${msg}${colors.reset}`);
}

function error(msg: string) {
  log(`${colors.red}[✗] ${msg}${colors.reset}`);
}

function info(msg: string) {
  log(`${colors.cyan}[i] ${msg}${colors.reset}`);
}

function askYn(query: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => {
    rl.question(`${colors.bold}${query}${colors.reset} [y/N]: `, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase().startsWith('y'));
    });
  });
}

async function diagnose() {
  log(`${colors.bold}================================================${colors.reset}`);
  log(`${colors.bold}  Simple TRPG Chat — 数据库与环境诊断诊断工具   ${colors.reset}`);
  log(`${colors.bold}================================================${colors.reset}`);
  log('');

  let overallSuccess = true;
  let pgUrl: string | null = null;

  // --- Step 1: Check .env file ---
  info('正在检测环境变量文件 (.env)...');
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    error('未找到 .env 文件！');
    warn('建议：请运行 setup.sh (Linux/macOS) 或 setup.bat (Windows) 来初始化环境。');
    overallSuccess = false;
  } else {
    try {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const lines = envContent.split(/\r?\n/);
      const envVars: Record<string, string> = {};
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const parts = trimmed.split('=');
          const key = parts[0].trim();
          const value = parts.slice(1).join('=').trim();
          envVars[key] = value;
        }
      }

      // Check AUTH_SECRET
      if (envVars['AUTH_SECRET']) {
        success('AUTH_SECRET 环境变量已配置。');
      } else {
        error('AUTH_SECRET 环境变量缺失或为空！');
        overallSuccess = false;
      }

      // Check AI_ENCRYPTION_KEY
      if (envVars['AI_ENCRYPTION_KEY']) {
        success('AI_ENCRYPTION_KEY 环境变量已配置。');
      } else {
        warn('AI_ENCRYPTION_KEY 未配置（AI 伴跑机器人功能将不可用，但不影响基础功能）。');
      }

    } catch (err: any) {
      error(`读取 .env 文件失败: ${err.message}`);
      overallSuccess = false;
    }
  }
  log('');

  // --- Step 2: Check db.config.json ---
  info('正在检测数据库配置文件 (db.config.json)...');
  const dbConfigPath = path.join(process.cwd(), 'db.config.json');
  if (!fs.existsSync(dbConfigPath)) {
    error('未找到 db.config.json 配置文件！');
    warn('建议：请运行 setup.sh (Linux/macOS) 或 setup.bat (Windows) 来生成数据库配置。');
    overallSuccess = false;
  } else {
    try {
      const configRaw = fs.readFileSync(dbConfigPath, 'utf-8');
      const config = JSON.parse(configRaw);
      if (config.type === 'postgresql' && config.url) {
        success('db.config.json 格式正确且配置有效 (数据库类型: PostgreSQL)。');
        pgUrl = config.url;
      } else {
        error('db.config.json 结构不正确。必须包含 "type": "postgresql" 和 "url" 字段。');
        overallSuccess = false;
      }
    } catch (err: any) {
      error(`解析 db.config.json 失败: ${err.message}`);
      overallSuccess = false;
    }
  }
  log('');

  // --- Step 3: Test Database Connection ---
  let connectionSuccess = false;
  if (pgUrl) {
    info('正在测试与 PostgreSQL 数据库的连接...');
    const sql = postgres(pgUrl, { max: 1, connect_timeout: 5 });
    try {
      await sql`SELECT 1`;
      success('数据库连接测试成功。');
      connectionSuccess = true;
    } catch (err: any) {
      error(`数据库连接失败: ${err.message}`);
      warn('请检查以下几项：');
      warn('  1. PostgreSQL 服务是否正在运行？');
      warn('  2. 如果使用 Docker 部署，对应的容器是否已启动？(e.g., docker ps)');
      warn('  3. 数据库用户名、密码、端口及库名是否正确？');
      overallSuccess = false;
    } finally {
      await sql.end({ timeout: 2 }).catch(() => {});
    }
  } else {
    warn('由于配置缺失或无效，跳过数据库连接测试。');
  }
  log('');

  // --- Step 4: Schema update and push ---
  if (overallSuccess && connectionSuccess) {
    success('所有环境与配置项检测通过！');
    log('');

    const autoPush = process.argv.includes('--push') || process.argv.includes('-y');
    const forcePush = process.argv.includes('--force');
    let shouldPush = autoPush || forcePush;
    
    if (!shouldPush) {
      shouldPush = await askYn('是否现在更新/推送最新的数据库表结构（pnpm db:push:pg）？');
    }

    if (shouldPush && pgUrl) {
      info('正在执行数据库结构更新 (drizzle-kit push)...');
      const args = ['db:push:pg'];
      // If auto-pushing or forced, pass the --force flag to drizzle-kit
      if (autoPush || forcePush) {
        args.push('--force');
      }
      
      const pushResult = spawnSync('pnpm', args, {
        stdio: 'inherit',
        env: {
          ...process.env,
          DATABASE_URL: pgUrl
        },
        shell: true
      });
      
      if (pushResult.status === 0) {
        success('数据库表结构更新成功。');
      } else {
        error(`数据库结构更新失败 (退出码: ${pushResult.status})。`);
        process.exit(pushResult.status || 1);
      }
    } else {
      info('已跳过数据库结构更新。');
    }
  } else {
    error('部分检测未通过，请根据提示修复配置后再试。');
    process.exit(1);
  }

  log('');
  log(`${colors.bold}================================================${colors.reset}`);
}

diagnose().catch(err => {
  console.error('诊断工具运行时发生致命错误:', err);
  process.exit(1);
});
