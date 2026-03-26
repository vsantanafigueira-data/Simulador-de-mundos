// Simulador do Mundo de Wumpus em TypeScript

import * as readline from 'readline';

const SIZE = 4; // 4x4 = 16 casas

type Cell = {
  pit: boolean;
  wumpus: boolean;
  gold: boolean;
};

type Position = {
  x: number;
  y: number;
};

class WumpusGame {
  grid: Cell[][] = [];
  player: Position = { x: 0, y: 0 };
  hasArrow = true;
  hasGold = false;
  wumpusAlive = true;
  score = 0;

  constructor() {
    this.initGrid();
    this.placeObjects();
  }

  initGrid() {
    for (let i = 0; i < SIZE; i++) {
      this.grid[i] = [];
      for (let j = 0; j < SIZE; j++) {
        this.grid[i][j] = { pit: false, wumpus: false, gold: false };
      }
    }
  }

  randomEmptyCell(): Position {
    while (true) {
      const x = Math.floor(Math.random() * SIZE);
      const y = Math.floor(Math.random() * SIZE);

      if ((x !== 0 || y !== 0) &&
        !this.grid[x][y].pit &&
        !this.grid[x][y].wumpus &&
        !this.grid[x][y].gold) {
        return { x, y };
      }
    }
  }

  placeObjects() {
    // Wumpus
    let pos = this.randomEmptyCell();
    this.grid[pos.x][pos.y].wumpus = true;

    // Ouro
    pos = this.randomEmptyCell();
    this.grid[pos.x][pos.y].gold = true;

    // 3 poços
    for (let i = 0; i < 3; i++) {
      pos = this.randomEmptyCell();
      this.grid[pos.x][pos.y].pit = true;
    }
  }

  getPerception(): string[] {
    const perceptions: string[] = [];
    const { x, y } = this.player;

    const directions = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 }
    ];

    for (let d of directions) {
      const nx = x + d.x;
      const ny = y + d.y;

      if (this.inBounds(nx, ny)) {
        if (this.grid[nx][ny].pit) perceptions.push("brisa");
        if (this.grid[nx][ny].wumpus && this.wumpusAlive) perceptions.push("fedor");
      }
    }

    if (this.grid[x][y].gold) perceptions.push("brilho");

    return perceptions;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < SIZE && y >= 0 && y < SIZE;
  }

  move(dx: number, dy: number) {
    const nx = this.player.x + dx;
    const ny = this.player.y + dy;

    if (!this.inBounds(nx, ny)) {
      console.log("Você bateu na parede! (choque)");
      return;
    }

    this.player = { x: nx, y: ny };
    this.score -= 1;

    this.checkCell();
  }

  checkCell() {
    const cell = this.grid[this.player.x][this.player.y];

    if (cell.pit) {
      console.log("Você caiu em um poço! ☠️");
      this.score -= 100;
      process.exit();
    }

    if (cell.wumpus && this.wumpusAlive) {
      console.log("O Wumpus te devorou! ☠️");
      this.score -= 100;
      process.exit();
    }

    this.printStatus();
  }

  shoot(dx: number, dy: number) {
    if (!this.hasArrow) {
      console.log("Você já usou sua flecha!");
      return;
    }

    this.hasArrow = false;
    const tx = this.player.x + dx;
    const ty = this.player.y + dy;

    if (this.inBounds(tx, ty) && this.grid[tx][ty].wumpus) {
      this.wumpusAlive = false;
      console.log("Você matou o Wumpus! Ele gritou! (+50 pontos)");
      this.score += 50;
    } else {
      console.log("Você errou o tiro.");
    }

    this.score -= 1;
  }

  grabGold() {
    const cell = this.grid[this.player.x][this.player.y];
    if (cell.gold) {
      this.hasGold = true;
      cell.gold = false;
      console.log("Você pegou o ouro! ✨");
    } else {
      console.log("Não há ouro aqui.");
    }
    this.score -= 1;
  }

  climb() {
    if (this.player.x === 0 && this.player.y === 0 && this.hasGold) {
      console.log("Você escapou com o ouro! 🏆 (+50 pontos)");
      this.score += 50;
      console.log("Pontuação final:", this.score);
      process.exit();
    } else {
      console.log("Você precisa estar na posição inicial com o ouro.");
    }
    this.score -= 1;
  }

  printStatus() {
    const perceptions = this.getPerception();
    console.log(`Você está em [${this.player.x + 1}, ${this.player.y + 1}]`);

    if (perceptions.length === 0) {
      console.log("Você não percebe nada.");
    } else {
      console.log("Você percebe:", perceptions.join(", "));
    }
  }
}

// Interface com usuário
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const game = new WumpusGame();

game.printStatus();

function prompt() {
  rl.question("Comando (w/a/s/d, shoot, grab, climb): ", (input) => {
    switch (input) {
      case 'w': game.move(-1, 0); break;
      case 's': game.move(1, 0); break;
      case 'a': game.move(0, -1); break;
      case 'd': game.move(0, 1); break;

      case 'shoot':
        rl.question("Direção (w/a/s/d): ", (dir) => {
          if (dir === 'w') game.shoot(-1, 0);
          if (dir === 's') game.shoot(1, 0);
          if (dir === 'a') game.shoot(0, -1);
          if (dir === 'd') game.shoot(0, 1);
          prompt();
        });
        return;

      case 'grab': game.grabGold(); break;
      case 'climb': game.climb(); break;

      default:
        console.log("Comando inválido.");
    }

    prompt();
  });
}

prompt();
