@echo off
chcp 65001 >nul

set "PORT=8765"
set "ROOT=%~dp0"
rem 去掉末尾反斜杠
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "PYTHON=C:\Users\admin\.workbuddy\binaries\python\versions\3.13.12\python.exe"

echo ========================================
echo   本地预览服务器 - 重启脚本
echo   端口: %PORT%
echo   目录: %ROOT%
echo ========================================
echo.

rem ---- 步骤 1: 关闭占用端口的进程 ----
echo [1/2] 关闭占用端口 %PORT% 的旧进程...
set "killed=0"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /C:":%PORT%" ^| findstr "LISTENING"') do (
    echo   - 终止 PID %%a
    taskkill /F /PID %%a >nul 2>&1
    set "killed=1"
)
if not "%killed%"=="1" echo   - 端口 %PORT% 空闲，无需关闭

echo.

rem ---- 步骤 2: 启动新服务器 ----
echo [2/2] 启动新的 HTTP 服务器...
echo.
echo   预览地址:
echo     首页导航:        http://localhost:%PORT%/
echo     ICO 图标生成器:   http://localhost:%PORT%/icons-generator/
echo     CLSF 刀轨预览:   http://localhost:%PORT%/clsf-viewer/
echo.
echo   (按 Ctrl+C 停止服务器，或关闭本窗口)
echo ----------------------------------------

rem 优先使用 WorkBuddy 管理的 Python，回退到系统 python
if exist "%PYTHON%" (
    "%PYTHON%" -m http.server %PORT% --bind 0.0.0.0 --directory "%ROOT%"
) else (
    where python >nul 2>&1
    if %errorlevel% equ 0 (
        python -m http.server %PORT% --bind 0.0.0.0 --directory "%ROOT%"
    ) else (
        echo [错误] 未找到 Python，请安装 Python 或修改本脚本中的 PYTHON 路径。
        pause
        exit /b 1
    )
)
