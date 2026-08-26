/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';

declare const Tone: any;

export default function App() {
  const [gameMode, setGameMode] = useState<'menu' | 'playing' | 'paused' | 'gameover'>('menu');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(parseInt(localStorage.getItem('spaceShooterHighScore') || '0', 10));
  const [lives, setLives] = useState(3);
  const [coins, setCoins] = useState(0);
  const [energyBars, setEnergyBars] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const [controlMode, setControlMode] = useState<'touch' | 'keyboard'>('touch');

  const gameRef = useRef<any>(null);
  const sfxRef = useRef<any>(null);

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
      shootSynth: null as any,
      boomSynth: null as any,
      powerupSynth: null as any,
      specialSynth: null as any,
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
      }
    };

    sfxRef.current = sfx;

    let animationId: number;
    let lastTime = 0;

    class InputHandler {
      keys: { [key: string]: boolean } = {};
      keydownHandler: (e: KeyboardEvent) => void;
      keyupHandler: (e: KeyboardEvent) => void;
      touchCleanups: (() => void)[] = [];

      constructor() {
        this.keydownHandler = e => { this.keys[e.key.toLowerCase()] = true; };
        this.keyupHandler = e => { this.keys[e.key.toLowerCase()] = false; };

        window.addEventListener('keydown', this.keydownHandler);
        window.addEventListener('keyup', this.keyupHandler);

        const bindTouch = (id: string, key: string) => {
          const btn = document.getElementById(id);
          if (!btn) return;

          const press = (e: Event) => {
            e.preventDefault();
            this.keys[key] = true;
            btn.classList.add('active');
          };

          const release = (e: Event) => {
            e.preventDefault();
            this.keys[key] = false;
            btn.classList.remove('active');
          };

          const clickAction = (e: Event) => {
            e.preventDefault();
            this.keys[key] = true;
            btn.classList.add('active');
            setTimeout(() => {
              this.keys[key] = false;
              btn.classList.remove('active');
            }, 120);
          };

          btn.addEventListener('touchstart', press, { passive: false });
          btn.addEventListener('touchend', release, { passive: false });
          btn.addEventListener('touchcancel', release, { passive: false });

          btn.addEventListener('mousedown', press);
          btn.addEventListener('mouseup', release);
          btn.addEventListener('mouseleave', release);
          btn.addEventListener('click', clickAction);

          this.touchCleanups.push(() => {
            btn.removeEventListener('touchstart', press);
            btn.removeEventListener('touchend', release);
            btn.removeEventListener('touchcancel', release);
            btn.removeEventListener('mousedown', press);
            btn.removeEventListener('mouseup', release);
            btn.removeEventListener('mouseleave', release);
            btn.removeEventListener('click', clickAction);
          });
        };

        bindTouch('t-up', 'arrowup');
        bindTouch('t-down', 'arrowdown');
        bindTouch('t-left', 'arrowleft');
        bindTouch('t-right', 'arrowright');
        bindTouch('t-shoot', 'z');
        bindTouch('t-special', 'x');
      }

      isPressed(key: string) { return this.keys[key]; }
      isAnyMovement() {
        return this.isPressed('w') || this.isPressed('a') || 
               this.isPressed('s') || this.isPressed('d') || 
               this.isPressed('arrowup') || this.isPressed('arrowdown') || 
               this.isPressed('arrowleft') || this.isPressed('arrowright'); 
      }

      destroy() {
        window.removeEventListener('keydown', this.keydownHandler);
        window.removeEventListener('keyup', this.keyupHandler);
        this.touchCleanups.forEach(fn => fn());
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

      constructor(game: Game) {
        this.game = game;
        this.width = 50;
        this.height = 60;
        this.x = GAME_WIDTH / 2 - this.width / 2;
        this.y = GAME_HEIGHT - this.height - (GAME_HEIGHT > GAME_WIDTH ? 200 : 80); 
        this.speed = 6;
        this.lives = 3;
        this.maxEnergy = 5;
        this.specialCharges = 0;
        this.shootTimer = 0;
        this.shootInterval = 120;
        this.specialTimer = 0; 
        this.invulnerableTimer = 0;
      }

      update(dt: number) {
        let vx = 0, vy = 0;
        if (this.game.input.isPressed('arrowleft') || this.game.input.isPressed('a')) vx = -this.speed;
        if (this.game.input.isPressed('arrowright') || this.game.input.isPressed('d')) vx = this.speed;
        if (this.game.input.isPressed('arrowup') || this.game.input.isPressed('w')) vy = -this.speed;
        if (this.game.input.isPressed('arrowdown') || this.game.input.isPressed('s')) vy = this.speed;
        
        if (vx !== 0 && vy !== 0) {
          const norm = Math.sqrt(vx*vx + vy*vy);
          vx = (vx / norm) * this.speed;
          vy = (vy / norm) * this.speed;
        }
        
        this.x += vx * (dt/16);
        this.y += vy * (dt/16);

        this.x = Math.max(0, Math.min(GAME_WIDTH - this.width, this.x));
        this.y = Math.max(0, Math.min(GAME_HEIGHT - this.height, this.y));

        if (this.shootTimer > 0) this.shootTimer -= dt;
        if ((this.game.input.isPressed('z') || this.game.input.isPressed(' ')) && this.shootTimer <= 0) {
          this.shoot();
          this.shootTimer = this.shootInterval;
        }

        if (this.specialTimer > 0) this.specialTimer -= dt;
        if (this.game.input.isPressed('x') && this.specialTimer <= 0 && this.specialCharges > 0) {
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
        
        ctx.fillStyle = '#60a5fa';
        if (this.game.input.isAnyMovement()) {
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.moveTo(this.width/2 - 10, this.height);
          ctx.lineTo(this.width/2 + 10, this.height);
          ctx.lineTo(this.width/2, this.height + 15 + Math.random() * 15);
          ctx.fill();
        }

        ctx.fillStyle = '#e2e8f0'; 
        ctx.beginPath();
        ctx.moveTo(this.width/2, 0); 
        ctx.lineTo(this.width, this.height/2 + 10); 
        ctx.lineTo(this.width - 10, this.height); 
        ctx.lineTo(10, this.height); 
        ctx.lineTo(0, this.height/2 + 10); 
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.ellipse(this.width/2, this.height/2 - 5, 8, 15, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(5, this.height/2 + 5, 5, 15);
        ctx.fillRect(this.width - 10, this.height/2 + 5, 5, 15);

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
        let targetY = this.game.player.y + this.targetOffsetY;
        
        this.x += (targetX - this.x) * 0.08 * (dt/16);
        this.y += (targetY - this.y) * 0.08 * (dt/16);

        this.shootTimer -= dt;
        if (this.shootTimer <= 0) {
          this.game.projectiles.push(new Projectile(this.x + this.width/2, this.y, -10, 'ally'));
          this.shootTimer = 800 + Math.random() * 400;
        }
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
      }
      update(dt: number) {
        this.y += this.speed * (dt/16);
        this.x = this.startX + Math.sin(this.y * this.frequency) * this.amplitude;
        this.x = Math.max(0, Math.min(GAME_WIDTH - this.width, this.x));

        if (this.y > GAME_HEIGHT) this.markedForDeletion = true;
        
        if (Math.random() < 0.005) {
          this.game.projectiles.push(new Projectile(this.x + this.width/2, this.y + this.height, 6 * (GAME_HEIGHT/800), 'enemy'));
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
          else if(rand < 0.15) this.game.drops.push(new Drop(this.x, this.y, 'coin'));
          else if(rand < 0.25) this.game.drops.push(new Drop(this.x, this.y, 'energy'));
          else if(rand < 0.30) {
            const multi = Math.floor(Math.random() * 3) + 2; 
            this.game.drops.push(new Drop(this.x, this.y, 'multiplier', multi));
          }
        }
      }
      draw(ctx: CanvasRenderingContext2D) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.fillStyle = '#4b5563';
        ctx.beginPath();
        ctx.moveTo(this.width/2, this.height); 
        ctx.lineTo(this.width, 10);
        ctx.lineTo(this.width - 10, 0);
        ctx.lineTo(10, 0);
        ctx.lineTo(0, 10);
        ctx.closePath();
        ctx.fill();
        
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(this.width/2, this.height/2 + 5, 5, 0, Math.PI*2);
        ctx.fill();
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ef4444';
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
          if (proj.type === 'enemy') {
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
      projectiles: (Projectile | SpecialMissile)[] = [];
      explosions: (Explosion | AreaExplosion)[] = [];
      drops: Drop[] = [];
      allies: Ally[] = [];
      asteroids: Asteroid[] = [];
      enemyTimer = 0;
      gameTime = 0;
      baseEnemyInterval = 1200;
      asteroidTimer = 0;
      nextAsteroidSpawn = 20000 + Math.random() * 25000;

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
        setScore(0);
        setCoins(0);
        setLives(3);
        setEnergyBars(0);
      }

      updateAllyFormations() {
        this.allies.forEach((ally, index) => {
          const isLeft = index % 2 === 0;
          const row = Math.floor(index / 2) + 1;
          const spacingX = 70; 
          const spacingY = 60; 
          
          ally.targetOffsetX = (isLeft ? -1 : 1) * (row * spacingX);
          ally.targetOffsetY = this.player.height + (row * spacingY) - 30;
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

        let currentInterval = Math.max(300, this.baseEnemyInterval - (this.gameTime / 60000) * 800);

        if (this.enemyTimer > currentInterval) {
          let numToSpawn = 1 + Math.floor(Math.random() * (this.gameTime / 50000));
          for(let i = 0; i < Math.min(numToSpawn, 5); i++) {
            this.enemies.push(new Enemy(this));
          }
          this.enemyTimer = 0;
        } else {
          this.enemyTimer += dt;
        }

        this.projectiles.forEach(p => p.update(dt));
        this.enemies.forEach(e => e.update(dt));
        this.allies.forEach(a => a.update(dt));
        
        this.asteroidTimer += dt;
        if (this.asteroidTimer > this.nextAsteroidSpawn) {
          this.asteroids.push(new Asteroid(this));
          this.asteroidTimer = 0;
          this.nextAsteroidSpawn = 20000 + Math.random() * 25000;
        }
        this.asteroids.forEach(a => a.update(dt));
        
        this.explosions.forEach(e => {
          if (e instanceof AreaExplosion) e.update(dt, this);
          else e.update(dt);
        });
        this.drops.forEach(d => d.update(dt));

        this.checkCollisions();

        this.projectiles = this.projectiles.filter(p => !p.markedForDeletion);
        this.enemies = this.enemies.filter(e => !e.markedForDeletion);
        this.explosions = this.explosions.filter(e => !e.markedForDeletion);
        this.drops = this.drops.filter(d => !d.markedForDeletion);
        this.allies = this.allies.filter(a => !a.markedForDeletion);
        this.asteroids = this.asteroids.filter(a => !a.markedForDeletion);
      }

      checkCollisions() {
        const rectIntersect = (r1x: number, r1y: number, r1w: number, r1h: number, r2x: number, r2y: number, r2w: number, r2h: number) => {
          return r1x < r2x + r2w && r1x + r1w > r2x && r1y < r2y + r2h && r1y + r1h > r2y;
        };

        this.projectiles.forEach(proj => {
          if (proj.type === 'player' || proj.type === 'special_missile' || proj.type === 'ally') {
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
              this.player.hit();
            }
          }
        });

        this.enemies.forEach(enemy => {
          if (rectIntersect(enemy.x+5, enemy.y+5, enemy.width-10, enemy.height-10, this.player.x+10, this.player.y+10, this.player.width-20, this.player.height-20)) {
            enemy.markedForDeletion = true;
            this.explosions.push(new Explosion(enemy.x + enemy.width/2, enemy.y + enemy.height/2, 'medium'));
            sfx.playBoom();
            this.player.hit();
          }
        });

        this.asteroids.forEach(asteroid => {
          let dx = asteroid.x - (this.player.x + this.player.width / 2);
          let dy = asteroid.y - (this.player.y + this.player.height / 2);
          let dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < asteroid.radius + Math.min(this.player.width, this.player.height) / 2) {
            this.explosions.push(new Explosion(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, 'large'));
            sfx.playBoom();
            this.player.lives = 0; 
            setLives(0);
            this.gameOver();
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
              setCoins(prev => {
                const nc = prev + 5;
                return nc;
              });
              sfx.playPowerup();
            } else if (drop.type === 'energy') {
              if (this.player.specialCharges < this.player.maxEnergy * 3) {
                this.player.specialCharges = Math.min(this.player.specialCharges + 3, this.player.maxEnergy * 3);
                this.updateEnergyHUD();
                sfx.playPowerup();
              }
            } else if (drop.type === 'multiplier') {
              sfx.playPowerup();
              let currentFleet = 1 + this.allies.length;
              let targetFleet = Math.min(currentFleet * drop.value, 8); 
              let newShips = targetFleet - currentFleet;
              for(let i = 0; i < newShips; i++) {
                this.allies.push(new Ally(this, this.player.x, this.player.y));
              }
              this.updateAllyFormations();
              this.addScore(50 * drop.value); 
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

      // Read current game mode via state ref or check window / closure
      // We can inspect current gameMode from React by storing it in a ref
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
        if (modeRef.current === 'playing') {
          setGameMode('paused');
        } else if (modeRef.current === 'paused') {
          setGameMode('playing');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
    if (gameRef.current) {
      gameRef.current.init();
    }
  };

  const handleRestart = async () => {
    await initAudio();
    setGameMode('playing');
    if (gameRef.current) {
      gameRef.current.init();
    }
  };

  const handleMenu = () => {
    setGameMode('menu');
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

  return (
    <div id="game-container">
      <canvas id="gameCanvas"></canvas>

      {/* HUD */}
      {(gameMode === 'playing' || gameMode === 'paused') && (
        <div id="hud" style={{pointerEvents: 'none'}}>
          <div className="hud-left">
            <div className="hud-group">
              <span className="hud-icon text-red-500">❤️</span>
              <span className="hud-text">x <span id="lives-display">{lives}</span></span>
            </div>
            <div className="hud-group">
              <span className="hud-icon text-yellow-400">🪙</span>
              <span className="hud-text"><span id="coins-display">{coins}</span></span>
            </div>
          </div>
          
          <div className="hud-center">
            <div className="hud-text text-gray-400 text-xs mb-1">SCORE</div>
            <div className="hud-text score-display font-[Orbitron]" id="score-display">
              {score.toString().padStart(6, '0')}
            </div>
          </div>

          <div className="hud-right">
            <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
              <div className="hud-group">
                <span className="hud-icon text-green-400 text-xs mr-1">⚡</span>
                <div className="energy-bar-container" id="energy-bar">
                  <div className={`energy-segment ${energyBars >= 1 ? 'filled' : ''}`}></div>
                  <div className={`energy-segment ${energyBars >= 2 ? 'filled' : ''}`}></div>
                  <div className={`energy-segment ${energyBars >= 3 ? 'filled' : ''}`}></div>
                  <div className={`energy-segment ${energyBars >= 4 ? 'filled' : ''}`}></div>
                  <div className={`energy-segment ${energyBars >= 5 ? 'filled' : ''}`}></div>
                </div>
              </div>
              <button 
                id="pause-btn" 
                style={{pointerEvents: 'auto'}} 
                onClick={handlePauseToggle}
              >
                ⏸
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Controls */}
      {gameMode === 'playing' && controlMode === 'touch' && (
        <div id="mobile-controls">
          <div className="touch-joystick">
            <div></div>
            <button id="t-up" className="t-btn">▲</button>
            <div></div>
            <button id="t-left" className="t-btn">◀</button>
            <div className="t-btn-center">●</div>
            <button id="t-right" className="t-btn">▶</button>
            <div></div>
            <button id="t-down" className="t-btn">▼</button>
            <div></div>
          </div>
          
          <div className="touch-actions">
            <button id="t-special" className="t-btn-special">SPEC</button>
            <button id="t-shoot" className="t-btn-shoot">SHOOT</button>
          </div>
        </div>
      )}

      {/* Main Menu Overlay */}
      {gameMode === 'menu' && (
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
                    <p className="text-gray-300 text-xs mb-1.5"><span className="key-badge">Z</span> / <span className="key-badge">Space</span> : Shoot</p>
                    <p className="text-gray-300 text-xs"><span className="key-badge">X</span> : Special</p>
                  </div>
                  <div className="flex-1 border-t sm:border-t-0 sm:border-l border-gray-700 pt-3 sm:pt-0 sm:pl-4">
                    <p className="font-[Orbitron] text-green-400 mb-2 text-sm tracking-wider">TOUCH</p>
                    <p className="text-gray-300 text-xs mb-1.5">● <span className="text-white">D-Pad</span> : Move</p>
                    <p className="text-gray-300 text-xs mb-1.5">● <span className="text-red-400">SHOOT</span> : Fire (Hold)</p>
                    <p className="text-gray-300 text-xs">● <span className="text-green-400">SPEC</span> : Special</p>
                  </div>
                </div>
                <p className="text-center text-[10px] text-gray-500 uppercase tracking-widest">Controls adapt to portrait/landscape seamlessly.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pause Menu Overlay */}
      {gameMode === 'paused' && (
        <div id="pause-menu" className="overlay relative overflow-hidden">
          {/* Animated Starfield Background */}
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
            <button className="btn btn-outline mt-4" onClick={handleRestart}>RESTART</button>
            <button className="btn btn-outline" onClick={() => setControlMode(prev => prev === 'touch' ? 'keyboard' : 'touch')}>
              CONTROL: {controlMode.toUpperCase()}
            </button>
            <button className="btn btn-outline mt-3" onClick={handleMenu}>MAIN MENU</button>
          </div>
        </div>
      )}

      {/* Game Over Menu Overlay */}
      {gameMode === 'gameover' && (
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
            <button className="btn btn-outline" onClick={handleMenu}>MAIN MENU</button>
          </div>
        </div>
      )}
    </div>
  );
}


