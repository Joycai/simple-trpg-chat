#!/bin/bash

# =======================================================================
# 脚本名称: setup_trpg_db.sh
# 功能: 自动生成密码、创建/更新 PG 数据库与用户（支持重复运行重置密码）、
#       配置监听地址以及本地 SCRAM-SHA-256 访问权限。
# =======================================================================

# 确保脚本以 root 权限运行
if [ "$EUID" -ne 0 ]; then
  echo "❌ 请使用 root 权限或 sudo 运行此脚本！"
  exit 1
fi

# ----------------- 配置区 -----------------
DB_NAME="simple_trpg_chat"
DB_USER="trpg"
PWD_FILE="./pgpwd"
# ------------------------------------------

echo "🔄 1. 正在生成/重置随机密码..."
# 生成 16 位包含字母和数字的随机密码
DB_PASS=$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 16)

# 将新密码写入当前目录下的 pgpwd 文件（覆盖旧密码）
echo "$DB_PASS" > "$PWD_FILE"
chmod 600 "$PWD_FILE"
echo "✅ 新密码已生成并安全保存至: $PWD_FILE"

echo "🔄 2. 正在自动查找 PostgreSQL 配置文件..."
HBA_PATH=$(find /var/lib/pgsql/ -name "pg_hba.conf" 2>/dev/null | head -n 1)

if [ -z "$HBA_PATH" ]; then
    echo "❌ 未找到配置文件，请确认 PostgreSQL 是否已安装并初始化！"
    exit 1
fi
DATA_DIR=$(dirname "$HBA_PATH")
CONF_PATH="${DATA_DIR}/postgresql.conf"

echo "📍 找到数据目录: $DATA_DIR"

echo "🔄 3. 正在修改 postgresql.conf 以允许 TCP/IP 连接..."
if grep -q "^[[:space:]]*listen_addresses" "$CONF_PATH"; then
    sed -i "s/^[[:space:]]*listen_addresses.*/listen_addresses = 'localhost'/g" "$CONF_PATH"
else
    sed -i "s/^#listen_addresses = 'localhost'/listen_addresses = 'localhost'/g" "$CONF_PATH"
    if ! grep -q "^listen_addresses" "$CONF_PATH"; then
        echo "listen_addresses = 'localhost'" >> "$CONF_PATH"
    fi
fi
echo "✅ 已确保 listen_addresses = 'localhost'"

echo "🔄 4. 正在配置 pg_hba.conf 权限规则 (使用 scram-sha-256)..."
# 构造现代的 scram-sha-256 认证规则
NEW_RULE="host    $DB_NAME     $DB_USER     127.0.0.1/32            scram-sha-256"

# 清理可能存在的旧 md5 规则（防止重复运行或旧规则干扰）
OLD_RULE_PATTERN="host[[:space:]]*$DB_NAME[[:space:]]*$DB_USER[[:space:]]*127.0.0.1/32"
sed -i "/$OLD_RULE_PATTERN/d" "$HBA_PATH"

# 将新规则插入到 IPv4 本地连接注释的下方
sed -i "/# IPv4 local connections:/a $NEW_RULE" "$HBA_PATH"
echo "✅ 权限规则 (scram-sha-256) 已成功写入 pg_hba.conf"

echo "🔄 5. 正在重启 PostgreSQL 服务使所有配置生效..."
PG_SERVICE=$(systemctl list-units --type=service --all | grep postgresql | awk '{print $1}' | head -n 1)

if [ -n "$PG_SERVICE" ]; then
    systemctl restart "$PG_SERVICE"
    echo "🚀 PostgreSQL 服务已重启 ($PG_SERVICE)"
else
    systemctl restart postgresql-16 2>/dev/null || systemctl restart postgresql
fi

echo "🔄 6. 正在创建/更新数据库和用户..."
# 1. 检查用户是否存在，不存在则创建，存在则直接更新密码
su - postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'\"" | grep -q 1
if [ $? -eq 0 ]; then
    echo "ℹ️ 用户 $DB_USER 已存在，正在重置密码..."
    su - postgres -c "psql -c \"ALTER USER $DB_USER WITH PASSWORD '$DB_PASS';\""
else
    echo "➕ 正在创建新用户 $DB_USER..."
    su - postgres -c "psql -c \"CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';\""
fi

# 2. 检查数据库是否存在，不存在则创建
su - postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='$DB_NAME'\"" | grep -q 1
if [ $? -eq 0 ]; then
    echo "ℹ️ 数据库 $DB_NAME 已存在，跳过创建。"
else
    echo "➕ 正在创建新数据库 $DB_NAME..."
    su - postgres -c "psql -c \"CREATE DATABASE $DB_NAME OWNER $DB_USER;\""
fi

# 3. 重新授予权限（确保万无一失）
su - postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;\""

echo "--------------------------------------------------------"
echo "🎉 数据库环境一键配置/重置成功！"
echo "--------------------------------------------------------"
echo "📊 数据库名: $DB_NAME"
echo "👤 用户名:   $DB_USER"
echo "🔑 密码文件: $PWD_FILE (内容已更新为最新随机密码)"
echo "🔒 访问控制: 已开启 127.0.0.1 监听及 scram-sha-256 验证"
echo "--------------------------------------------------------"
echo "💡 现在你可以使用最新密码测试连接了："
echo "   psql -U $DB_USER -d $DB_NAME -h 127.0.0.1"
echo "--------------------------------------------------------"