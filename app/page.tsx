'use client';

import { useEffect, useRef, useState } from 'react';

type Pipe = {
  x: number;
  gapY: number;
  scored: boolean;
};

type GameStatus = 'start' | 'running' | 'paused' | 'gameover';

type GameRefs = {
  birdY: number;
  birdVelocity: number;
  pipes: Pipe[];
  spawnTimer: number;
  score: number;
  best: number;
  status: GameStatus;
  lastTime: number;
  pauseReasonHidden: boolean;
};

const WORLD = {
  width: 480,
  height: 720,
};

const BIRD = {
  x: 130,
  radius: 18,
};

const PHYSICS = {
  gravity: 1450,
  flapImpulse: -430,
  terminalVelocity: 580,
  pipeSpeed: 170,
  pipeWidth: 72,
  pipeGap: 176,
  pipeSpawnMs: 1400,
  groundHeight: 92,
  topMargin: 64,
};

const COLORS = {
  skyTop: '#08203e',
  skyBottom: '#1d4f7f',
  mountain: '#0f2f53',
  mountainFar: '#123a62',
  ground: '#1f2d1e',
  groundStripe: '#56733c',
  bird: '#ffda6a',
  birdWing: '#f7a53d',
  birdEye: '#0f1320',
  pipe: '#6ccf4f',
  pipeShadow: '#397b2f',
  text: '#f8fbff',
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const randomGapY = () => {
  const min = PHYSICS.topMargin + PHYSICS.pipeGap / 2;
  const max = WORLD.height - PHYSICS.groundHeight - 64 - PHYSICS.pipeGap / 2;
  return min + Math.random() * (max - min);
};

const bestScoreKey = 'flap-combat-best-score';

export default function HomePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const [gameStatus, setGameStatus] = useState<GameStatus>('start');
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);

  const gameRef = useRef<GameRefs>({
    birdY: WORLD.height * 0.45,
    birdVelocity: 0,
    pipes: [],
    spawnTimer: 0,
    score: 0,
    best: 0,
    status: 'start',
    lastTime: 0,
    pauseReasonHidden: false,
  });

  const scaleRef = useRef(1);
  const groundOffsetRef = useRef(0);

  const syncStatus = (status: GameStatus) => {
    gameRef.current.status = status;
    setGameStatus(status);
  };

  const saveBest = (value: number) => {
    gameRef.current.best = value;
    setBestScore(value);
    window.localStorage.setItem(bestScoreKey, String(value));
  };

  const resetGame = (nextStatus: GameStatus) => {
    gameRef.current.birdY = WORLD.height * 0.45;
    gameRef.current.birdVelocity = 0;
    gameRef.current.pipes = [];
    gameRef.current.spawnTimer = PHYSICS.pipeSpawnMs * 0.75;
    gameRef.current.score = 0;
    groundOffsetRef.current = 0;
    setScore(0);
    syncStatus(nextStatus);
  };

  const flap = () => {
    const state = gameRef.current;

    if (state.status === 'start') {
      resetGame('running');
    } else if (state.status === 'gameover') {
      resetGame('running');
    } else if (state.status === 'paused') {
      syncStatus('running');
    }

    if (gameRef.current.status === 'running') {
      state.birdVelocity = PHYSICS.flapImpulse;
    }
  };

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(bestScoreKey) ?? '0');
    const best = Number.isFinite(stored) ? Math.max(0, Math.floor(stored)) : 0;
    gameRef.current.best = best;
    setBestScore(best);
  }, []);

  useEffect(() => {
    const resizeCanvas = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const dpr = window.devicePixelRatio || 1;
      const parentWidth = container.clientWidth;
      const parentHeight = container.clientHeight;
      const scale = Math.min(parentWidth / WORLD.width, parentHeight / WORLD.height);

      const cssWidth = Math.floor(WORLD.width * scale);
      const cssHeight = Math.floor(WORLD.height * scale);

      scaleRef.current = scale;

      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      canvas.width = Math.floor(WORLD.width * dpr);
      canvas.height = Math.floor(WORLD.height * dpr);

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault();
        flap();
      }
    };

    const preventScroll = (event: TouchEvent) => {
      if (gameRef.current.status === 'running' || gameRef.current.status === 'paused') {
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('touchmove', preventScroll, { passive: false });

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('touchmove', preventScroll);
    };
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      const state = gameRef.current;
      if (document.hidden && state.status === 'running') {
        state.pauseReasonHidden = true;
        syncStatus('paused');
      } else if (!document.hidden && state.status === 'paused' && state.pauseReasonHidden) {
        state.pauseReasonHidden = false;
        syncStatus('running');
        state.lastTime = performance.now();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => {
    const draw = (ctx: CanvasRenderingContext2D, state: GameRefs) => {
      const gradient = ctx.createLinearGradient(0, 0, 0, WORLD.height);
      gradient.addColorStop(0, COLORS.skyTop);
      gradient.addColorStop(1, COLORS.skyBottom);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, WORLD.width, WORLD.height);

      ctx.fillStyle = COLORS.mountainFar;
      for (let i = 0; i < 6; i += 1) {
        const baseX = i * 110 - ((groundOffsetRef.current * 0.2) % 110);
        ctx.beginPath();
        ctx.moveTo(baseX, WORLD.height - PHYSICS.groundHeight);
        ctx.lineTo(baseX + 55, WORLD.height - PHYSICS.groundHeight - 110);
        ctx.lineTo(baseX + 110, WORLD.height - PHYSICS.groundHeight);
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = COLORS.mountain;
      for (let i = 0; i < 5; i += 1) {
        const baseX = i * 140 - ((groundOffsetRef.current * 0.35) % 140);
        ctx.beginPath();
        ctx.moveTo(baseX, WORLD.height - PHYSICS.groundHeight);
        ctx.lineTo(baseX + 70, WORLD.height - PHYSICS.groundHeight - 150);
        ctx.lineTo(baseX + 140, WORLD.height - PHYSICS.groundHeight);
        ctx.closePath();
        ctx.fill();
      }

      for (const pipe of state.pipes) {
        const topHeight = pipe.gapY - PHYSICS.pipeGap / 2;
        const bottomY = pipe.gapY + PHYSICS.pipeGap / 2;

        ctx.fillStyle = COLORS.pipeShadow;
        ctx.fillRect(pipe.x + 8, 0, PHYSICS.pipeWidth - 8, topHeight);
        ctx.fillRect(
          pipe.x + 8,
          bottomY,
          PHYSICS.pipeWidth - 8,
          WORLD.height - PHYSICS.groundHeight - bottomY,
        );

        ctx.fillStyle = COLORS.pipe;
        ctx.fillRect(pipe.x, 0, PHYSICS.pipeWidth - 8, topHeight);
        ctx.fillRect(
          pipe.x,
          bottomY,
          PHYSICS.pipeWidth - 8,
          WORLD.height - PHYSICS.groundHeight - bottomY,
        );
      }

      ctx.fillStyle = COLORS.ground;
      ctx.fillRect(0, WORLD.height - PHYSICS.groundHeight, WORLD.width, PHYSICS.groundHeight);

      ctx.fillStyle = COLORS.groundStripe;
      const stripeWidth = 42;
      for (let x = -stripeWidth; x < WORLD.width + stripeWidth; x += stripeWidth) {
        ctx.fillRect(
          x - (groundOffsetRef.current % stripeWidth),
          WORLD.height - PHYSICS.groundHeight + 16,
          stripeWidth / 2,
          10,
        );
      }

      const birdTilt = clamp(state.birdVelocity / 450, -0.5, 0.7);
      ctx.save();
      ctx.translate(BIRD.x, state.birdY);
      ctx.rotate(birdTilt);

      ctx.fillStyle = COLORS.bird;
      ctx.beginPath();
      ctx.arc(0, 0, BIRD.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = COLORS.birdWing;
      ctx.beginPath();
      ctx.ellipse(-4, 4, 10, 8, -0.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = COLORS.birdEye;
      ctx.beginPath();
      ctx.arc(7, -6, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const gameOver = () => {
      const state = gameRef.current;
      syncStatus('gameover');
      if (state.score > state.best) {
        saveBest(state.score);
      }
    };

    const update = (dt: number) => {
      const state = gameRef.current;
      if (state.status !== 'running') return;

      state.birdVelocity = clamp(
        state.birdVelocity + PHYSICS.gravity * dt,
        -9999,
        PHYSICS.terminalVelocity,
      );
      state.birdY += state.birdVelocity * dt;

      state.spawnTimer -= dt * 1000;
      if (state.spawnTimer <= 0) {
        state.pipes.push({
          x: WORLD.width + PHYSICS.pipeWidth,
          gapY: randomGapY(),
          scored: false,
        });
        state.spawnTimer += PHYSICS.pipeSpawnMs;
      }

      for (const pipe of state.pipes) {
        pipe.x -= PHYSICS.pipeSpeed * dt;
        if (!pipe.scored && pipe.x + PHYSICS.pipeWidth < BIRD.x) {
          pipe.scored = true;
          state.score += 1;
          setScore(state.score);
        }
      }

      state.pipes = state.pipes.filter((pipe) => pipe.x + PHYSICS.pipeWidth > -16);
      groundOffsetRef.current += PHYSICS.pipeSpeed * dt;

      const birdTop = state.birdY - BIRD.radius;
      const birdBottom = state.birdY + BIRD.radius;
      const playBottom = WORLD.height - PHYSICS.groundHeight;

      if (birdTop <= 0 || birdBottom >= playBottom) {
        gameOver();
        return;
      }

      for (const pipe of state.pipes) {
        const pipeRight = pipe.x + PHYSICS.pipeWidth;
        const overlapX = BIRD.x + BIRD.radius > pipe.x && BIRD.x - BIRD.radius < pipeRight;
        if (!overlapX) continue;

        const gapTop = pipe.gapY - PHYSICS.pipeGap / 2;
        const gapBottom = pipe.gapY + PHYSICS.pipeGap / 2;

        if (birdTop < gapTop || birdBottom > gapBottom) {
          gameOver();
          return;
        }
      }
    };

    const loop = (time: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const state = gameRef.current;
      if (state.lastTime === 0) {
        state.lastTime = time;
      }

      const deltaSeconds = clamp((time - state.lastTime) / 1000, 0, 0.04);
      state.lastTime = time;

      update(deltaSeconds);
      draw(ctx, state);

      animationRef.current = requestAnimationFrame(loop);
    };

    animationRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const overlayTitle =
    gameStatus === 'gameover' ? 'Mission Failed' : gameStatus === 'paused' ? 'Paused' : 'Flap Combat';

  const overlayText =
    gameStatus === 'gameover'
      ? 'Tap, click, or press Space to redeploy.'
      : gameStatus === 'paused'
        ? 'Game paused while tab was hidden. Tap, click, or press Space to continue.'
        : 'Tap, click, or press Space to fly through enemy gates.';

  return (
    <main className="gamePage" ref={containerRef}>
      <div className="canvasWrap" onClick={flap} onTouchStart={flap} role="button" tabIndex={0}>
        <canvas ref={canvasRef} aria-label="Flap Combat game canvas" />

        <div className="hud">
          <div className="scoreCard">
            <span>Score</span>
            <strong>{score}</strong>
          </div>
          <div className="scoreCard">
            <span>Best</span>
            <strong>{bestScore}</strong>
          </div>
        </div>

        {gameStatus !== 'running' && (
          <div className="overlay">
            <h1>{overlayTitle}</h1>
            <p>{overlayText}</p>
            <button type="button" onClick={flap}>
              {gameStatus === 'gameover' ? 'Restart' : gameStatus === 'paused' ? 'Resume' : 'Start'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
