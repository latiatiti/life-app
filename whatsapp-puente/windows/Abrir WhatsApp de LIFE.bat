@echo off
rem LIFE: reinicia el puente de WhatsApp (por si quedó trabado) y abre los chats en su propia ventana.
title WhatsApp de LIFE
echo Prendiendo WhatsApp de LIFE... (esta ventana se cierra sola)
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0reiniciar.ps1"
start "" "https://life-app-latiatiti.netlify.app/#/whatsapp"
exit /b 0
