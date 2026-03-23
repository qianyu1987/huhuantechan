@echo off
chcp 65001 >nul
echo ========================================
echo 阿里云短信服务 - 快速部署脚本
echo ========================================
echo.

echo [步骤1/3] 安装阿里云 SDK 依赖...
cd cloudfunctions\userInit
call npm install
if %errorlevel% neq 0 (
    echo ❌ 依赖安装失败!
    pause
    exit /b 1
)
echo ✅ 依赖安装成功!
echo.

cd ..\..

echo [步骤2/3] 检查配置文件...
if exist "cloudfunctions\common\sms\sms-config.js" (
    echo ✅ 配置文件存在
) else (
    echo ❌ 配置文件不存在: cloudfunctions\common\sms\sms-config.js
    pause
    exit /b 1
)
echo.

echo [步骤3/3] 部署说明
echo.
echo ========================================
echo 接下来请在微信开发者工具中操作:
echo.
echo 1. 右键 cloudfunctions\userInit 文件夹
echo 2. 选择 "上传并部署: 云端安装依赖"
echo 3. 等待部署完成(约1-2分钟)
echo.
echo 验证部署成功:
echo - 打开"云开发" → "云函数" → "userInit"
echo - 查看日志,应显示: "[SMS] 阿里云短信服务初始化成功"
echo ========================================
echo.

echo ✅ 本地准备工作完成!
echo.
pause
