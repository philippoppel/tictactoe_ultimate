// Globale Variablen
let peer = null;
let conn = null;
let isHost = false;
let mySymbol = '';
let opponentSymbol = '';
let isMyTurn = false;
let gameMode = '';
let reconnectAttempts = 0;
let gameStateBackup = null;
let peerIdBackup = null;
let lastHeartbeat = Date.now();
let heartbeatInterval = null;
let reconnectTimer = null;

let currentPlayer = 'X';
let activeBoard = null;
let boards = Array(9).fill(null).map(() => Array(9).fill(''));
let boardWinners = Array(9).fill(null);
let gameWon = false;

const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
];

// Netzwerk-Status Überwachung
let isOnline = navigator.onLine;
let offlineMoves = [];

// Hilfsfunktionen
function generateGameCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Speichere Spielzustand
function saveGameState() {
    gameStateBackup = {
        currentPlayer,
        activeBoard,
        boards: boards.map(board => [...board]),
        boardWinners: [...boardWinners],
        gameWon,
        isMyTurn,
        mySymbol,
        opponentSymbol,
        gameMode,
        isHost,
        peerIdBackup
    };

    // Speichere im localStorage für Seiten-Refresh
    if (gameMode === 'online') {
        localStorage.setItem('ultimateTTT_gameState', JSON.stringify(gameStateBackup));
    }
}

// Stelle Spielzustand wieder her
function restoreGameState() {
    const savedState = localStorage.getItem('ultimateTTT_gameState');
    if (savedState) {
        try {
            gameStateBackup = JSON.parse(savedState);
            currentPlayer = gameStateBackup.currentPlayer;
            activeBoard = gameStateBackup.activeBoard;
            boards = gameStateBackup.boards;
            boardWinners = gameStateBackup.boardWinners;
            gameWon = gameStateBackup.gameWon;
            isMyTurn = gameStateBackup.isMyTurn;
            mySymbol = gameStateBackup.mySymbol;
            opponentSymbol = gameStateBackup.opponentSymbol;
            gameMode = gameStateBackup.gameMode;
            isHost = gameStateBackup.isHost;
            peerIdBackup = gameStateBackup.peerIdBackup;
            return true;
        } catch (e) {
            console.error('Fehler beim Wiederherstellen:', e);
            localStorage.removeItem('ultimateTTT_gameState');
        }
    }
    return false;
}

// Heartbeat für Verbindungsstabilität
function startHeartbeat() {
    heartbeatInterval = setInterval(() => {
        if (conn && conn.open) {
            conn.send({ type: 'heartbeat', timestamp: Date.now() });
        }
    }, 3000);
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

// Automatischer Reconnect
function attemptReconnect() {
    if (!isOnline) {
        console.log('Warte auf Internetverbindung...');
        return;
    }

    updateNetworkStatus();

    if (reconnectAttempts >= 5) {
        document.getElementById('connectionStatus').innerHTML = '❌ Verbindung verloren. <button onclick="manualReconnect()" class="mini-button">Erneut verbinden</button>';
        return;
    }

    reconnectAttempts++;
    document.getElementById('connectionStatus').textContent = `🔄 Verbinde neu... (Versuch ${reconnectAttempts}/5)`;

    if (isHost && peerIdBackup) {
        peer = createPeerWithFallback(peerIdBackup);

        peer.on('open', (id) => {
            console.log('Host wieder verbunden mit ID:', id);
            document.getElementById('gameCode').textContent = id;
        });

        peer.on('connection', (connection) => {
            conn = connection;
            setupConnection();
            conn.send({ type: 'sync', gameState: gameStateBackup });
        });
    } else if (!isHost && peerIdBackup) {
        peer = createPeerWithFallback();

        peer.on('open', () => {
            conn = peer.connect(peerIdBackup);
            setupConnection();
        });
    }

    reconnectTimer = setTimeout(() => {
        if (!conn || !conn.open) {
            attemptReconnect();
        }
    }, 3000);
}

function manualReconnect() {
    reconnectAttempts = 0;
    attemptReconnect();
}

// Erweiterte PeerJS-Konfiguration
function createPeerWithFallback(id = null) {
    const iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        {
            urls: 'turn:numb.viagenie.ca',
            credential: 'muazkh',
            username: 'webrtc@live.com'
        }
    ];

    return new Peer(id, {
        debug: 2,
        config: {
            iceServers: iceServers,
            iceCandidatePoolSize: 10
        },
        reliable: true,
        pingInterval: 5000,
        peerConnectTimeout: 15000
    });
}

// Netzwerk-Status Update
function updateNetworkStatus() {
    const indicator = document.getElementById('networkStatus');
    const banner = document.getElementById('offlineBanner');

    if (!isOnline) {
        indicator.classList.add('offline');
        indicator.classList.remove('reconnecting');
        banner.classList.add('show');
    } else if (reconnectAttempts > 0) {
        indicator.classList.add('reconnecting');
        indicator.classList.remove('offline');
        banner.classList.remove('show');
    } else {
        indicator.classList.remove('offline', 'reconnecting');
        banner.classList.remove('show');
    }
}

// Connection Management
function showHostPanel() {
    gameMode = 'online';
    document.getElementById('modeSelector').classList.add('hidden');
    document.getElementById('connectionPanel').classList.remove('hidden');
    document.getElementById('hostSection').classList.remove('hidden');
    document.getElementById('connectionTitle').textContent = '🎮 Spiel erstellen';

    const gameCode = generateGameCode();
    peerIdBackup = gameCode;

    peer = createPeerWithFallback(gameCode);

    peer.on('open', (id) => {
        document.getElementById('gameCode').textContent = id;
        console.log('Game code:', id);
    });

    peer.on('connection', (connection) => {
        conn = connection;
        setupConnection();
        isHost = true;
        mySymbol = 'X';
        opponentSymbol = 'O';
        isMyTurn = true;
    });

    peer.on('error', (err) => {
        console.error('Peer error:', err);
        if (err.type === 'unavailable-id') {
            const newCode = generateGameCode();
            peerIdBackup = newCode;
            peer = createPeerWithFallback(newCode);
        } else if (err.type === 'browser-incompatible') {
            alert('Dein Browser unterstützt keine P2P-Verbindungen. Bitte verwende einen modernen Browser.');
        } else if (err.type === 'network') {
            document.getElementById('connectionStatus').textContent = '⚠️ Netzwerkfehler - Überprüfe deine Internetverbindung';
        }
    });

    peer.on('disconnected', () => {
        console.log('Peer disconnected');
        updateNetworkStatus();
        if (!reconnectTimer && isOnline) {
            attemptReconnect();
        }
    });
}

function showJoinPanel() {
    gameMode = 'online';
    document.getElementById('modeSelector').classList.add('hidden');
    document.getElementById('connectionPanel').classList.remove('hidden');
    document.getElementById('joinSection').classList.remove('hidden');
    document.getElementById('connectionTitle').textContent = '🔗 Spiel beitreten';
}

function joinGame() {
    const code = document.getElementById('joinCode').value.toUpperCase();
    if (!code) {
        alert('Bitte gib einen Spiel-Code ein!');
        return;
    }

    peerIdBackup = code;

    peer = createPeerWithFallback();

    peer.on('open', () => {
        conn = peer.connect(code, {
            reliable: true,
            serialization: 'json'
        });

        const connectionTimeout = setTimeout(() => {
            if (!conn || !conn.open) {
                document.getElementById('connectionStatus').textContent = '❌ Verbindung fehlgeschlagen - Code überprüfen';
                peer.destroy();
            }
        }, 10000);

        conn.on('open', () => {
            clearTimeout(connectionTimeout);
        });

        setupConnection();
        isHost = false;
        mySymbol = 'O';
        opponentSymbol = 'X';
        isMyTurn = false;
    });

    peer.on('error', (err) => {
        console.error('Peer error:', err);
        if (err.type === 'peer-unavailable') {
            document.getElementById('connectionStatus').textContent = '❌ Spiel-Code nicht gefunden';
        } else {
            document.getElementById('connectionStatus').textContent = '❌ Fehler: ' + err.type;
        }
    });

    peer.on('disconnected', () => {
        console.log('Peer disconnected');
        updateNetworkStatus();
        if (!reconnectTimer && isOnline) {
            attemptReconnect();
        }
    });
}

function setupConnection() {
    conn.on('open', () => {
        document.getElementById('connectionStatus').textContent = '✅ Verbunden!';
        document.getElementById('connectionStatus').classList.add('connected');
        reconnectAttempts = 0;
        startHeartbeat();
        startOnlineGame();

        if (gameStateBackup && gameStateBackup.boards) {
            if (isHost) {
                conn.send({ type: 'sync', gameState: gameStateBackup });
            }
        }
    });

    conn.on('data', (data) => {
        if (data.type === 'move') {
            receiveMove(data.boardIndex, data.cellIndex);
            saveGameState();
        } else if (data.type === 'reset') {
            resetGame();
        } else if (data.type === 'heartbeat') {
            lastHeartbeat = Date.now();
        } else if (data.type === 'sync') {
            if (data.gameState) {
                restoreSyncedState(data.gameState);
            }
        }
    });

    conn.on('close', () => {
        document.getElementById('connectionStatus').textContent = '⚠️ Verbindung unterbrochen...';
        document.getElementById('connectionStatus').classList.remove('connected');
        stopHeartbeat();

        if (!reconnectTimer && !gameWon) {
            reconnectTimer = setTimeout(() => {
                attemptReconnect();
            }, 1000);
        }
    });

    conn.on('error', (err) => {
        console.error('Connection error:', err);
    });
}

function restoreSyncedState(syncedState) {
    currentPlayer = syncedState.currentPlayer;
    activeBoard = syncedState.activeBoard;
    boards = syncedState.boards;
    boardWinners = syncedState.boardWinners;
    gameWon = syncedState.gameWon;

    document.getElementById('currentPlayer').textContent = currentPlayer;
    initGame();

    for (let boardIndex = 0; boardIndex < 9; boardIndex++) {
        for (let cellIndex = 0; cellIndex < 9; cellIndex++) {
            if (boards[boardIndex][cellIndex]) {
                const cell = document.getElementById(`cell-${boardIndex}-${cellIndex}`);
                cell.textContent = boards[boardIndex][cellIndex];
                cell.classList.add(boards[boardIndex][cellIndex]);
                cell.disabled = true;
            }
        }

        if (boardWinners[boardIndex]) {
            const smallBoard = document.getElementById(`board-${boardIndex}`);
            smallBoard.classList.add(`won-${boardWinners[boardIndex]}`);

            const winnerSymbol = document.createElement('div');
            winnerSymbol.className = 'board-winner';
            winnerSymbol.textContent = boardWinners[boardIndex];
            winnerSymbol.style.color = boardWinners[boardIndex] === 'X' ? '#60a5fa' : '#f87171';
            smallBoard.appendChild(winnerSymbol);
            disableSmallBoard(boardIndex);
        }
    }

    updateActiveBoards();
    updateTurnIndicator();

    if (gameWon) {
        const winnerText = currentPlayer === mySymbol ? '🎉 Du hast gewonnen! 🎉' : '😔 Dein Gegner hat gewonnen!';
        document.getElementById('winnerMessage').textContent = winnerText;
        disableAllBoards();
    }
}

// Game Functions
function startOnlineGame() {
    document.getElementById('connectionPanel').classList.add('hidden');
    document.getElementById('gameInfo').classList.remove('hidden');
    document.getElementById('ultimateBoard').classList.add('active');
    document.getElementById('gameButtons').classList.remove('hidden');

    document.getElementById('playerSymbol').textContent = mySymbol;
    document.getElementById('playerSymbol').style.color = mySymbol === 'X' ? '#60a5fa' : '#f87171';

    initGame();
    updateTurnIndicator();
}

function startComputerGame() {
    gameMode = 'computer';
    document.getElementById('modeSelector').classList.add('hidden');
    document.getElementById('gameInfo').classList.remove('hidden');
    document.getElementById('ultimateBoard').classList.add('active');
    document.getElementById('gameButtons').classList.remove('hidden');

    document.getElementById('playerSymbol').textContent = 'X (Du)';
    document.getElementById('playerSymbol').style.color = '#60a5fa';

    mySymbol = 'X';
    opponentSymbol = 'O';
    isMyTurn = true;

    initGame();
}

function initGame() {
    const gameBoard = document.getElementById('gameBoard');
    gameBoard.innerHTML = '';

    for (let boardIndex = 0; boardIndex < 9; boardIndex++) {
        const smallBoard = document.createElement('div');
        smallBoard.className = 'small-board';
        smallBoard.id = `board-${boardIndex}`;

        const smallGrid = document.createElement('div');
        smallGrid.className = 'small-grid';

        for (let cellIndex = 0; cellIndex < 9; cellIndex++) {
            const cell = document.createElement('button');
            cell.className = 'cell';
            cell.onclick = () => makeMove(boardIndex, cellIndex);
            cell.id = `cell-${boardIndex}-${cellIndex}`;
            smallGrid.appendChild(cell);
        }

        smallBoard.appendChild(smallGrid);
        gameBoard.appendChild(smallBoard);
    }
    updateActiveBoards();
    if (gameMode === 'online') {
        updateTurnIndicator();
    } else {
        updateBoardHint();
    }
}

function makeMove(boardIndex, cellIndex) {
    if (gameWon || boards[boardIndex][cellIndex] || boardWinners[boardIndex]) return;
    if (activeBoard !== null && activeBoard !== boardIndex) return;

    if (gameMode === 'online') {
        if (!isMyTurn || currentPlayer !== mySymbol) return;

        if (!isOnline) {
            offlineMoves.push({ type: 'move', boardIndex, cellIndex });
        } else if (conn && conn.open) {
            conn.send({ type: 'move', boardIndex, cellIndex });
        }
    } else if (gameMode === 'computer') {
        if (currentPlayer !== mySymbol) return;
    }

    executeMove(boardIndex, cellIndex);
}

function receiveMove(boardIndex, cellIndex) {
    executeMove(boardIndex, cellIndex);
}

function executeMove(boardIndex, cellIndex) {
    boards[boardIndex][cellIndex] = currentPlayer;
    const cell = document.getElementById(`cell-${boardIndex}-${cellIndex}`);
    cell.textContent = currentPlayer;
    cell.classList.add(currentPlayer);
    cell.disabled = true;

    saveGameState();

    if (checkSmallBoardWin(boardIndex, currentPlayer)) {
        boardWinners[boardIndex] = currentPlayer;
        const smallBoard = document.getElementById(`board-${boardIndex}`);
        smallBoard.classList.add(`won-${currentPlayer}`);

        const winnerSymbol = document.createElement('div');
        winnerSymbol.className = 'board-winner';
        winnerSymbol.textContent = currentPlayer;
        winnerSymbol.style.color = currentPlayer === 'X' ? '#60a5fa' : '#f87171';
        smallBoard.appendChild(winnerSymbol);
        disableSmallBoard(boardIndex);

        if (checkUltimateWin(currentPlayer)) {
            gameWon = true;
            const winnerText = gameMode === 'online'
                ? (currentPlayer === mySymbol ? '🎉 Du hast gewonnen! 🎉' : '😔 Dein Gegner hat gewonnen!')
                : (currentPlayer === mySymbol ? '🎉 Du hast gewonnen! 🎉' : '🤖 Die KI hat gewonnen!');
            document.getElementById('winnerMessage').textContent = winnerText;
            disableAllBoards();
            localStorage.removeItem('ultimateTTT_gameState');
            return;
        }
    }

    if (checkDraw()) {
        gameWon = true;
        document.getElementById('winnerMessage').textContent = '🤝 Unentschieden!';
        localStorage.removeItem('ultimateTTT_gameState');
        return;
    }

    currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
    document.getElementById('currentPlayer').textContent = currentPlayer;

    activeBoard = boardWinners[cellIndex] !== null || isBoardFull(cellIndex) ? null : cellIndex;

    updateActiveBoards();

    if (gameMode === 'online') {
        isMyTurn = !isMyTurn;
        updateTurnIndicator();
    } else {
        isMyTurn = !isMyTurn;
        updateBoardHint();
        if (!isMyTurn && !gameWon) {
            document.getElementById('ultimateBoard').style.pointerEvents = 'none';
            setTimeout(() => {
                makeComputerMove();
                document.getElementById('ultimateBoard').style.pointerEvents = 'auto';
            }, 300);
        }
    }
}

// Computer AI
function makeComputerMove() {
    if (gameWon) return;

    const searchDepth = 6;
    let bestMove = { score: -Infinity, move: null };
    const availableMoves = getAvailableMoves();

    if (availableMoves.length === 0) return;
    if (availableMoves.length === 1) {
        bestMove.move = availableMoves[0];
    } else {
        for (const move of availableMoves) {
            boards[move.boardIndex][move.cellIndex] = opponentSymbol;
            const oldWinner = boardWinners[move.boardIndex];
            if (checkSmallBoardWin(move.boardIndex, opponentSymbol)) {
                boardWinners[move.boardIndex] = opponentSymbol;
            }

            const score = minimax(searchDepth, false, -Infinity, Infinity, move);

            boards[move.boardIndex][move.cellIndex] = '';
            boardWinners[move.boardIndex] = oldWinner;

            if (score > bestMove.score) {
                bestMove.score = score;
                bestMove.move = move;
            }
        }
    }

    if (!bestMove.move) {
        bestMove.move = availableMoves[Math.floor(Math.random() * availableMoves.length)];
    }

    executeMove(bestMove.move.boardIndex, bestMove.move.cellIndex);
}

function minimax(depth, isMaximizing, alpha, beta, lastMove) {
    const score = evaluateBoard();
    if (Math.abs(score) > 5000 || depth === 0 || gameWon) {
        return score + depth;
    }

    const nextActiveBoard = (boardWinners[lastMove.cellIndex] !== null || isBoardFull(lastMove.cellIndex)) ? null : lastMove.cellIndex;
    const moves = getAvailableMoves(nextActiveBoard);

    if (isMaximizing) {
        let maxEval = -Infinity;
        for (const move of moves) {
            boards[move.boardIndex][move.cellIndex] = opponentSymbol;
            const oldWinner = boardWinners[move.boardIndex];
            if (checkSmallBoardWin(move.boardIndex, opponentSymbol)) {
                boardWinners[move.boardIndex] = opponentSymbol;
            }

            const evaluation = minimax(depth - 1, false, alpha, beta, move);

            boards[move.boardIndex][move.cellIndex] = '';
            boardWinners[move.boardIndex] = oldWinner;

            maxEval = Math.max(maxEval, evaluation);
            alpha = Math.max(alpha, evaluation);
            if (beta <= alpha) break;
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (const move of moves) {
            boards[move.boardIndex][move.cellIndex] = mySymbol;
            const oldWinner = boardWinners[move.boardIndex];
            if (checkSmallBoardWin(move.boardIndex, mySymbol)) {
                boardWinners[move.boardIndex] = mySymbol;
            }

            const evaluation = minimax(depth - 1, true, alpha, beta, move);

            boards[move.boardIndex][move.cellIndex] = '';
            boardWinners[move.boardIndex] = oldWinner;

            minEval = Math.min(minEval, evaluation);
            beta = Math.min(beta, evaluation);
            if (beta <= alpha) break;
        }
        return minEval;
    }
}

function evaluateBoard() {
    if (checkUltimateWin(opponentSymbol)) return 10000;
    if (checkUltimateWin(mySymbol)) return -10000;

    let totalScore = 0;
    totalScore += evaluateLine(boardWinners, opponentSymbol, mySymbol) * 150;

    for (let i = 0; i < 9; i++) {
        if (boardWinners[i] === null) {
            totalScore += evaluateSmallBoard(i);
        }
    }

    return totalScore;
}

function evaluateLine(board, p1, p2) {
    let score = 0;
    for (const pattern of winPatterns) {
        let p1_pieces = 0;
        let p2_pieces = 0;
        for (const index of pattern) {
            if (board[index] === p1) p1_pieces++;
            else if (board[index] === p2) p2_pieces++;
        }
        if (p1_pieces === 2 && p2_pieces === 0) score += 1;
        if (p2_pieces === 2 && p1_pieces === 0) score -= 1;
    }
    return score;
}

function evaluateSmallBoard(boardIndex) {
    let score = 0;
    const board = boards[boardIndex];

    score += evaluateLine(board, opponentSymbol, mySymbol) * 10;

    if(board[4] === opponentSymbol) score += 4;
    else if(board[4] === mySymbol) score -= 4;

    const corners = [0, 2, 6, 8];
    corners.forEach(corner => {
        if(board[corner] === opponentSymbol) score += 2;
        else if(board[corner] === mySymbol) score -= 2;
    });

    if (boardIndex === 4) {
        return score * 1.5;
    }

    return score;
}

// Game Logic Helpers
function getAvailableMoves(currentActiveBoard = activeBoard) {
    const moves = [];
    if (gameWon) return moves;

    if (currentActiveBoard !== null) {
        for (let cellIndex = 0; cellIndex < 9; cellIndex++) {
            if (!boards[currentActiveBoard][cellIndex]) {
                moves.push({ boardIndex: currentActiveBoard, cellIndex });
            }
        }
    } else {
        for (let boardIndex = 0; boardIndex < 9; boardIndex++) {
            if (boardWinners[boardIndex]) continue;
            for (let cellIndex = 0; cellIndex < 9; cellIndex++) {
                if (!boards[boardIndex][cellIndex]) {
                    moves.push({ boardIndex, cellIndex });
                }
            }
        }
    }
    return moves;
}

function checkSmallBoardWin(boardIndex, player) {
    const board = boards[boardIndex];
    return winPatterns.some(pattern =>
        pattern.every(index => board[index] === player)
    );
}

function checkUltimateWin(player) {
    return winPatterns.some(pattern =>
        pattern.every(index => boardWinners[index] === player)
    );
}

function isBoardFull(boardIndex) {
    return boards[boardIndex].every(cell => cell !== '');
}

function checkDraw() {
    for(let i = 0; i < 9; i++) {
        if (boardWinners[i] === null && !isBoardFull(i)) {
            return false;
        }
    }
    return !checkUltimateWin('X') && !checkUltimateWin('O');
}

// UI Updates
function updateActiveBoards() {
    document.querySelectorAll('.small-board').forEach((board, index) => {
        board.classList.remove('active');
        if (!boardWinners[index] && (activeBoard === null || activeBoard === index)) {
            board.classList.add('active');
        }
    });
}

function updateTurnIndicator() {
    if (gameMode === 'online') {
        const boardHint = document.getElementById('boardHint');
        if (isMyTurn) {
            boardHint.style.color = '#4ade80';
            if (activeBoard === null) {
                boardHint.textContent = '✅ Dein Zug! Wähle ein beliebiges freies Feld.';
            } else {
                const row = Math.floor(activeBoard / 3) + 1;
                const col = (activeBoard % 3) + 1;
                boardHint.textContent = `✅ Dein Zug! Spiele in Feld (${row}, ${col}).`;
            }
        } else {
            boardHint.style.color = '#fbbf24';
            boardHint.innerHTML = '⏳ Warte auf deinen Gegner...';
        }
    } else {
        updateBoardHint();
    }
}

function updateBoardHint() {
    const hint = document.getElementById('boardHint');
    if (gameWon) {
        hint.textContent = '';
        return;
    }

    if (gameMode === 'computer') {
        if (isMyTurn) {
            hint.style.color = '#4ade80';
            if (activeBoard === null) {
                hint.textContent = '✅ Dein Zug! Wähle ein beliebiges freies Feld.';
            } else {
                const row = Math.floor(activeBoard / 3) + 1;
                const col = (activeBoard % 3) + 1;
                hint.textContent = `✅ Dein Zug! Spiele in Feld (${row}, ${col}).`;
            }
        } else {
            hint.style.color = '#fbbf24';
            hint.innerHTML = '🤖 KI denkt nach<span class="thinking"></span>';
        }
    }
}

function disableSmallBoard(boardIndex) {
    for (let i = 0; i < 9; i++) {
        const cell = document.getElementById(`cell-${boardIndex}-${i}`);
        cell.disabled = true;
    }
}

function disableAllBoards() {
    for (let i = 0; i < 9; i++) {
        disableSmallBoard(i);
    }
    document.querySelectorAll('.small-board').forEach(b => b.classList.remove('active'));
}

// Game Control
function resetGame() {
    if (gameMode === 'online' && conn) {
        conn.send({ type: 'reset' });
    }

    currentPlayer = 'X';
    activeBoard = null;
    boards = Array(9).fill(null).map(() => Array(9).fill(''));
    boardWinners = Array(9).fill(null);
    gameWon = false;

    if (gameMode === 'computer') {
        mySymbol = 'X';
        opponentSymbol = 'O';
        isMyTurn = true;
    } else if (gameMode === 'online') {
        isMyTurn = mySymbol === 'X';
    }

    document.getElementById('currentPlayer').textContent = currentPlayer;
    document.getElementById('winnerMessage').textContent = '';

    initGame();
}

function backToMenu() {
    // Stoppe alle laufenden Prozesse
    stopHeartbeat();
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    if (peer) {
        peer.destroy();
        peer = null;
    }
    if (conn) {
        conn.close();
        conn = null;
    }

    // Lösche gespeicherten Zustand
    localStorage.removeItem('ultimateTTT_gameState');

    currentPlayer = 'X';
    activeBoard = null;
    boards = Array(9).fill(null).map(() => Array(9).fill(''));
    boardWinners = Array(9).fill(null);
    gameWon = false;
    isHost = false;
    mySymbol = '';
    opponentSymbol = '';
    isMyTurn = false;
    gameMode = '';
    reconnectAttempts = 0;
    gameStateBackup = null;
    peerIdBackup = null;

    document.getElementById('modeSelector').classList.remove('hidden');
    document.getElementById('connectionPanel').classList.add('hidden');
    document.getElementById('hostSection').classList.add('hidden');
    document.getElementById('joinSection').classList.add('hidden');
    document.getElementById('gameInfo').classList.add('hidden');
    document.getElementById('ultimateBoard').classList.remove('active');
    document.getElementById('gameButtons').classList.add('hidden');
    document.getElementById('winnerMessage').textContent = '';
    document.getElementById('connectionStatus').textContent = '';
    document.getElementById('connectionStatus').classList.remove('connected');
    document.getElementById('joinCode').value = '';
}

// Event Listeners
window.addEventListener('load', () => {
    // Initialisiere Netzwerk-Status
    updateNetworkStatus();

    // Prüfe ob ein Spiel wiederhergestellt werden kann
    if (restoreGameState()) {
        document.getElementById('modeSelector').classList.add('hidden');
        document.getElementById('gameInfo').classList.remove('hidden');
        document.getElementById('ultimateBoard').classList.add('active');
        document.getElementById('gameButtons').classList.remove('hidden');

        document.getElementById('playerSymbol').textContent = mySymbol;
        document.getElementById('playerSymbol').style.color = mySymbol === 'X' ? '#60a5fa' : '#f87171';
        document.getElementById('currentPlayer').textContent = currentPlayer;

        initGame();

        // Stelle Spielzustand visuell wieder her
        for (let boardIndex = 0; boardIndex < 9; boardIndex++) {
            for (let cellIndex = 0; cellIndex < 9; cellIndex++) {
                if (boards[boardIndex][cellIndex]) {
                    const cell = document.getElementById(`cell-${boardIndex}-${cellIndex}`);
                    cell.textContent = boards[boardIndex][cellIndex];
                    cell.classList.add(boards[boardIndex][cellIndex]);
                    cell.disabled = true;
                }
            }

            if (boardWinners[boardIndex]) {
                const smallBoard = document.getElementById(`board-${boardIndex}`);
                smallBoard.classList.add(`won-${boardWinners[boardIndex]}`);

                const winnerSymbol = document.createElement('div');
                winnerSymbol.className = 'board-winner';
                winnerSymbol.textContent = boardWinners[boardIndex];
                winnerSymbol.style.color = boardWinners[boardIndex] === 'X' ? '#60a5fa' : '#f87171';
                smallBoard.appendChild(winnerSymbol);
                disableSmallBoard(boardIndex);
            }
        }

        updateActiveBoards();

        // Zeige Nachricht dass Spiel wiederhergestellt wurde
        document.getElementById('boardHint').innerHTML = '🔄 Spiel wurde wiederhergestellt! <button onclick="attemptReconnect()" class="mini-button">Neu verbinden</button>';

        if (gameMode === 'computer' && !isMyTurn && !gameWon) {
            setTimeout(() => {
                makeComputerMove();
            }, 500);
        }
    }
});

// Speichere Zustand bevor die Seite verlassen wird
window.addEventListener('beforeunload', () => {
    if (gameMode === 'online' && !gameWon) {
        saveGameState();
    }
});

// Behandle Visibility-Changes (Tab-Wechsel, App-Minimierung)
document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameMode === 'online') {
        saveGameState();
    } else if (!document.hidden && gameMode === 'online' && conn && !conn.open) {
        // Versuche neu zu verbinden wenn Tab wieder aktiv
        attemptReconnect();
    }
});

// Online/Offline Events
window.addEventListener('online', () => {
    isOnline = true;
    updateNetworkStatus();

    // Sende alle offline gemachten Züge
    if (gameMode === 'online' && conn && conn.open && offlineMoves.length > 0) {
        offlineMoves.forEach(move => {
            conn.send(move);
        });
        offlineMoves = [];
    }

    // Versuche neu zu verbinden
    if (gameMode === 'online' && (!conn || !conn.open)) {
        attemptReconnect();
    }
});

window.addEventListener('offline', () => {
    isOnline = false;
    updateNetworkStatus();
});

// Verhindere Zoom auf iOS beim Doppeltippen
let lastTouchEnd = 0;
document.addEventListener('touchend', function (event) {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);

// Verhindere Pull-to-Refresh
document.body.addEventListener('touchmove', function(e) {
    if (e.target.closest('.ultimate-board')) {
        e.preventDefault();
    }
}, { passive: false });

// Service Worker für Offline-Funktionalität
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('data:text/javascript,' + encodeURIComponent(`
            self.addEventListener('install', event => {
                self.skipWaiting();
            });

            self.addEventListener('activate', event => {
                event.waitUntil(clients.claim());
            });

            self.addEventListener('fetch', event => {
                // Cache wichtige Ressourcen
                if (event.request.url.includes('peerjs')) {
                    event.respondWith(
                        caches.match(event.request).then(response => {
                            return response || fetch(event.request).then(fetchResponse => {
                                return caches.open('v1').then(cache => {
                                    cache.put(event.request, fetchResponse.clone());
                                    return fetchResponse;
                                });
                            });
                        })
                    );
                }
            });
        `)).catch(err => console.log('Service Worker registration failed:', err));
    });
}