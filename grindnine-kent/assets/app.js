(() => {
        'use strict';

        const $ = (s) => document.querySelector(s);
        const boardEl = $('#board');
        const padEl = $('#numberPad');

        const state = {
            puzzle: [],
            board: [],
            selected: null,
            notes: false,
            notesMap: {},
            incorrect: new Set(),
            locked: new Set(),
            mistakes: 0,
            maxMistakes: 5,
            elapsed: 0,
            running: false,
            paused: false,
            ended: false,
            timerId: null,
            level: 'easy',
            givens: new Set(),
            validationId: 0,
            hintsUsed: 0,
            maxHints: 3
        };

        const csrf = window.SUDOKU_CSRF;
        const symbols = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
        let toastTimer;

        // ========================================
        // PREMIUM SOUND SYSTEM
        // ========================================

        const SudokuSound = (() => {
            let audioContext = null;
            let enabled = true;

            function initializeAudio() {
                if (!enabled) return null;

                if (!audioContext) {
                    const AudioContextClass =
                        window.AudioContext || window.webkitAudioContext;

                    if (!AudioContextClass) return null;

                    audioContext = new AudioContextClass();
                }

                if (audioContext.state === 'suspended') {
                    audioContext.resume().catch(() => {});
                }

                return audioContext;
            }

            function tone(
                frequency,
                duration = 0.12,
                type = 'sine',
                volume = 0.08,
                delay = 0
            ) {
                if (!enabled) return;

                const ctx = initializeAudio();
                if (!ctx) return;

                const oscillator = ctx.createOscillator();
                const gain = ctx.createGain();

                const startTime = ctx.currentTime + delay;

                oscillator.type = type;
                oscillator.frequency.setValueAtTime(frequency, startTime);

                gain.gain.setValueAtTime(0.001, startTime);

                gain.gain.exponentialRampToValueAtTime(
                    volume,
                    startTime + 0.025
                );

                gain.gain.exponentialRampToValueAtTime(
                    0.001,
                    startTime + duration
                );

                oscillator.connect(gain);
                gain.connect(ctx.destination);

                oscillator.start(startTime);
                oscillator.stop(startTime + duration + 0.03);
            }

            return {
                click() {
                    tone(450, 0.07);
                },

                number() {
                    tone(620, 0.09);
                },

                correct() {
                    tone(850, 0.13);
                },

                wrong() {
                    tone(190, 0.20, 'triangle');
                },

                hint() {
                    tone(740, 0.16);
                    tone(980, 0.12, 'sine', 0.06, 0.12);
                },

                erase() {
                    tone(350, 0.09);
                },

                pause() {
                    tone(330, 0.12);
                },

                resume() {
                    tone(620, 0.12);
                },

                // PREMIUM TROPHY VICTORY SOUND
                win() {
                    if (!enabled) return;

                    // Opening celebration
                    tone(523.25, 0.25, 'sine', 0.13, 0);
                    tone(659.25, 0.25, 'sine', 0.13, 0.18);
                    tone(783.99, 0.30, 'sine', 0.14, 0.36);

                    // Grand victory melody
                    tone(1046.50, 0.45, 'sine', 0.15, 0.58);
                    tone(1318.51, 0.45, 'sine', 0.13, 0.85);
                    tone(1567.98, 0.70, 'sine', 0.12, 1.12);

                    // Final trophy sparkle
                    tone(2093.00, 0.35, 'sine', 0.08, 1.55);
                    tone(1567.98, 0.50, 'sine', 0.10, 1.75);
                },

                // TROPHY DROPPING SOUND
                drop() {
                    if (!enabled) return;

                    const frequency = 700 + Math.random() * 1000;

                    tone(
                        frequency,
                        0.18,
                        'sine',
                        0.045,
                        Math.random() * 0.15
                    );
                },

                // PREMIUM GAME-OVER SOUND
                lose() {
                    if (!enabled) return;

                    tone(392.00, 0.30, 'triangle', 0.13, 0);
                    tone(329.63, 0.35, 'triangle', 0.13, 0.25);
                    tone(261.63, 0.40, 'triangle', 0.13, 0.50);
                    tone(196.00, 0.75, 'triangle', 0.10, 0.75);
                },

                toggle() {
                    enabled = !enabled;
                    return enabled;
                },

                isEnabled() {
                    return enabled;
                }
            };
        })();

        // ========================================
        // PREMIUM STYLES
        // ========================================

        const extraStyle = document.createElement('style');

        extraStyle.textContent = `
        #pauseBtn {
            cursor: pointer;
            padding: 10px 17px;
            min-height: 42px;
            border: none;
            border-radius: 12px;
            background: linear-gradient(135deg, #8b5cf6, #6d28d9);
            color: #fff;
            font-size: 13px;
            font-weight: 800;
            letter-spacing: .4px;
            box-shadow: 0 5px 18px rgba(139,92,246,.25);
            transition: all .3s cubic-bezier(.2,.8,.2,1);
        }

        #pauseBtn:hover {
            transform: translateY(-3px);
            background: linear-gradient(135deg,#a78bfa,#7c3aed);
            box-shadow: 0 9px 25px rgba(139,92,246,.4);
        }

        #pauseBtn:active {
            transform: scale(.95);
        }

        #pauseBtn:disabled {
            opacity: .45;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }

        #pauseOverlay {
            position: fixed;
            inset: 0;
            z-index: 99999;
            display: none;
            align-items: center;
            justify-content: center;
            background: rgba(5,8,20,.82);
            backdrop-filter: blur(14px);
        }

        #pauseOverlay.show {
            display: flex;
            animation: pauseFade .3s ease;
        }

        .pause-card {
            width: min(90%,380px);
            padding: 40px 28px;
            text-align: center;
            border-radius: 25px;
            background: #171d32;
            color: white;
            border: 1px solid rgba(255,255,255,.15);
            box-shadow: 0 25px 80px rgba(0,0,0,.4);
            animation: pausePop .35s ease;
        }

        .pause-icon {
            font-size: 55px;
            margin-bottom: 15px;
        }

        .pause-card h2 {
            font-size: 28px;
            margin: 0 0 10px;
        }

        .pause-card p {
            color: #aab3ca;
            margin-bottom: 25px;
        }

        #resumeBtn {
            width: 100%;
            padding: 15px;
            border: none;
            border-radius: 13px;
            background: linear-gradient(135deg,#7c83ff,#a16bff);
            color: white;
            font-weight: 800;
            font-size: 15px;
            cursor: pointer;
            transition: .25s ease;
        }

        #resumeBtn:hover {
            transform: translateY(-3px);
            box-shadow: 0 10px 25px rgba(124,131,255,.3);
        }

        #numberPad .pad-key {
            position: relative;
            overflow: hidden;
            transition: all .22s ease;
        }

        #numberPad .pad-key .pad-count {
            position: absolute;
            right: 6px;
            bottom: 4px;
            font-size: 9px;
            line-height: 1;
            font-weight: 800;
            letter-spacing: .2px;
            opacity: .62;
            pointer-events: none;
        }

        #numberPad .pad-key.is-max {
            opacity: .58;
            cursor: not-allowed;
            border-color: rgba(167,139,250,.55) !important;
            background: linear-gradient(
                145deg,
                rgba(139,92,246,.22),
                rgba(79,70,229,.16)
            ) !important;
            box-shadow:
                inset 0 0 0 1px rgba(167,139,250,.12),
                0 0 12px rgba(139,92,246,.08) !important;
            transform: none !important;
        }

        #numberPad .pad-key.is-max .pad-count {
            color: #c4b5fd;
            opacity: 1;
        }

        #numberPad .pad-key .pad-max-label {
            display: none;
            position: absolute;
            top: 4px;
            right: 5px;
            padding: 2px 4px;
            border-radius: 5px;
            background: rgba(167,139,250,.2);
            color: #ddd0ff;
            font-size: 7px;
            line-height: 1.2;
            font-weight: 900;
            letter-spacing: .5px;
            pointer-events: none;
        }

        #numberPad .pad-key.is-max .pad-max-label {
            display: block;
        }

        #numberPad .pad-key.is-max:disabled {
            opacity: .58;
        }

        @keyframes pauseFade {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        @keyframes pausePop {
            from {
                opacity: 0;
                transform: scale(.88) translateY(15px);
            }
            to {
                opacity: 1;
                transform: scale(1) translateY(0);
            }
        }

        #gameOverOverlay {
            position: fixed;
            inset: 0;
            z-index: 100000;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 20px;
            background: rgba(5,8,20,.86);
            backdrop-filter: blur(15px);
        }

        #gameOverOverlay.show {
            display: flex;
            animation: gameOverFade .45s ease;
        }

        .game-over-card {
            position: relative;
            width: min(100%,410px);
            padding: 38px 30px;
            overflow: hidden;
            text-align: center;
            color: white;
            border: 1px solid rgba(248,113,113,.35);
            border-radius: 25px;
            background: linear-gradient(145deg,#22243b,#151a2e);
            box-shadow:
                0 25px 90px rgba(0,0,0,.5),
                0 0 45px rgba(239,68,68,.12);
            animation: gameOverPop .65s cubic-bezier(.2,.8,.2,1);
        }

        .game-over-card::before {
            content: "";
            position: absolute;
            top: -100px;
            left: 50%;
            width: 220px;
            height: 220px;
            transform: translateX(-50%);
            border-radius: 50%;
            background: rgba(239,68,68,.14);
            filter: blur(55px);
            pointer-events: none;
        }

        .game-over-icon {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 82px;
            height: 82px;
            margin: 0 auto 22px;
            border: 1px solid rgba(248,113,113,.4);
            border-radius: 50%;
            background: linear-gradient(145deg,#7f2938,#451e35);
            color: #ffb4b4;
            font-size: 38px;
            font-weight: 900;
            box-shadow: 0 0 30px rgba(239,68,68,.22);
            animation: gameOverIcon 1s ease;
        }

        .game-over-card h2 {
            position: relative;
            margin: 0 0 10px;
            font-size: 29px;
            font-weight: 900;
            letter-spacing: 1.5px;
            background: linear-gradient(90deg,#fecaca,#f87171,#fb7185);
            background-clip: text;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .game-over-card p {
            position: relative;
            margin: 0 0 24px;
            color: #b7bfd2;
            font-size: 14px;
            line-height: 1.7;
        }

        .game-over-stats {
            position: relative;
            display: flex;
            justify-content: center;
            gap: 12px;
            margin-bottom: 25px;
        }

        .game-over-stat {
            flex: 1;
            padding: 13px 8px;
            border: 1px solid rgba(255,255,255,.09);
            border-radius: 13px;
            background: rgba(255,255,255,.045);
        }

        .game-over-stat strong {
            display: block;
            color: #fff;
            font-size: 20px;
            font-weight: 850;
        }

        .game-over-stat span {
            display: block;
            margin-top: 5px;
            color: #9ca8c0;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 1px;
        }

        #tryAgainBtn {
            position: relative;
            width: 100%;
            min-height: 49px;
            border: 0;
            border-radius: 13px;
            background: linear-gradient(135deg,#ef4444,#be123c);
            color: white;
            font-size: 14px;
            font-weight: 850;
            letter-spacing: .6px;
            cursor: pointer;
            box-shadow: 0 8px 24px rgba(239,68,68,.24);
            transition: .3s ease;
        }

        #tryAgainBtn:hover {
            transform: translateY(-3px);
            box-shadow: 0 12px 30px rgba(239,68,68,.4);
            background: linear-gradient(135deg,#f87171,#e11d48);
        }

        #tryAgainBtn:active {
            transform: scale(.97);
        }

        @keyframes gameOverFade {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        @keyframes gameOverPop {
            0% {
                opacity: 0;
                transform: translateY(35px) scale(.85);
            }
            70% {
                transform: translateY(-5px) scale(1.02);
            }
            100% {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }

        @keyframes gameOverIcon {
            0% {
                transform: scale(.4) rotate(-25deg);
                opacity: 0;
            }
            70% {
                transform: scale(1.15) rotate(5deg);
                opacity: 1;
            }
            100% {
                transform: scale(1) rotate(0);
            }
        }

        .victory-rain {
            position: fixed;
            top: -60px;
            z-index: 100003;
            pointer-events: none;
            user-select: none;
            filter: drop-shadow(0 0 8px rgba(250,204,21,.55));
            animation: trophyRain linear forwards;
            will-change: transform, opacity;
        }

        .victory-confetti {
            position: fixed;
            top: -30px;
            z-index: 100002;
            pointer-events: none;
            border-radius: 3px;
            box-shadow: 0 0 8px rgba(250,204,21,.3);
            animation: confettiFall linear forwards;
            will-change: transform, opacity;
        }

        @keyframes trophyRain {
            0% {
                transform: translate3d(0,-5vh,0) rotate(0deg) scale(.6);
                opacity: 0;
            }
            12% {
                opacity: 1;
                transform: translate3d(15px,10vh,0) rotate(90deg) scale(1);
            }
            50% {
                transform: translate3d(-20px,55vh,0) rotate(240deg) scale(1.1);
                opacity: 1;
            }
            100% {
                transform: translate3d(25px,115vh,0) rotate(520deg) scale(.8);
                opacity: 0;
            }
        }

        @keyframes confettiFall {
            0% {
                transform: translate3d(0,-5vh,0) rotate(0deg);
                opacity: 0;
            }
            10% {
                opacity: 1;
            }
            100% {
                transform: translate3d(80px,115vh,0) rotate(900deg);
                opacity: 0;
            }
        }

        @media (prefers-reduced-motion: reduce) {
            #gameOverOverlay,
            .game-over-card,
            .game-over-icon,
            #pauseOverlay,
            .pause-card,
            .victory-rain,
            .victory-confetti {
                animation: none !important;
            }

            .victory-rain,
            .victory-confetti {
                display: none !important;
            }
        }
    `;

        extraStyle.textContent += `
    #board .cell.incorrect {
        background: rgba(239, 68, 68, 0.25) !important;
        border: 2px solid #ef4444 !important;
        color: #ff5555 !important;
        box-shadow: inset 0 0 12px rgba(239, 68, 68, 0.20) !important;
    }

    #board .cell.incorrect.selected {
        background: rgba(239, 68, 68, 0.35) !important;
        border: 2px solid #ff3333 !important;
        color: #ff5555 !important;
    }
`;
        extraStyle.textContent += `

/* =================================
   PERSONAL BEST — PREMIUM DESIGN
================================= */

.personal-best {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 22px;
    padding: 17px;
    border-radius: 17px;
    border: 1px solid rgba(250,204,21,.23);
    background:
        linear-gradient(
            120deg,
            rgba(250,204,21,.12),
            rgba(139,92,246,.09)
        );
    box-shadow:
        inset 0 1px 0 rgba(255,255,255,.04),
        0 8px 25px rgba(0,0,0,.12);
    transition: .3s ease;
}

.personal-best:hover {
    transform: translateY(-3px);
    border-color: rgba(250,204,21,.5);
    box-shadow: 0 10px 30px rgba(250,204,21,.09);
}

.best-left {
    display: flex;
    align-items: center;
    gap: 13px;
}

.best-icon {
    width: 43px;
    height: 43px;
    display: grid;
    place-items: center;
    border-radius: 13px;
    background: rgba(250,204,21,.14);
    font-size: 23px;
    box-shadow: 0 0 18px rgba(250,204,21,.12);
}

.best-label,
.best-right small {
    display: block;
    color: #a5aec2;
    font-size: 9px;
    font-weight: 850;
    letter-spacing: 1.3px;
}

#bestTime {
    display: block;
    margin-top: 4px;
    color: #facc15;
    font-size: 25px;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
    letter-spacing: 1px;
}

.best-right {
    text-align: right;
}

#bestLevel {
    display: block;
    margin-bottom: 5px;
    color: #c4b5fd;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 1px;
}

/* NEW RECORD BADGE */

.record-badge {
    width: fit-content;
    margin: 18px auto 10px;
    padding: 10px 17px;
    border: 1px solid rgba(250,204,21,.5);
    border-radius: 30px;
    background: rgba(250,204,21,.12);
    color: #facc15;
    font-size: 11px;
    font-weight: 950;
    letter-spacing: 1.5px;
    animation: recordGlow 1.5s ease-in-out infinite alternate;
}

.record-badge[hidden] {
    display: none;
}

@keyframes recordGlow {
    from {
        box-shadow: 0 0 5px rgba(250,204,21,.1);
        transform: scale(.96);
    }
    to {
        box-shadow: 0 0 25px rgba(250,204,21,.35);
        transform: scale(1.04);
    }
}

.personal-best.record-beaten {
    animation: bestCelebrate .7s ease;
    border-color: #facc15;
}

@keyframes bestCelebrate {
    0% { transform: scale(1); }
    40% {
        transform: scale(1.055);
        box-shadow: 0 0 35px rgba(250,204,21,.35);
    }
    100% { transform: scale(1); }
}

@media (prefers-reduced-motion: reduce) {
    .record-badge,
    .personal-best.record-beaten {
        animation: none !important;
    }
}
`;

        document.head.appendChild(extraStyle);

        // ========================================
        // PAUSE BUTTON AND OVERLAY
        // ========================================

        const pauseButton = document.createElement('button');
        pauseButton.id = 'pauseBtn';
        pauseButton.type = 'button';
        pauseButton.textContent = 'Ⅱ Pause';
        pauseButton.disabled = true;

        const newGameButton = $('#newGameBtn');
        const controlsCard = $('.controls-card');
        const toolGrid = $('.controls-card .tool-grid');

        // Place Pause with the gameplay tools, not beside the hidden New Game button.
        if (controlsCard && toolGrid) {
            controlsCard.insertBefore(pauseButton, toolGrid);
        } else if (newGameButton) {
            newGameButton.insertAdjacentElement('afterend', pauseButton);
        }

        const pauseOverlay = document.createElement('div');
        pauseOverlay.id = 'pauseOverlay';

        pauseOverlay.innerHTML = `
        <div class="pause-card">
            <div class="pause-icon">Ⅱ</div>
            <h2>Game Paused</h2>
            <p>Your progress is safe. Take your time.</p>
            <button id="resumeBtn" type="button">▶ Resume Game</button>
        </div>
    `;

        document.body.appendChild(pauseOverlay);

        // ========================================
        // GAME OVER OVERLAY
        // ========================================

        const gameOverOverlay = document.createElement('div');
        gameOverOverlay.id = 'gameOverOverlay';

        gameOverOverlay.innerHTML = `
        <div class="game-over-card">
            <div class="game-over-icon">!</div>
            <h2>GAME OVER</h2>
            <p>
                Your mistake limit has been reached.
                Every puzzle is another chance to improve!
            </p>

            <div class="game-over-stats">
                <div class="game-over-stat">
                    <strong id="gameOverMistakes">0</strong>
                    <span>MISTAKES</span>
                </div>

                <div class="game-over-stat">
                    <strong id="gameOverTime">00:00</strong>
                    <span>TIME PLAYED</span>
                </div>
            </div>

            <button id="tryAgainBtn" type="button">
                ↻ &nbsp; TRY AGAIN
            </button>
        </div>
    `;

        document.body.appendChild(gameOverOverlay);

        // ========================================
        // TOAST
        // ========================================

        function toast(message) {
            const el = $('#toast');
            if (!el) return;

            el.textContent = message;
            el.classList.add('show');

            clearTimeout(toastTimer);

            toastTimer = setTimeout(() => {
                el.classList.remove('show');
            }, 2300);
        }

        // ========================================
        // PREMIUM VICTORY CELEBRATION
        // ========================================

        function celebrateVictory() {
            // Play trophy dropping sounds
            let dropSoundCount = 0;

            const dropSoundInterval = setInterval(() => {
                if (dropSoundCount >= 15) {
                    clearInterval(dropSoundInterval);
                    return;
                }

                SudokuSound.drop();
                dropSoundCount++;
            }, 250);
            const effects = [
                '🏆', '🥇', '🏅', '⭐', '✨',
                '🎖️', '🌟', '💎', '🎉', '👑'
            ];

            const colors = [
                '#facc15',
                '#fde68a',
                '#bef264',
                '#86efac',
                '#c4b5fd',
                '#ffffff'
            ];

            for (let i = 0; i < 75; i++) {
                const piece = document.createElement('span');

                piece.className = 'victory-rain';
                piece.textContent =
                    effects[Math.floor(Math.random() * effects.length)];

                piece.style.left = `${Math.random() * 100}%`;
                piece.style.animationDelay = `${Math.random() * 2.5}s`;
                piece.style.animationDuration = `${3 + Math.random() * 3}s`;
                piece.style.fontSize = `${18 + Math.random() * 22}px`;

                document.body.appendChild(piece);

                setTimeout(() => piece.remove(), 7000);
            }

            for (let i = 0; i < 110; i++) {
                const piece = document.createElement('span');

                piece.className = 'victory-confetti';

                piece.style.left = `${Math.random() * 100}%`;
                piece.style.background =
                    colors[Math.floor(Math.random() * colors.length)];

                piece.style.width = `${5 + Math.random() * 8}px`;
                piece.style.height = `${9 + Math.random() * 12}px`;

                piece.style.animationDelay = `${Math.random() * 2}s`;
                piece.style.animationDuration = `${3 + Math.random() * 3}s`;

                document.body.appendChild(piece);

                setTimeout(() => piece.remove(), 7000);
            }
        }

        // ========================================
        // TIME FORMAT
        // ========================================
        // ========================================
        // PERSONAL BEST SYSTEM
        // ========================================

        function bestTimeKey() {
            return `gridNineBest_${state.level}`;
        }

        // Trophy progress is saved separately for each difficulty.
        const TROPHY_LEVELS = [
            { name: 'Bronze', icon: '🥉', className: 'bronze' },
            { name: 'Silver', icon: '🥈', className: 'silver' },
            { name: 'Gold', icon: '🥇', className: 'gold' },
            { name: 'Platinum', icon: '🏆', className: 'platinum' },
            { name: 'Diamond', icon: '💎', className: 'diamond' }
        ];

        function trophyKey() {
            return `gridNineTrophy_${state.level}`;
        }

        function getBestTime() {
            try {
                const saved = localStorage.getItem(bestTimeKey());
                return saved === null ? null : Number(saved);
            } catch (error) {
                return null;
            }
        }

        function getTrophyLevel() {
            try {
                const saved = Number(localStorage.getItem(trophyKey()));
                return Number.isFinite(saved) && saved > 0 ? saved : 0;
            } catch (error) {
                return 0;
            }
        }

        function getTrophyDetails(level = getTrophyLevel()) {
            if (level <= 0) {
                return {
                    name: 'No Trophy Yet',
                    icon: '🏆',
                    className: 'locked',
                    level: 0
                };
            }

            const trophy = TROPHY_LEVELS[
                Math.min(level, TROPHY_LEVELS.length) - 1
            ];

            const extraLevel = level > TROPHY_LEVELS.length ?
                ` ${level - TROPHY_LEVELS.length + 1}` :
                '';

            return {
                ...trophy,
                name: trophy.name + (trophy.name === 'Diamond' ? extraLevel : ''),
                level
            };
        }

        function updateTrophyUI() {
            const card = document.querySelector('.personal-best');
            if (!card) return;

            let trophy = card.querySelector('#personalBestTrophy');

            if (!trophy) {
                trophy = document.createElement('div');
                trophy.id = 'personalBestTrophy';
                trophy.className = 'personal-best-trophy';
                card.appendChild(trophy);
            }

            const details = getTrophyDetails();

            trophy.className =
                `personal-best-trophy trophy-${details.className}`;

            trophy.innerHTML = `
        <span class="trophy-art" aria-hidden="true">
            ${details.icon}
        </span>

        <span class="trophy-copy">
            <small>PERSONAL BEST TROPHY</small>
            <strong>${details.name}</strong>
            <em>
                ${details.level
                    ? `RECORD LEVEL ${details.level}`
                    : 'WIN A GAME TO UNLOCK'}
            </em>
        </span>
    `;

    trophy.setAttribute(
        'aria-label',
        details.level
            ? `${details.name} trophy, record level ${details.level}`
            : 'No trophy unlocked yet'
    );
}

function updateBestTimeUI() {
    const best = getBestTime();

    const bestTimeEl = $('#bestTime');
    const bestLevelEl = $('#bestLevel');

    if (bestTimeEl) {
        bestTimeEl.textContent =
            best === null ? '--:--' : fmtTime(best);
    }

    if (bestLevelEl) {
        bestLevelEl.textContent = state.level.toUpperCase();
    }

    updateTrophyUI();
}

function saveBestTime() {
    const previousBest = getBestTime();
    const previousTrophyLevel = getTrophyLevel();

    // Don't save if the player did not beat their record.
    if (previousBest !== null && state.elapsed >= previousBest) {
        return {
            isRecord: false,
            trophyUpgraded: false,
            trophy: getTrophyDetails()
        };
    }

    // Calculate trophy based on the new personal-best time.
    let nextTrophyLevel;

    if (state.elapsed < 180) {
        nextTrophyLevel = 5; // Diamond: under 3 minutes
    } else if (state.elapsed < 300) {
        nextTrophyLevel = 4; // Platinum: under 5 minutes
    } else if (state.elapsed < 480) {
        nextTrophyLevel = 3; // Gold: under 8 minutes
    } else if (state.elapsed < 720) {
        nextTrophyLevel = 2; // Silver: under 12 minutes
    } else {
        nextTrophyLevel = 1; // Bronze: 12 minutes or more
    }

    try {
        localStorage.setItem(
            bestTimeKey(),
            String(state.elapsed)
        );

        localStorage.setItem(
            trophyKey(),
            String(nextTrophyLevel)
        );

        updateTrophyUI();
        renderHomeAchievements();

        return {
            isRecord: true,
            trophyUpgraded: nextTrophyLevel > previousTrophyLevel,
            trophy: getTrophyDetails()
        };

    } catch (error) {
        console.warn('Unable to save personal best or trophy:', error);

        return {
            isRecord: false,
            trophyUpgraded: false,
            trophy: getTrophyDetails()
        };
    }



    updateBestTimeUI();

    // Animate the personal-best card.
    const card = document.querySelector('.personal-best');

    if (card) {
        card.classList.remove('record-beaten');
        void card.offsetWidth;
        card.classList.add('record-beaten');
    }

    // Animate the upgraded trophy.
    const trophyElement = $('#personalBestTrophy');

    if (trophyElement) {
        trophyElement.classList.remove('trophy-upgraded');
        void trophyElement.offsetWidth;
        trophyElement.classList.add('trophy-upgraded');
    }

    return {
        isRecord: true,
        trophyUpgraded: true,
        trophy: getTrophyDetails(nextTrophyLevel)
    };
}
    function fmtTime(s) {
        return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    }

    // ========================================
    // API
    // ========================================

    async function api(action, extra = {}) {
        const res = await fetch(
            window.SUDOKU_API || 'index.php?api=1', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    action,
                    csrf,
                    ...extra
                })
            }
        );

        const raw = await res.text();
        let data;

        try {
            data = JSON.parse(raw);
        } catch (err) {
            console.error('Invalid PHP response:', raw);
            throw new Error(
                'PHP returned an invalid response. Check your PHP error log.'
            );
        }

        if (!res.ok || !data.ok) {
            throw new Error(data.message || `Request failed (${res.status})`);
        }

        return data;
    }

    // ========================================
    // DIFFICULTY LIMITS
    // ========================================

    function updateDifficultyLimits() {
        const mistakeLimits = {
            easy: 5,
            medium: 5,
            hard: 7,
            expert: 7
        };

        const hintLimits = {
            easy: 3,
            medium: 6,
            hard: 9,
            expert: 12
        };

        const level = state.level.toLowerCase();

        state.maxMistakes = mistakeLimits[level] || 5;
        state.maxHints = hintLimits[level] || 3;
    }

    // ========================================
    // STATISTICS
    // ========================================

    function setStatus(text, type = '') {
        const el = $('#gameStatus');
        if (!el) return;

        el.textContent = text;
        el.className = 'status-chip ' + type;
    }

    function countFilled() {
        return state.board.flat().filter(v => v !== 0).length;
    }

    function updateStats() {
        const filled = countFilled();
        const progress = Math.round(filled / 81 * 100);

        $('#filledCount').textContent = filled;
        $('#mistakeCount').textContent =
            `${state.mistakes}/${state.maxMistakes}`;

        $('#progressPct').textContent = `${progress}%`;
        $('#progressFill').style.width = `${progress}%`;
    }

    function key(r, c) {
        return `${r}-${c}`;
    }

    // ========================================
    // NUMBER PAD MAXIMUM COUNTER
    // ========================================

    function getNumberCount(number) {
        let count = 0;

        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (state.board[r][c] === number) {
                    count++;
                }
            }
        }

        return count;
    }

function updatePadCounts() {
    if (!padEl) return;

    symbols.forEach(symbol => {
        const number = Number(symbol);
        const button = padEl.querySelector(
            `.pad-key[data-number="${number}"]`
        );

        if (!button) return;

        const count = getNumberCount(number);
        const isMax = count >= 9;

        const countLabel = button.querySelector('.pad-count');
        const maxLabel = button.querySelector('.pad-max-label');

        if (countLabel) {
    countLabel.textContent = isMax ? '🔒' : '';
}

        if (maxLabel) {
            maxLabel.style.display = 'none';
        }

        button.classList.toggle('is-max', isMax);
        button.disabled = isMax || state.paused || state.ended;

        button.setAttribute(
            'aria-label',
            isMax
                ? `Number ${number} is locked`
                : `Number ${number}, used ${count} out of 9 times`
        );

        button.title = isMax
            ? `Number ${number} is locked`
            : `Number ${number}: ${count}/9 used`;
    });
}

    // ========================================
    // HINT BUTTON
    // ========================================

    function updateHintButton() {
        const btn = $('#hintBtn');
        if (!btn) return;

        const remaining = Math.max(0, state.maxHints - state.hintsUsed);

        btn.disabled = remaining <= 0;

        btn.innerHTML = `
            <span>✦</span>
            Hint
            <small>${remaining}/${state.maxHints} LEFT</small>
        `;

        btn.classList.toggle('disabled', remaining <= 0);
    }

    // ========================================
    // RENDER BOARD
    // ========================================

    function renderBoard() {
        boardEl.innerHTML = '';

        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const v = state.board[r][c];
                const cell = document.createElement('button');
                const cellKey = key(r, c);

                cell.type = 'button';
                cell.className = 'cell';
                cell.setAttribute('role', 'gridcell');
                cell.dataset.r = r;
                cell.dataset.c = c;
                // Highlight incorrect answers in red
                if (state.incorrect.has(cellKey)) {
                    cell.classList.add('incorrect');
                }

                if (state.puzzle[r][c] !== 0) {
                    cell.classList.add('given');
                }

                if (
                    state.selected &&
                    state.selected.r === r &&
                    state.selected.c === c
                ) {
                    cell.classList.add('selected');
                }

                if (state.selected) {
                    const sr = state.selected.r;
                    const sc = state.selected.c;

                    if (
                        r === sr ||
                        c === sc ||
                        (
                            Math.floor(r / 3) === Math.floor(sr / 3) &&
                            Math.floor(c / 3) === Math.floor(sc / 3)
                        )
                    ) {
                        cell.classList.add('related');
                    }

                    if (v !== 0 && v === state.board[sr][sc]) {
                        cell.classList.add('same-number');
                    }
                }



                if (v !== 0) {
                    cell.textContent = v;

                    if (state.givens.has(cellKey)) {
                        cell.classList.add('fixed-number');
                    }
                } else {
                    cell.classList.add('empty-cell');

                    const cellNotes = state.notesMap[cellKey];

                    if (cellNotes && cellNotes.size > 0) {
                        const notes = document.createElement('span');
                        notes.className = 'notes';

                        for (let n = 1; n <= 9; n++) {
                            const item = document.createElement('i');
                            item.textContent = cellNotes.has(n) ? n : '';
                            notes.appendChild(item);
                        }

                        cell.appendChild(notes);
                    }
                }

                if (r === 2 || r === 5) {
                    cell.classList.add('box-bottom');
                }

                if (c === 2 || c === 5) {
                    cell.classList.add('box-right');
                }

                cell.addEventListener('click', () => {
                    if (state.paused || state.ended) return;

                    state.selected = { r, c };
                    SudokuSound.click();

                    if (v === 0) {
                        toast('Empty space selected! Choose a number from 1 to 9.');
                    }

                    renderBoard();
                });

                boardEl.appendChild(cell);
            }
        }

        updateStats();
        updatePadCounts();
    }

    // ========================================
    // NUMBER PAD
    // ========================================

    function renderPad() {
        padEl.innerHTML = '';

        symbols.forEach(n => {
            const b = document.createElement('button');

            b.className = 'pad-key';
            b.type = 'button';
            b.dataset.number = n;

            b.innerHTML = `
                <span class="pad-number">${n}</span>
<span class="pad-count"></span>
            `;

            b.addEventListener('click', () => {
                if (b.disabled) {
                    toast(`Number ${n} has already reached MAX (9/9).`);
                    return;
                }

                enterNumber(Number(n));
            });

            padEl.appendChild(b);
        });

        updatePadCounts();
    }

    // ========================================
    // SELECT EDITABLE CELL
    // ========================================

    function selectedEditable() {
        if (state.paused) {
            toast('Your game is paused. Resume to continue.');
            return false;
        }

        if (state.ended) return false;

        if (!state.selected) {
            toast('Select a square first.');
            return false;
        }

        const { r, c } = state.selected;
        const cellKey = key(r, c);

        if (state.puzzle[r][c] !== 0) {
            toast('That number is part of the puzzle.');
            return false;
        }

        if (state.locked.has(cellKey)) {
            toast('This answer is correct and locked!');
            return false;
        }

        return true;
    }

    // ========================================
    // ENTER NUMBER
    // ========================================

    async function enterNumber(n) {
        if (!selectedEditable()) return;

        const { r, c } = state.selected;
        const k = key(r, c);

        if (state.notes) {
            if (!state.notesMap[k]) {
                state.notesMap[k] = new Set();
            }

            if (state.notesMap[k].has(n)) {
                state.notesMap[k].delete(n);
            } else {
                state.notesMap[k].add(n);
            }

            SudokuSound.click();
            renderBoard();
            return;
        }

        const previous = state.board[r][c];

        state.board[r][c] = n;
        delete state.notesMap[k];
        state.incorrect.delete(k);

        const requestId = ++state.validationId;

        renderBoard();
        SudokuSound.number();

        try {
            const result = await api('validate_cell', {

                r,
                c,
                value: n
            });
            console.log('Sudoku validation:', result);

            if (
                requestId !== state.validationId ||
                state.board[r][c] !== n ||
                state.paused ||
                state.ended
            ) {
                return;
            }

            if (!result.correct) {
                state.incorrect.add(k);
                state.locked.delete(k);

                if (previous !== n) {
                    state.mistakes++;
                }

                setStatus('INCORRECT NUMBER', 'warning');
                toast('Incorrect number! Highlighted in red.');

                if (state.mistakes >= state.maxMistakes) {
                    renderBoard();
                    showGameOver();
                    return;
                }

                // Play normal error sound only if the game continues.
                SudokuSound.wrong();

            } else {
                state.incorrect.delete(k);
                state.locked.add(k);


                SudokuSound.correct();

                setStatus('LOOKING GOOD', 'success');
                toast('Correct number!');
            }

            renderBoard();

            if (!state.ended && countFilled() === 81) {
                await checkBoard(true);
            }

        } catch (error) {
            if (!state.paused) toast(error.message);
        }
    }

    // ========================================
    // ERASE
    // ========================================

    function eraseSelected() {
        if (!selectedEditable()) return;

        const { r, c } = state.selected;
        const k = key(r, c);

        state.board[r][c] = 0;

        delete state.notesMap[k];
        state.incorrect.delete(k);

        state.validationId++;

        SudokuSound.erase();
        renderBoard();
    }

    // ========================================
    // LEVEL DISPLAY
    // ========================================

    function updateLevel() {
        const levelTitle = $('#levelTitle');

        if (levelTitle) {
            levelTitle.textContent =
                state.level[0].toUpperCase() +
                state.level.slice(1) +
                ' mode';
        }
    }

    // ========================================
    // HOME SCREEN AND ACHIEVEMENTS
    // ========================================



function showHomeScreen() {
    const homeScreen = $('#homeScreen');
    const gameLayout = $('.game-layout');

    if (homeScreen) homeScreen.hidden = false;
    if (gameLayout) gameLayout.hidden = true;

    $('#backToHomeBtn')?.blur();
}

function showGameScreen() {
    const homeScreen = $('#homeScreen');
    const gameLayout = $('.game-layout');

    if (homeScreen) homeScreen.hidden = true;
    if (gameLayout) gameLayout.hidden = false;

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

    function renderHomeAchievements() {
        const levels = [
            { name: 'Bronze', icon: '🥉', threshold: '12+ minutes', level: 1 },
            { name: 'Silver', icon: '🥈', threshold: 'Under 12 min', level: 2 },
            { name: 'Gold', icon: '🥇', threshold: 'Under 8 min', level: 3 },
            { name: 'Platinum', icon: '🏆', threshold: 'Under 5 min', level: 4 },
            { name: 'Diamond', icon: '💎', threshold: 'Under 3 min', level: 5 }
        ];
        const unlocked = levels.some(item => {
            try {
                return ['easy', 'medium', 'hard', 'expert'].some(level =>
                    Number(localStorage.getItem(`gridNineTrophy_${level}`)) >= item.level
                );
            } catch (error) { return false; }
        });
        const grid = $('#achievementGrid');
        if (!grid) return;
        grid.innerHTML = levels.map(item => {
            let earned = false;
            try {
                earned = ['easy', 'medium', 'hard', 'expert'].some(level =>
                    Number(localStorage.getItem(`gridNineTrophy_${level}`)) >= item.level
                );
            } catch (error) {}
            return `<button class="achievement-item ${earned ? 'earned' : 'locked'}" type="button" aria-label="${item.name}: ${earned ? 'unlocked' : item.threshold}">
                <span>${item.icon}</span><strong>${item.name}</strong>
                <small>${earned ? 'UNLOCKED' : item.threshold}</small>
            </button>`;
        }).join('');
    }

    $('#startGameBtn').addEventListener('click', () => {
        $('#difficulty').value = $('#homeDifficulty').value;
        newGame();
    });

    $('#backToHomeBtn').addEventListener('click', () => {
        stopClock();
        pauseButton.disabled = true;
        showHomeScreen();
        renderHomeAchievements();
    });

    renderHomeAchievements();

    // Give each trophy card a small celebration animation when selected.
    $('#achievementGrid').addEventListener('click', (event) => {
        const item = event.target.closest('.achievement-item');
        if (!item) return;
        item.classList.remove('achievement-pop');
        void item.offsetWidth;
        item.classList.add('achievement-pop');
    });

    showHomeScreen();

    // ========================================
    // NEW GAME
    // ========================================

    async function newGame() {
        const btn = $('#newGameBtn');
        const startBtn = $('#startGameBtn');

        btn.disabled = true;
        if (startBtn) startBtn.disabled = true;
        btn.classList.add('loading');

        stopClock();

        try {
            const data = await api('new', {
                level: $('#difficulty').value
            });

            state.level = data.level.toLowerCase();

            updateDifficultyLimits();

            // Load the personal best for this difficulty.
            updateBestTimeUI();

            state.puzzle = data.puzzle;
            state.board = data.puzzle.map(row => row.slice());

            state.selected = null;
            state.notes = false;
            state.notesMap = {};
            state.incorrect = new Set();
            state.locked = new Set();
            state.mistakes = 0;
            state.elapsed = 0;
            state.paused = false;
            state.ended = false;
            state.validationId++;

            state.hintsUsed = 0;
            updateHintButton();

            state.givens = new Set();

            state.puzzle.forEach((row, r) => {
                row.forEach((v, c) => {
                    if (v !== 0) {
                        state.givens.add(key(r, c));
                    }
                });
            });

            $('#notesBtn').classList.remove('active');

            const notesLabel = $('#notesBtn small');
            if (notesLabel) notesLabel.textContent = 'OFF';

            $('#timer').textContent = '00:00';

            updateLevel();
            updateStats();

            setStatus('READY TO PLAY');

            $('#winModal').classList.remove('open');
            gameOverOverlay.classList.remove('show');
            pauseOverlay.classList.remove('show');

            pauseButton.textContent = 'Ⅱ Pause';

            renderBoard();
            updatePadCounts();
            showGameScreen();
            startClock();

            SudokuSound.click();

            toast(`New ${state.level} puzzle ready · ${data.clues} clues`);

        } catch (error) {
            toast(error.message);

        } finally {
            btn.disabled = false;
            if (startBtn) startBtn.disabled = false;
            btn.classList.remove('loading');
        }
    }

    // ========================================
    // CHECK BOARD
    // ========================================

    async function checkBoard(auto = false) {
        if (state.paused || state.ended) return;

        try {
            const data = await api('check', {
                board: state.board
            });

            if (state.paused || state.ended) return;

            // STEP G: Identify incorrect answers
            const wrongKeys = new Set(
                data.wrong.map(({ r, c }) => key(r, c))
            );

            state.incorrect = wrongKeys;

            // Lock all correct player-entered answers
            for (let r = 0; r < 9; r++) {
                for (let c = 0; c < 9; c++) {
                    const cellKey = key(r, c);

                    if (
                        state.puzzle[r][c] === 0 &&
                        state.board[r][c] !== 0 &&
                        !wrongKeys.has(cellKey)
                    ) {
                        state.locked.add(cellKey);
                    }
                }
            }

            renderBoard();

            if (data.wrong.length) {
                if (!auto) state.mistakes++;

                updateStats();
                setStatus('CHECK YOUR NUMBERS', 'warning');

                toast(
                    data.wrong.length === 1 ?
                    '1 incorrect entry found.' :
                    `${data.wrong.length} incorrect entries found.`
                );

                if (state.mistakes >= state.maxMistakes) {
                    showGameOver();
                } else {
                    SudokuSound.wrong();
                }
                       } else if (data.complete) {
                state.ended = true;
                stopClock();

                // Save the result and check whether the player earned a new record.
                const recordResult = saveBestTime();
                const newRecord = recordResult.isRecord;

                // Victory sound.
                SudokuSound.win();

                setStatus(
                    newRecord ? 'NEW PERSONAL RECORD!' : 'COMPLETED',
                    'success'
                );

                // Show completion time.
                $('#finalTime').textContent = fmtTime(state.elapsed);

                // Display the new-record badge.
                const recordBadge = $('#recordBadge');

                if (recordBadge) {
                    recordBadge.hidden = !newRecord;
                }

                // Display trophy in victory modal.
                const modal = document.querySelector('#winModal .modal');

                if (modal) {
                    let modalTrophy = modal.querySelector('#winTrophyResult');

                    if (!modalTrophy) {
                        modalTrophy = document.createElement('div');
                        modalTrophy.id = 'winTrophyResult';
                        modalTrophy.className = 'win-trophy-result';

                        const timeElement = $('#finalTime');

                        if (timeElement) {
                            timeElement.insertAdjacentElement(
                                'beforebegin',
                                modalTrophy
                            );
                        } else {
                            modal.appendChild(modalTrophy);
                        }
                    }

                    const trophy = recordResult.trophy;

                    modalTrophy.className =
                        `win-trophy-result trophy-${trophy.className}` +
                        (newRecord ? ' trophy-upgraded' : '');

                    modalTrophy.innerHTML = `
                        <span class="win-trophy-icon" aria-hidden="true">
                            ${trophy.icon}
                        </span>

                        <span>
                            <small>
                                ${newRecord
                                    ? 'NEW PERSONAL RECORD!'
                                    : 'CURRENT TROPHY'}
                            </small>

                            <strong>${trophy.name}</strong>

                            <em>
                                ${newRecord
                                    ? 'YOUR TROPHY HAS BEEN UPGRADED'
                                    : 'BEAT YOUR BEST TIME TO UPGRADE'}
                            </em>
                        </span>
                    `;
                }

                // Open victory modal.
                $('#winModal').classList.add('open');

                // Full celebration.
                celebrateVictory();

                if (newRecord) {
                    toast(
                        `🏆 NEW RECORD! ${recordResult.trophy.name} TROPHY UNLOCKED!`
                    );
                } else {
                    toast(
                        '🏆 Congratulations! Beat your best time to upgrade your trophy.'
                    );
                }

            } else {
                setStatus('LOOKING GOOD', 'success');

                toast(
                    auto ?
                    'All filled numbers are correct.' :
                    'No incorrect numbers so far.'
                );
            }

        } catch (error) {
            toast(error.message);
        }
    }

    // ========================================
    // HINT SYSTEM
    // ========================================

    async function hint() {
        if (!selectedEditable()) return;

        if (state.hintsUsed >= state.maxHints) {
            toast(`You have used all ${state.maxHints} hints!`);
            updateHintButton();
            return;
        }

        const { r, c } = state.selected;
        const k = key(r, c);
        const requestId = state.validationId;

        try {
            const data = await api('hint', { r, c });

            if (
                state.paused ||
                state.ended ||
                requestId !== state.validationId ||
                !state.selected ||
                state.selected.r !== r ||
                state.selected.c !== c
            ) {
                return;
            }

            state.board[r][c] = data.value;
            state.locked.add(k);

            delete state.notesMap[k];
            state.incorrect.delete(k);

            state.hintsUsed++;

            updateHintButton();
            renderBoard();

            SudokuSound.hint();

            const remaining = state.maxHints - state.hintsUsed;

            toast(
                remaining > 0 ?
                `Hint used! ${remaining} hints remaining.` :
                'You have used all your hints!'
            );

            if (countFilled() === 81) {
                await checkBoard(true);
            }

        } catch (error) {
            toast(error.message);
        }
    }

    // ========================================
    // NOTES
    // ========================================

    function toggleNotes() {
        if (state.paused || state.ended) return;

        state.notes = !state.notes;

        $('#notesBtn').classList.toggle('active', state.notes);

        const notesLabel = $('#notesBtn small');
        if (notesLabel) {
            notesLabel.textContent = state.notes ? 'ON' : 'OFF';
        }

        SudokuSound.click();

        toast(
            state.notes ?
            'Notes mode enabled.' :
            'Notes mode disabled.'
        );
    }

    // ========================================
    // GAME OVER
    // ========================================

    function showGameOver() {
        if (state.ended) return;

        state.ended = true;
        stopClock();

        setStatus('GAME OVER', 'warning');

        $('#gameOverMistakes').textContent =
            `${state.mistakes}/${state.maxMistakes}`;

        $('#gameOverTime').textContent = fmtTime(state.elapsed);

        gameOverOverlay.classList.add('show');

        updatePadCounts();

        // Play the dedicated game-over melody.
        SudokuSound.lose();
    }

    $('#tryAgainBtn').addEventListener('click', () => {
        gameOverOverlay.classList.remove('show');
        newGame();
    });

    // ========================================
    // PAUSE AND RESUME
    // ========================================

    function pauseGame() {
        if (!state.running || state.ended || state.paused) return;

        state.paused = true;
        state.running = false;

        clearInterval(state.timerId);

        pauseOverlay.classList.add('show');
        pauseButton.textContent = '▶ Resume';

        updatePadCounts();
        SudokuSound.pause();
    }


    function resumeGame() {
        if (!state.paused || state.ended) return;

        state.paused = false;
        state.running = true;

        pauseOverlay.classList.remove('show');
        pauseButton.textContent = 'Ⅱ Pause';

        clearInterval(state.timerId);

        state.timerId = setInterval(() => {
            if (!state.running || state.paused || state.ended) return;

            state.elapsed++;
            $('#timer').textContent = fmtTime(state.elapsed);
        }, 1000);

        updatePadCounts();
        SudokuSound.resume();
    }


    pauseButton.addEventListener('click', () => {
        if (state.paused) {
            resumeGame();
        } else {
            pauseGame();
        }
    });

    $('#resumeBtn').addEventListener('click', resumeGame);

    // ========================================
    // BUTTON EVENTS
    // ========================================

    $('#newGameBtn').addEventListener('click', newGame);
    $('#playAgainBtn').addEventListener('click', newGame);
    $('#notesBtn').addEventListener('click', toggleNotes);
    $('#eraseBtn').addEventListener('click', eraseSelected);
    $('#hintBtn').addEventListener('click', hint);
    $('#checkBtn').addEventListener('click', () => checkBoard(false));

    // ========================================
    // AUTOMATIC DIFFICULTY CHANGE
    // ========================================

    $('#difficulty').addEventListener('change', async() => {
        const difficulty = $('#difficulty').value.toLowerCase();
        state.level = difficulty;
        $('#homeDifficulty').value = difficulty;
        await newGame();
    });

    // ========================================
    // TIMER
    // ========================================

    function startClock() {
        clearInterval(state.timerId);

        state.paused = false;
        state.running = true;

        pauseOverlay.classList.remove('show');
        pauseButton.textContent = 'Ⅱ Pause';
        pauseButton.disabled = false;

        state.timerId = setInterval(() => {
            if (!state.running || state.paused || state.ended) return;

            state.elapsed++;
            $('#timer').textContent = fmtTime(state.elapsed);
        }, 1000);
    }

    function stopClock() {
        state.running = false;
        state.paused = false;

        clearInterval(state.timerId);

        pauseOverlay.classList.remove('show');
        pauseButton.textContent = 'Ⅱ Pause';
        pauseButton.disabled = true;
    }

    // ========================================
    // THEME
    // ========================================

    $('#themeBtn').addEventListener('click', () => {
        document.body.classList.toggle('light');

        localStorage.setItem(
            'sudoku-theme',
            document.body.classList.contains('light') ? 'light' : 'dark'
        );

        SudokuSound.click();
    });

    if (localStorage.getItem('sudoku-theme') === 'light') {
        document.body.classList.add('light');
    }

    // ========================================
    // KEYBOARD CONTROLS
    // ========================================

    document.addEventListener('keydown', e => {
        if (state.paused || state.ended) return;

        if (e.target.matches('input, textarea, select')) return;

        if (e.key >= '1' && e.key <= '9') {
            enterNumber(Number(e.key));

        } else if (e.key === 'Backspace' || e.key === 'Delete') {
            eraseSelected();

        } else if (e.key === 'Escape') {
            state.selected = null;
            renderBoard();

        } else if (e.key === 'n' || e.key === 'N') {
            toggleNotes();

        } else if (e.key.startsWith('Arrow') && state.selected) {
            e.preventDefault();

            let { r, c } = state.selected;

            if (e.key === 'ArrowUp') r = (r + 8) % 9;
            if (e.key === 'ArrowDown') r = (r + 1) % 9;
            if (e.key === 'ArrowLeft') c = (c + 8) % 9;
            if (e.key === 'ArrowRight') c = (c + 1) % 9;

            state.selected = { r, c };

            SudokuSound.click();
            renderBoard();
        }
    });

    // ========================================
    // SOUND BUTTON
    // ========================================

    const soundButton = $('#soundToggle');

    if (soundButton) {
        soundButton.addEventListener('click', () => {
            const enabled = SudokuSound.toggle();

            soundButton.textContent = enabled ? '🔊' : '🔇';
            soundButton.title = enabled ? 'Sound On' : 'Sound Off';
        });
    }

    // ========================================
    // TODAY LABEL
    // ========================================

    if ($('#todayLabel')) {
        $('#todayLabel').textContent =
            new Intl.DateTimeFormat(undefined, {
                weekday: 'long',
                month: 'short',
                day: 'numeric'
            }).format(new Date()).toUpperCase();
    }

    // ========================================
    // INITIALIZE GAME
    // ========================================

    renderPad();
    updateDifficultyLimits();
    updateHintButton();

})();