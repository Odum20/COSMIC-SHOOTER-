/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';

declare const Tone: any;

interface KeyBindings {
  shoot: string;
  special: string;
  shield: string;
}

const DEFAULT_KEY_BINDINGS: KeyBindings = {
  shoot: 'z',
  special: 'x',
  shield: 'c',
};

export default function App() {
  const [gameMode, setGameMode] = useState<'menu' | 'playing' | 'paused' | 'gameover'>('menu');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(parseInt(localStorage.getItem('spaceShooterHighScore') || '0', 10));
  const [lives, setLives] = useState(3);
  const [coins, setCoins] = useState(() => {
    try {
      const saved = localStorage.getItem('spaceShooterCoins');
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  });
  const [shieldsCount, setShieldsCount] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('spaceShooterShields');
      return saved !== null ? Math.max(0, parseInt(saved, 10)) : 1;
    } catch {
      return 1;
    }
  });
  const [keyBindings, setKeyBindings] = useState<KeyBindings>(() => {
    try {
      const saved = localStorage.getItem('spaceShooterKeyBindings');
      if (saved) return { ...DEFAULT_KEY_BINDINGS, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_KEY_BINDINGS;
  });

  const [energyBars, setEnergyBars] = useState(1);
  const [showControls, setShowControls] = useState(false);
  const [showUpgrades, setShowUpgrades] = useState(false);
  const [upgradesReturnMode, setUpgradesReturnMode] = useState<'menu' | 'playing' | 'paused' | 'gameover'>('menu');
  const [rebindAction, setRebindAction] = useState<null | keyof KeyBindings>(null);
  const [controlMode, setControlMode] = useState<'touch' | 'keyboard'>('touch');
  const [navMode, setNavMode] = useState<'dpad' | 'swipe'>('swipe');
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const [swipeTouchPos, setSwipeTouchPos] = useState<{ x: number; y: number } | null>(null);
  const [pressedButtons, setPressedButtons] = useState<{ [key: string]: boolean }>({});

  const [purchasedFlame, setPurchasedFlame] = useState(false);
  const [purchasedAlien, setPurchasedAlien] = useState(false);

  // Active buff timers for HUD display
  const [activeFlameSecs, setActiveFlameSecs] = useState(0);
  const [activeAlienSecs, setActiveAlienSecs] = useState(0);
  const [shieldActiveStatus, setShieldActiveStatus] = useState(false);
  const [shieldHpStatus, setShieldHpStatus] = useState(4);

  const gameRef = useRef<any>(null);
  const sfxRef = useRef<any>(null);
  const swipeAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const hasShownHintRef = useRef(false);
  const keyBindingsRef = useRef<KeyBindings>(keyBindings);
  keyBindingsRef.current = keyBindings;
  const shieldsCountRef = useRef<number>(shieldsCount);
  shieldsCountRef.current = shieldsCount;
  const pendingFlameRef = useRef(false);
  const pendingAlienRef = useRef(false);

  const updateCoins = (updater: number | ((prev: number) => number)) => {
    setCoins(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try {
        localStorage.setItem('spaceShooterCoins', next.toString());
      } catch {}
      return next;
    });
  };

  const updateShields = (updater: number | ((prev: number) => number)) => {
    setShieldsCount(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const clamped = Math.max(0, next);
      try {
        localStorage.setItem('spaceShooterShields', clamped.toString());
      } catch {}
      if (gameRef.current) {
        gameRef.current.shieldsCount = clamped;
      }
      return clamped;
    });
  };

  const saveKeyBindings = (newBindings: KeyBindings) => {
    setKeyBindings(newBindings);
    try {
      localStorage.setItem('spaceShooterKeyBindings', JSON.stringify(newBindings));
    } catch {}
  };

  const triggerSwipeTutorial = () => {
    setShowSwipeHint(true);
    setTimeout(() => {
      setShowSwipeHint(false);
    }, 2800);
  };

  const handleSwipePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
    setShowSwipeHint(false);
    swipeAnchorRef.current = { x: e.clientX, y: e.clientY };
    setSwipeTouchPos({ x: e.clientX, y: e.clientY });
    if (gameRef.current?.input) {
      gameRef.current.input.setMoveVector(0, 0);
    }
  };

  const handleSwipePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!swipeAnchorRef.current) return;
    const dx = e.clientX - swipeAnchorRef.current.x;
    const dy = e.clientY - swipeAnchorRef.current.y;
    const maxDist = 38;
    const clampedX = Math.max(-1, Math.min(1, dx / maxDist));
    const clampedY = Math.max(-1, Math.min(1, dy / maxDist));

    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxDist) {
      swipeAnchorRef.current.x = e.clientX - (clampedX * maxDist);
      swipeAnchorRef.current.y = e.clientY - (clampedY * maxDist);
    }

    setSwipeTouchPos({ x: e.clientX, y: e.clientY });
    if (gameRef.current?.input) {
      gameRef.current.input.setMoveVector(clampedX, clampedY);
    }
  };

  const handleSwipePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch (_) {}
    swipeAnchorRef.current = null;
    setSwipeTouchPos(null);
    if (gameRef.current?.input) {
      gameRef.current.input.setMoveVector(0, 0);
    }
  };

  const toggleNavMode = () => {
    setNavMode(prev => {
      const next = prev === 'dpad' ? 'swipe' : 'dpad';
      if (next === 'swipe') {
        triggerSwipeTutorial();
      }
      return next;
    });
    if (gameRef.current?.input) {
      gameRef.current.input.setMoveVector(0, 0);
    }
  };

  const bindControl = (actionOrKey: string) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (_) {}
      setPressedButtons(prev => ({ ...prev, [actionOrKey]: true }));
      if (gameRef.current?.input) {
        gameRef.current.input.setKey(actionOrKey, true);
      }
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch (_) {}
      setPressedButtons(prev => ({ ...prev, [actionOrKey]: false }));
      if (gameRef.current?.input) {
        gameRef.current.input.setKey(actionOrKey, false);
      }
    },
    onPointerCancel: () => {
      setPressedButtons(prev => ({ ...prev, [actionOrKey]: false }));
      if (gameRef.current?.input) {
        gameRef.current.input.setKey(actionOrKey, false);
      }
    },
    onPointerLeave: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        setPressedButtons(prev => ({ ...prev, [actionOrKey]: false }));
        if (gameRef.current?.input) {
          gameRef.current.input.setKey(actionOrKey, false);
        }
      }
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  // Rebind key listener when armory rebinding is active
  useEffect(() => {
    if (!rebindAction) return;

    const handleRebindKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const key = e.key.toLowerCase();
      if (key === 'escape') {
        setRebindAction(null);
        return;
      }
      saveKeyBindings({
        ...keyBindingsRef.current,
        [rebindAction]: key,
      });
      setRebindAction(null);
    };

    window.addEventListener('keydown', handleRebindKey, { capture: true });
    return () => window.removeEventListener('keydown', handleRebindKey, { capture: true });
  }, [rebindAction]);

  useEffect(() => {
    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let GAME_WIDTH = window.innerWidth;
    let GAME_HEIGHT = window.innerHeight;

    const sfx = {
      initialized: false,
      lastShootTime: 0,
      lastBoomTime: 0,
      lastPowerupTime: 0,
      lastSpecialTime: 0,
      lastFlameTime: 0,
      shootSynth: null as any,
      boomSynth: null as any,
      powerupSynth: null as any,
      specialSynth: null as any,
      shieldSynth: null as any,
      init() {
        if (this.initialized || typeof Tone === 'undefined') return;
        try {
          this.shootSynth = new Tone.Synth({
            oscillator: { type: 'square' },
            envelope: { attack: 0.01, decay: 0.1, sustain: 0.0, release: 0.1 }
          }).toDestination();
          this.shootSynth.volume.value = -15;

          this.boomSynth = new Tone.NoiseSynth({
            noise: { type: 'white' },
            envelope: { attack: 0.01, decay: 0.3, sustain: 0, release: 0.2 }
          }).toDestination();
          this.boomSynth.volume.value = -12;

          this.powerupSynth = new Tone.PolySynth(Tone.Synth, {
            envelope: { attack: 0.05, decay: 0.1, sustain: 0.2, release: 1 }
          }).toDestination();
          this.powerupSynth.volume.value = -15;
          
          this.specialSynth = new Tone.FMSynth({
            modulationIndex: 10,
            envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.5 }
          }).toDestination();
          this.specialSynth.volume.value = -10;

          this.shieldSynth = new Tone.Synth({
            oscillator: { type: 'sine' },
            envelope: { attack: 0.05, decay: 0.3, sustain: 0.3, release: 0.8 }
          }).toDestination();
          this.shieldSynth.volume.value = -12;
          
          this.initialized = true;
        } catch (e) {
          console.error("Audio init error", e);
        }
      },
      playShoot() {
        if (!this.initialized || !this.shootSynth) return;
        const now = Tone.now();
        if (now - this.lastShootTime < 0.05) return;
        this.lastShootTime = now;
        try {
          this.shootSynth.triggerAttackRelease("C5", "32n", now);
          this.shootSynth.detune.setValueAtTime(0, now);
          this.shootSynth.detune.rampTo(-1200, 0.1);
        } catch(e) {}
      },
      playFlame() {
        if (!this.initialized || !this.boomSynth) return;
        const now = Tone.now();
        if (now - this.lastFlameTime < 0.09) return;
        this.lastFlameTime = now;
        try {
          this.boomSynth.triggerAttackRelease("16n", now);
        } catch(e) {}
      },
      playBoom() {
        if (!this.initialized || !this.boomSynth) return;
        const now = Tone.now();
        if (now - this.lastBoomTime < 0.05) return;
        this.lastBoomTime = now;
        try {
          this.boomSynth.triggerAttackRelease("8n", now);
        } catch(e) {}
      },
      playPowerup() {
        if (!this.initialized || !this.powerupSynth) return;
        const now = Tone.now();
        if (now - this.lastPowerupTime < 0.05) return;
        this.lastPowerupTime = now;
        try {
          this.powerupSynth.triggerAttackRelease(["C5", "E5", "G5"], "16n", now);
        } catch(e) {}
      },
      playSpecial() {
        if (!this.initialized || !this.specialSynth) return;
        const now = Tone.now();
        if (now - this.lastSpecialTime < 0.1) return;
        this.lastSpecialTime = now;
        try {
          this.specialSynth.triggerAttackRelease("C3", "8n", now);
        } catch(e) {}
      },
      playShield() {
        if (!this.initialized || !this.powerupSynth) return;
        try {
          this.powerupSynth.triggerAttackRelease(["E5", "G#5", "B5", "E6"], "16n");
        } catch(e) {}
      },
      playShieldHit() {
        if (!this.initialized || !this.shieldSynth) return;
        try {
          this.shieldSynth.triggerAttackRelease("A4", "32n");
        } catch(e) {}
      },
      playShieldBreak() {
        if (!this.initialized || !this.boomSynth) return;
        try {
          this.boomSynth.triggerAttackRelease("4n");
        } catch(e) {}
      },
      playAlienHack() {
        if (!this.initialized || !this.powerupSynth) return;
        try {
          this.powerupSynth.triggerAttackRelease(["D#5", "F#5", "A#5", "D#6"], "8n");
        } catch(e) {}
      }
    };

    sfxRef.current = sfx;

    let animationId: number;
    let lastTime = 0;

    class InputHandler {
      keys: { [key: string]: boolean } = {};
      moveVector: { x: number; y: number } = { x: 0, y: 0 };
      keydownHandler: (e: KeyboardEvent) => void;
      keyupHandler: (e: KeyboardEvent) => void;

      constructor() {
        this.keydownHandler = e => { 
          const k = e.key.toLowerCase();
          this.keys[k] = true;
          if (k === ' ') this.keys['space'] = true;
        };
        this.keyupHandler = e => { 
          const k = e.key.toLowerCase();
          this.keys[k] = false;
          if (k === ' ') this.keys['space'] = false;
        };

        window.addEventListener('keydown', this.keydownHandler);
        window.addEventListener('keyup', this.keyupHandler);
      }

      setKey(key: string, pressed: boolean) {
        const k = key.toLowerCase();
        this.keys[k] = pressed;
        if (k === 'z' || k === 'space' || k === ' ') {
          this.keys['z'] = pressed;
          this.keys[' '] = pressed;
          this.keys['space'] = pressed;
        }
      }

      setMoveVector(x: number, y: number) {
        this.moveVector = { x, y };
      }

      isPressed(key: string) { return !!this.keys[key.toLowerCase()]; }
      isAnyMovement() {
        return this.isPressed('w') || this.isPressed('a') || 
               this.isPressed('s') || this.isPressed('d') || 
               this.isPressed('arrowup') || this.isPressed('arrowdown') || 
               this.isPressed('arrowleft') || this.isPressed('arrowright') ||
               Math.abs(this.moveVector.x) > 0.05 || Math.abs(this.moveVector.y) > 0.05;
      }

      destroy() {
        window.removeEventListener('keydown', this.keydownHandler);
        window.removeEventListener('keyup', this.keyupHandler);
      }
    }

    class Starfield {
      stars: { x: number; y: number; size: number; speed: number; color: string }[];
      constructor() {
        this.stars = Array.from({ length: 120 }, () => ({
          x: Math.random() * GAME_WIDTH,
          y: Math.random() * GAME_HEIGHT,
          size: Math.random() * 2.5,
          speed: Math.random() * 2 + 0.5,
          color: `rgba(255, 255, 255, ${Math.random() * 0.8 + 0.2})`
        }));
      }
      update(dt: number) {
        this.stars.forEach(star => {
          star.y += star.speed * (dt / 16);
          if (star.y > GAME_HEIGHT) {
            star.y = 0;
            star.x = Math.random() * GAME_WIDTH;
          }
        });
      }
      draw(ctx: CanvasRenderingContext2D) {
        this.stars.forEach(star => {
          ctx.fillStyle = star.color;
          ctx.fillRect(star.x, star.y, star.size, star.size);
        });
      }
    }

    class FireBall {
      x: number;
      y: number;
      speed: number;
      radius: number;
      maxRadius: number;
      type: string;
      width: number;
      height: number;
      markedForDeletion: boolean;
      particles: { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string }[];

      constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
        this.speed = -10.5;
        this.radius = 24;
        this.maxRadius = 75; // Approx 150px diameter (4cm on screen)
        this.width = this.radius * 2;
        this.height = this.radius * 2;
        this.type = 'fireball';
        this.markedForDeletion = false;
        this.particles = [];
      }

      update(dt: number, game: Game) {
        this.y += this.speed * (dt / 16);
        if (this.radius < this.maxRadius) {
          this.radius += 2.8 * (dt / 16);
          this.width = this.radius * 2;
          this.height = this.radius * 2;
        }

        // Spawn burning flame particle aura
        for (let i = 0; i < 2; i++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = Math.random() * (this.radius * 0.7);
          this.particles.push({
            x: this.x + Math.cos(angle) * dist,
            y: this.y + Math.sin(angle) * dist,
            vx: (Math.random() - 0.5) * 3,
            vy: Math.random() * 3 + 1,
            life: 0,
            maxLife: 12 + Math.random() * 12,
            color: Math.random() > 0.4 ? '#f59e0b' : '#ef4444'
          });
        }

        this.particles.forEach(p => {
          p.x += p.vx * (dt / 16);
          p.y += p.vy * (dt / 16);
          p.life += (dt / 16);
        });
        this.particles = this.particles.filter(p => p.life < p.maxLife);

        if (this.y < -this.radius * 2) {
          this.markedForDeletion = true;
        }

        // Incinerate enemy projectiles
        game.projectiles.forEach(p => {
          if (p.type === 'enemy' || p.type === 'hacked_projectile') {
            const dx = p.x - this.x;
            const dy = p.y - this.y;
            if (Math.sqrt(dx * dx + dy * dy) < this.radius + p.width) {
              p.markedForDeletion = true;
            }
          }
        });

        // Incinerate enemies in radius
        game.enemies.forEach(enemy => {
          if (!enemy.markedForDeletion) {
            const dx = (enemy.x + enemy.width / 2) - this.x;
            const dy = (enemy.y + enemy.height / 2) - this.y;
            if (Math.sqrt(dx * dx + dy * dy) < this.radius + Math.max(enemy.width, enemy.height) / 2) {
              enemy.hp -= 2;
              if (enemy.hp <= 0) {
                enemy.hit();
              }
            }
          }
        });

        // Scorch asteroids
        game.asteroids.forEach(asteroid => {
          const dx = asteroid.x - this.x;
          const dy = asteroid.y - this.y;
          if (Math.sqrt(dx * dx + dy * dy) < this.radius + asteroid.radius) {
            asteroid.radius -= 0.4 * (dt / 16);
            if (asteroid.radius < 18) {
              asteroid.markedForDeletion = true;
              game.explosions.push(new Explosion(asteroid.x, asteroid.y, 'large'));
              sfx.playBoom();
              game.addScore(100);
            }
          }
        });
      }

      draw(ctx: CanvasRenderingContext2D) {
        ctx.save();
        
        // Draw flame aura particles
        this.particles.forEach(p => {
          const alpha = 1 - (p.life / p.maxLife);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = alpha * 0.8;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(2, 6 * alpha), 0, Math.PI * 2);
          ctx.fill();
        });

        // Draw expanding core plasma
        ctx.globalAlpha = 0.92;
        const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.2, '#fef08a');
        grad.addColorStop(0.5, '#f59e0b');
        grad.addColorStop(0.85, '#ef4444');
        grad.addColorStop(1, 'rgba(185, 28, 28, 0)');
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(251, 146, 60, 0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.85, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
      }
    }

    class HackedProjectile {
      x: number;
      y: number;
      vx: number;
      vy: number;
      type: string;
      width: number;
      height: number;
      markedForDeletion: boolean;

      constructor(x: number, y: number, vx: number, vy: number) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.type = 'hacked_projectile';
        this.width = 6;
        this.height = 6;
        this.markedForDeletion = false;
      }

      update(dt: number) {
        this.x += this.vx * (dt / 16);
        this.y += this.vy * (dt / 16);
        if (this.x < -30 || this.x > GAME_WIDTH + 30 || this.y < -30 || this.y > GAME_HEIGHT + 30) {
          this.markedForDeletion = true;
        }
      }

      draw(ctx: CanvasRenderingContext2D) {
        ctx.save();
        ctx.fillStyle = '#c084fc';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#a855f7';
        ctx.beginPath();
        ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    class ShieldSpark {
      x: number;
      y: number;
      radius: number;
      alpha: number;
      markedForDeletion: boolean;

      constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
        this.radius = 6;
        this.alpha = 1;
        this.markedForDeletion = false;
      }

      update(dt: number) {
        this.radius += 2.5 * (dt / 16);
        this.alpha -= 0.08 * (dt / 16);
        if (this.alpha <= 0) this.markedForDeletion = true;
      }

      draw(ctx: CanvasRenderingContext2D) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    class Player {
      game: Game;
      width: number;
      height: number;
      x: number;
      y: number;
      speed: number;
      lives: number;
      maxEnergy: number;
      specialCharges: number;
      shootTimer: number;
      shootInterval: number;
      specialTimer: number;
      invulnerableTimer: number;

      // Shield System
      shieldActive: boolean;
      shieldHp: number;
      shieldMaxHp: number;
      shieldAngle: number;

      // Flamethrower Powerup System
      flameTimer: number;
      flameInterval: number;
      flameShootTimer: number;

      constructor(game: Game) {
        this.game = game;
        this.width = 50;
        this.height = 60;
        this.x = GAME_WIDTH / 2 - this.width / 2;
        this.y = GAME_HEIGHT - this.height - (GAME_HEIGHT > GAME_WIDTH ? 200 : 80); 
        this.speed = 6;
        this.lives = 3;
        this.maxEnergy = 5;
        this.specialCharges = 3;
        this.shootTimer = 0;
        this.shootInterval = 120;
        this.specialTimer = 0; 
        this.invulnerableTimer = 0;

        this.shieldActive = false;
        this.shieldHp = 4;
        this.shieldMaxHp = 4;
        this.shieldAngle = 0;

        this.flameTimer = 0;
        this.flameInterval = 180;
        this.flameShootTimer = 0;
      }

      activateShield() {
        if (this.shieldActive) return;
        if (this.game.shieldsCount > 0) {
          this.game.consumeShield();
          this.shieldActive = true;
          this.shieldHp = this.shieldMaxHp;
          sfx.playShield();
          setShieldActiveStatus(true);
          setShieldHpStatus(this.shieldMaxHp);
        }
      }

      update(dt: number) {
        let vx = 0, vy = 0;
        if (this.game.input.isPressed('arrowleft') || this.game.input.isPressed('a')) vx = -this.speed;
        if (this.game.input.isPressed('arrowright') || this.game.input.isPressed('d')) vx = this.speed;
        if (this.game.input.isPressed('arrowup') || this.game.input.isPressed('w')) vy = -this.speed;
        if (this.game.input.isPressed('arrowdown') || this.game.input.isPressed('s')) vy = this.speed;
        
        if (Math.abs(this.game.input.moveVector.x) > 0.05 || Math.abs(this.game.input.moveVector.y) > 0.05) {
          vx = this.game.input.moveVector.x * this.speed;
          vy = this.game.input.moveVector.y * this.speed;
        } else if (vx !== 0 && vy !== 0) {
          const norm = Math.sqrt(vx*vx + vy*vy);
          vx = (vx / norm) * this.speed;
          vy = (vy / norm) * this.speed;
        }
        
        this.x += vx * (dt/16);
        this.y += vy * (dt/16);

        this.x = Math.max(0, Math.min(GAME_WIDTH - this.width, this.x));
        this.y = Math.max(0, Math.min(GAME_HEIGHT - this.height, this.y));

        // Keybindings resolution
        const bindings = keyBindingsRef.current;
        const isShootPressed = this.game.input.isPressed(bindings.shoot) || this.game.input.isPressed(' ') || this.game.input.isPressed('shoot');
        const isSpecialPressed = this.game.input.isPressed(bindings.special) || this.game.input.isPressed('special');
        const isShieldPressed = this.game.input.isPressed(bindings.shield) || this.game.input.isPressed('shield') || this.game.input.isPressed('c');

        // Trigger Shield
        if (isShieldPressed) {
          this.activateShield();
        }

        // Rotate kinetic shield
        if (this.shieldActive) {
          this.shieldAngle += 0.045 * (dt / 16);
        }

        // Flamethrower Timer update
        if (this.flameTimer > 0) {
          this.flameTimer -= dt;
          setActiveFlameSecs(Math.max(0, Math.ceil(this.flameTimer / 1000)));
        } else {
          setActiveFlameSecs(0);
        }

        // Shooting logic
        if (this.shootTimer > 0) this.shootTimer -= dt;
        if (this.flameShootTimer > 0) this.flameShootTimer -= dt;

        if (isShootPressed) {
          if (this.flameTimer > 0 && this.flameShootTimer <= 0) {
            this.shootFlame();
            this.flameShootTimer = this.flameInterval;
          }
          if (this.shootTimer <= 0) {
            this.shoot();
            this.shootTimer = this.shootInterval;
          }
        }

        // Special Missile
        if (this.specialTimer > 0) this.specialTimer -= dt;
        if (isSpecialPressed && this.specialTimer <= 0 && this.specialCharges > 0) {
          this.fireSpecial();
          this.specialTimer = 500;
          this.specialCharges--;
          this.game.updateEnergyHUD();
        }

        if (this.invulnerableTimer > 0) this.invulnerableTimer -= dt;
      }

      shoot() {
        this.game.projectiles.push(new Projectile(this.x + this.width / 2, this.y, -12, 'player'));
        sfx.playShoot();
      }

      shootFlame() {
        this.game.projectiles.push(new FireBall(this.x + this.width / 2, this.y - 10));
        sfx.playFlame();
      }
      
      fireSpecial() {
        sfx.playSpecial();
        const spreadAngle = 25 * (Math.PI / 180);
        const speed = -10;
        
        this.game.projectiles.push(new SpecialMissile(this.x + this.width / 2, this.y, speed, 0));
        this.game.projectiles.push(new SpecialMissile(this.x + this.width / 2, this.y, speed, -spreadAngle));
        this.game.projectiles.push(new SpecialMissile(this.x + this.width / 2, this.y, speed, spreadAngle));
      }

      hit() {
        if (this.invulnerableTimer > 0) return;
        this.lives--;
        this.game.updateLivesHUD();
        this.game.explosions.push(new Explosion(this.x + this.width/2, this.y + this.height/2, 'medium'));
        sfx.playBoom();
        
        if (this.lives <= 0) {
          this.game.gameOver();
        } else {
          this.invulnerableTimer = 2000;
        }
      }

      draw(ctx: CanvasRenderingContext2D) {
        if (this.invulnerableTimer > 0 && Math.floor(Date.now() / 100) % 2 === 0) return;

        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Thruster flame
        ctx.fillStyle = this.flameTimer > 0 ? '#ef4444' : '#60a5fa';
        if (this.game.input.isAnyMovement() || this.flameTimer > 0) {
          ctx.fillStyle = this.flameTimer > 0 ? '#f97316' : '#f59e0b';
          ctx.beginPath();
          ctx.moveTo(this.width/2 - 12, this.height);
          ctx.lineTo(this.width/2 + 12, this.height);
          ctx.lineTo(this.width/2, this.height + (this.flameTimer > 0 ? 26 : 15) + Math.random() * 15);
          ctx.fill();
        }

        // Ship hull
        ctx.fillStyle = '#e2e8f0'; 
        ctx.beginPath();
        ctx.moveTo(this.width/2, 0); 
        ctx.lineTo(this.width, this.height/2 + 10); 
        ctx.lineTo(this.width - 10, this.height); 
        ctx.lineTo(10, this.height); 
        ctx.lineTo(0, this.height/2 + 10); 
        ctx.closePath();
        ctx.fill();

        // Canopy
        ctx.fillStyle = this.flameTimer > 0 ? '#f59e0b' : '#38bdf8';
        ctx.beginPath();
        ctx.ellipse(this.width/2, this.height/2 - 5, 8, 15, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Wings/Cannons
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(5, this.height/2 + 5, 5, 15);
        ctx.fillRect(this.width - 10, this.height/2 + 5, 5, 15);

        // Flamethrower Cannons Glow
        if (this.flameTimer > 0) {
          ctx.fillStyle = '#ef4444';
          ctx.shadowBlur = 12;
          ctx.shadowColor = '#f97316';
          ctx.beginPath();
          ctx.arc(this.width/2, 2, 6, 0, Math.PI * 2);
          ctx.fill();
        }

        // Orbiting Kinetic Energy Shield Drawing
        if (this.shieldActive) {
          const centerX = this.width / 2;
          const centerY = this.height / 2;
          const shieldRadius = 46;
          const shieldPulse = Math.sin(Date.now() * 0.006) * 3;
          const curRadius = shieldRadius + shieldPulse;

          // Glowing barrier aura
          const glow = ctx.createRadialGradient(centerX, centerY, curRadius * 0.6, centerX, centerY, curRadius + 10);
          glow.addColorStop(0, 'rgba(56, 189, 248, 0.04)');
          glow.addColorStop(0.8, 'rgba(56, 189, 248, 0.28)');
          glow.addColorStop(1, 'rgba(14, 165, 233, 0)');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(centerX, centerY, curRadius + 10, 0, Math.PI * 2);
          ctx.fill();

          // Shield perimeter line
          ctx.strokeStyle = `rgba(56, 189, 248, ${0.45 + (this.shieldHp / this.shieldMaxHp) * 0.5})`;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(centerX, centerY, curRadius, 0, Math.PI * 2);
          ctx.stroke();

          // 3 Orbiting kinetic satellite nodes
          const nodeCount = 3;
          for (let i = 0; i < nodeCount; i++) {
            const nodeAngle = this.shieldAngle + (i * (Math.PI * 2 / nodeCount));
            const nodeX = centerX + Math.cos(nodeAngle) * curRadius;
            const nodeY = centerY + Math.sin(nodeAngle) * curRadius;
            
            ctx.fillStyle = '#38bdf8';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#0284c7';
            ctx.beginPath();
            ctx.arc(nodeX, nodeY, 4, 0, Math.PI * 2);
            ctx.fill();
          }

          // Shield HP Arc Segments
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 3.5;
          const segGap = 0.16;
          for (let i = 0; i < this.shieldMaxHp; i++) {
            if (i < this.shieldHp) {
              const startA = (i * (Math.PI * 2 / this.shieldMaxHp)) - Math.PI / 2 + segGap / 2;
              const endA = ((i + 1) * (Math.PI * 2 / this.shieldMaxHp)) - Math.PI / 2 - segGap / 2;
              ctx.beginPath();
              ctx.arc(centerX, centerY, curRadius + 6, startA, endA);
              ctx.stroke();
            }
          }
        }

        ctx.restore();
      }
    }

    class Ally {
      game: Game;
      x: number;
      y: number;
      width: number;
      height: number;
      targetOffsetX: number;
      targetOffsetY: number;
      shootTimer: number;
      markedForDeletion: boolean;

      constructor(game: Game, x: number, y: number) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.width = 20;
        this.height = 25;
        this.targetOffsetX = 0;
        this.targetOffsetY = 0; 
        this.shootTimer = Math.random() * 500;
        this.markedForDeletion = false;
      }
      update(dt: number) {
        let targetX = this.game.player.x + (this.game.player.width / 2) - (this.width / 2) + this.targetOffsetX;
        let targetY = this.game.player.y + (this.game.player.height / 2) - (this.height / 2) + this.targetOffsetY;
        
        this.x += (targetX - this.x) * 0.08 * (dt/16);
        this.y += (targetY - this.y) * 0.08 * (dt/16);

        this.shootTimer -= dt;
        if (this.shootTimer <= 0) {
          this.game.projectiles.push(new Projectile(this.x + this.width/2, this.y, -10, 'ally'));
          this.shootTimer = 800 + Math.random() * 400;
        }
      }
      hit() {
        if (this.markedForDeletion) return;
        this.markedForDeletion = true;
        this.game.explosions.push(new Explosion(this.x + this.width/2, this.y + this.height/2, 'small'));
        sfx.playBoom();
      }
      draw(ctx: CanvasRenderingContext2D) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.moveTo(this.width/2, 0); 
        ctx.lineTo(this.width, this.height/2 + 5); 
        ctx.lineTo(this.width - 5, this.height); 
        ctx.lineTo(5, this.height); 
        ctx.lineTo(0, this.height/2 + 5); 
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    class SpecialMissile {
      x: number;
      y: number;
      vx: number;
      vy: number;
      type: string;
      width: number;
      height: number;
      markedForDeletion: boolean;
      rotation: number;

      constructor(x: number, y: number, speed: number, angleOffset: number) {
        this.x = x;
        this.y = y;
        this.vx = Math.sin(angleOffset) * Math.abs(speed);
        this.vy = -Math.cos(angleOffset) * Math.abs(speed);
        this.type = 'special_missile';
        this.width = 10;
        this.height = 24;
        this.markedForDeletion = false;
        this.rotation = angleOffset;
      }
      update(dt: number) {
        this.x += this.vx * (dt/16);
        this.y += this.vy * (dt/16);
        if (this.y < -this.height || this.y > GAME_HEIGHT || this.x < -this.width || this.x > GAME_WIDTH) {
          this.markedForDeletion = true;
        }
      }
      explode(game: Game) {
        this.markedForDeletion = true;
        game.explosions.push(new AreaExplosion(this.x, this.y, Math.min(GAME_WIDTH, GAME_HEIGHT) * 0.25));
      }
      draw(ctx: CanvasRenderingContext2D) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.fillStyle = '#34d399';
        ctx.beginPath();
        ctx.moveTo(0, -this.height/2);
        ctx.lineTo(this.width/2, this.height/2);
        ctx.lineTo(-this.width/2, this.height/2);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#10b981';
        ctx.fillRect(-this.width/4, this.height/2, this.width/2, 5);
        ctx.restore();
      }
    }

    class Enemy {
      game: Game;
      width: number;
      height: number;
      x: number;
      y: number;
      speed: number;
      markedForDeletion: boolean;
      hp: number;
      scoreValue: number;
      amplitude: number;
      frequency: number;
      startX: number;

      // Alien Mind-Hack state
      isHacked: boolean;
      hackedAngle: number;
      hackedTurnTimer: number;
      hackedShootTimer: number;
      shootTimer: number;

      constructor(game: Game) {
        this.game = game;
        this.width = 40;
        this.height = 40;
        this.x = Math.random() * (GAME_WIDTH - this.width);
        this.y = -this.height;
        this.speed = (Math.random() * 1.5 + 1.5) * (GAME_HEIGHT / 800);
        this.markedForDeletion = false;
        this.hp = 2;
        this.scoreValue = 10;
        this.amplitude = Math.random() * 40 + 10;
        this.frequency = Math.random() * 0.05 + 0.01;
        this.startX = this.x;

        this.isHacked = false;
        this.hackedAngle = (Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2);
        this.hackedTurnTimer = 0;
        this.hackedShootTimer = Math.random() * 300;
        // Guaranteed initial shot delay between 300ms and 750ms after appearing
        this.shootTimer = 300 + Math.random() * 450;
      }

      update(dt: number) {
        if (this.game.alienHackTimer > 0) {
          if (!this.isHacked) {
            this.isHacked = true;
            this.hackedAngle = Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2;
          }

          this.hackedTurnTimer += dt;
          if (this.hackedTurnTimer > 700) {
            this.hackedTurnTimer = 0;
            // Target nearest enemy ship for friendly fire
            let closestOther: Enemy | null = null;
            let closestDist = 99999;
            this.game.enemies.forEach(other => {
              if (other !== this && !other.markedForDeletion) {
                const d = Math.hypot(other.x - this.x, other.y - this.y);
                if (d < closestDist) {
                  closestDist = d;
                  closestOther = other;
                }
              }
            });

            if (closestOther) {
              this.hackedAngle = Math.atan2((closestOther as Enemy).y - this.y, (closestOther as Enemy).x - this.x);
            } else {
              this.hackedAngle = (Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2);
            }
          }

          this.x += Math.cos(this.hackedAngle) * this.speed * 1.8 * (dt / 16);
          this.y += Math.sin(this.hackedAngle) * this.speed * 1.2 * (dt / 16);
          this.x = Math.max(10, Math.min(GAME_WIDTH - this.width - 10, this.x));
          this.y = Math.max(10, Math.min(GAME_HEIGHT - this.height - 120, this.y));

          this.hackedShootTimer -= dt;
          if (this.hackedShootTimer <= 0) {
            this.hackedShootTimer = 350 + Math.random() * 250;
            const projSpeed = 9;
            const pvx = Math.cos(this.hackedAngle) * projSpeed;
            const pvy = Math.sin(this.hackedAngle) * projSpeed;
            this.game.projectiles.push(new HackedProjectile(this.x + this.width/2, this.y + this.height/2, pvx, pvy));
          }
        } else {
          this.isHacked = false;
          this.y += this.speed * (dt/16);
          this.x = this.startX + Math.sin(this.y * this.frequency) * this.amplitude;
          this.x = Math.max(0, Math.min(GAME_WIDTH - this.width, this.x));

          if (this.y > GAME_HEIGHT) this.markedForDeletion = true;
          
          // Guaranteed active shooting for every enemy ship while on screen
          if (this.y > 0 && this.y < GAME_HEIGHT - 40) {
            this.shootTimer -= dt;
            if (this.shootTimer <= 0) {
              this.shootTimer = 1100 + Math.random() * 900;
              this.game.projectiles.push(new Projectile(this.x + this.width/2, this.y + this.height, 6 * (GAME_HEIGHT/800), 'enemy'));
            }
          }
        }
      }

      hit() {
        this.hp--;
        if(this.hp <= 0) {
          this.markedForDeletion = true;
          this.game.explosions.push(new Explosion(this.x + this.width/2, this.y + this.height/2, 'small'));
          sfx.playBoom();
          this.game.addScore(this.scoreValue);
          
          let rand = Math.random();
          if(rand < 0.05) this.game.drops.push(new Drop(this.x, this.y, 'heart'));
          else if(rand < 0.20) this.game.drops.push(new Drop(this.x, this.y, 'coin'));
          else if(rand < 0.32) this.game.drops.push(new Drop(this.x, this.y, 'energy'));
          else if(rand < 0.42) {
            const multi = Math.floor(Math.random() * 3) + 2; 
            this.game.drops.push(new Drop(this.x, this.y, 'multiplier', multi));
          }
          else if(rand < 0.45 && purchasedFlame) this.game.drops.push(new Drop(this.x, this.y, 'flame'));
          else if(rand < 0.48 && purchasedAlien) this.game.drops.push(new Drop(this.x, this.y, 'alien'));
        }
      }

      draw(ctx: CanvasRenderingContext2D) {
        ctx.save();
        ctx.translate(this.x, this.y);

        if (this.isHacked) {
          // Mind-control holographic aura
          ctx.strokeStyle = '#c084fc';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(this.width/2, this.height/2, this.width * 0.7, 0, Math.PI * 2);
          ctx.stroke();

          ctx.font = '16px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('👽', this.width/2, -6);
        }

        ctx.fillStyle = this.isHacked ? '#7e22ce' : '#4b5563';
        ctx.beginPath();
        ctx.moveTo(this.width/2, this.height); 
        ctx.lineTo(this.width, 10);
        ctx.lineTo(this.width - 10, 0);
        ctx.lineTo(10, 0);
        ctx.lineTo(0, 10);
        ctx.closePath();
        ctx.fill();
        
        ctx.fillStyle = this.isHacked ? '#a855f7' : '#ef4444';
        ctx.beginPath();
        ctx.arc(this.width/2, this.height/2 + 5, 5, 0, Math.PI*2);
        ctx.fill();
        ctx.shadowBlur = 10;
        ctx.shadowColor = ctx.fillStyle;
        ctx.restore();
      }
    }

    class Projectile {
      x: number;
      y: number;
      speed: number;
      type: string;
      width: number;
      height: number;
      markedForDeletion: boolean;

      constructor(x: number, y: number, speed: number, type: string) {
        this.x = x;
        this.y = y;
        this.speed = speed;
        this.type = type; 
        this.width = 4;
        this.height = 18;
        this.markedForDeletion = false;
      }
      update(dt: number) {
        this.y += this.speed * (dt/16);
        if (this.y < -this.height || this.y > GAME_HEIGHT) this.markedForDeletion = true;
      }
      draw(ctx: CanvasRenderingContext2D) {
        ctx.save();
        if (this.type === 'player') ctx.fillStyle = '#60a5fa';
        else if (this.type === 'ally') ctx.fillStyle = '#34d399';
        else ctx.fillStyle = '#ef4444';
        
        ctx.shadowBlur = 8;
        ctx.shadowColor = ctx.fillStyle;
        ctx.fillRect(this.x - this.width/2, this.y, this.width, this.height);
        ctx.restore();
      }
    }
    
    class AreaExplosion {
      x: number;
      y: number;
      radius: number;
      maxRadius: number;
      markedForDeletion: boolean;
      alpha: number;
      damageDealt: boolean;

      constructor(x: number, y: number, maxRadius: number) {
        this.x = x;
        this.y = y;
        this.radius = 1;
        this.maxRadius = maxRadius;
        this.markedForDeletion = false;
        this.alpha = 1;
        this.damageDealt = false;
      }
      update(dt: number, game: Game) {
        this.radius += 18 * (dt/16);
        this.alpha -= 0.03 * (dt/16);
        
        if (!this.damageDealt && this.radius > this.maxRadius * 0.4) {
          this.dealAreaDamage(game);
          this.damageDealt = true;
        }
        if (this.alpha <= 0 || this.radius >= this.maxRadius) this.markedForDeletion = true;
      }
      dealAreaDamage(game: Game) {
        game.enemies.forEach(enemy => {
          if (enemy.markedForDeletion) return;
          const dx = this.x - (enemy.x + enemy.width/2);
          const dy = this.y - (enemy.y + enemy.height/2);
          if (Math.sqrt(dx*dx + dy*dy) <= this.maxRadius) {
            enemy.hp = 0; 
            enemy.hit(); 
          }
        });
        game.projectiles.forEach(proj => {
          if (proj.type === 'enemy' || proj.type === 'hacked_projectile') {
            const pDistance = Math.sqrt(Math.pow(this.x - proj.x, 2) + Math.pow(this.y - proj.y, 2));
            if (pDistance <= this.maxRadius) proj.markedForDeletion = true;
          }
        });
      }
      draw(ctx: CanvasRenderingContext2D) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(16, 185, 129, ${this.alpha})`;
        ctx.lineWidth = 4;
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.8, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius * 0.8);
        grad.addColorStop(0, `rgba(255, 255, 255, ${this.alpha})`);
        grad.addColorStop(0.5, `rgba(52, 211, 153, ${this.alpha * 0.5})`);
        grad.addColorStop(1, 'rgba(16, 185, 129, 0)');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
      }
    }

    class Explosion {
      x: number;
      y: number;
      radius: number;
      maxRadius: number;
      markedForDeletion: boolean;
      alpha: number;

      constructor(x: number, y: number, size: string) {
        this.x = x;
        this.y = y;
        this.radius = 1;
        this.maxRadius = size === 'large' ? 60 : size === 'medium' ? 40 : 20;
        this.markedForDeletion = false;
        this.alpha = 1;
      }
      update(dt: number) {
        this.radius += 2.5 * (dt/16);
        this.alpha -= 0.05 * (dt/16);
        if (this.alpha <= 0 || this.radius >= this.maxRadius) this.markedForDeletion = true;
      }
      draw(ctx: CanvasRenderingContext2D) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = '#fef08a';
        ctx.fill();
        ctx.restore();
      }
    }

    class Drop {
      x: number;
      y: number;
      type: string;
      value: number;
      width: number;
      height: number;
      speed: number;
      markedForDeletion: boolean;

      constructor(x: number, y: number, type: string, value = 0) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.value = value;
        this.width = 24;
        this.height = 24;
        this.speed = 2.5;
        this.markedForDeletion = false;
      }
      update(dt: number) {
        this.y += this.speed * (dt/16);
        if (this.y > GAME_HEIGHT) this.markedForDeletion = true;
      }
      draw(ctx: CanvasRenderingContext2D) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (this.type === 'coin') {
          ctx.font = '22px Arial';
          ctx.fillText('🪙', this.x, this.y);
        } else if (this.type === 'heart') {
          ctx.font = '22px Arial';
          ctx.fillText('❤️', this.x, this.y);
        } else if (this.type === 'energy') {
          ctx.font = '22px Arial';
          ctx.fillText('⚡', this.x, this.y);
        } else if (this.type === 'flame') {
          ctx.font = '22px Arial';
          ctx.fillText('🔥', this.x, this.y);
        } else if (this.type === 'alien') {
          ctx.font = '22px Arial';
          ctx.fillText('👽', this.x, this.y);
        } else if (this.type === 'shield') {
          ctx.font = '22px Arial';
          ctx.fillText('🛡️', this.x, this.y);
        } else if (this.type === 'multiplier') {
          ctx.font = 'bold 18px Orbitron, sans-serif';
          ctx.fillStyle = '#c084fc';
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#a855f7';
          ctx.fillText('x' + this.value, this.x, this.y);
        }
        ctx.restore();
      }
    }

    class Asteroid {
      game: Game;
      radius: number;
      isTopLeft: boolean;
      x: number;
      y: number;
      speed: number;
      vx: number;
      vy: number;
      markedForDeletion: boolean;
      rotation: number;
      rotSpeed: number;
      vertices: { x: number; y: number }[];

      constructor(game: Game) {
        this.game = game;
        this.radius = Math.random() * 30 + 45;
        this.isTopLeft = Math.random() > 0.5;
        this.x = this.isTopLeft ? -this.radius * 2 : GAME_WIDTH + this.radius * 2;
        this.y = -this.radius * 2;
        let speedMultiplier = 1 + (this.game.gameTime / 25000); 
        this.speed = (Math.random() * 1.5 + 2.0) * (GAME_HEIGHT / 800) * speedMultiplier;
        let angle = this.isTopLeft ? Math.PI / 4 : 3 * Math.PI / 4; 
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
        this.markedForDeletion = false;
        this.rotation = 0;
        this.rotSpeed = (Math.random() - 0.5) * 0.05;
        this.vertices = [];
        let points = 8 + Math.floor(Math.random() * 5);
        for (let i = 0; i < points; i++) {
          let a = (i / points) * Math.PI * 2;
          let r = this.radius * (0.75 + Math.random() * 0.25);
          this.vertices.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
        }
      }
      update(dt: number) {
        this.x += this.vx * (dt / 16);
        this.y += this.vy * (dt / 16);
        this.rotation += this.rotSpeed * (dt / 16);
        
        if (this.y > GAME_HEIGHT + this.radius * 2) this.markedForDeletion = true;
        
        this.game.enemies.forEach(enemy => {
          if (!enemy.markedForDeletion) {
            let dx = this.x - (enemy.x + enemy.width / 2);
            let dy = this.y - (enemy.y + enemy.height / 2);
            if (Math.sqrt(dx * dx + dy * dy) < this.radius + Math.max(enemy.width, enemy.height) / 2) {
              enemy.markedForDeletion = true;
              this.game.explosions.push(new Explosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, 'medium'));
            }
          }
        });
      }
      draw(ctx: CanvasRenderingContext2D) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        
        ctx.save();
        let travelAngle = Math.atan2(this.vy, this.vx);
        ctx.rotate(travelAngle - this.rotation); 
        
        ctx.beginPath();
        ctx.arc(0, 0, this.radius + 12, -Math.PI / 3.5, Math.PI / 3.5);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
        ctx.lineWidth = 12;
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(0, 0, this.radius + 4, -Math.PI / 5, Math.PI / 5);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.9)';
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.restore();
        
        ctx.fillStyle = '#374151';
        ctx.strokeStyle = '#111827';
        ctx.lineWidth = 4;
        
        ctx.beginPath();
        ctx.moveTo(this.vertices[0].x, this.vertices[0].y);
        for (let i = 1; i < this.vertices.length; i++) {
          ctx.lineTo(this.vertices[i].x, this.vertices[i].y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = '#1f2937';
        ctx.beginPath();
        ctx.arc(-this.radius / 3, -this.radius / 3, this.radius / 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(this.radius / 2.5, this.radius / 4, this.radius / 5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
      }
    }

    class Game {
      input: InputHandler;
      starfield: Starfield;
      player!: Player;
      enemies: Enemy[] = [];
      projectiles: (Projectile | SpecialMissile | FireBall | HackedProjectile)[] = [];
      explosions: (Explosion | AreaExplosion | ShieldSpark)[] = [];
      drops: Drop[] = [];
      allies: Ally[] = [];
      asteroids: Asteroid[] = [];
      enemyTimer = 0;
      gameTime = 0;
      baseEnemyInterval = 1200;
      asteroidTimer = 0;
      nextAsteroidSpawn = 20000 + Math.random() * 25000;

      shieldsCount = shieldsCountRef.current;
      alienHackTimer = 0;

      constructor() {
        this.input = new InputHandler();
        this.starfield = new Starfield();
        this.init();
      }

      init() {
        this.player = new Player(this);
        this.enemies = [];
        this.projectiles = [];
        this.explosions = [];
        this.drops = [];
        this.allies = [];
        this.asteroids = [];
        this.enemyTimer = 0;
        this.gameTime = 0;
        this.asteroidTimer = 0;
        this.nextAsteroidSpawn = 20000 + Math.random() * 25000;
        this.shieldsCount = shieldsCountRef.current;
        this.alienHackTimer = 0;
        setScore(0);
        setLives(3);
        setShieldActiveStatus(false);
        
        if (pendingFlameRef.current) {
          this.player.flameTimer = 8000;
          setActiveFlameSecs(8);
          pendingFlameRef.current = false;
        } else {
          setActiveFlameSecs(0);
        }

        if (pendingAlienRef.current) {
          this.alienHackTimer = 5000;
          setActiveAlienSecs(5);
          pendingAlienRef.current = false;
        } else {
          setActiveAlienSecs(0);
        }

        this.updateEnergyHUD();
      }

      consumeShield() {
        updateShields(prev => Math.max(0, prev - 1));
      }

      updateAllyFormations() {
        const spacing = 75; // Pixels per concentric ring
        const slotAngles = [
          Math.PI,                 // Slot 0: Left
          0,                       // Slot 1: Right
          -3 * Math.PI / 4,        // Slot 2: Front-Left
          -Math.PI / 4,            // Slot 3: Front-Right
          3 * Math.PI / 4,         // Slot 4: Back-Left
          Math.PI / 4,             // Slot 5: Back-Right
          -Math.PI / 2,            // Slot 6: Front-Center
          Math.PI / 2              // Slot 7: Back-Center
        ];

        this.allies.forEach((ally, index) => {
          const ring = Math.floor(index / 8) + 1;
          const posIndex = index % 8;
          const radius = ring === 1 ? spacing : spacing * 1.75;
          const angleOffset = ring === 2 ? Math.PI / 8 : 0; // Stagger second ring so fire lines never overlap
          const angle = slotAngles[posIndex] + angleOffset;

          ally.targetOffsetX = Math.cos(angle) * radius;
          ally.targetOffsetY = Math.sin(angle) * radius;
        });
      }

      update(dt: number, currentMode: string) {
        if (currentMode !== 'playing') {
          this.starfield.update(dt);
          return;
        }

        this.starfield.update(dt);
        this.player.update(dt);
        this.gameTime += dt;

        if (this.alienHackTimer > 0) {
          this.alienHackTimer -= dt;
          setActiveAlienSecs(Math.max(0, Math.ceil(this.alienHackTimer / 1000)));
        } else {
          setActiveAlienSecs(0);
        }

        let currentInterval = Math.max(500, this.baseEnemyInterval - (this.gameTime / 60000) * 400);

        if (this.enemyTimer > currentInterval) {
          let numToSpawn = 1 + Math.floor(Math.random() * (this.gameTime / 50000));
          for(let i = 0; i < Math.min(numToSpawn, 5); i++) {
            this.enemies.push(new Enemy(this));
          }
          this.enemyTimer = 0;
        } else {
          this.enemyTimer += dt;
        }

        this.projectiles.forEach(p => {
          if (p instanceof FireBall) (p as FireBall).update(dt, this);
          else p.update(dt);
        });
        this.enemies.forEach(e => e.update(dt));
        this.allies.forEach(a => a.update(dt));
        
        this.asteroidTimer += dt;
        if (this.asteroidTimer > this.nextAsteroidSpawn) {
          this.asteroids.push(new Asteroid(this));
          this.asteroidTimer = 0;
          this.nextAsteroidSpawn = 30000 + Math.random() * 30000;
        }
        this.asteroids.forEach(a => a.update(dt));
        
        this.explosions.forEach(e => {
          if (e instanceof AreaExplosion) e.update(dt, this);
          else e.update(dt);
        });
        this.drops.forEach(d => d.update(dt));

        this.checkCollisions();

        const prevAllyCount = this.allies.length;
        this.projectiles = this.projectiles.filter(p => !p.markedForDeletion);
        this.enemies = this.enemies.filter(e => !e.markedForDeletion);
        this.explosions = this.explosions.filter(e => !e.markedForDeletion);
        this.drops = this.drops.filter(d => !d.markedForDeletion);
        this.allies = this.allies.filter(a => !a.markedForDeletion);
        this.asteroids = this.asteroids.filter(a => !a.markedForDeletion);

        if (this.allies.length !== prevAllyCount) {
          this.updateAllyFormations();
        }
      }

      checkCollisions() {
        const rectIntersect = (r1x: number, r1y: number, r1w: number, r1h: number, r2x: number, r2y: number, r2w: number, r2h: number) => {
          return r1x < r2x + r2w && r1x + r1w > r2x && r1y < r2y + r2h && r1y + r1h > r2y;
        };

        this.projectiles.forEach(proj => {
          if (proj.type === 'player' || proj.type === 'special_missile' || proj.type === 'ally' || proj.type === 'hacked_projectile') {
            this.enemies.forEach(enemy => {
              if (!enemy.markedForDeletion) {
                let pLeft = proj.x - proj.width/2;
                let pTop = proj.type === 'special_missile' ? proj.y - proj.height/2 : proj.y;
                let pHeight = proj.height;
                
                if (rectIntersect(pLeft, pTop, proj.width, pHeight, enemy.x, enemy.y, enemy.width, enemy.height)) {
                  if (proj.type === 'special_missile') {
                    (proj as SpecialMissile).explode(this);
                  } else {
                    proj.markedForDeletion = true;
                    enemy.hit();
                  }
                }
              }
            });
          } else if (proj.type === 'enemy') {
            if (rectIntersect(proj.x - proj.width/2, proj.y, proj.width, proj.height, this.player.x, this.player.y, this.player.width, this.player.height)) {
              proj.markedForDeletion = true;
              if (this.player.shieldActive) {
                this.player.shieldHp--;
                sfx.playShieldHit();
                this.explosions.push(new ShieldSpark(proj.x, proj.y));
                setShieldHpStatus(this.player.shieldHp);
                if (this.player.shieldHp <= 0) {
                  this.player.shieldActive = false;
                  setShieldActiveStatus(false);
                  sfx.playShieldBreak();
                  this.explosions.push(new Explosion(this.player.x + this.player.width/2, this.player.y + this.player.height/2, 'small'));
                }
              } else {
                this.player.hit();
              }
            } else {
              for (let ally of this.allies) {
                if (!ally.markedForDeletion && rectIntersect(proj.x - proj.width/2, proj.y, proj.width, proj.height, ally.x, ally.y, ally.width, ally.height)) {
                  proj.markedForDeletion = true;
                  ally.hit();
                  break;
                }
              }
            }
          }
        });

        this.enemies.forEach(enemy => {
          if (enemy.markedForDeletion) return;

          if (rectIntersect(enemy.x+5, enemy.y+5, enemy.width-10, enemy.height-10, this.player.x+10, this.player.y+10, this.player.width-20, this.player.height-20)) {
            enemy.markedForDeletion = true;
            this.explosions.push(new Explosion(enemy.x + enemy.width/2, enemy.y + enemy.height/2, 'medium'));
            sfx.playBoom();
            if (this.player.shieldActive) {
              this.player.shieldHp -= 2;
              sfx.playShieldHit();
              setShieldHpStatus(this.player.shieldHp);
              if (this.player.shieldHp <= 0) {
                this.player.shieldActive = false;
                setShieldActiveStatus(false);
                sfx.playShieldBreak();
              }
            } else {
              this.player.hit();
            }
            return;
          }

          for (let ally of this.allies) {
            if (!ally.markedForDeletion && rectIntersect(enemy.x, enemy.y, enemy.width, enemy.height, ally.x, ally.y, ally.width, ally.height)) {
              ally.hit();
              enemy.hit();
              break;
            }
          }
        });

        this.asteroids.forEach(asteroid => {
          let dx = asteroid.x - (this.player.x + this.player.width / 2);
          let dy = asteroid.y - (this.player.y + this.player.height / 2);
          let dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < asteroid.radius + Math.min(this.player.width, this.player.height) / 2) {
            if (this.player.shieldActive) {
              // Kinetic orbit shield completely collapses on asteroid impact, keeping mother ship alive!
              this.player.shieldActive = false;
              this.player.shieldHp = 0;
              setShieldActiveStatus(false);
              this.explosions.push(new AreaExplosion(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, 100));
              sfx.playShieldBreak();
              sfx.playBoom();
              this.player.invulnerableTimer = 1600;
              return;
            }
            this.explosions.push(new Explosion(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, 'large'));
            sfx.playBoom();
            this.player.lives = 0; 
            setLives(0);
            this.gameOver();
            return;
          }

          for (let ally of this.allies) {
            if (!ally.markedForDeletion) {
              let adx = asteroid.x - (ally.x + ally.width / 2);
              let ady = asteroid.y - (ally.y + ally.height / 2);
              let adist = Math.sqrt(adx * adx + ady * ady);
              if (adist < asteroid.radius + Math.max(ally.width, ally.height) / 2) {
                ally.hit();
              }
            }
          }
        });

        this.drops.forEach(drop => {
           if (rectIntersect(drop.x - drop.width/2, drop.y - drop.height/2, drop.width, drop.height, this.player.x, this.player.y, this.player.width, this.player.height)) {
            drop.markedForDeletion = true;
            if(drop.type === 'heart') {
              this.player.lives++;
              setLives(this.player.lives);
              sfx.playPowerup();
            } else if(drop.type === 'coin') {
              updateCoins(prev => prev + 5);
              sfx.playPowerup();
            } else if (drop.type === 'energy') {
              if (this.player.specialCharges < this.player.maxEnergy * 3) {
                this.player.specialCharges = Math.min(this.player.specialCharges + 3, this.player.maxEnergy * 3);
                this.updateEnergyHUD();
                sfx.playPowerup();
              }
            } else if (drop.type === 'flame') {
              this.player.flameTimer = 8000;
              setActiveFlameSecs(8);
              sfx.playPowerup();
            } else if (drop.type === 'alien') {
              this.alienHackTimer = 5000;
              setActiveAlienSecs(5);
              sfx.playAlienHack();
            } else if (drop.type === 'multiplier') {
              sfx.playPowerup();
              const MAX_ALLIES = 15;
              const currentAllies = this.allies.length;
              const currentFleet = 1 + currentAllies; // 1 player mother ship + allies
              const targetFleet = currentFleet * drop.value;
              const targetAllies = Math.min(MAX_ALLIES, targetFleet - 1);
              const newShips = Math.max(0, targetAllies - currentAllies);

              for(let i = 0; i < newShips; i++) {
                this.allies.push(new Ally(this, this.player.x, this.player.y));
              }
              this.updateAllyFormations();

              if (currentAllies >= MAX_ALLIES) {
                // If player fleet is already maxed at 15 escort troops, grant bonus score & coins
                this.addScore(150 * drop.value);
                updateCoins(prev => prev + 2 * drop.value);
              } else {
                this.addScore(50 * drop.value);
              }
            }
           }
        });
      }

      draw(ctx: CanvasRenderingContext2D, currentMode: string) {
        ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        this.starfield.draw(ctx);

        if (currentMode === 'playing' || currentMode === 'paused') {
          this.drops.forEach(d => d.draw(ctx));
          this.projectiles.forEach(p => p.draw(ctx));
          this.enemies.forEach(e => e.draw(ctx));
          this.asteroids.forEach(a => a.draw(ctx));
          this.allies.forEach(a => a.draw(ctx));
          this.player.draw(ctx);
          this.explosions.forEach(e => e.draw(ctx));
        }
      }

      addScore(points: number) {
        setScore(prev => {
          const ns = prev + points;
          return ns;
        });
      }

      updateLivesHUD() {
        setLives(Math.max(0, this.player.lives));
      }

      updateEnergyHUD() {
        const bars = Math.ceil(this.player.specialCharges / 3);
        setEnergyBars(bars);
      }

      gameOver() {
        setGameMode('gameover');
        setScore(currentScore => {
          setHighScore(currentHigh => {
            if (currentScore > currentHigh) {
              localStorage.setItem('spaceShooterHighScore', currentScore.toString());
              return currentScore;
            }
            return currentHigh;
          });
          return currentScore;
        });
      }
    }

    const game = new Game();
    gameRef.current = game;

    function resize() {
      const container = document.getElementById('game-container');
      if (!container) return;
      GAME_WIDTH = container.clientWidth;
      GAME_HEIGHT = container.clientHeight;
      
      canvas.width = GAME_WIDTH;
      canvas.height = GAME_HEIGHT;
      
      if (game && game.player) {
        game.player.x = Math.max(0, Math.min(GAME_WIDTH - game.player.width, game.player.x));
        game.player.y = Math.min(game.player.y, GAME_HEIGHT - game.player.height - 20);
      }
    }

    window.addEventListener('resize', resize);
    resize();

    function gameLoop(timestamp: number) {
      const deltaTime = timestamp - lastTime;
      lastTime = timestamp;
      const dt = Math.min(deltaTime, 32); 

      const currentMode = modeRef.current;
      game.update(dt, currentMode);
      game.draw(ctx, currentMode);
      
      animationId = requestAnimationFrame(gameLoop);
    }

    animationId = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
      game.input.destroy();
    };
  }, []);

  const modeRef = useRef(gameMode);
  modeRef.current = gameMode;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showUpgrades) {
          handleCloseUpgrades();
        } else if (modeRef.current === 'playing') {
          setGameMode('paused');
        } else if (modeRef.current === 'paused') {
          setGameMode('playing');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showUpgrades, upgradesReturnMode]);

  const initAudio = async () => {
    if (typeof Tone !== 'undefined') {
      try {
        await Tone.start();
        if (typeof Tone.Destination !== 'undefined') {
          Tone.Destination.mute = false;
        }
      } catch (e) {
        console.error("Audio start error", e);
      }
    }
    if (sfxRef.current) {
      sfxRef.current.init();
    }
  };

  const handlePlay = async () => {
    await initAudio();
    setGameMode('playing');
    if (navMode === 'swipe' && !hasShownHintRef.current) {
      hasShownHintRef.current = true;
      triggerSwipeTutorial();
    }
    if (gameRef.current) {
      gameRef.current.init();
    }
  };

  const handleRestart = async () => {
    await initAudio();
    setGameMode('playing');
    if (navMode === 'swipe' && !hasShownHintRef.current) {
      hasShownHintRef.current = true;
      triggerSwipeTutorial();
    }
    if (gameRef.current) {
      gameRef.current.init();
    }
  };

  const handleMenu = () => {
    setGameMode('menu');
    setShowUpgrades(false);
    if (gameRef.current) {
      gameRef.current.init();
    }
  };

  const handlePauseToggle = () => {
    if (modeRef.current === 'playing') {
      setGameMode('paused');
    } else if (modeRef.current === 'paused') {
      setGameMode('playing');
    }
  };

  const handleOpenUpgrades = () => {
    setUpgradesReturnMode(modeRef.current);
    if (modeRef.current === 'playing') {
      setGameMode('paused');
    }
    setShowUpgrades(true);
  };

  const handleCloseUpgrades = () => {
    setShowUpgrades(false);
    setRebindAction(null);
    if (upgradesReturnMode === 'menu') {
      setGameMode('menu');
    } else if (upgradesReturnMode === 'gameover') {
      setGameMode('gameover');
    } else if (upgradesReturnMode === 'playing' || upgradesReturnMode === 'paused') {
      setGameMode('playing');
    }
  };

  const handleBuyShield = () => {
    if (coins < 10) {
      if (sfxRef.current) sfxRef.current.playBoom();
      return;
    }
    updateCoins(prev => prev - 10);
    updateShields(prev => prev + 1);
    if (sfxRef.current) sfxRef.current.playPowerup();
  };

  const handleBuyFlamethrower = () => {
    if (coins < 30) {
      if (sfxRef.current) sfxRef.current.playBoom();
      return;
    }
    updateCoins(prev => prev - 30);
    setPurchasedFlame(true);
    if (gameRef.current?.player && (modeRef.current === 'playing' || modeRef.current === 'paused')) {
      gameRef.current.player.flameTimer = Math.max(0, gameRef.current.player.flameTimer) + 8000;
      setActiveFlameSecs(Math.ceil(gameRef.current.player.flameTimer / 1000));
    } else {
      pendingFlameRef.current = true;
      setActiveFlameSecs(8);
    }
    if (sfxRef.current) sfxRef.current.playFlame();
  };

  const handleBuyAlienHack = () => {
    if (coins < 50) {
      if (sfxRef.current) sfxRef.current.playBoom();
      return;
    }
    updateCoins(prev => prev - 50);
    setPurchasedAlien(true);
    if (gameRef.current && (modeRef.current === 'playing' || modeRef.current === 'paused')) {
      gameRef.current.alienHackTimer = Math.max(0, gameRef.current.alienHackTimer) + 5000;
      setActiveAlienSecs(Math.ceil(gameRef.current.alienHackTimer / 1000));
    } else {
      pendingAlienRef.current = true;
      setActiveAlienSecs(5);
    }
    if (sfxRef.current) sfxRef.current.playAlienHack();
  };

  return (
    <div id="game-container">
      <canvas id="gameCanvas"></canvas>

      {/* HUD */}
      {(gameMode === 'playing' || gameMode === 'paused') && (
        <div id="hud">
          <div className="hud-left">
            <div className="hud-pill">
              <div className="hud-stat">
                <span className="hud-icon text-red-500">❤️</span>
                <span className="hud-val font-[Orbitron]" id="lives-display">{lives}</span>
              </div>
              <div className="hud-sep"></div>
              <div className="hud-stat">
                <span className="hud-icon text-yellow-400">🪙</span>
                <span className="hud-val font-[Orbitron]" id="coins-display">{coins}</span>
              </div>
            </div>
            
            {/* Upgrade Armory Button - Visible on screens >= 1080px */}
            <button 
              id="hud-upgrade-btn"
              className="hud-upgrade-btn hidden min-[1080px]:inline-flex"
              onClick={handleOpenUpgrades}
              aria-label="Open Upgrade Armory"
            >
              <span>⚡</span>
              <span>UPGRADES</span>
            </button>
          </div>
          
          <div className="hud-center">
            <button 
              id="pause-btn" 
              onClick={handlePauseToggle}
              aria-label="Pause Game"
            >
              ⏸
            </button>
          </div>

          <div className="hud-right">
            <div className="hud-score-box">
              <div className="score-label">SCORE</div>
              <div className="score-value font-[Orbitron]" id="score-display">
                {score.toString().padStart(6, '0')}
              </div>
            </div>
            <div className="hud-pill energy-pill">
              <span className="hud-icon text-green-400 text-xs">⚡</span>
              <div className="energy-bar-container" id="energy-bar">
                <div className={`energy-segment ${energyBars >= 1 ? 'filled' : ''}`}></div>
                <div className={`energy-segment ${energyBars >= 2 ? 'filled' : ''}`}></div>
                <div className={`energy-segment ${energyBars >= 3 ? 'filled' : ''}`}></div>
                <div className={`energy-segment ${energyBars >= 4 ? 'filled' : ''}`}></div>
                <div className={`energy-segment ${energyBars >= 5 ? 'filled' : ''}`}></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Buffs Banners */}
      {(gameMode === 'playing' || gameMode === 'paused') && (
        <div className="buff-banner-container">
          {activeFlameSecs > 0 && (
            <div className="buff-pill flame" title={`Flamethrower (${activeFlameSecs}s)`}>
              <span className="text-sm">🔥</span>
              <span>{activeFlameSecs}s</span>
            </div>
          )}
          {activeAlienSecs > 0 && (
            <div className="buff-pill alien" title={`Alien Astro Hack (${activeAlienSecs}s)`}>
              <span className="text-sm">👽</span>
              <span>{activeAlienSecs}s</span>
            </div>
          )}
          {shieldActiveStatus && (
            <div className="buff-pill shield" title={`Kinetic Shield (${shieldHpStatus}/4)`}>
              <span className="text-sm">🛡️</span>
              <span>{shieldHpStatus}/4</span>
            </div>
          )}
        </div>
      )}

      {/* Mobile Controls */}
      {gameMode === 'playing' && controlMode === 'touch' && (
        <div id="mobile-controls">
          {/* Swipe Surface */}
          {navMode === 'swipe' && (
            <div 
              className="swipe-surface"
              onPointerDown={handleSwipePointerDown}
              onPointerMove={handleSwipePointerMove}
              onPointerUp={handleSwipePointerUp}
              onPointerCancel={handleSwipePointerUp}
            />
          )}

          {/* Swipe Thumb Indicator */}
          {navMode === 'swipe' && swipeTouchPos && (
            <div 
              className="swipe-indicator"
              style={{ left: `${swipeTouchPos.x}px`, top: `${swipeTouchPos.y}px` }}
            >
              <div className="swipe-indicator-dot" />
            </div>
          )}

          {/* Animated Swipe Onboarding Hint */}
          {showSwipeHint && (
            <div className="swipe-tutorial-hint">
              <div className="swipe-hand-anim">👆</div>
              <div className="swipe-hint-badge">
                <div>Swipe to direct ship!</div>
                <div className="swipe-hint-sub">Drag thumb anywhere on screen</div>
              </div>
            </div>
          )}

          {/* Nav Mode Switcher Button */}
          <button 
            id="nav-mode-toggle"
            className="touch-nav-toggle"
            onClick={toggleNavMode}
            aria-label="Toggle Navigation Mode"
          >
            <span className="toggle-icon">{navMode === 'dpad' ? '🎮' : '👆'}</span>
            <span>{navMode === 'dpad' ? 'D-PAD' : 'SWIPE'}</span>
          </button>

          {/* D-Pad Buttons (Visible in D-Pad mode) */}
          {navMode === 'dpad' && (
            <div className="touch-joystick">
              <div></div>
              <button 
                id="t-up" 
                className={`t-btn ${pressedButtons['arrowup'] ? 'active' : ''}`}
                {...bindControl('arrowup')}
                aria-label="Move Up"
              >
                ▲
              </button>
              <div></div>
              <button 
                id="t-left" 
                className={`t-btn ${pressedButtons['arrowleft'] ? 'active' : ''}`}
                {...bindControl('arrowleft')}
                aria-label="Move Left"
              >
                ◀
              </button>
              <div className="t-btn-center">●</div>
              <button 
                id="t-right" 
                className={`t-btn ${pressedButtons['arrowright'] ? 'active' : ''}`}
                {...bindControl('arrowright')}
                aria-label="Move Right"
              >
                ▶
              </button>
              <div></div>
              <button 
                id="t-down" 
                className={`t-btn ${pressedButtons['arrowdown'] ? 'active' : ''}`}
                {...bindControl('arrowdown')}
                aria-label="Move Down"
              >
                ▼
              </button>
              <div></div>
            </div>
          )}
          
          {/* Action Buttons: Green SPEC, Blue SHIELD (with exponent stack counter), Red SHOOT */}
          <div className="touch-actions">
            <div className="flex items-center gap-2">
              <button 
                id="t-shield" 
                className={`t-btn-shield ${pressedButtons['c'] || pressedButtons['shield'] ? 'active' : ''}`}
                {...bindControl('shield')}
                onClick={() => {
                  if (gameRef.current?.player) {
                    gameRef.current.player.activateShield();
                  }
                }}
                aria-label="Deploy Orbit Shield"
              >
                <span className="shield-count-badge">x{shieldsCount}</span>
                <svg className="w-5 h-5 text-sky-300" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 2.18l7 3.12v4.7c0 4.54-3.05 8.79-7 9.88-3.95-1.09-7-5.34-7-9.88V6.3l7-3.12z"/>
                </svg>
                <span className="text-[8px] font-bold tracking-wider leading-none mt-0.5">SHIELD</span>
              </button>
              <button 
                id="t-special" 
                className={`t-btn-special ${pressedButtons['x'] ? 'active' : ''}`}
                {...bindControl('x')}
                aria-label="Special Attack"
              >
                SPEC
              </button>
            </div>
            <button 
              id="t-shoot" 
              className={`t-btn-shoot ${pressedButtons['z'] ? 'active' : ''}`}
              {...bindControl('z')}
              aria-label="Shoot Laser"
            >
              SHOOT
            </button>
          </div>
        </div>
      )}

      {/* Main Menu Overlay */}
      {gameMode === 'menu' && !showUpgrades && (
        <div id="main-menu" className="overlay relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none z-0">
            {[...Array(45)].map((_, i) => (
              <div
                key={i}
                className="absolute rounded-full animate-pulse"
                style={{
                  top: `${(i * 31) % 100}%`,
                  left: `${(i * 43) % 100}%`,
                  width: `${(i % 3) + 2}px`,
                  height: `${(i % 3) + 2}px`,
                  backgroundColor: i % 3 === 0 ? '#60a5fa' : i % 5 === 0 ? '#fde047' : '#ffffff',
                  boxShadow: i % 3 === 0 ? '0 0 10px #3b82f6' : i % 5 === 0 ? '0 0 10px #eab308' : '0 0 8px #ffffff',
                  opacity: 0.85,
                  animationDuration: `${1.2 + (i % 3)}s`,
                  animationDelay: `${(i % 4) * 0.3}s`
                }}
              />
            ))}
          </div>

          <div className="panel relative z-10">
            <div className="title-text">COSMIC<span>SHOOTER</span></div>
            <button className="btn" onClick={handlePlay}>PLAY</button>
            <button className="btn btn-outline" onClick={handleOpenUpgrades}>UPGRADE ARMORY</button>
            <button className="btn btn-outline" onClick={() => setShowControls(!showControls)}>CONTROLS</button>
            <button 
              className="btn btn-outline mt-3 text-xs tracking-wider" 
              onClick={() => setControlMode(prev => prev === 'touch' ? 'keyboard' : 'touch')}
            >
              CONTROL MODE: {controlMode.toUpperCase()}
            </button>
            
            {showControls && (
              <div id="controls-info" className="mt-4 text-left bg-gray-900 bg-opacity-90 border border-gray-700 p-4 rounded-lg">
                <div className="flex flex-col sm:flex-row gap-4 justify-between border-b border-gray-700 pb-3 mb-3">
                  <div className="flex-1">
                    <p className="font-[Orbitron] text-blue-400 mb-2 text-sm tracking-wider">KEYBOARD</p>
                    <p className="text-gray-300 text-xs mb-1.5"><span className="key-badge">WASD</span> / <span className="key-badge">Arrows</span> : Move</p>
                    <p className="text-gray-300 text-xs mb-1.5"><span className="key-badge">{keyBindings.shoot.toUpperCase()}</span> / <span className="key-badge">Space</span> : Shoot</p>
                    <p className="text-gray-300 text-xs mb-1.5"><span className="key-badge">{keyBindings.special.toUpperCase()}</span> : Special Missile</p>
                    <p className="text-gray-300 text-xs"><span className="key-badge">{keyBindings.shield.toUpperCase()}</span> : Deploy Shield</p>
                  </div>
                  <div className="flex-1 border-t sm:border-t-0 sm:border-l border-gray-700 pt-3 sm:pt-0 sm:pl-4">
                    <p className="font-[Orbitron] text-green-400 mb-2 text-sm tracking-wider">TOUCH</p>
                    <p className="text-gray-300 text-xs mb-1.5">● <span className="text-white">D-Pad / Swipe</span> : Direct Ship</p>
                    <p className="text-gray-300 text-xs mb-1.5">● <span className="text-red-400">SHOOT</span> : Fire (Hold)</p>
                    <p className="text-gray-300 text-xs mb-1.5">● <span className="text-green-400">SPEC</span> : Special Missile</p>
                    <p className="text-gray-300 text-xs">● <span className="text-sky-400">SHIELD</span> : Kinetic Orbit Shield</p>
                  </div>
                </div>
                <p className="text-center text-[10px] text-gray-500 uppercase tracking-widest">Reconfigure keyboard controls anytime in the Upgrade Armory.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pause Menu Overlay */}
      {gameMode === 'paused' && !showUpgrades && (
        <div id="pause-menu" className="overlay relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none z-0">
            {[...Array(45)].map((_, i) => (
              <div
                key={i}
                className="absolute rounded-full animate-pulse"
                style={{
                  top: `${(i * 31) % 100}%`,
                  left: `${(i * 43) % 100}%`,
                  width: `${(i % 3) + 2}px`,
                  height: `${(i % 3) + 2}px`,
                  backgroundColor: i % 3 === 0 ? '#60a5fa' : i % 5 === 0 ? '#fde047' : '#ffffff',
                  boxShadow: i % 3 === 0 ? '0 0 10px #3b82f6' : i % 5 === 0 ? '0 0 10px #eab308' : '0 0 8px #ffffff',
                  opacity: 0.85,
                  animationDuration: `${1.2 + (i % 3)}s`,
                  animationDelay: `${(i % 4) * 0.3}s`
                }}
              />
            ))}
          </div>

          <div className="panel relative z-10">
            <h2 className="text-4xl font-bold text-blue-400 mb-8 font-[Orbitron] tracking-widest">PAUSED</h2>
            <button className="btn" onClick={handlePauseToggle}>RESUME</button>
            <button className="btn btn-outline mt-4" onClick={handleOpenUpgrades}>UPGRADE ARMORY</button>
            <button className="btn btn-outline" onClick={handleRestart}>RESTART</button>
            <button className="btn btn-outline" onClick={() => setControlMode(prev => prev === 'touch' ? 'keyboard' : 'touch')}>
              CONTROL: {controlMode.toUpperCase()}
            </button>
            <button className="btn btn-outline mt-3" onClick={handleMenu}>MAIN MENU</button>
          </div>
        </div>
      )}

      {/* Game Over Menu Overlay */}
      {gameMode === 'gameover' && !showUpgrades && (
        <div id="game-over-menu" className="overlay relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none z-0">
            {[...Array(45)].map((_, i) => (
              <div
                key={i}
                className="absolute rounded-full animate-pulse"
                style={{
                  top: `${(i * 31) % 100}%`,
                  left: `${(i * 43) % 100}%`,
                  width: `${(i % 3) + 2}px`,
                  height: `${(i % 3) + 2}px`,
                  backgroundColor: i % 3 === 0 ? '#60a5fa' : i % 5 === 0 ? '#fde047' : '#ffffff',
                  boxShadow: i % 3 === 0 ? '0 0 10px #3b82f6' : i % 5 === 0 ? '0 0 10px #eab308' : '0 0 8px #ffffff',
                  opacity: 0.85,
                  animationDuration: `${1.2 + (i % 3)}s`,
                  animationDelay: `${(i % 4) * 0.3}s`
                }}
              />
            ))}
          </div>

          <div className="panel relative z-10">
            <h2 className="text-4xl font-bold text-red-500 mb-6 font-[Orbitron] tracking-widest">GAME OVER</h2>
            <div className="mb-8 bg-gray-900 bg-opacity-50 p-4 rounded-lg border border-gray-700">
              <p className="text-gray-400 text-xs uppercase tracking-widest mb-1">FINAL SCORE</p>
              <p className="text-3xl text-blue-300 font-[Orbitron] mb-4">{score.toString().padStart(6, '0')}</p>
              <p className="text-gray-400 text-xs uppercase tracking-widest mb-1">BEST SCORE</p>
              <p className="text-xl text-yellow-400 font-[Orbitron]">{highScore.toString().padStart(6, '0')}</p>
            </div>
            <button className="btn" onClick={handleRestart}>RETRY</button>
            <button className="btn btn-outline" onClick={handleOpenUpgrades}>UPGRADE ARMORY</button>
            <button className="btn btn-outline" onClick={handleMenu}>MAIN MENU</button>
          </div>
        </div>
      )}

      {/* Upgrade Armory Modal (Highest stacking overlay) */}
      {showUpgrades && (
        <div id="upgrades-modal">
          <div className="armory-panel">
            {/* Header with Coin Wealth & Close 'X' Button */}
            <div className="flex items-center justify-between border-b border-blue-500/40 pb-3 mb-4">
              <div>
                <h2 className="text-xl font-bold font-[Orbitron] text-sky-400 tracking-wider">UPGRADE ARMORY</h2>
                <p className="text-xs text-gray-400">Added Features & Keymapping</p>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1.5 bg-yellow-950/60 border border-yellow-500/50 px-3 py-1.5 rounded-full font-[Orbitron] text-yellow-300 font-bold text-sm shadow-[0_0_10px_rgba(245,158,11,0.3)]">
                  <span>🪙</span>
                  <span>{coins}</span>
                </div>
                <button
                  id="armory-close-x"
                  onClick={handleCloseUpgrades}
                  className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-600 text-gray-300 hover:text-white flex items-center justify-center font-bold text-sm transition-colors cursor-pointer"
                  aria-label="Close upgrades menu"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Added Feature: Kinetic Orbit Shield */}
            <div className="armory-card featured">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-start gap-2.5">
                  <div className="w-10 h-10 rounded-full bg-sky-500/20 border border-sky-400 flex items-center justify-center text-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.4)] shrink-0 mt-0.5">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 2.18l7 3.12v4.7c0 4.54-3.05 8.79-7 9.88-3.95-1.09-7-5.34-7-9.88V6.3l7-3.12z"/>
                    </svg>
                  </div>
                  <div>
                    <span className="font-[Orbitron] font-bold text-sky-300 text-sm tracking-wide block">Orbit Kinetic Shield</span>
                    <p className="text-[11px] text-gray-300 mt-0.5 leading-snug">
                      Generates a 4-hit orbiting kinetic mesh. Absorbs multiple lasers or collapses instantly on asteroid impact to protect the mother ship.
                    </p>
                  </div>
                </div>
                <span className="bg-sky-500/20 text-sky-300 border border-sky-500/40 text-[10px] font-bold px-2 py-0.5 rounded font-[Orbitron] shrink-0">
                  10 🪙
                </span>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-sky-500/30 mt-2">
                <div className="text-xs font-[Orbitron] text-gray-300">
                  Stock: <span className="text-yellow-400 font-bold">x{shieldsCount}</span>
                </div>
                <button
                  id="buy-shield-btn"
                  onClick={handleBuyShield}
                  disabled={coins < 10}
                  className={`font-[Orbitron] text-xs font-bold px-3 py-1 rounded border transition-all cursor-pointer ${
                    coins >= 10
                      ? 'bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white border-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.4)] active:scale-95'
                      : 'bg-slate-800 text-gray-500 border-slate-700 cursor-not-allowed opacity-60'
                  }`}
                >
                  {coins >= 10 ? 'BUY (10 🪙)' : '10 🪙'}
                </button>
              </div>
            </div>

            {/* Field Power-Ups & Armory Purchases */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
              <div className="armory-card !p-3 !mb-0 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xl">🔥</span>
                      <span className="font-[Orbitron] text-xs font-bold text-orange-400">Flamethrower</span>
                    </div>
                    <span className="bg-orange-500/20 text-orange-300 border border-orange-500/40 text-[10px] font-bold px-2 py-0.5 rounded font-[Orbitron]">
                      30 🪙
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-300 leading-snug mb-2.5">
                    Fires massive thermal plasma balls for 8s, obliterating enemy fleets and melting bullets. Also drops in field once unlocked.
                  </p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-700/60 mt-auto">
                  <span className="text-[10px] font-[Orbitron] text-gray-400">
                    {activeFlameSecs > 0 ? (
                      <span className="text-orange-300 font-bold animate-pulse">ACTIVE: {activeFlameSecs}s</span>
                    ) : (
                      <span>Duration: 8s</span>
                    )}
                  </span>
                  <button
                    id="buy-flame-btn"
                    onClick={handleBuyFlamethrower}
                    disabled={coins < 30}
                    className={`font-[Orbitron] text-xs font-bold px-3 py-1 rounded border transition-all cursor-pointer ${
                      coins >= 30 
                        ? 'bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white border-orange-400 shadow-[0_0_10px_rgba(249,115,22,0.4)] active:scale-95' 
                        : 'bg-slate-800 text-gray-500 border-slate-700 cursor-not-allowed opacity-60'
                    }`}
                  >
                    {coins >= 30 ? 'BUY (30 🪙)' : '30 🪙'}
                  </button>
                </div>
              </div>

              <div className="armory-card !p-3 !mb-0 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xl">👽</span>
                      <span className="font-[Orbitron] text-xs font-bold text-purple-400">Alien Astro Hack</span>
                    </div>
                    <span className="bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-bold px-2 py-0.5 rounded font-[Orbitron]">
                      50 🪙
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-300 leading-snug mb-2.5">
                    Hacks alien fleet telemetry for 5s, forcing them to bank 90° and turn weapons against each other in friendly fire!
                  </p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-700/60 mt-auto">
                  <span className="text-[10px] font-[Orbitron] text-gray-400">
                    {activeAlienSecs > 0 ? (
                      <span className="text-purple-300 font-bold animate-pulse">ACTIVE: {activeAlienSecs}s</span>
                    ) : (
                      <span>Duration: 5s</span>
                    )}
                  </span>
                  <button
                    id="buy-alien-btn"
                    onClick={handleBuyAlienHack}
                    disabled={coins < 50}
                    className={`font-[Orbitron] text-xs font-bold px-3 py-1 rounded border transition-all cursor-pointer ${
                      coins >= 50 
                        ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white border-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.4)] active:scale-95' 
                        : 'bg-slate-800 text-gray-500 border-slate-700 cursor-not-allowed opacity-60'
                    }`}
                  >
                    {coins >= 50 ? 'BUY (50 🪙)' : '50 🪙'}
                  </button>
                </div>
              </div>
            </div>

            {/* Key Bindings Configurator */}
            <div className="bg-slate-900/90 border border-slate-700 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-700">
                <span className="font-[Orbitron] text-xs font-bold text-blue-400 tracking-wider">KEYBOARD CONFIGURATION</span>
                <button 
                  onClick={() => saveKeyBindings(DEFAULT_KEY_BINDINGS)}
                  className="text-[10px] font-[Orbitron] text-gray-400 hover:text-white underline cursor-pointer"
                >
                  Reset Defaults
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-300">Shoot Laser:</span>
                  <button 
                    className={`key-record-btn ${rebindAction === 'shoot' ? 'recording' : ''}`}
                    onClick={() => setRebindAction(rebindAction === 'shoot' ? null : 'shoot')}
                  >
                    {rebindAction === 'shoot' ? 'PRESS KEY' : keyBindings.shoot.toUpperCase()}
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-300">Special Missile:</span>
                  <button 
                    className={`key-record-btn ${rebindAction === 'special' ? 'recording' : ''}`}
                    onClick={() => setRebindAction(rebindAction === 'special' ? null : 'special')}
                  >
                    {rebindAction === 'special' ? 'PRESS KEY' : keyBindings.special.toUpperCase()}
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-300">Deploy Orbit Shield:</span>
                  <button 
                    className={`key-record-btn ${rebindAction === 'shield' ? 'recording' : ''}`}
                    onClick={() => setRebindAction(rebindAction === 'shield' ? null : 'shield')}
                  >
                    {rebindAction === 'shield' ? 'PRESS KEY' : keyBindings.shield.toUpperCase()}
                  </button>
                </div>
              </div>

              {rebindAction && (
                <p className="text-[10px] text-yellow-300 text-center mt-2 animate-pulse">
                  Press any keyboard key to rebind {rebindAction.toUpperCase()} (or Escape to cancel). Saved to browser storage.
                </p>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-2">
              <button 
                id="close-upgrades-btn"
                onClick={handleCloseUpgrades}
                className="btn !py-2.5 !px-6 !text-sm !w-full"
              >
                {upgradesReturnMode === 'menu' ? '← RETURN TO MAIN MENU' : upgradesReturnMode === 'gameover' ? '← RETURN TO RESULTS' : '← RETURN TO GAME'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
