
/**
 * Cyberpunk Tetris — compact implementation for the same canvas.
 * Controls: Left/Right move, Up rotate, Down soft drop, Space hard drop, P pause, R reset
 */
(function(global){
  'use strict';

  const scrn = document.getElementById("canvas");
  const ctx = scrn.getContext("2d");
  const LOGICAL_W = 276, LOGICAL_H = 414;
  const W = () => LOGICAL_W, H = () => LOGICAL_H;
  const raf = (fn)=>window.requestAnimationFrame(fn);

  // Use shared HiDPI if present
  if (typeof global.setupHiDPI === 'function') global.setupHiDPI();

  // Grid
  const COLS = 10, ROWS = 20;
  let cell = Math.floor(Math.min(W()*0.92 / COLS, (H()*0.92) / ROWS)); // fit with margin
  function gridLeft(){ return Math.floor((W() - COLS*cell)/2); }
  function gridTop(){ return Math.floor((H() - ROWS*cell)/2); }

  // Pieces (matrices)
  const SHAPES = {
    I: [[1,1,1,1]],
    J: [[1,0,0],[1,1,1]],
    L: [[0,0,1],[1,1,1]],
    O: [[1,1],[1,1]],
    S: [[0,1,1],[1,1,0]],
    T: [[0,1,0],[1,1,1]],
    Z: [[1,1,0],[0,1,1]]
  };
  const COLORS = {
    I: "#00f0ff", J: "#ff00cc", L: "#ffd300", O: "#00ff85", S: "#ff3b7b", T: "#8e5dff", Z: "#ff6b00"
  };
  const KEYS = { LEFT: "ArrowLeft", RIGHT:"ArrowRight", UP:"ArrowUp", DOWN:"ArrowDown", SPACE:" ", P:"p", R:"r" };

  let board, piece, next, dropInterval, dropTimer, paused, score, lines, level;
  let running = false, animId = null;

  function emptyBoard(){
    const b = [];
    for (let r=0;r<ROWS;r++){ b[r] = new Array(COLS).fill(null); }
    return b;
  }

  function randomPiece(){
    const types = Object.keys(SHAPES);
    const t = types[Math.floor(Math.random()*types.length)];
    return { t, shape: SHAPES[t].map(row=>row.slice()), x: Math.floor((COLS - SHAPES[t][0].length)/2), y: -2 };
  }

  function rotate(mat){
    const R = mat.length, C = mat[0].length;
    const out = [];
    for (let c=0;c<C;c++){ out[c] = []; for(let r=R-1;r>=0;r--){ out[c].push(mat[r][c]); } }
    return out;
  }

  function collide(px, py, shape){
    for (let r=0;r<shape.length;r++){
      for (let c=0;c<shape[r].length;c++){
        if (!shape[r][c]) continue;
        const x = px + c, y = py + r;
        if (x < 0 || x >= COLS || y >= ROWS) return true;
        if (y >= 0 && board[y][x]) return true;
      }
    }
    return false;
  }

  function mergePiece(){
    for (let r=0;r<piece.shape.length;r++){
      for (let c=0;c<piece.shape[r].length;c++){
        if (!piece.shape[r][c]) continue;
        const y = piece.y + r, x = piece.x + c;
        if (y >= 0) board[y][x] = piece.t;
      }
    }
  }

  function clearLines(){
    let cleared = 0;
    for (let r = ROWS-1; r >= 0; ){
      if (board[r].every(v => v)){
        board.splice(r, 1);
        board.unshift(new Array(COLS).fill(null));
        cleared++;
      } else { r--; }
    }
    if (cleared){
      lines += cleared;
      const pts = [0, 100, 300, 500, 800][cleared] || 0;
      score += pts * (1 + Math.floor(level/2));
      level = Math.min(15, 1 + Math.floor(lines/10));
      dropInterval = Math.max(90, 700 - level*40);
    }
  }

  // Controls
  function onKeyDown(e){
    if (!running) return;
    const k = e.key;
    if (k === KEYS.P || k === KEYS.P.toUpperCase()){ paused = !paused; return; }
    if (paused) return;

    if (k === KEYS.LEFT){
      if (!collide(piece.x - 1, piece.y, piece.shape)) piece.x--;
    } else if (k === KEYS.RIGHT){
      if (!collide(piece.x + 1, piece.y, piece.shape)) piece.x++;
    } else if (k === KEYS.DOWN){
      tick();
      score += 1;
    } else if (k === KEYS.UP){
      const rot = rotate(piece.shape);
      if (!collide(piece.x, piece.y, rot)) piece.shape = rot;
    } else if (k === KEYS.SPACE){
      // hard drop
      let dy = 0;
      while(!collide(piece.x, piece.y + 1, piece.shape)){ piece.y++; dy++; }
      score += 2*dy;
      tick(); // lock & spawn
    } else if (k === KEYS.R || k === KEYS.R.toUpperCase()){
      reset();
    }
  }

  // Falling
  let lastTime = 0;
  function loop(t){
    if (!running){ return; }
    animId = raf(loop);
    if (paused) { draw(); return; }
    if (!lastTime) lastTime = t;
    const dt = t - lastTime;
    dropTimer += dt;
    if (dropTimer >= dropInterval){ tick(); dropTimer = 0; }
    lastTime = t;
    draw();
  }

  function tick(){
    if (!running) return;
    if (!collide(piece.x, piece.y + 1, piece.shape)){
      piece.y++;
      return;
    }
    // lock
    mergePiece();
    clearLines();
    piece = next; next = randomPiece();
    // If new piece collides immediately => game over
    if (collide(piece.x, piece.y, piece.shape)){
      gameOver();
    }
  }

  function gameOver(){
    running = false;
    draw(true);
  }

  // Draw
  function draw(gameOverFlag=false){
    // cyberpunk gradient bg
    const g = ctx.createLinearGradient(0,0,W(),H());
    g.addColorStop(0, "rgba(0,255,255,0.12)");
    g.addColorStop(1, "rgba(255,0,204,0.12)");
    ctx.fillStyle = "#0b0f1f";
    ctx.fillRect(0,0,W(),H());
    ctx.fillStyle = g;
    ctx.fillRect(0,0,W(),H());

    // grid glow
    const left = gridLeft(), top = gridTop();
    ctx.save();
    // outer frame
    ctx.strokeStyle = "rgba(0,255,255,0.6)";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(255,0,204,0.35)";
    ctx.shadowBlur = 8;
    ctx.strokeRect(left-2, top-2, COLS*cell+4, ROWS*cell+4);

    // cells
    for (let r=0;r<ROWS;r++){
      for (let c=0;c<COLS;c++){
        const v = board[r][c];
        if (v){
          drawCell(left + c*cell, top + r*cell, COLORS[v]);
        } else {
          // faint grid lines
          ctx.strokeStyle = "rgba(255,255,255,0.05)";
          ctx.lineWidth = 1;
          ctx.strokeRect(left + c*cell, top + r*cell, cell, cell);
        }
      }
    }
    // current piece
    if (running){
      for (let r=0;r<piece.shape.length;r++){
        for (let c=0;c<piece.shape[r].length;c++){
          if (!piece.shape[r][c]) continue;
          const x = piece.x + c, y = piece.y + r;
          if (y >= 0) drawCell(left + x*cell, top + y*cell, COLORS[piece.t]);
        }
      }
    }
    ctx.restore();

    // HUD
    ctx.save();
    ctx.font = "20px Squada One";
    ctx.textAlign = "left";
    ctx.fillStyle = "#e6f7ff";
    ctx.fillText(`SCORE ${score}`, 8, 8+18);
    ctx.fillText(`LINES ${lines}`, 8, 8+18*2);
    ctx.fillText(`LVL   ${level}`, 8, 8+18*3);

    if (paused){
      centerText("PAUSED", "#00f0ff", "#ff00cc");
    } else if (!running && !gameOverFlag){
      centerText("TETRIS — Press any key", "#00f0ff", "#ff00cc");
    } else if (gameOverFlag){
      centerText("GAME OVER — R to Reset", "#ff5277", "#ff00cc");
    }
    ctx.restore();
  }

  function centerText(msg, fg, glow){
    ctx.save();
    ctx.font = "28px Squada One";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = glow; ctx.lineWidth = 3;
    ctx.fillStyle = fg;
    ctx.shadowColor = glow; ctx.shadowBlur = 16;
    ctx.strokeText(msg, W()/2, H()/2);
    ctx.fillText(msg, W()/2, H()/2);
    ctx.restore();
  }

  function drawCell(x, y, color){
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fillRect(x+1, y+1, cell-2, cell-2);
    // inner highlight
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x+2, y+2, Math.max(1, cell-8), Math.max(1, cell-8));
    ctx.restore();
  }

  // Public API
  function start(){
    if (running) return;
    reset();
    running = true;
    scrn.addEventListener("keydown", onKeyDown);
    scrn.addEventListener("click", focusCanvas, { once: true });
    scrn.focus();
    animId = raf(loop);
  }
  function stop(){
    if (!running && animId===null) return;
    running = false;
    if (animId){ cancelAnimationFrame(animId); animId = null; }
    scrn.removeEventListener("keydown", onKeyDown);
  }
  function isActive(){ return running; }

  function focusCanvas(){ scrn.focus(); }

  function reset(){
    board = emptyBoard();
    piece = randomPiece();
    next = randomPiece();
    score = 0; lines = 0; level = 1;
    dropInterval = 700; dropTimer = 0; paused = false;
    lastTime = 0;
    // re-evaluate cell size in case canvas resized
    if (typeof global.setupHiDPI === 'function') global.setupHiDPI();
    cell = Math.floor(Math.min(W()*0.92 / COLS, (H()*0.92) / ROWS));
    draw();
  }

  global.TetrisGame = { start, stop, isActive };
})(window);
