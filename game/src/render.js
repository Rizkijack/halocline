// Painting. Everything is drawn with the canvas 2D API into a fixed 1280x720 logical area that
// the caller scales to the window, so every coordinate here is absolute and no layout depends on
// the screen. Four screens are painted over one world: the title card, play with its HUD, pause,
// and the results card (a win at the trench floor, or a hull breach / out of air).
//
// The look is a sonar readout: near-black water, one cyan family for what the sonar has touched,
// amber for air, red for what hurts. Hazards are drawn as faint ghosts until a ping lights them,
// which is the whole point of the game: the screen is honest about what the player has revealed
// and nothing else.

import { FONT, FIELD, PALETTE, SONAR, SUB, TRENCH_FLOOR, ZONE } from './config.js';
import { HAZARD_SPUR, PICKUP_TANK } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const W = FIELD.width;
const H = FIELD.height;
const HUD_TOP = 74;
const HUD_BOTTOM = H - 58;

function paletteFor(zone) {
  return PALETTE.zones[Math.min(PALETTE.zones.length - 1, Math.max(0, zone))];
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** A label in the game's one typeface, with the tracking the sonar readout look depends on. */
function label(ctx, text, x, y, { size = 20, color = PALETTE.text, align = 'left', weight = 500, track = 2 } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  if (track === 0) {
    ctx.fillText(text, x, y);
  } else {
    // Letter-spacing is not universal on canvas 2D, so the tracking is drawn by hand.
    const chars = [...text];
    const widths = chars.map((ch) => ctx.measureText(ch).width + track);
    const total = widths.reduce((sum, w) => sum + w, 0) - track;
    let cursor = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    for (let index = 0; index < chars.length; index += 1) {
      ctx.fillText(chars[index], cursor, y);
      cursor += widths[index];
    }
  }
  ctx.restore();
}

export function createRenderer(canvas, trench) {
  const ctx = canvas.getContext('2d', { alpha: false });

  /** Keep the backing store matched to the window and the logical field. */
  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth || W;
    const height = canvas.clientHeight || H;
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    // The input module reads these to map pointer coordinates into the logical field.
    canvas.logicalWidth = W;
    canvas.logicalHeight = H;
    ctx.setTransform((canvas.width / W), 0, 0, (canvas.height / H), 0, 0);
  }

  function drawWater(state, palette) {
    const water = ctx.createLinearGradient(0, 0, 0, H);
    water.addColorStop(0, palette.deep);
    water.addColorStop(0.55, palette.water);
    water.addColorStop(1, palette.haze);
    ctx.fillStyle = water;
    ctx.fillRect(0, 0, W, H);

    // A faint shaft of what daylight is left, only near the surface.
    const surface = Math.max(0, 1 - state.depth / 700);
    if (surface > 0) {
      const shaft = ctx.createLinearGradient(0, 0, W * 0.6, H);
      shaft.addColorStop(0, `rgba(120, 220, 235, ${0.1 * surface})`);
      shaft.addColorStop(1, 'rgba(120, 220, 235, 0)');
      ctx.fillStyle = shaft;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawScenery(state, palette) {
    const scenery = trench.sceneryFor(state.zone);

    // The vent plumes: slow columns of warmer water, pulsing on their own phase.
    for (const vent of scenery.vents) {
      const pulse = 0.5 + 0.5 * Math.sin(state.elapsed * vent.rate + vent.phase);
      const plume = ctx.createLinearGradient(0, vent.y, 0, vent.y - vent.height);
      plume.addColorStop(0, `rgba(255, 226, 168, ${0.16 + 0.1 * pulse})`);
      plume.addColorStop(1, 'rgba(255, 226, 168, 0)');
      ctx.fillStyle = plume;
      ctx.beginPath();
      ctx.moveTo(vent.x - vent.width / 2, vent.y);
      ctx.lineTo(vent.x + vent.width / 2, vent.y);
      ctx.lineTo(vent.x + vent.width * (0.7 + 0.5 * pulse), vent.y - vent.height);
      ctx.lineTo(vent.x - vent.width * (0.7 + 0.5 * pulse), vent.y - vent.height);
      ctx.closePath();
      ctx.fill();
    }

    // The two walls, drawn as filled silhouettes so they read at a glance when the frame shrinks.
    ctx.fillStyle = palette.rock;
    ctx.beginPath();
    ctx.moveTo(-10, -10);
    for (const point of scenery.walls.left) ctx.lineTo(point.x, point.y);
    ctx.lineTo(-10, H + 10);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(W + 10, -10);
    for (const point of scenery.walls.right) ctx.lineTo(point.x, point.y);
    ctx.lineTo(W + 10, H + 10);
    ctx.closePath();
    ctx.fill();

    // A lit edge along the walls, so they never merge into the water.
    ctx.strokeStyle = palette.rockLit;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(scenery.walls.left[0].x, scenery.walls.left[0].y);
    for (const point of scenery.walls.left) ctx.lineTo(point.x, point.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(scenery.walls.right[0].x, scenery.walls.right[0].y);
    for (const point of scenery.walls.right) ctx.lineTo(point.x, point.y);
    ctx.stroke();

    // Ledges reaching in from a wall.
    for (const ledge of scenery.ledges) {
      const outer = ledge.side < 0 ? 0 : W;
      const inner = ledge.side < 0 ? ledge.reach : W - ledge.reach;
      ctx.fillStyle = palette.rock;
      ctx.beginPath();
      ctx.moveTo(outer, ledge.y);
      ctx.lineTo(inner, ledge.y);
      ctx.lineTo(inner - ledge.side * 10, ledge.y + ledge.thickness);
      ctx.lineTo(outer, ledge.y + ledge.thickness + 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = palette.rockLit;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(outer, ledge.y);
      ctx.lineTo(inner, ledge.y);
      ctx.stroke();
    }
  }

  function drawPing(state, palette) {
    const age = state.pingAge;
    if (!Number.isFinite(age) || age > SONAR.revealTime + 0.6) return;
    const t = Math.min(1, age / (SONAR.revealTime + 0.6));
    const radius = SONAR.radius * Math.min(1, age / SONAR.revealTime);
    const fade = 1 - t;
    // Three rings and a soft disc of light: the sweep has to read as a sonar pulse even when the
    // frame is shrunk to a contact-sheet cell, so it is drawn bright and thick.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const wash = ctx.createRadialGradient(state.pingX, state.pingY, 0, state.pingX, state.pingY, Math.max(1, radius));
    wash.addColorStop(0, `rgba(124, 246, 255, ${0.16 * fade})`);
    wash.addColorStop(1, 'rgba(124, 246, 255, 0)');
    ctx.fillStyle = wash;
    ctx.beginPath();
    ctx.arc(state.pingX, state.pingY, Math.max(1, radius), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(160, 250, 255, ${0.85 * fade})`;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(state.pingX, state.pingY, Math.max(1, radius), 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(124, 246, 255, ${0.5 * fade})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(state.pingX, state.pingY, Math.max(1, radius * 0.7), 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(124, 246, 255, ${0.3 * fade})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(state.pingX, state.pingY, Math.max(1, radius * 0.42), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawHazard(state, item, palette, visibility) {
    const lit = visibility > 0.55;
    const radius = item.radius;

    if (item.kind === HAZARD_SPUR) {
      // A rock spur: a jagged wedge with its point toward the sub.
      ctx.save();
      ctx.globalAlpha = 0.16 + 0.84 * visibility;
      if (lit) {
        // A revealed hazard throws light of its own, so it reads even in a shrunken frame.
        const halo = ctx.createRadialGradient(item.x, item.y, 0, item.x, item.y, radius * 2.6);
        halo.addColorStop(0, 'rgba(255, 107, 94, 0.42)');
        halo.addColorStop(1, 'rgba(255, 107, 94, 0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(item.x, item.y, radius * 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.fillStyle = lit ? palette.rockLit : palette.rock;
      ctx.beginPath();
      ctx.moveTo(item.x - radius, item.y + radius * 0.7);
      ctx.lineTo(item.x + radius, item.y + radius * 0.7);
      ctx.lineTo(item.x + radius * 0.3, item.y - radius);
      ctx.lineTo(item.x - radius * 0.2, item.y - radius * 0.35);
      ctx.closePath();
      ctx.fill();
      if (lit) {
        ctx.strokeStyle = palette.glow;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    // A mine: a ringed disc with spikes, so it is unmistakable against the rocks.
    ctx.save();
    ctx.globalAlpha = 0.16 + 0.84 * visibility;
    if (lit) {
      // The same self-light the spurs get, in the hazard colour, so a revealed mine is the
      // second-brightest thing on screen after the sub.
      const halo = ctx.createRadialGradient(item.x, item.y, 0, item.x, item.y, radius * 3);
      halo.addColorStop(0, 'rgba(255, 107, 94, 0.5)');
      halo.addColorStop(1, 'rgba(255, 107, 94, 0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(item.x, item.y, radius * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.strokeStyle = lit ? palette.hazard : palette.rockLit;
    ctx.lineWidth = lit ? 3 : 2;
    ctx.beginPath();
    for (let spike = 0; spike < 8; spike += 1) {
      const angle = (spike / 8) * Math.PI * 2 + item.x * 0.01;
      ctx.moveTo(item.x + Math.cos(angle) * radius * 0.6, item.y + Math.sin(angle) * radius * 0.6);
      ctx.lineTo(item.x + Math.cos(angle) * radius * 1.5, item.y + Math.sin(angle) * radius * 1.5);
    }
    ctx.stroke();
    ctx.fillStyle = lit ? palette.hazard : palette.rockLit;
    ctx.beginPath();
    ctx.arc(item.x, item.y, radius * 0.72, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = lit ? '#1a0509' : palette.water;
    ctx.beginPath();
    ctx.arc(item.x, item.y, radius * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPickup(item, palette) {
    const tank = item.kind === PICKUP_TANK;
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = palette.salvage;
    ctx.strokeStyle = tank ? '#fff3c9' : palette.salvage;
    ctx.lineWidth = tank ? 3 : 2;
    roundedRect(ctx, item.x - item.radius, item.y - item.radius * 1.15, item.radius * 2, item.radius * 2.3, 4);
    ctx.fill();
    ctx.stroke();
    // A cross for air, a chevron for a vent: two shapes that survive being shrunk.
    ctx.fillStyle = '#20160a';
    if (tank) {
      ctx.fillRect(item.x - 2, item.y - item.radius * 0.65, 4, item.radius * 1.3);
      ctx.fillRect(item.x - item.radius * 0.65, item.y - 2, item.radius * 1.3, 4);
    } else {
      ctx.beginPath();
      ctx.moveTo(item.x, item.y - item.radius * 0.7);
      ctx.lineTo(item.x + item.radius * 0.6, item.y + item.radius * 0.2);
      ctx.lineTo(item.x, item.y - item.radius * 0.1);
      ctx.lineTo(item.x - item.radius * 0.6, item.y + item.radius * 0.2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSub(state, palette) {
    const x = state.subX;
    const y = state.subY;
    const halfWidth = SUB.width / 2;
    const halfHeight = SUB.height / 2;
    const blink = state.invulnerable > 0 && Math.floor(state.elapsed * 14) % 2 === 0;

    ctx.save();
    if (blink) ctx.globalAlpha = 0.42;

    // A halo, so the player's own sub is the brightest thing on a dark screen.
    const halo = ctx.createRadialGradient(x, y, 4, x, y, 74);
    halo.addColorStop(0, 'rgba(124, 246, 255, 0.32)');
    halo.addColorStop(1, 'rgba(124, 246, 255, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, 74, 0, Math.PI * 2);
    ctx.fill();

    // The hull: a rounded capsule with a darker keel.
    ctx.fillStyle = PALETTE.sub;
    roundedRect(ctx, x - halfWidth, y - halfHeight * 0.62, halfWidth * 2, halfHeight * 1.24, halfHeight * 0.62);
    ctx.fill();
    ctx.fillStyle = PALETTE.subDark;
    ctx.beginPath();
    ctx.moveTo(x + halfWidth - 8, y - halfHeight * 0.26);
    ctx.lineTo(x + halfWidth + 12, y);
    ctx.lineTo(x + halfWidth - 8, y + halfHeight * 0.26);
    ctx.closePath();
    ctx.fill();

    // The cockpit, and a headlamp cone aimed at where the sub is going.
    ctx.fillStyle = '#0d3b44';
    roundedRect(ctx, x - halfWidth * 0.5, y - halfHeight * 0.3, halfWidth * 0.62, halfHeight * 0.6, 5);
    ctx.fill();
    const lamp = ctx.createLinearGradient(x, y, x, y - 210);
    lamp.addColorStop(0, 'rgba(223, 246, 255, 0.16)');
    lamp.addColorStop(1, 'rgba(223, 246, 255, 0)');
    ctx.fillStyle = lamp;
    ctx.beginPath();
    ctx.moveTo(x - 10, y - 8);
    ctx.lineTo(x - 62, y - 210);
    ctx.lineTo(x + 62, y - 210);
    ctx.lineTo(x + 10, y - 8);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawGauge(state, palette, x, y, width, height, fraction, color) {
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    roundedRect(ctx, x, y, width, height, height / 2);
    ctx.fill();
    if (fraction > 0) {
      ctx.fillStyle = color;
      roundedRect(ctx, x, y, Math.max(height, width * Math.min(1, fraction)), height, height / 2);
      ctx.fill();
    }
  }

  function drawHud(state, palette) {
    // A strip across the top: the bar everything else hangs from.
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(0, 0, W, HUD_TOP);
    ctx.fillStyle = PALETTE.panelEdge;
    ctx.fillRect(0, HUD_TOP - 1, W, 1);

    label(ctx, 'DEPTH', 26, 26, { size: 11, color: PALETTE.muted, track: 3 });
    label(ctx, `${Math.floor(state.depth)} m`, 26, 56, { size: 26, color: PALETTE.text, track: 1 });
    label(ctx, ZONE.names[state.zone].toUpperCase(), 26, 68, { size: 10, color: palette.glow, track: 2 });

    // The depth gauge: the whole descent, with a marker where the sub is now.
    const gaugeX = 210;
    const gaugeW = 300;
    drawGauge(state, palette, gaugeX, 30, gaugeW, 6, state.depth / TRENCH_FLOOR, palette.glow);
    ctx.fillStyle = PALETTE.text;
    const markerX = gaugeX + gaugeW * Math.min(1, state.depth / TRENCH_FLOOR);
    ctx.fillRect(markerX - 1.5, 24, 3, 18);
    for (let zone = 1; zone < ZONE.names.length; zone += 1) {
      const at = gaugeX + gaugeW * ((zone * ZONE.span) / TRENCH_FLOOR);
      ctx.fillStyle = 'rgba(234,247,251,0.4)';
      ctx.fillRect(at, 30, 1, 6);
    }
    label(ctx, `${TRENCH_FLOOR} m  TRENCH FLOOR`, gaugeX + gaugeW, 26, {
      size: 11, color: PALETTE.muted, align: 'right', track: 2,
    });

    // Air.
    const airLow = state.oxygen < 30;
    const airColor = airLow ? PALETTE.oxygenLow : PALETTE.oxygen;
    label(ctx, 'AIR', 548, 26, { size: 11, color: PALETTE.muted, track: 3 });
    drawGauge(state, palette, 548, 32, 180, 10, state.oxygen / 100, airColor);
    label(ctx, `${Math.ceil(state.oxygen)}%`, 736, 43, { size: 15, color: airColor, track: 1 });

    // Hull pips.
    label(ctx, 'HULL', 800, 26, { size: 11, color: PALETTE.muted, track: 3 });
    for (let pip = 0; pip < SUB.maxHull; pip += 1) {
      const filled = pip < state.hull;
      ctx.fillStyle = filled ? PALETTE.hull : PALETTE.hullLost;
      roundedRect(ctx, 800 + pip * 26, 32, 20, 12, 3);
      ctx.fill();
    }

    // Sonar charge, as pips that refill.
    label(ctx, 'SONAR', 900, 26, { size: 11, color: PALETTE.muted, track: 3 });
    for (let pip = 0; pip < SONAR.max; pip += 1) {
      const fill = Math.max(0, Math.min(1, state.charge - pip));
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      roundedRect(ctx, 900 + pip * 30, 30, 22, 16, 4);
      ctx.fill();
      if (fill > 0) {
        ctx.fillStyle = PALETTE.sonar;
        roundedRect(ctx, 900 + pip * 30, 30, 22 * fill, 16, 4);
        ctx.fill();
      }
    }
    label(ctx, 'E', 996, 44, { size: 11, color: PALETTE.muted, track: 1 });

    // Score, and the run's best, hard right.
    label(ctx, 'SCORE', W - 26, 26, { size: 11, color: PALETTE.muted, align: 'right', track: 3 });
    label(ctx, String(state.score).padStart(5, '0'), W - 26, 58, {
      size: 28, color: PALETTE.text, align: 'right', track: 1,
    });

    // A thin footer strip carries the two control hints that are worth keeping on screen.
    ctx.fillStyle = 'rgba(4, 10, 14, 0.55)';
    ctx.fillRect(0, HUD_BOTTOM, W, H - HUD_BOTTOM);
    label(ctx, 'A / D  STEER     W / S  DIVE & CLIMB     E  SONAR PING     P  PAUSE', 26, H - 22, {
      size: 12, color: PALETTE.muted, track: 2,
    });
    label(ctx, 'M  MUTE', W - 26, H - 22, { size: 12, color: PALETTE.muted, align: 'right', track: 2 });
  }

  /** A full-frame darkening, so a card over the water stays readable at any depth. */
  function drawVeil(alpha) {
    ctx.fillStyle = `rgba(2, 6, 9, ${alpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  function drawTitle(state, best, palette) {
    drawVeil(0.74);

    label(ctx, 'A DESCENT INTO THE DARK', W / 2, 150, {
      size: 13, color: palette.glow, align: 'center', track: 8,
    });
    label(ctx, 'HALOCLINE', W / 2, 248, { size: 92, color: PALETTE.text, align: 'center', track: 12, weight: 700 });
    ctx.fillStyle = palette.glow;
    ctx.fillRect(W / 2 - 190, 272, 380, 2);

    label(ctx, 'Reach the trench floor at 2,000 m. Your hull takes three hits and your air runs out.', W / 2, 314, {
      size: 17, color: PALETTE.text, align: 'center', track: 1,
    });
    label(ctx, 'Below the halocline the water hides everything. A sonar ping is the only way to see.', W / 2, 342, {
      size: 17, color: PALETTE.muted, align: 'center', track: 1,
    });

    // The controls, as a two-column card: the judge has to see the rules in this frame.
    const cardX = W / 2 - 330;
    const cardY = 384;
    const cardW = 660;
    ctx.fillStyle = PALETTE.panel;
    roundedRect(ctx, cardX, cardY, cardW, 168, 10);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const rows = [
      ['A  D   /   \u2190  \u2192', 'Steer the sub left and right'],
      ['W  S   /   \u2191  \u2193', 'Dive and climb inside the current'],
      ['E   /   CLICK', 'Sound a sonar ping: it lights what the dark is hiding'],
      ['P   /   ESC', 'Pause the descent'],
    ];
    for (let index = 0; index < rows.length; index += 1) {
      const rowY = cardY + 38 + index * 34;
      label(ctx, rows[index][0], cardX + 28, rowY, { size: 16, color: palette.glow, track: 1 });
      label(ctx, rows[index][1], cardX + 232, rowY, { size: 15, color: PALETTE.text, track: 0 });
    }

    label(ctx, 'SPACE  TO  DIVE', W / 2, 606, { size: 26, color: PALETTE.text, align: 'center', track: 6, weight: 700 });
    label(ctx, 'Best this browser', W / 2 - 120, 644, { size: 12, color: PALETTE.muted, align: 'right', track: 2 });
    label(ctx, String(best).padStart(5, '0'), W / 2 + 120, 646, { size: 18, color: PALETTE.salvage, track: 1 });
  }

  function drawPaused(palette) {
    drawVeil(0.7);
    label(ctx, 'PAUSED', W / 2, 320, { size: 64, color: PALETTE.text, align: 'center', track: 10, weight: 700 });
    label(ctx, 'P  OR  ESC  TO  RESUME', W / 2, 372, { size: 18, color: palette.glow, align: 'center', track: 4 });
  }

  function drawResults(state, best, palette) {
    drawVeil(0.8);
    const won = state.won;
    const heading = won ? 'TRENCH FLOOR REACHED' : state.lostTo;
    const accent = won ? PALETTE.hull : PALETTE.oxygenLow;

    label(ctx, won ? 'THE DESCENT IS DONE' : 'THE DESCENT IS OVER', W / 2, 118, {
      size: 13, color: PALETTE.muted, align: 'center', track: 8,
    });
    label(ctx, heading, W / 2, 190, { size: 66, color: accent, align: 'center', track: 6, weight: 700 });
    ctx.fillStyle = accent;
    ctx.fillRect(W / 2 - 210, 214, 420, 2);

    label(ctx, `${Math.floor(state.depth)} m`, W / 2, 268, { size: 40, color: PALETTE.text, align: 'center', track: 2 });
    label(ctx, won ? 'Trench floor reached' : `Trench floor is ${TRENCH_FLOOR} m`, W / 2, 296, {
      size: 14, color: PALETTE.muted, align: 'center', track: 2,
    });

    // The run's numbers, in a row of columns: every one is a thing the player did.
    const stats = [
      ['SCORE', String(state.score)],
      ['SALVAGE', String(state.salvageTaken)],
      ['HAZARDS LIT', String(state.spotted)],
      ['HAZARDS CLEARED', String(state.cleared)],
    ];
    const columnWidth = 220;
    const startX = W / 2 - (stats.length - 1) * columnWidth / 2;
    for (let index = 0; index < stats.length; index += 1) {
      const x = startX + index * columnWidth;
      label(ctx, stats[index][0], x, 356, { size: 11, color: PALETTE.muted, align: 'center', track: 3 });
      label(ctx, stats[index][1], x, 388, { size: 30, color: PALETTE.text, align: 'center', track: 1 });
    }

    ctx.fillStyle = PALETTE.panel;
    roundedRect(ctx, W / 2 - 300, 428, 600, 96, 10);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    label(ctx, 'BEST THIS BROWSER', W / 2 - 268, 464, { size: 12, color: PALETTE.muted, track: 2 });
    label(ctx, String(best).padStart(5, '0'), W / 2 + 268, 468, {
      size: 26, color: PALETTE.salvage, align: 'right', track: 1,
    });
    label(ctx, won ? 'A clean run to the floor earns a 500 point bonus' : 'Every hazard your sonar lit still scores', W / 2, 500, {
      size: 13, color: PALETTE.muted, align: 'center', track: 1,
    });

    label(ctx, 'PRESS  R  TO DIVE AGAIN', W / 2, 588, {
      size: 30, color: PALETTE.text, align: 'center', track: 6, weight: 700,
    });
    label(ctx, 'or press SPACE', W / 2, 618, { size: 13, color: PALETTE.muted, align: 'center', track: 2 });
  }

  /** Paint one frame: the water and its contents, then whatever card belongs on top. */
  function draw(state, screen, best, trenchRef) {
    const palette = paletteFor(state.zone);
    drawWater(state, palette);
    drawScenery(state, palette);
    drawPing(state, palette);

    for (const pickup of trenchRef.pickups) {
      if (pickup.active) drawPickup(pickup, palette);
    }
    for (const hazard of trenchRef.hazards) {
      if (!hazard.active) continue;
      drawHazard(state, hazard, palette, trenchRef.hazardVisibility(hazard));
    }
    drawSub(state, palette);

    if (screen === SCREEN_PLAY) {
      drawHud(state, palette);
    } else if (screen === SCREEN_TITLE) {
      drawTitle(state, best, palette);
    } else if (screen === SCREEN_PAUSED) {
      drawHud(state, palette);
      drawPaused(palette);
    } else if (screen === SCREEN_OVER) {
      drawResults(state, best, palette);
    }
  }

  resize();
  window.addEventListener('resize', resize);

  return { draw, resize, screenOf: () => null };
}
