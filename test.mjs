import { spawn } from 'child_process';

const proc = spawn('npx', ['tsx', 'wumpus_agent.ts'], {
  cwd: process.cwd(),
  stdio: ['pipe', 'inherit', 'inherit'],
});

// Escrever a instrução após 1 segundo
setTimeout(() => {
  proc.stdin.write('mate o wumpus\n');
  proc.stdin.end();
}, 1000);

// Finalizar após 10 segundos
setTimeout(() => {
  proc.kill();
  process.exit(0);
}, 10000);
