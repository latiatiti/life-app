@echo off
rem LIFE: prende el puente de WhatsApp (si ya anda, no hace nada) y abre los chats en su propia ventana.
schtasks /run /tn "LIFE WhatsApp" >nul 2>&1
start "" msedge --app=https://life-app-latiatiti.netlify.app/#/whatsapp
