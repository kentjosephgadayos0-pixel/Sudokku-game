<?php
declare(strict_types=1);
ob_start();
session_start();

/*
 * PREMIUM SUDOKU — GRID/NINE
 * - Every generated puzzle has exactly one solution.
 * - Solution remains in the PHP session.
 * - Difficulty controls the target number of clues.
 * - Includes an integrated sound system.
 */

function pattern(int $r, int $c): int {
    return ($r * 3 + intdiv($r, 3) + $c) % 9;
}

function shuffled(array $items): array {
    shuffle($items);
    return $items;
}

function makeSolvedGrid(): array {
    $groups = [0,1,2];
    $rows = [];

    foreach (shuffled($groups) as $g) {
        foreach (shuffled([0,1,2]) as $r) {
            $rows[] = $g * 3 + $r;
        }
    }

    $cols = [];

    foreach (shuffled($groups) as $g) {
        foreach (shuffled([0,1,2]) as $c) {
            $cols[] = $g * 3 + $c;
        }
    }

    $digits = shuffled([1,2,3,4,5,6,7,8,9]);
    $grid = [];

    foreach ($rows as $r) {
        $line = [];

        foreach ($cols as $c) {
            $line[] = $digits[pattern($r, $c)];
        }

        $grid[] = $line;
    }

    return $grid;
}

function countSolutions(array $grid, int $limit = 2): int {
    $row = array_fill(0, 9, 0);
    $col = array_fill(0, 9, 0);
    $box = array_fill(0, 9, 0);

    for ($r = 0; $r < 9; $r++) {
        for ($c = 0; $c < 9; $c++) {
            $v = (int)$grid[$r][$c];

            if ($v === 0) continue;

            $bit = 1 << $v;
            $b = intdiv($r, 3) * 3 + intdiv($c, 3);

            if (($row[$r] & $bit) ||
                ($col[$c] & $bit) ||
                ($box[$b] & $bit)) {
                return 0;
            }

            $row[$r] |= $bit;
            $col[$c] |= $bit;
            $box[$b] |= $bit;
        }
    }

    $found = 0;

    $search = function() use (
        &$search, &$grid, &$row, &$col, &$box, &$found, $limit
    ): void {
        if ($found >= $limit) return;

        $bestR = -1;
        $bestC = -1;
        $bestMask = 0;
        $bestCount = 10;

        for ($r = 0; $r < 9; $r++) {
            for ($c = 0; $c < 9; $c++) {
                if ($grid[$r][$c] !== 0) continue;

                $b = intdiv($r, 3) * 3 + intdiv($c, 3);
                $mask = 0;

                for ($v = 1; $v <= 9; $v++) {
                    $bit = 1 << $v;

                    if (!(($row[$r] | $col[$c] | $box[$b]) & $bit)) {
                        $mask |= $bit;
                    }
                }

                $n = 0;

                for ($m = $mask; $m; $m &= ($m - 1)) {
                    $n++;
                }

                if ($n === 0) return;

                if ($n < $bestCount) {
                    $bestCount = $n;
                    $bestR = $r;
                    $bestC = $c;
                    $bestMask = $mask;

                    if ($n === 1) break 2;
                }
            }
        }

        if ($bestR === -1) {
            $found++;
            return;
        }

        $b = intdiv($bestR, 3) * 3 + intdiv($bestC, 3);

        for ($v = 1; $v <= 9 && $found < $limit; $v++) {
            $bit = 1 << $v;

            if (!($bestMask & $bit)) continue;

            $grid[$bestR][$bestC] = $v;
            $row[$bestR] |= $bit;
            $col[$bestC] |= $bit;
            $box[$b] |= $bit;

            $search();

            $row[$bestR] ^= $bit;
            $col[$bestC] ^= $bit;
            $box[$b] ^= $bit;
            $grid[$bestR][$bestC] = 0;
        }
    };

    $search();

    return $found;
}

function createPuzzle(string $level): array {
    $targets = [
        'easy' => 40,
        'medium' => 34,
        'hard' => 25,
        'expert' => 18,
    ];

    $target = $targets[$level] ?? 40;

    for ($attempt = 0; $attempt < 5; $attempt++) {
        $solution = makeSolvedGrid();
        $puzzle = $solution;

        $cells = range(0, 80);
        shuffle($cells);

        foreach ($cells as $cell) {
            $r = intdiv($cell, 9);
            $c = $cell % 9;

            $old = $puzzle[$r][$c];
            $puzzle[$r][$c] = 0;

            if (countSolutions($puzzle, 2) !== 1) {
                $puzzle[$r][$c] = $old;
            }

            $clues = 0;

            foreach ($puzzle as $line) {
                foreach ($line as $v) {
                    if ($v !== 0) $clues++;
                }
            }

            if ($clues <= $target) break;
        }

        $clues = 0;

        foreach ($puzzle as $line) {
            foreach ($line as $v) {
                if ($v !== 0) $clues++;
            }
        }

        if (countSolutions($puzzle, 2) === 1) {
            return [$puzzle, $solution, $clues];
        }
    }

    $solution = makeSolvedGrid();
    $puzzle = $solution;
    $cells = range(0, 80);
    shuffle($cells);

    foreach ($cells as $cell) {
        $r = intdiv($cell, 9);
        $c = $cell % 9;

        $old = $puzzle[$r][$c];
        $puzzle[$r][$c] = 0;

        if (countSolutions($puzzle, 2) !== 1) {
            $puzzle[$r][$c] = $old;
        }
    }

    $clues = 0;

    foreach ($puzzle as $line) {
        foreach ($line as $v) {
            if ($v !== 0) $clues++;
        }
    }

    return [$puzzle, $solution, $clues];
}

function sendJson(array $data, int $status = 200): void {
    while (ob_get_level() > 0) {
        ob_end_clean();
    }

    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');

    echo json_encode($data);
    exit;
}

if (!isset($_SESSION['sudoku_csrf'])) {
    $_SESSION['sudoku_csrf'] = bin2hex(random_bytes(32));
}

/* API */

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_GET['api'])) {
    $body = json_decode(file_get_contents('php://input'), true) ?? [];

    if (!hash_equals(
        $_SESSION['sudoku_csrf'],
        (string)($body['csrf'] ?? '')
    )) {
        sendJson([
            'ok' => false,
            'message' => 'Session expired. Refresh and try again.'
        ], 403);
    }

    $action = (string)($body['action'] ?? '');

    if ($action === 'new') {
        $level = (string)($body['level'] ?? 'easy');

        if (!in_array($level, ['easy','medium','hard','expert'], true)) {
            $level = 'easy';
        }

        [$puzzle, $solution, $clues] = createPuzzle($level);

        $_SESSION['sudoku_game'] = [
            'puzzle' => $puzzle,
            'solution' => $solution,
            'level' => $level
        ];

        sendJson([
            'ok' => true,
            'puzzle' => $puzzle,
            'level' => $level,
            'clues' => $clues
        ]);
    }

    $game = $_SESSION['sudoku_game'] ?? null;

    if (!$game) {
        sendJson([
            'ok' => false,
            'message' => 'Start a new game first.'
        ], 400);
    }

    if ($action === 'check') {
        $board = $body['board'] ?? null;

        if (!is_array($board) || count($board) !== 9) {
            sendJson(['ok' => false, 'message' => 'Invalid board.'], 400);
        }

        $wrong = [];
        $filled = 0;
        $correct = 0;

        for ($r = 0; $r < 9; $r++) {
            if (!is_array($board[$r]) || count($board[$r]) !== 9) {
                sendJson(['ok' => false, 'message' => 'Invalid board.'], 400);
            }

            for ($c = 0; $c < 9; $c++) {
                $v = (int)$board[$r][$c];

                if ($v !== 0) {
                    $filled++;

                    if ($v === (int)$game['solution'][$r][$c]) {
                        $correct++;
                    } else {
                        $wrong[] = ['r' => $r, 'c' => $c];
                    }
                }
            }
        }

        sendJson([
            'ok' => true,
            'wrong' => $wrong,
            'filled' => $filled,
            'correct' => $correct,
            'complete' => count($wrong) === 0 && $filled === 81
        ]);
    }

    if ($action === 'validate_cell') {
        $r = (int)($body['r'] ?? -1);
        $c = (int)($body['c'] ?? -1);
        $value = (int)($body['value'] ?? 0);

        if ($r < 0 || $r > 8 || $c < 0 || $c > 8 ||
            $value < 1 || $value > 9) {
            sendJson(['ok' => false, 'message' => 'Invalid cell value.'], 400);
        }

        if ((int)$game['puzzle'][$r][$c] !== 0) {
            sendJson(['ok' => false, 'message' => 'That cell is a fixed clue.'], 400);
        }

        sendJson([
            'ok' => true,
            'correct' => $value === (int)$game['solution'][$r][$c]
        ]);
    }

    if ($action === 'hint') {
        $r = (int)($body['r'] ?? -1);
        $c = (int)($body['c'] ?? -1);

        if ($r < 0 || $r > 8 || $c < 0 || $c > 8) {
            sendJson(['ok' => false, 'message' => 'Choose a cell first.'], 400);
        }

        if ((int)$game['puzzle'][$r][$c] !== 0) {
            sendJson(['ok' => false, 'message' => 'That cell is already given.'], 400);
        }

        sendJson([
            'ok' => true,
            'value' => $game['solution'][$r][$c]
        ]);
    }

    if ($action === 'solution') {
        sendJson([
            'ok' => true,
            'solution' => $game['solution']
        ]);
    }

    sendJson(['ok' => false, 'message' => 'Unknown action.'], 400);
}

$csrf = htmlspecialchars($_SESSION['sudoku_csrf'], ENT_QUOTES, 'UTF-8');
?>

<!doctype html>
<html lang="en">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#101522">

    <title>Sudoku — The Daily Grid</title>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

    <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap"
        rel="stylesheet">

    <link rel="stylesheet" href="assets/style.css">

    <style>
    /* BRAND NAME AND CREATOR */
    .brand-name-wrap {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        line-height: 1.1;
    }

    .brand-credit {
        font-size: 10px;
        font-weight: 500;
        letter-spacing: 1.2px;
        color: var(--muted);
        margin-top: 4px;
        opacity: 0.8;
    }

    /* SOUND BUTTON */

    #soundToggle {
        cursor: pointer;
        transition: transform .25s ease, background .25s ease, box-shadow .25s ease;
    }

    #soundToggle:hover {
        transform: scale(1.12);
        box-shadow: 0 0 18px rgba(120, 150, 255, .35);
    }

    #soundToggle:active {
        transform: scale(.92);
    }

    /* COMPACT, CENTERED HOME PAGE — MATCH THE GAME BOARD SCALE */
    .home-screen {
        width: min(780px, 100%);
        margin: 0 auto;
        padding: 22px 0 28px;
    }

    .home-hero {
        min-height: 142px;
        margin-bottom: 16px;
        padding: 22px 28px;
        justify-content: center;
        text-align: center;
        border-radius: 18px;
    }

    .home-hero .hero-copy {
        width: 100%;
        text-align: center;
    }

    .home-hero h2 {
        margin: 7px 0 8px;
        font-size: clamp(27px, 3.5vw, 36px);
        letter-spacing: -1.4px;
    }

    .home-hero .subline {
        margin: 0 auto;
        font-size: 12px;
    }

    .hero-stamp {
        position: absolute;
        right: 22px;
        width: 76px;
        height: 76px;
        flex-basis: 76px;
        border-radius: 18px;
    }

    .stamp-number {
        font-size: 39px;
    }

    .stamp-caption {
        font-size: 6px;
        margin-top: 5px;
    }

    .home-grid {
        width: 100%;
        gap: 14px;
    }

    .home-start-card,
    .achievements-card {
        width: 100%;
        padding: 19px 22px;
        border-radius: 17px;
    }

    .start-card-top,
    .card-heading {
        justify-content: center;
        text-align: center;
    }

    .home-start-card h3,
    .achievements-card h3 {
        margin: 9px 0 5px;
        font-size: 25px;
        text-align: center;
    }

    .start-description,
    .achievement-intro {
        margin: 0 auto 15px;
        max-width: 540px;
        font-size: 11px;
        line-height: 1.55;
        text-align: center;
    }

    .home-start-card .select-label {
        display: block;
        max-width: 420px;
        margin: 0 auto 7px;
        text-align: left;
        font-size: 9px;
    }

    .home-start-card select {
        display: block;
        width: min(420px, 100%);
        height: 43px;
        margin: 0 auto;
        font-size: 12px;
    }

    #startGameBtn {
        width: min(420px, 100%);
        min-height: 48px;
        margin: 10px auto 0;
        padding: 0 15px;
        border-radius: 11px;
        font-size: 12px;
    }

    #startGameBtn b {
        font-size: 17px;
    }

    .home-hint {
        margin: 10px auto 0;
        font-size: 9px;
        text-align: center;
    }

    .achievement-intro {
        margin-top: 7px;
        margin-bottom: 0;
    }

    .sparkle {
        font-size: 19px;
    }

    .achievement-grid {
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 9px;
        margin-top: 15px;
    }

    .achievement-item {
        min-height: 105px;
        gap: 5px;
        padding: 11px 5px;
        border-radius: 12px;
    }

    .achievement-item span {
        font-size: 26px;
    }

    .achievement-item strong {
        font-size: 10px;
    }

    .achievement-item small {
        font-size: 7px;
        letter-spacing: .4px;
    }

    @media (max-width: 760px) {
        .home-screen {
            width: min(620px, 100%);
            padding-top: 18px;
        }

        .home-hero {
            min-height: 125px;
            padding: 20px 18px;
        }

        .hero-stamp {
            width: 62px;
            height: 62px;
            right: 14px;
        }

        .stamp-number {
            font-size: 32px;
        }

        .stamp-caption {
            font-size: 5px;
        }

        .home-hero h2 {
            font-size: clamp(24px, 5vw, 32px);
        }

        .home-start-card,
        .achievements-card {
            padding: 17px;
        }
    }

    @media (max-width: 520px) {
        .home-screen {
            width: 100%;
            padding-top: 14px;
        }

        .home-hero {
            min-height: 0;
            padding: 22px 16px;
        }

        .hero-stamp {
            display: none;
        }

        .home-hero .hero-copy {
            max-width: 100%;
        }

        .home-hero h2 {
            font-size: 27px;
        }

        .start-card-top {
            flex-direction: column;
            gap: 7px;
        }

        .achievement-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
        }

        .achievement-item {
            min-height: 96px;
        }
    }

    @media (max-width: 360px) {
        .achievement-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }
    </style>
</head>

<body>

    <div class="ambient ambient-one"></div>
    <div class="ambient ambient-two"></div>

    <main class="app-shell">

        <header class="topbar">

            <a class="brand" href="#">
                <span class="brand-mark">
                    <span></span><span></span><span></span><span></span>
                </span>
                <span class="brand-name-wrap">
                    <span>GRID<span class="brand-light">/NINE</span></span>
                    <small class="brand-credit">Created by Kent</small>
                </span>
            </a>

            <button class="lobby-btn top-home-btn" id="backToHomeBtn" type="button" aria-label="Back to home">
                &lt;
            </button>
            <div class="top-actions">

                <div class="quiet-moment">
                    <span class="live-pill">
                        <i></i> YOUR QUIET MOMENT
                    </span>

                    <div class="date-chip">
                        <span class="date-dot"></span>
                        <span id="todayLabel">DAILY PRACTICE</span>
                    </div>
                </div>

                <button class="icon-btn" id="themeBtn" aria-label="Toggle theme" title="Toggle theme">
                    ☼
                </button>

                <button class="icon-btn" id="soundToggle" aria-label="Toggle sound" title="Sound On">
                    🔊
                </button>

            </div>

        </header>


        <section class="home-screen" id="homeScreen">
            <div class="home-hero welcome-hero">
                <div class="welcome-content">
                    <p class="welcome-label">WELCOME TO</p>
                    <h2 class="welcome-brand">
                        GRID<span>/NINE</span>
                    </h2>
                    <div class="welcome-line"></div>
                    <p class="welcome-caption">THE ART OF LOGIC</p>
                </div>
            </div>

            <div class="home-grid">
                <section class="side-card home-start-card">
                    <span class="section-kicker">START A NEW GAME</span>
                    <label class="select-label" for="homeDifficulty">CHOOSE DIFFICULTY</label>
                    <select id="homeDifficulty">
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                        <option value="expert">Expert</option>
                    </select>
                    <button class="primary-btn" id="startGameBtn" type="button">
                        <span>Create a new game</span><b>↗</b>
                    </button>
                    <p class="home-hint">Your best times and trophies are saved on this device.</p>
                </section>

                <section class="side-card achievements-card">
                    <div class="card-heading">
                        <span class="section-kicker">YOUR ACHIEVEMENTS</span>
                        <span class="sparkle">✦</span>
                    </div>
                    <div class="achievement-grid" id="achievementGrid">
                        <div class="achievement-item"><span>🥉</span><strong>Bronze</strong><small>12+ minutes</small>
                        </div>
                        <div class="achievement-item"><span>🥈</span><strong>Silver</strong><small>Under 12 min</small>
                        </div>
                        <div class="achievement-item"><span>🥇</span><strong>Gold</strong><small>Under 8 min</small>
                        </div>
                        <div class="achievement-item"><span>🏆</span><strong>Platinum</strong><small>Under 5 min</small>
                        </div>
                        <div class="achievement-item"><span>💎</span><strong>Diamond</strong><small>Under 3 min</small>
                        </div>
                    </div>
                    <p class="home-hint">Earn a trophy by setting a personal best in any difficulty.</p>
                </section>
            </div>
        </section>

        <section class="game-layout" hidden>

            <div class="board-panel">

                <div class="board-head">

                    <div>
                        <span class="section-kicker">CURRENT PUZZLE</span>
                        <h2 id="levelTitle">Easy mode</h2>
                    </div>

                    <div class="status-chip" id="gameStatus">
                        READY TO PLAY
                    </div>
                </div>

                <div class="board-wrap">
                    <div class="board" id="board" role="grid" aria-label="Sudoku board">
                    </div>

                    <div class="board-glow"></div>
                </div>

                <div class="number-pad" id="numberPad" aria-label="Number pad">
                </div>

                <div class="board-footer">
                    <span><kbd>1–9</kbd> enter number</span>
                    <span><kbd>⌫</kbd> erase</span>
                    <span><kbd>Esc</kbd> clear selection</span>
                </div>

            </div>

            <aside class="side-panel">

                <div class="side-card">

                    <div class="card-heading">
                        <span class="section-kicker">YOUR SESSION</span>
                        <span class="sparkle">✦</span>
                    </div>

                    <div class="timer" id="timer">00:00</div>
                    <div class="timer-caption">TIME ELAPSED</div>

                    <div class="stats-row">
                        <div>
                            <strong id="filledCount">0</strong>
                            <span>FILLED</span>
                        </div>

                        <div>
                            <strong id="mistakeCount">0/3</strong>
                            <span>MISTAKES</span>
                        </div>

                        <div>
                            <strong id="progressPct">0%</strong>
                            <span>PROGRESS</span>
                        </div>
                    </div>

                    <div class="progress-track">
                        <div class="progress-fill" id="progressFill"></div>
                    </div>

                    <!-- PERSONAL BEST -->
                    <div class="personal-best">
                        <div class="best-left">
                            <div class="best-icon">🏆</div>
                            <div>
                                <span class="best-label">PERSONAL BEST</span>
                                <strong id="bestTime">--:--</strong>
                            </div>
                        </div>

                        <div class="best-right">
                            <span id="bestLevel">EASY</span>
                            <small>FASTEST TIME</small>
                        </div>
                    </div>

                </div>

                <div class="side-card controls-card">

                    <div class="card-heading">
                        <span class="section-kicker">GAME CONTROLS</span>
                    </div>

                    <label class="select-label" for="difficulty">
                        DIFFICULTY
                    </label>

                    <select id="difficulty">
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                        <option value="expert">Expert</option>
                    </select>

                    <button class="primary-btn" id="newGameBtn">
                        <span>New game</span><b>↗</b>
                    </button>

                    <div class="tool-grid">

                        <button class="tool-btn" id="notesBtn">
                            <span class="tool-icon">✎</span>
                            <span>Notes</span>
                            <small>OFF</small>
                        </button>

                        <button class="tool-btn" id="eraseBtn">
                            <span class="tool-icon">⌫</span>
                            <span>Erase</span>
                        </button>

                        <button class="tool-btn" id="hintBtn">
                            <span class="tool-icon">✧</span>
                            <span>Hint</span>
                        </button>

                        <button class="tool-btn" id="checkBtn">
                            <span class="tool-icon">✓</span>
                            <span>Check</span>
                        </button>



            </aside>
            < </section>
                < <footer class="footer">
                    <span>GRID/NINE <span class="footer-muted">· A CLASSIC, REFINED.</span></span>
                    <span>MADE FOR A MOMENT OF FOCUS</span>
                    </footer>

    </main>

    <div class="toast" id="toast" role="status"></div>

    <div class="modal-backdrop" id="winModal">

        <div class="modal">

            <div class="win-icon">✦</div>

            <p class="eyebrow">PUZZLE COMPLETE</p>

            <h2>Beautifully <em>solved.</em></h2>

            <p>You completed the grid. Take that win with you.</p>

            <div id="recordBadge" class="record-badge" hidden>
                ✦ NEW PERSONAL RECORD ✦
            </div>

            <div class="modal-time" id="finalTime">00:00</div>

            <button class="primary-btn" id="playAgainBtn">
                Play another game <b>↗</b>
            </button>

        </div>

    </div>

    <script>
    window.SUDOKU_CSRF = <?= json_encode($_SESSION['sudoku_csrf']) ?>;
    window.SUDOKU_API = <?= json_encode($_SERVER['SCRIPT_NAME'] . '?api=1') ?>;

    /* ==========================================
       PREMIUM SUDOKU SOUND SYSTEM
    ========================================== */

    window.SudokuSound = (() => {

        let audioContext = null;
        let enabled = true;

        function playTone(frequency, duration = 0.12, type = 'sine', volume = 0.07) {

            if (!enabled) return;

            try {

                const AudioContext =
                    window.AudioContext || window.webkitAudioContext;

                if (!AudioContext) return;

                if (!audioContext) {
                    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                    audioContext = new AudioContextClass();
                }

                if (audioContext.state === 'suspended') {
                    audioContext.resume();
                }

                const oscillator = audioContext.createOscillator();
                const gain = audioContext.createGain();

                oscillator.type = type;
                oscillator.frequency.setValueAtTime(
                    frequency,
                    audioContext.currentTime
                );

                gain.gain.setValueAtTime(
                    volume,
                    audioContext.currentTime
                );

                gain.gain.exponentialRampToValueAtTime(
                    0.001,
                    audioContext.currentTime + duration
                );

                oscillator.connect(gain);
                gain.connect(audioContext.destination);

                oscillator.start();
                oscillator.stop(audioContext.currentTime + duration);

            } catch (error) {
                console.warn('Sound unavailable:', error);
            }
        }

        return {

            click() {
                playTone(450, 0.07);
            },

            number() {
                playTone(620, 0.09);
            },

            correct() {
                playTone(850, 0.13);
            },

            wrong() {
                playTone(190, 0.20, 'triangle');
            },

            hint() {
                playTone(740, 0.16);
            },

            erase() {
                playTone(320, 0.08);
            },

            win() {
                playTone(523, 0.18);
                setTimeout(() => playTone(659, 0.18), 180);
                setTimeout(() => playTone(784, 0.30), 360);
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

    /* SOUND BUTTON */

    document.addEventListener('DOMContentLoaded', () => {

        const soundButton = document.getElementById('soundToggle');

        if (!soundButton) return;

        soundButton.addEventListener('click', () => {

            const enabled = window.SudokuSound.toggle();

            soundButton.textContent = enabled ? '🔊' : '🔇';
            soundButton.title = enabled ? 'Sound On' : 'Sound Off';
            soundButton.setAttribute(
                'aria-label',
                enabled ? 'Turn sound off' : 'Turn sound on'
            );

            if (enabled) {
                window.SudokuSound.click();
            }

        });

    });
    </script>

    <script src="assets/app.js" defer></script>

</body>

</html>