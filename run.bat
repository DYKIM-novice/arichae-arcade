@echo off
chcp 65001 > nul
cd /d "%~dp0"
title 아리채 오락실 서버

python --version > nul 2>&1
if errorlevel 1 (
  echo 파이썬이 설치되어 있지 않아요. https://www.python.org 에서 설치해 주세요.
  echo 설치할 때 "Add python.exe to PATH" 를 꼭 체크해 주세요.
  pause
  exit /b
)

python server.py
pause
