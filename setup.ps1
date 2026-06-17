# ================================================================
#   Simple TRPG Chat — Project Setup (pnpm) for Windows
# ================================================================

# Ensure output encoding is UTF-8
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "================================================"
Write-Host "  Simple TRPG Chat — Project Setup (pnpm)"
Write-Host "================================================"
Write-Host ""

# Helper: prompt user for Y/n
function Ask-Yn($prompt, $default = "y") {
    if ($default -eq "y") {
        $display = "[Y/n]"
    } else {
        $display = "[y/N]"
    }
    $answer = Read-Host "$prompt $display"
    if ([string]::IsNullOrWhiteSpace($answer)) {
        $answer = $default
    }
    if ($answer -match "^[Yy]") {
        return $true
    } else {
        return $false
    }
}

# Helper: generate a hex secret using node or openssl
function Gen-Secret {
    if (Get-Command openssl -ErrorAction SilentlyContinue) {
        $secret = openssl rand -hex 32
    } else {
        $secret = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    }
    return $secret.Trim()
}

# Helper: set env variable in .env (handles commented and active lines)
function Set-EnvVariable($key, $value) {
    $envPath = Join-Path $pwd ".env"
    if (Test-Path $envPath) {
        $lines = Get-Content $envPath
        $updated = $false
        $newLines = @()
        foreach ($line in $lines) {
            if ($line -match "^$key=.*") {
                $newLines += "$key=$value"
                $updated = $true
            } elseif ($line -match "^#\s*$key=.*") {
                $newLines += "$key=$value"
                $updated = $true
            } else {
                $newLines += $line
            }
        }
        if (-not $updated) {
            $newLines += "$key=$value"
        }
        $utf8NoBom = New-Object System.Text.UTF8Encoding $False
        [System.IO.File]::WriteAllLines($envPath, $newLines, $utf8NoBom)
    }
}

# 1. Check prerequisites
Write-Host "--- Checking environment ---"

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "[!] pnpm not found. Attempting to install via corepack..."
    try {
        corepack enable
        corepack prepare pnpm@latest --activate
    } catch {
        Write-Host "[!] Corepack installation failed. If you got a permission error, please run PowerShell as Administrator, or run 'npm install -g pnpm' manually."
    }
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        Write-Host "[✗] pnpm not found. Please install pnpm manually and re-run this script."
        exit 1
    }
    $pnpmVer = pnpm --version
    Write-Host "[✓] pnpm installed (version $pnpmVer)"
} else {
    $pnpmVer = pnpm --version
    Write-Host "[✓] pnpm $pnpmVer"
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[✗] Node.js is required but not found. Please install Node.js >= 18."
    exit 1
}
$nodeVer = node --version
Write-Host "[✓] Node $nodeVer"
Write-Host ""

# 2. Database setup
Write-Host "================================================"
Write-Host "  Step 1 — Database Configuration"
Write-Host "================================================"
Write-Host ""

$dbSkip = $false
$dbConfigPath = Join-Path $pwd "db.config.json"
if (Test-Path $dbConfigPath) {
    try {
        $config = Get-Content $dbConfigPath -Raw | ConvertFrom-Json
        $existingType = $config.type
        Write-Host "[✓] 检测到已有数据库配置 (类型: $existingType)："
        $configStr = Get-Content $dbConfigPath -Raw
        Write-Host "    $configStr"
        Write-Host ""
        if (Ask-Yn "是否重新配置数据库？" "n") {
            Write-Host "[→] 将重新配置数据库"
        } else {
            Write-Host "[✓] 保留现有数据库配置"
            $dbSkip = $true
        }
        Write-Host ""
    } catch {
        # If parsing fails, proceed to reconfigure
    }
}

if (-not $dbSkip) {
    Write-Host "--- PostgreSQL Configuration ---"
    Write-Host "Connection string format: postgres://user:password@host:5432/dbname"
    Write-Host ""
    Write-Host "  Tip: Use Docker to run PostgreSQL locally:"
    Write-Host "  docker run -d --name trpg-pg -e POSTGRES_USER=trpg -e POSTGRES_PASSWORD=trpg_dev_pwd -e POSTGRES_DB=simple_trpg_chat -p 5432:5432 postgres:16"
    Write-Host ""
    
    $PG_URL = Read-Host "PostgreSQL connection URL"
    if ([string]::IsNullOrWhiteSpace($PG_URL)) {
        Write-Host "[✗] PostgreSQL connection URL is required."
        exit 1
    }
    
    # 3. Generate .env
    Write-Host ""
    Write-Host "================================================"
    Write-Host "  Step 2 — Environment Variables"
    Write-Host "================================================"
    Write-Host ""
    
    $envPath = Join-Path $pwd ".env"
    if (-not (Test-Path $envPath)) {
        Write-Host "[✓] Creating .env from .env.example..."
        $envExamplePath = Join-Path $pwd ".env.example"
        Copy-Item $envExamplePath $envPath
    } else {
        Write-Host "[✓] .env already exists"
    }
    
    # AUTH_SECRET (always generate)
    $authSecret = Gen-Secret
    Set-EnvVariable "AUTH_SECRET" $authSecret
    Write-Host "[✓] AUTH_SECRET generated"
    
    # AUTH_URL (always set for production compatibility)
    $envContent = Get-Content $envPath -Raw
    if ($envContent -notmatch "(?m)^AUTH_URL=") {
        Add-Content $envPath "`nAUTH_URL=http://localhost:3000" -Encoding utf8
        Write-Host "[✓] AUTH_URL set"
    } else {
        Write-Host "[✓] AUTH_URL already set"
    }
    
    # AI_ENCRYPTION_KEY & AI_ENCRYPTION_SALT (optional)
    Write-Host ""
    if (Ask-Yn "Enable AI bot features?" "n") {
        $aiKey = Gen-Secret
        $aiSalt = Gen-Secret
        Set-EnvVariable "AI_ENCRYPTION_KEY" $aiKey
        Set-EnvVariable "AI_ENCRYPTION_SALT" $aiSalt
        Write-Host "[✓] AI_ENCRYPTION_KEY & AI_ENCRYPTION_SALT generated"
    } else {
        Write-Host "[✓] AI features disabled — skipping AI encryption keys"
    }
    
    # 4. Install dependencies
    Write-Host ""
    Write-Host "================================================"
    Write-Host "  Step 3 — Installing Dependencies"
    Write-Host "================================================"
    Write-Host ""
    pnpm install
    
    # 5. Create db.config.json & test connection
    Write-Host ""
    Write-Host "================================================"
    Write-Host "  Step 4 — Database Initialization"
    Write-Host "================================================"
    Write-Host ""
    
    Write-Host "Testing PostgreSQL connection..."
    $testScript = @'
async function test() {
  const postgres = require('postgres');
  const sql = postgres('__PG_URL__', { max: 1, connect_timeout: 10, idle_timeout: 5 });
  await sql`SELECT 1`;
  await sql.end({ timeout: 3 });
  console.log('OK');
}
test().catch(e => { console.error(e.message); process.exit(1); });
'@ -replace '__PG_URL__', $PG_URL

    $testScript | Out-File "test-db.js" -Encoding utf8
    
    node test-db.js 2>$null
    $dbOk = $LASTEXITCODE -eq 0
    Remove-Item "test-db.js" -ErrorAction SilentlyContinue
    
    if ($dbOk) {
        Write-Host "[✓] PostgreSQL connection successful"
        $dbConfig = @{
            type = "postgresql"
            url = $PG_URL
        } | ConvertTo-Json
        $utf8NoBom = New-Object System.Text.UTF8Encoding $False
        [System.IO.File]::WriteAllText($dbConfigPath, $dbConfig, $utf8NoBom)
        Write-Host "[✓] db.config.json created"
        Write-Host ""
        
        Write-Host "Pushing PostgreSQL schema..."
        $env:DATABASE_URL = $PG_URL
        pnpm db:push:pg
        Remove-Item env:DATABASE_URL
        Write-Host "[✓] PostgreSQL schema pushed"
        Write-Host ""
    } else {
        Write-Host "[✗] PostgreSQL connection failed"
        exit 1
    }
}

# 6. Seed database (optional)
Write-Host ""
if (Ask-Yn "Seed database with default admin user (admin / admin123)?" "n") {
    pnpm db:seed
    Write-Host "[✓] Database seeded"
} else {
    Write-Host "[✓] Skipping seed"
}

# Done
Write-Host ""
Write-Host "================================================"
Write-Host "  Setup complete!"
Write-Host ""
Write-Host "  Start the dev server:   pnpm dev"
Write-Host "  Or build for production: pnpm build && pnpm start"
Write-Host "================================================"
