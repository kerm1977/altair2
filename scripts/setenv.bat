@echo off
setlocal
set "SDK_ROOT=%~dp0..\tools\sdk"
set "ANDROID_HOME=%SDK_ROOT%"
set "ANDROID_SDK_ROOT=%SDK_ROOT%"
set "JAVA_HOME="
for /d %%D in ("C:\Program Files\Eclipse Adoptium\jdk-21*") do set "JAVA_HOME=%%~fD"
if not defined JAVA_HOME for /d %%D in ("C:\Program Files\Java\jdk-21*") do set "JAVA_HOME=%%~fD"
if not defined JAVA_HOME for /d %%D in ("C:\Program Files\Eclipse Adoptium\jdk-17*") do set "JAVA_HOME=%%~fD"
set "PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\cmdline-tools\latest\bin;%ANDROID_HOME%\platform-tools;%PATH%"
endlocal & set "ANDROID_HOME=%ANDROID_HOME%" & set "ANDROID_SDK_ROOT=%ANDROID_SDK_ROOT%" & set "JAVA_HOME=%JAVA_HOME%" & set "PATH=%PATH%"
echo [ENV] JAVA_HOME=%JAVA_HOME%
echo [ENV] ANDROID_HOME=%ANDROID_HOME%
