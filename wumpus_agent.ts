import OpenAI from "openai";
import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

dotenv.config();

/* ================= CONFIG ================= */

const SIZE = 4;

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

/* ================= GAME ================= */

type Cell = { pit: boolean; wumpus: boolean; gold: boolean };
type Position = { x: number; y: number };

class WumpusGame {
  grid: Cell[][];
  player: Position = { x: 0, y: 0 };
  hasGold = false;
  hasArrow = true;
  wumpusAlive = true;
  gameOver = false;

  constructor() {
    this.grid = Array.from({ length: SIZE }, () =>
      Array.from({ length: SIZE }, () => ({
        pit: false,
        wumpus: false,
        gold: false,
      }))
    );
    this.placeObjects();
  }

  private randomCell(): Position {
    return {
      x: Math.floor(Math.random() * SIZE),
      y: Math.floor(Math.random() * SIZE),
    };
  }

  private placeObjects() {
    let p;
    do p = this.randomCell(); while (p.x === 0 && p.y === 0);
    this.grid[p.x][p.y].wumpus = true;

    do p = this.randomCell(); while (this.grid[p.x][p.y].wumpus);
    this.grid[p.x][p.y].gold = true;

    for (let i = 0; i < 3; i++) {
      do p = this.randomCell();
      while (this.grid[p.x][p.y].wumpus || this.grid[p.x][p.y].gold);
      this.grid[p.x][p.y].pit = true;
    }
  }

  inBounds(x: number, y: number) {
    return x >= 0 && x < SIZE && y >= 0 && y < SIZE;
  }

  perception(): string[] {
    const p: string[] = [];
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];

    for (const [dx,dy] of dirs) {
      const nx = this.player.x + dx;
      const ny = this.player.y + dy;
      if (!this.inBounds(nx, ny)) continue;

      if (this.grid[nx][ny].pit) p.push("brisa");
      if (this.grid[nx][ny].wumpus && this.wumpusAlive) p.push("fedor");
    }

    if (this.grid[this.player.x][this.player.y].gold) p.push("brilho");
    return [...new Set(p)];
  }

  move(dir: string) {
    const map: any = { w: [-1,0], s: [1,0], a: [0,-1], d: [0,1] };
    if (!map[dir]) return "direção inválida";
    
    const [dx,dy] = map[dir];
    const nx = this.player.x + dx;
    const ny = this.player.y + dy;

    if (!this.inBounds(nx, ny)) return "parede";

    this.player = { x: nx, y: ny };

    const c = this.grid[nx][ny];
    if (c.pit) { this.gameOver = true; return "morreu_poco"; }
    if (c.wumpus && this.wumpusAlive) { this.gameOver = true; return "morreu_wumpus"; }

    return "ok";
  }

  grab() {
    const c = this.grid[this.player.x][this.player.y];
    if (c.gold) {
      this.hasGold = true;
      c.gold = false;
      return true;
    }
    return false;
  }

  shoot(dir: string) {
    if (!this.hasArrow) return false;
    this.hasArrow = false;

    const map: any = { w: [-1,0], s: [1,0], a: [0,-1], d: [0,1] };
    const [dx,dy] = map[dir];
    const nx = this.player.x + dx;
    const ny = this.player.y + dy;

    if (this.inBounds(nx, ny) && this.grid[nx][ny].wumpus) {
      this.wumpusAlive = false;
      return true;
    }
    return false;
  }
}

/* ================= MEMORY ================= */

type KnowledgeCell = {
  visited: boolean;
  safe: boolean;
  pitProb: number;
  wumpusProb: number;
};

class Memory {
  grid: KnowledgeCell[][];

  constructor() {
    this.grid = Array.from({ length: SIZE }, () =>
      Array.from({ length: SIZE }, () => ({
        visited: false,
        safe: false,
        pitProb: 0,
        wumpusProb: 0,
      }))
    );
    this.grid[0][0].safe = true;
  }
}

/* ================= INSTRUCTION PARSER ================= */

function parseInstruction(instr: string) {
  const lower = instr.toLowerCase();
  return {
    killWumpus: /matar|mata|mate|matei|matou|kill|atire|dispara|shoot/.test(lower),
    collectGold: /ouro|gold|pegue|pega|pego|coleta|collect/.test(lower),
    escape: /fuja|fug|sai|escape|volte|vivo|return|saida|saiu/.test(lower),
    avoidWumpus: /sem machucar|nao machucar|não machucar|evite|avoid|não mata|nao mata/.test(lower),
  };
}

function findWumpusDirection(percep: string[], pos: Position, game: WumpusGame): string | null {
  if (!percep.includes("fedor")) return null;
  const dirs: Record<string, [number, number]> = { w: [-1,0], s: [1,0], a: [0,-1], d: [0,1] };
  for (const [dir, [dx, dy]] of Object.entries(dirs)) {
    const nx = pos.x + dx;
    const ny = pos.y + dy;
    if (game.inBounds(nx, ny) && game.grid[nx][ny].wumpus) {
      return dir;
    }
  }
  return null;
}

/* ================= AGENT ================= */

class IntelligentAgent {
  memory = new Memory();

  update(game: WumpusGame) {
    const pos = game.player;
    const percep = game.perception();

    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];

    const current = this.memory.grid[pos.x][pos.y];
    current.visited = true;
    current.safe = true;

    for (const [dx,dy] of dirs) {
      const nx = pos.x + dx;
      const ny = pos.y + dy;
      if (!game.inBounds(nx, ny)) continue;

      const cell = this.memory.grid[nx][ny];

      if (percep.includes("brisa")) {
        cell.pitProb += 0.3;
      } else {
        cell.pitProb = 0;
        cell.safe = true;
      }

      // Atualizar wumpusProb apenas se há nova percepção
      if (percep.includes("fedor")) {
        cell.wumpusProb = 0.1; // risco baixo (pode atirar!)
      }
      // NÃO zerar wumpusProb se não sente fedor (o wumpus não desaparece!)
    }
  }

  getMoves(game: WumpusGame) {
    const pos = game.player;
    const dirs: Record<string, [number, number]> = { w: [-1,0], s: [1,0], a: [0,-1], d: [0,1] };

    const moves: any[] = [];

    for (const [dir, [dx,dy]] of Object.entries(dirs)) {
      const nx = pos.x + dx;
      const ny = pos.y + dy;
      if (!game.inBounds(nx, ny)) continue;

      const cell = this.memory.grid[nx][ny];
      const risk = cell.pitProb + cell.wumpusProb;

      moves.push({ dir, risk, cell });
    }

    return moves.sort((a,b)=>a.risk - b.risk);
  }

  async decide(game: WumpusGame, userInstruction: string) {
    this.update(game);
    const percep = game.perception();
    const instr = parseInstruction(userInstruction);
    const pos = game.player;

    console.log(`[decide] instr: ${JSON.stringify(instr)} | percep: ${percep.join(",") || "none"} | arrow: ${game.hasArrow} | wumpus: ${game.wumpusAlive}`);

    // PRIORIDADE 0: Objetivo alcançado?
    if (instr.killWumpus && !game.wumpusAlive) {
      console.log(`[decide] >>> WUMPUS ELIMINADO COM SUCESSO!`);
      return { action: "objetivo_completo" };
    }
    
    if (instr.collectGold && game.hasGold && !instr.escape) {
      console.log(`[decide] >>> OURO COLETADO COM SUCESSO!`);
      return { action: "objetivo_completo" };
    }
    if (instr.killWumpus && game.hasArrow && game.wumpusAlive && percep.includes("fedor")) {
      const wumpusDir = findWumpusDirection(percep, pos, game);
      if (wumpusDir) {
        console.log(`[decide] >>> MATANDO WUMPUS em ${wumpusDir}`);
        return { action: "atirar", dir: wumpusDir };
      }
    }

    // PRIORIDADE 2: Pegar ouro se estiver aqui
    if (percep.includes("brilho")) {
      console.log(`[decide] >>> PEGANDO OURO`);
      return { action: "pegar" };
    }

    // ESTRATÉGIA ESPECIAL: Se objetivo é ESCAPE e sente Wumpus, mate para liberar caminho
    if (instr.escape && game.hasArrow && game.wumpusAlive && percep.includes("fedor")) {
      const wumpusDir = findWumpusDirection(percep, pos, game);
      if (wumpusDir) {
        console.log(`[decide] >>> MATANDO WUMPUS para escape (liberando caminho)`);
        return { action: "atirar", dir: wumpusDir };
      }
    }

    // PRIORIDADE 3: Sair se tem ouro E está em [0,0]
    if (game.hasGold && pos.x === 0 && pos.y === 0 && instr.escape) {
      console.log(`[decide] >>> ESCAPOU COM SUCESSO!`);
      return { action: "sair" };
    }
    
    if (game.hasGold && pos.x === 0 && pos.y === 0 && (instr.escape || instr.collectGold)) {
      console.log(`[decide] >>> SAINDO COM OURO`);
      return { action: "sair" };
    }

    const moves = this.getMoves(game);

    // ESTRATÉGIA: FUGIR/ESCAPE (voltar com ouro para [0,0])
    if (instr.escape && game.hasGold) {
      if (pos.x > 0) return { action: "andar", dir: "w" };
      if (pos.y > 0) return { action: "andar", dir: "a" };
      return { action: "sair" };
    }

    // ESTRATÉGIA: ESCAPE implica coletar ouro primeiro (aceita risco moderado)
    if (instr.escape && !game.hasGold) {
      const unvisited = moves.filter(m => !m.cell.visited).sort((a,b) => a.risk - b.risk);
      if (unvisited.length > 0) {
        const move = unvisited[0];
        console.log(`[decide] explorando ouro para escape: ${move.dir} (risco:${move.risk.toFixed(2)})`);
        return { action: "andar", dir: move.dir };
      }
      // Se tudo foi explorado, aceita risco até 1.0
      const risky = moves.sort((a,b) => a.risk - b.risk)[0];
      if (risky) {
        console.log(`[decide] retentativa ouro com risco:${risky.risk.toFixed(2)}`);
        return { action: "andar", dir: risky.dir };
      }
    }

    // ESTRATÉGIA: COLETAR OURO (explorar até encontrar, evitando Wumpus)
    if (instr.collectGold && !game.hasGold) {
      // Se sente Wumpus adjacente, contorna com segurança
      if (percep.includes("fedor")) {
        const safeMoves = moves.filter(m => m.risk <= 0.1); // Muito seguro
        if (safeMoves.length > 0) {
          console.log(`[decide] contornando wumpus para coletar ouro: ${safeMoves[0].dir}`);
          return { action: "andar", dir: safeMoves[0].dir };
        }
        // Se não há safe path, espera = volta de onde veio
        const previousMoves = moves.filter(m => m.cell.visited && m.risk <= 0.3);
        if (previousMoves.length > 0) {
          console.log(`[decide] voltando para explorar depois: ${previousMoves[0].dir}`);
          return { action: "andar", dir: previousMoves[0].dir };
        }
      }
      
      const unvisited = moves.filter(m => !m.cell.visited).sort((a,b) => a.risk - b.risk);
      if (unvisited.length > 0) {
        const move = unvisited[0];
        console.log(`[decide] explorando para coletar ouro: ${move.dir} (risco:${move.risk.toFixed(2)})`);
        return { action: "andar", dir: move.dir };
      }
    }

    // ESTRATÉGIA: MATAR WUMPUS (explorar até encontrar, aceita risco!)
    if (instr.killWumpus && game.wumpusAlive && game.hasArrow) {
      // Prioritiza: células não visitadas (seguras > moderado > arriscado)
      const unvisited = moves.filter(m => !m.cell.visited).sort((a,b) => a.risk - b.risk);
      if (unvisited.length > 0) {
        const move = unvisited[0];
        if (move.risk <= 0.3) {
          console.log(`[decide] explorando seguro para encontrar wumpus: ${move.dir}`);
        } else {
          console.log(`[decide] exploração arriscada para matar wumpus: ${move.dir} (risco:${move.risk.toFixed(2)})`);
        }
        return { action: "andar", dir: move.dir };
      }
      // Se tudo foi visitado, revisita o de menor risco
      if (moves.length > 0) {
        console.log(`[decide] revisitando (risco): ${moves[0].dir} (risco:${moves[0].risk.toFixed(2)})`);
        return { action: "andar", dir: moves[0].dir };
      }
    }

    // EVITAR WUMPUS: não atirar, contornar
    if (instr.avoidWumpus && percep.includes("fedor")) {
      const safeMoves = moves.filter(m => m.risk === 0);
      if (safeMoves.length > 0) {
        console.log(`[decide] evitar wumpus: ${safeMoves[0].dir}`);
        return { action: "andar", dir: safeMoves[0].dir };
      }
    }

    // FALLBACK 1: movimento seguro (qualquer um, visitado ou não)
    const safe = moves.find(m => m.risk === 0);
    if (safe) {
      console.log(`[decide] seguro (revisitando): ${safe.dir}`);
      return { action: "andar", dir: safe.dir };
    }

    // FALLBACK 2: movimento de menor risco
    if (moves.length > 0) {
      const lowerRisk = moves[0];
      console.log(`[decide] menor risco: ${lowerRisk.dir} (risco:${lowerRisk.risk.toFixed(2)})`);
      return { action: "andar", dir: lowerRisk.dir };
    }

    // FALLBACK 3: padrão
    console.log(`[decide] sem opção, andar s`);
    return { action: "andar", dir: "s" };
  }

  async askLLM(game: WumpusGame, moves: any[], userInstruction: string) {
    const promptPath = path.resolve(process.cwd(), "agent_prompt.md");
    const systemPrompt = fs.existsSync(promptPath)
      ? fs.readFileSync(promptPath, "utf8")
      : "Você é um agente de Wumpus.";

    const perc = game.perception().join(", ") || "nenhuma";
    const pos = `[${game.player.x + 1},${game.player.y + 1}]`;
    const movesStr = moves.map((m) => `${m.dir}(risco:${m.risk})`).join(", ");

    const userMessage = `Objetivo: ${userInstruction}
Posição: ${pos}
Percepções: ${perc}
Ouro: ${game.hasGold}
Wumpus vivo: ${game.wumpusAlive}
Flecha: ${game.hasArrow}
Movimentos seguros: ${movesStr}
Retorne apenas JSON com acao e direcao se necessário.`;

    try {
      const res = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: 200,
      });

      const content = res.choices[0].message.content || "{}";
      return JSON.parse(content);
    } catch (e) {
      console.log("LLM error, fallback");
      return { action: "andar", dir: moves[0]?.dir || "s" };
    }
  }
}

/* ================= RUN ================= */

async function run(userInstruction: string) {
  const game = new WumpusGame();
  const agent = new IntelligentAgent();

  console.log(
    "Estado inicial:",
    `Posição: [1,1] | Percepções: ${game.perception().join(", ") || "nenhuma"}`
  );
  console.log(`Objetivo: ${userInstruction}\n`);

  for (let i = 0; i < 30; i++) {
    if (game.gameOver) break;

    let decision;
    try {
      decision = await agent.decide(game, userInstruction);
    } catch (e) {
      console.log(`>> [${i + 1}] ERRO ao decidir:`, e);
      break;
    }

    if (decision.action === "andar") {
      const result = game.move(decision.dir);
      console.log(`>> [${i + 1}] andar ${decision.dir} => ${result}`);
    } else if (decision.action === "pegar") {
      const grabbed = game.grab();
      console.log(`>> [${i + 1}] pegar ouro => ${grabbed ? "pegou" : "não tinha"}`);
    } else if (decision.action === "atirar") {
      const hit = game.shoot(decision.dir);
      console.log(`>> [${i + 1}] atirar ${decision.dir} => ${hit ? "acertou!" : "errou"}`);
    } else if (decision.action === "sair") {
      console.log(`>> [${i + 1}] sair => sucesso!`);
      break;
    } else if (decision.action === "objetivo_completo") {
      console.log(`>> [${i + 1}] objetivo completo!`);
      break;
    }
  }

  console.log("Jogo finalizado.");
}

/* ================= MAIN ================= */

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Digite a instrução do usuário: ", async (instrucao) => {
  rl.close();
  await run(instrucao.trim());
});