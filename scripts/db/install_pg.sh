#!/bin/bash

# =======================================================================
# 脚本名称: install_pg.sh
# 适用系统: RHEL / CentOS / Rocky Linux / AlmaLinux (使用 YUM/DNF 的系统)
# 功能: 自动配置官方源并安装 PostgreSQL
# =======================================================================

# 确保脚本以 root 权限运行
if [ "$EUID" -ne 0 ]; then
  echo "❌ 请使用 root 权限或 sudo 运行此脚本！"
  exit 1
fi

# ----------------- 配置区 -----------------
# 你可以修改为你想要安装的 PostgreSQL 版本（例如: 14, 15, 16）
PG_VERSION="16"
# ------------------------------------------

echo "🔄 正在检测系统版本..."

# 获取系统大版本号
if [ -f /etc/os-release ]; then
    . /etc/os-release
    MAIN_VER=$(echo $VERSION_ID | cut -d. -f1)
    OS_NAME=$ID
else
    echo "❌ 无法检测到系统版本，脚本退出。"
    exit 1
fi

echo "🐧 检测到系统: $OS_NAME , 大版本号: $MAIN_VER"

# 根据系统版本配置官方 YUM 源 URL
case $MAIN_VER in
    7)
        REPO_URL="https://download.postgresql.org/pub/repos/yum/reporpms/EL-7-x86_64/pgdg-redhat-repo-latest.noarch.rpm"
        PKG_MANAGER="yum"
        ;;
    8)
        REPO_URL="https://download.postgresql.org/pub/repos/yum/reporpms/EL-8-x86_64/pgdg-redhat-repo-latest.noarch.rpm"
        PKG_MANAGER="dnf"
        ;;
    9)
        REPO_URL="https://download.postgresql.org/pub/repos/yum/reporpms/EL-9-x86_64/pgdg-redhat-repo-latest.noarch.rpm"
        PKG_MANAGER="dnf"
        ;;
    *)
        echo "❌ 暂不支持的系统版本: EL $MAIN_VER"
        exit 1
        ;;
esac

echo "📦 1. 正在安装 PostgreSQL 官方 YUM 源..."
$PKG_MANAGER install -y $REPO_URL

# 如果是 CentOS 8/9 或更高版本，需要禁用系统自带的 postgresql 模块
if [ "$PKG_MANAGER" = "dnf" ]; then
    echo "🔄 2. 正在禁用系统内置的 PostgreSQL 模块..."
    dnf -qy module disable postgresql
fi

echo "📥 3. 正在安装 PostgreSQL $PG_VERSION 服务端及客户端..."
$PKG_MANAGER install -y postgresql${PG_VERSION}-server postgresql${PG_VERSION}

echo "⚙️ 4. 正在初始化数据库..."
/usr/pgsql-${PG_VERSION}/bin/postgresql-${PG_VERSION}-setup initdb

echo "🚀 5. 正在启动 PostgreSQL 服务并设置开机自启..."
systemctl start postgresql-${PG_VERSION}
systemctl enable postgresql-${PG_VERSION}

# 检查服务状态
if systemctl is-active --quiet postgresql-${PG_VERSION}; then
    echo "--------------------------------------------------------"
    echo "🎉 PostgreSQL $PG_VERSION 安装并启动成功！"
    echo "--------------------------------------------------------"
    echo "💡 提示："
    echo "   - 默认数据库用户为: postgres"
    echo "   - 切换到 postgres 用户命令: su - postgres"
    echo "   - 进入数据库命令行命令: psql"
    echo "--------------------------------------------------------"
else
    echo "❌ PostgreSQL 启动失败，请检查系统日志 (journalctl -u postgresql-${PG_VERSION})"
fi