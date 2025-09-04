
/**
 * Flappy Bird (refactored to be start/stop-able) + HiDPI setup shared with Tetris
 * Original logic preserved where possible, wrapped into a module.
 * Keyboard focus is on the canvas; click or press a key to focus.
 */

(function(global){
  'use strict';

  // ====== Shared canvas and logical size ======
  const scrn = document.getElementById("canvas");
  const sctx = scrn.getContext("2d");
  const LOGICAL_W = 276;
  const LOGICAL_H = 414;
  const W = () => LOGICAL_W;
  const H = () => LOGICAL_H;

  // HiDPI (exposed as global function, used by both games)
  function setupHiDPI() {
    const dpr = window.devicePixelRatio || 1;
    const rect = scrn.getBoundingClientRect(); // size in CSS pixels
    const internalW = Math.round(rect.width * dpr);
    const internalH = Math.round(rect.height * dpr);
    if (scrn.width !== internalW)  scrn.width  = internalW;
    if (scrn.height !== internalH) scrn.height = internalH;
    sctx.setTransform(internalW / W(), 0, 0, internalH / H(), 0, 0);
    sctx.imageSmoothingEnabled = true;
  }
  global.setupHiDPI = setupHiDPI;
  setupHiDPI();
  window.addEventListener('resize', setupHiDPI);

  scrn.tabIndex = 1;

  // ====== Leaderboard utilities (unchanged) ======
  function loadLeaderboard() {
    try {
      const raw = localStorage.getItem("leaderboard");
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveLeaderboard(arr) {
    try { localStorage.setItem("leaderboard", JSON.stringify(arr)); } catch (e) {}
  }
  function updateLeaderboard(name, score) {
    if (!(score > 0)) return;
    const cleanName = (name || "Player") + "";
    const lb = loadLeaderboard();
    lb.push({ name: cleanName, score: Number(score), ts: Date.now() });
    lb.sort((a, b) => {
      const ds = (b.score - a.score);
      if (ds !== 0) return ds;
      return (b.ts || 0) - (a.ts || 0);
    });
    saveLeaderboard(lb.slice(0, 5));
  }
  function drawLeaderboard(ctx) {
    const lb = loadLeaderboard();
    ctx.save();
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.font = "16px Squada One";
    ctx.fillStyle = "#FFFFFF";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    const title = "TOP 5";
    const x = W() - 8;
    let y = 8;
    ctx.strokeText(title, x, y);
    ctx.fillText(title, x, y);
    y += 18;
    if (lb.length === 0) {
      const t = "—";
      ctx.strokeText(t, x, y);
      ctx.fillText(t, x, y);
      ctx.restore();
      return;
    }
    for (let i = 0; i < Math.min(5, lb.length); i++) {
      const entry = lb[i];
      const line = `${i+1}. ${entry.name} — ${entry.score}`;
      ctx.strokeText(line, x, y);
      ctx.fillText(line, x, y);
      y += 18;
    }
    ctx.restore();
  }

  // ====== Game state (mostly original) ======
  const RAD = Math.PI / 180;
  let frames = 0;
  let dx = 2;
  const state = { curr: 0, getReady: 0, Play: 1, gameOver: 2 };
  const SFX = { start: new Audio(), flap: new Audio(), score: new Audio(), hit: new Audio(), die: new Audio(), played: false };
  const gnd = {
    sprite: new Image(), x: 0, y: 0,
    draw() { this.y = H() - this.sprite.height; sctx.drawImage(this.sprite, this.x, this.y); },
    update() { if (state.curr != state.Play) return; this.x -= dx; this.x = this.x % (this.sprite.width / 2); }
  };
  const bg = {
    sprite: new Image(), x: 0, y: 0,
    draw() { const y = H() - this.sprite.height; sctx.drawImage(this.sprite, this.x, y); }
  };
  const pipe = {
    top: { sprite: new Image() }, bot: { sprite: new Image() }, gap: 95, moved: true, pipes: [],
    draw() {
      for (let i = 0; i < this.pipes.length; i++) {
        let p = this.pipes[i];
        sctx.drawImage(this.top.sprite, p.x, p.y);
        sctx.drawImage(this.bot.sprite, p.x, p.y + this.top.sprite.height + this.gap);
      }
    },
    update() {
      if (state.curr != state.Play) return;
      if (frames % 100 == 0) {
        this.pipes.push({ x: W(), y: -210 * Math.min(Math.random() + 1, 1.8) });
      }
      this.pipes.forEach((pipe) => { pipe.x -= dx; });
      if (this.pipes.length && this.pipes[0].x < -this.top.sprite.width) {
        this.pipes.shift(); this.moved = true;
      }
    }
  };
  const bird = {
    animations: [{ sprite: new Image() },{ sprite: new Image() },{ sprite: new Image() },{ sprite: new Image() }],
    rotatation: 0, x: 50, y: 100, speed: 0, gravity: 0.125, thrust: 3.6, frame: 0,
    draw() {
      let h = this.animations[this.frame].sprite.height;
      let w = this.animations[this.frame].sprite.width;
      sctx.save(); sctx.translate(this.x, this.y); sctx.rotate(this.rotatation * RAD);
      sctx.drawImage(this.animations[this.frame].sprite, -w / 2, -h / 2); sctx.restore();
    },
    update() {
      let r = this.animations[0].sprite.width / 2;
      switch (state.curr) {
        case state.getReady:
          this.rotatation = 0; this.y += frames % 10 == 0 ? Math.sin(frames * RAD) : 0; this.frame += frames % 10 == 0 ? 1 : 0; break;
        case state.Play:
          this.frame += frames % 5 == 0 ? 1 : 0; this.y += this.speed; this.setRotation(); this.speed += this.gravity;
          if (this.y + r >= gnd.y || this.collisioned()) { state.curr = state.gameOver; }
          break;
        case state.gameOver:
          this.frame = 1;
          if (this.y + r < gnd.y) {
            this.y += this.speed; this.setRotation(); this.speed += this.gravity * 2;
          } else {
            this.speed = 0; this.y = gnd.y - r; this.rotatation = 90;
            if (!SFX.played) { SFX.die.play(); SFX.played = true; }
          } break;
      }
      this.frame = this.frame % this.animations.length;
    },
    flap() { if (this.y > 0) { SFX.flap.play(); this.speed = -this.thrust; } },
    setRotation() {
      if (this.speed <= 0) this.rotatation = Math.max(-25, (-25 * this.speed) / (-1 * this.thrust));
      else if (this.speed > 0) this.rotatation = Math.min(90, (90 * this.speed) / (this.thrust * 2));
    },
    collisioned() {
      if (!pipe.pipes.length) return;
      let bird = this.animations[0].sprite;
      let x = pipe.pipes[0].x; let y = pipe.pipes[0].y;
      let r = bird.height / 4 + bird.width / 4;
      let roof = y + pipe.top.sprite.height; let floor = roof + pipe.gap; let w = pipe.top.sprite.width;
      if (this.x + r >= x) {
        if (this.x + r < x + w) {
          if (this.y - r <= roof || this.y + r >= floor) { SFX.hit.play(); return true; }
        } else if (pipe.moved) { UI.score.curr++; SFX.score.play(); pipe.moved = false; }
      }
    }
  };
  const UI = {
    getReady: { sprite: new Image() }, gameOver: { sprite: new Image() }, tap: [{ sprite: new Image() }, { sprite: new Image() }],
    score: { curr: 0, best: 0 }, x: 0, y: 0, tx: 0, ty: 0, frame: 0, leaderboardSaved: false,
    draw() {
      switch (state.curr) {
        case state.getReady:
          this.y = (H() - this.getReady.sprite.height) / 2;
          this.x = (W() - this.getReady.sprite.width) / 2;
          this.tx = (W() - this.tap[0].sprite.width) / 2;
          this.ty = this.y + this.getReady.sprite.height - this.tap[0].sprite.height;
          sctx.drawImage(this.getReady.sprite, this.x, this.y);

          // Name entry overlay
          (function(){
            const promptTxt = "Type name, then press Enter";
            const typed = nameEntry.text;
            const caret = (frames % 40 < 20) ? "_" : "";
            sctx.save();
            sctx.font = "24px Squada One";
            sctx.textAlign = "center";
            sctx.textBaseline = "top";
            sctx.fillStyle = "#FFFFFF";
            sctx.strokeStyle = "#000000";
            sctx.lineWidth = 3;
            const cx = W() / 2;
            const cy = (H() - UI.getReady.sprite.height) / 2 + UI.getReady.sprite.height + 10;
            sctx.strokeText(promptTxt, cx, cy);
            sctx.fillText(promptTxt, cx, cy);
            const line = "Enter Name: " + typed + caret;
            sctx.strokeText(line, cx, cy + 28);
            sctx.fillText(line, cx, cy + 28);
            sctx.restore();
          })();
          sctx.drawImage(this.tap[this.frame].sprite, this.tx, this.ty);
          break;
        case state.gameOver:
          this.y = (H() - this.gameOver.sprite.height) / 2;
          this.x = (W() - this.gameOver.sprite.width) / 2;
          this.tx = (W() - this.tap[0].sprite.width) / 2;
          this.ty = this.y + this.gameOver.sprite.height - this.tap[0].sprite.height;
          sctx.drawImage(this.gameOver.sprite, this.x, this.y);
          sctx.drawImage(this.tap[this.frame].sprite, this.tx, this.ty);
          break;
      }
      this.drawScore();
      try { drawLeaderboard(sctx); } catch (e) {}
    },
    drawScore() {
      sctx.fillStyle = "#FFFFFF"; sctx.strokeStyle = "#000000";
      switch (state.curr) {
        case state.Play:
          sctx.lineWidth = 2; sctx.font = "35px Squada One";
          sctx.fillText(this.score.curr, W() / 2 - 5, 50);
          sctx.strokeText(this.score.curr, W() / 2 - 5, 50);
          break;
        case state.gameOver:
          sctx.lineWidth = 2; sctx.font = "40px Squada One";
          let sc = `SCORE :     ${this.score.curr}`;
          try {
            this.score.best = Math.max(this.score.curr, localStorage.getItem("best"));
            sctx.fillText(sc, W() / 2 - 80, H() / 2 + 0);
            sctx.strokeText(sc, W() / 2 - 80, H() / 2 + 0);
          } catch (e) {
            sctx.fillText(sc, W() / 2 - 85, H() / 2 + 15);
            sctx.strokeText(sc, W() / 2 - 85, H() / 2 + 15);
          }
          if (!this.leaderboardSaved) {
            updateLeaderboard(playerName || nameEntry.text || "Player", this.score.curr);
            this.leaderboardSaved = true;
          }
          break;
      }
    },
    update() { if (state.curr == state.Play) return; this.frame += frames % 10 == 0 ? 1 : 0; this.frame = this.frame % this.tap.length; }
  };

  // ====== Name entry state ======
  let playerName = "";
  let nameEntry = { active: true, text: "" };

  // ====== Input Handlers (attach/detach on start/stop) ======
  function onClick() {
    switch (state.curr) {
      case state.getReady:
        if (nameEntry.text.trim().length > 0) {
          playerName = nameEntry.text.trim();
          nameEntry.active = false;
          state.curr = state.Play;
          SFX.start.play();
        } else {
          SFX.start.play();
        }
        break;
      case state.Play:
        bird.flap();
        break;
      case state.gameOver:
        resetGame();
        break;
    }
  }
  function onKeyDown(e) {
    //press SHIFT+~ to CLEAR BOARD
    if (e.key === '~' && e.shiftKey) { saveLeaderboard([]); UI.leaderboardSaved = false; return; }

    if (state.curr === state.getReady) {
      const k = e.key;
      if (k === 'Backspace') { nameEntry.text = nameEntry.text.slice(0, -1); return; }
      if (k === 'Enter') {
        const t = nameEntry.text.trim();
        if (t.length > 0) { playerName = t; nameEntry.active = false; state.curr = state.Play; SFX.start.play(); }
        return;
      }
      if (k && k.length === 1) { if (nameEntry.text.length < 16) nameEntry.text += k; return; }
      return; // ignore other keys
    }
    switch (state.curr) {
      case state.getReady:
        state.curr = state.Play; SFX.start.play(); break;
      case state.Play:
        bird.flap(); break;
      case state.gameOver:
        resetGame(); break;
    }
  }

  function resetGame(){
    state.curr = state.getReady;
    nameEntry = { active: true, text: "" };
    playerName = "";
    UI.leaderboardSaved = false;
    bird.speed = 0;
    bird.y = 100;
    pipe.pipes = [];
    UI.score.curr = 0;
    SFX.played = false;
  }

  // ====== Update/Draw Loop ======
  function update() { bird.update(); gnd.update(); pipe.update(); UI.update(); }
  function draw() {
    sctx.fillStyle = "#30c0df"; sctx.fillRect(0, 0, W(), H());
    bg.draw(); pipe.draw(); bird.draw(); gnd.draw(); UI.draw();
  }
  function gameLoop(){ update(); draw(); frames++; }

  // ====== Assets ======
  gnd.sprite.src = "img/ground.png";
  bg.sprite.src = "img/BG.png";
  pipe.top.sprite.src = "img/toppipe.png";
  pipe.bot.sprite.src = "img/botpipe.png";
  UI.gameOver.sprite.src = "img/go.png";
  UI.getReady.sprite.src = "img/getready.png";
  UI.tap[0].sprite.src = "img/tap/t0.png";
  UI.tap[1].sprite.src = "img/tap/t1.png";
  bird.animations[0].sprite.src = "img/bird/b0.png";
  bird.animations[1].sprite.src = "img/bird/b1.png";
  bird.animations[2].sprite.src = "img/bird/b2.png";
  bird.animations[3].sprite.src = "img/bird/b0.png";
  SFX.start.src = "sfx/start.wav";
  SFX.flap.src = "sfx/flap.wav";
  SFX.score.src = "sfx/score.wav";
  SFX.hit.src = "sfx/hit.wav";
  SFX.die.src = "sfx/die.wav";

  // ====== Public API: start/stop ======
  let timer = null;
  function start(){
    if (timer) return;
    setupHiDPI();
    frames = 0;
    SFX.played = false;
    scrn.addEventListener("click", onClick);
    scrn.addEventListener("keydown", onKeyDown);
    scrn.focus();
    timer = setInterval(gameLoop, 20);
  }
  function stop(){
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    scrn.removeEventListener("click", onClick);
    scrn.removeEventListener("keydown", onKeyDown);
  }

  global.FlappyGame = { start, stop, isActive: () => !!timer };
})(window);
