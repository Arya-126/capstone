@echo off
REM Content-pipeline diagnostic dump. Run from anywhere:
REM   C:\Users\Lenovo\projects\capstone\capstone\server\scripts\diagnose.cmd
REM Paste the full output to any AI agent to debug crashes/stalls.
REM Docs: docs/OPERATIONS.md (runbook), docs/content-pipeline-plan.md (design)

cd /d C:\Users\Lenovo\projects\capstone\capstone\server

echo ================= SCHEDULED TASKS =================
schtasks /Query /TN "capstone-content-pipeline" /V /FO LIST 2>nul | findstr /C:"Last Run" /C:"Next Run" /C:"Last Result" /C:"Status:"
schtasks /Query /TN "capstone-pipeline-recycle" /V /FO LIST 2>nul | findstr /C:"Last Run" /C:"Last Result"

echo ================= DAEMON LOCK =================
if exist prisma\data\daemon.lock (
  set /p LOCKPID=<prisma\data\daemon.lock
  call echo lock held by PID %%LOCKPID%%
  call tasklist /FI "PID eq %%LOCKPID%%" /NH 2>nul | findstr /R "." || echo (process is DEAD - stale lock, auto-cleared next run)
) else (
  echo no lock - no daemon running
)

echo ================= CLOUD QUOTA STATE =================
if exist prisma\data\quota-state.json (type prisma\data\quota-state.json) else (echo no providers parked)

echo ================= LOCAL SERVICES =================
curl -s -m 3 http://localhost:11434/api/tags >nul 2>&1 && (echo ollama: UP) || (echo ollama: DOWN - start the Ollama app)
curl -s -m 3 http://localhost:2000/api/v2/runtimes >nul 2>&1 && (echo piston: UP) || (echo piston: DOWN - run: docker compose up -d)
docker ps --format "{{.Names}}: {{.Status}}" 2>nul

echo ================= PIPELINE + BANKS =================
call npx ts-node scripts/pipeline-status.ts

echo ================= LAST 30 DAEMON LOG LINES =================
node -e "try{const l=require('fs').readFileSync('logs/pipeline.log','utf8').trimEnd().split(/\r?\n/);console.log(l.slice(-30).join('\n'))}catch{console.log('no log yet')}"

echo ================= LAST 10 MCQ LOG LINES =================
node -e "try{const l=require('fs').readFileSync('logs/mcq-solve.log','utf8').trimEnd().split(/\r?\n/);console.log(l.slice(-10).join('\n'))}catch{console.log('no log yet')}"
