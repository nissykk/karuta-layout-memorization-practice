// --- グローバル変数 ---
let allKarutaData = []; // 100枚すべての札データ (fetchで読み込む)
let teiichiData = {};   // ユーザーの定位置データ
let currentGameTimer = null; // 実行中のタイマー
let currentKaraFudaIds = []; // 現在の空札IDリスト
const TOTAL_ROWS = 3; // 3段

// --- DOM要素の取得 ---
const startButton = document.getElementById('startButton');
const jiJinField = document.getElementById('jiJin');
const tekiJinField = document.getElementById('tekiJin');
const karaFudaList = document.getElementById('karaFudaList');
const manualArea = document.getElementById('manualArea');
const temaeFudaArea = document.getElementById('temaeFuda');
const cardCountInput = document.getElementById('cardCount');
const jiJinModeSelect = document.getElementById('jiJinMode');

const timerSelect = document.getElementById('timerSelect');
const timerDisplay = document.getElementById('timerDisplay');
const toggleKaraFuda = document.getElementById('toggleKaraFuda');

// --- イベントリスナー ---
startButton.addEventListener('click', startGame);
toggleKaraFuda.addEventListener('click', toggleKaraFudaVisibility); 

// --- 初期化処理 ---
async function initialize() {
    // 1. 札データの読み込み (JSON分離版)
    try {
        const response = await fetch('karuta_data.json');
        allKarutaData = await response.json();
    } catch (e) {
        console.error("札データの読み込みに失敗:", e);
        alert("karuta_data.json の読み込みに失敗しました。\nGitHub PagesのURLが正しいか確認してください。");
        return; 
    }
    
    // 2. 定位置データの読み込み
    const savedTeiichi = localStorage.getItem('karutaTeiichi');
    if (savedTeiichi) {
        teiichiData = JSON.parse(savedTeiichi);
        console.log("定位置データを読み込みました:", teiichiData);
    } else {
        console.log("カスタム定位置データはありません。");
    }

    // 3. ドラッグ＆ドロップの基本設定
    setupDragDropListeners();
}

// --- メインの関数 ---

// 「段」と「左右グループ」を生成する関数
function createRows(fieldElement, prefix) {
    fieldElement.innerHTML = ''; // 中身をリセット
    for (let i = 0; i < TOTAL_ROWS; i++) {
        const row = document.createElement('div');
        row.className = 'row-slot'; 
        row.dataset.rowId = `${prefix}-${i}`; 
        
        const leftGroup = document.createElement('div');
        leftGroup.className = 'left-group';
        leftGroup.dataset.groupId = `${prefix}-${i}-left`;
        
        const rightGroup = document.createElement('div');
        rightGroup.className = 'right-group';
        rightGroup.dataset.groupId = `${prefix}-${i}-right`;
        
        row.appendChild(leftGroup);
        row.appendChild(rightGroup);
        fieldElement.appendChild(row);
    }
}

// 1. ゲーム開始
function startGame() {
    // 0. タイマーリセット
    if (currentGameTimer) {
        clearInterval(currentGameTimer);
    }
    const selectedMinutes = parseInt(timerSelect.value); 
    timerDisplay.textContent = `${selectedMinutes < 10 ? '0' : ''}${selectedMinutes}:00`;
    timerSelect.disabled = false; 
    
    // 1. フィールドをリセット
    temaeFudaArea.innerHTML = '';
    manualArea.classList.add('hidden'); 
    jiJinField.classList.remove('manual-setup'); 
    
    createRows(jiJinField, 'j');
    createRows(tekiJinField, 't');
    
    // 2. 設定を取得
    const totalCount = parseInt(cardCountInput.value);
    const jiJinMode = jiJinModeSelect.value;
    const playerCardCount = totalCount / 2; 
    
    const maxCardsPerSide = 25; 
    if (totalCount > (maxCardsPerSide * 2) || totalCount < 2 || totalCount % 2 !== 0) {
        alert(`札数は2～${maxCardsPerSide * 2} (50枚) の偶数を指定してください。`);
        return;
    }

    // 3. 札をシャッフルして選定
    const shuffledIds = allKarutaData.map(fuda => fuda.id).sort(() => 0.5 - Math.random());
    
    const baFudaIds = shuffledIds.slice(0, totalCount);     
    const karaFudaIds = shuffledIds.slice(totalCount);   
    currentKaraFudaIds = karaFudaIds; 
    
    const jiJinFudaIds = baFudaIds.slice(0, playerCardCount); 
    const tekiJinFudaIds = baFudaIds.slice(playerCardCount); 

    // 4. 空札リストを初期化 (非表示のまま中身を空にする)
    karaFudaList.innerHTML = '';
    karaFudaList.classList.add('hidden');
    
    const karaFudaHeader = document.querySelector('#toggleKaraFuda').parentElement;
    karaFudaHeader.firstChild.textContent = `空札 (${currentKaraFudaIds.length}枚) `;

    // 5. 相手陣を配置 (AIロジック)
    placeFudaInRows(tekiJinField, tekiJinFudaIds);
    
    // 6. 自陣の配置 (モード分岐)
    if (jiJinMode === 'auto') {
        placeFudaInRows(jiJinField, jiJinFudaIds);
        startTimer(selectedMinutes * 60); 
    } else {
        setupJiJinManual(jiJinFudaIds);
    }
}

// 2. 札を「段」の左右グループに配置する (AI / 自動配置)
function placeFudaInRows(fieldElement, fudaIds) {
    const rows = Array.from(fieldElement.querySelectorAll('.row-slot'));
    const groups = {
        topLeft: rows[0].querySelector('.left-group'),
        topRight: rows[0].querySelector('.right-group'),
        midLeft: rows[1].querySelector('.left-group'),
        midRight: rows[1].querySelector('.right-group'),
        bottomLeft: rows[2].querySelector('.left-group'),
        bottomRight: rows[2].querySelector('.right-group')
    };

    const oneCharIds = [87, 18, 57, 22, 70, 81, 77]; 
    const oyamaFudaIds = [31, 64, 15, 50, 76, 11]; 

    let fudaToPlace = fudaIds.map(id => allKarutaData.find(f => f.id === id)).sort(() => 0.5 - Math.random());

    // 1. 枚数バランス: 右側をわずかに多く (例: 25枚なら 左12, 右13)
    const rightCount = Math.ceil(fudaToPlace.length / 2);
    // const leftCount = fudaToPlace.length - rightCount; // 比較用

    let leftFudaCount = 0;
    let rightFudaCount = 0;

    // 2. セオリー札の振り分け
    const oneCharFuda = fudaToPlace.filter(f => oneCharIds.includes(f.id));
    const oyamaFuda = fudaToPlace.filter(f => oyamaFudaIds.includes(f.id));
    const otherFuda = fudaToPlace.filter(f => !oneCharIds.includes(f.id) && !oyamaFudaIds.includes(f.id));

    // 2a. 一字決まりは左右の下段に分散
    oneCharFuda.forEach((fuda, index) => {
        const fudaElement = createFudaElement(fuda);
        if (index % 2 === 0 && rightFudaCount < rightCount) {
            groups.bottomRight.appendChild(fudaElement);
            rightFudaCount++;
        } else {
            groups.bottomLeft.appendChild(fudaElement);
            leftFudaCount++;
        }
    });

    // 2b. 大山札は右側（利き手側）の中下段に
    oyamaFuda.forEach(fuda => {
        const fudaElement = createFudaElement(fuda);
        if (rightFudaCount < rightCount) {
            if (groups.bottomRight.children.length < 5) { 
                groups.bottomRight.appendChild(fudaElement);
            } else {
                groups.midRight.appendChild(fudaElement);
            }
            rightFudaCount++;
        } else { 
             groups.midLeft.appendChild(fudaElement);
             leftFudaCount++;
        }
    });

    // 2c. 残りの札を、残りの左右カウントに達するまで配置
    otherFuda.forEach(fuda => {
        const fudaElement = createFudaElement(fuda);
        if (rightFudaCount < rightCount) {
            // 右側に配置 (上段から埋める)
            if (groups.topRight.children.length < 5) groups.topRight.appendChild(fudaElement);
            else if (groups.midRight.children.length < 5) groups.midRight.appendChild(fudaElement);
            else groups.bottomRight.appendChild(fudaElement);
            rightFudaCount++;
        } else {
            // 左側に配置 (上段から埋める)
            if (groups.topLeft.children.length < 5) groups.topLeft.appendChild(fudaElement);
            else if (groups.midLeft.children.length < 5) groups.midLeft.appendChild(fudaElement);
            else groups.bottomLeft.appendChild(fudaElement);
            leftFudaCount++;
        }
    });
}


// 3b. 自陣の手動配置（準備）
function setupJiJinManual(fudaIds) {
    manualArea.classList.remove('hidden');
    temaeFudaArea.innerHTML = '';
    
    fudaIds.forEach(id => {
        const fuda = allKarutaData.find(f => f.id === id);
        const fudaElement = createFudaElement(fuda);
        temaeFudaArea.appendChild(fudaElement); 
    });

    jiJinField.classList.add('manual-setup');
}

// 4. ドラッグ＆ドロップのイベントリスナー設定 (手動配置用)
function setupDragDropListeners() {
    let draggedFuda = null;

    // ドラッグ開始
    document.body.addEventListener('dragstart', (e) => {
        // 相手陣(tekiJin)の札はドラッグ不可にする
        if (e.target.classList.contains('fuda') && !e.target.closest('#tekiJin')) {
            draggedFuda = e.target;
            setTimeout(() => e.target.classList.add('dragging'), 0);
        } else {
            e.preventDefault(); // 相手陣の札や他の要素のドラッグを禁止
        }
    });

    // ドラッグ終了
    document.body.addEventListener('dragend', (e) => {
        if (draggedFuda) {
            draggedFuda.classList.remove('dragging');
            draggedFuda = null;
        }
    });

    // --- ドロップエリア側のイベント ---
    document.body.addEventListener('dragover', (e) => {
        // ドロップ先（左右グループまたは手札エリア）を見つける
        const dropTarget = e.target.closest('.left-group, .right-group, #temaeFuda');
        
        if (draggedFuda && dropTarget) {
            // ドロップ先が自陣(jiJin) または 手札(temaeFuda) のみ許可
            if (dropTarget.closest('#jiJin') || dropTarget.id === 'temaeFuda') {
                e.preventDefault(); 
                if (!dropTarget.id) { // グループの場合
                    dropTarget.classList.add('drag-over');
                }
            }
        }
    });

    document.body.addEventListener('dragleave', (e) => {
        const dropTarget = e.target.closest('.left-group, .right-group');
        if (dropTarget) {
            dropTarget.classList.remove('drag-over');
        }
    });

    document.body.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!draggedFuda) return;

        const dropTarget = e.target.closest('.left-group, .right-group, #temaeFuda');
        
        if (dropTarget) {
            dropTarget.classList.remove('drag-over');
            
            if (dropTarget.id === 'temaeFuda') {
                // 手札エリアへのドロップ (末尾に追加)
                dropTarget.appendChild(draggedFuda);
            } else {
                // 陣地グループへのドロップ (挿入位置を計算)
                
                // マウス位置に最も近い「次の札」を見つける
                const afterElement = getDragAfterElement(dropTarget, e.clientX);
                
                if (afterElement == null) {
                    // 最も近い札がない = グループの末尾に追加
                    dropTarget.appendChild(draggedFuda);
                } else {
                    // 最も近い札の前に挿入
                    dropTarget.insertBefore(draggedFuda, afterElement);
                }
            }
        }

        // 手動配置モードが完了したかチェック (暗記中のD&Dでも呼ばれる)
        checkManualPlacementComplete();
    });

    // マウスX座標に基づいて、挿入すべき位置（の次の要素）を見つける関数
    function getDragAfterElement(container, x) {
        // コンテナ内のドラッグ可能でない要素（札）を取得
        const draggableElements = [...container.querySelectorAll('.fuda:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            // 札の中心X座標とマウスX座標の距離
            const offset = x - box.left - (box.width / 2);
            
            // マウスが札の中心より *左* にあり、かつこれまでで一番近い（offsetが負で最大）
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
}


// 4b. 手動配置完了チェック
function checkManualPlacementComplete() {
    // 手動配置モード中か確認
    if (manualArea.classList.contains('hidden')) {
        return; // 手動配置モードではない（=暗記中）なら何もしない
    }

    // 手札エリアが空になったら完了
    const fudaInTemate = temaeFudaArea.querySelectorAll('#temaeFuda .fuda').length;

    if (fudaInTemate === 0) {
        // 完了！
        manualArea.classList.add('hidden'); // 手札エリアを隠す
        jiJinField.classList.remove('manual-setup'); // ハイライト解除
        
        const selectedMinutes = parseInt(timerSelect.value); 
        startTimer(selectedMinutes * 60);
    }
}


// 5. タイマー開始
function startTimer(duration) {
    if (currentGameTimer) {
        clearInterval(currentGameTimer);
    }
    timerSelect.disabled = true; 

    let timer = duration;
    currentGameTimer = setInterval(() => {
        const minutes = Math.floor(timer / 60);
        const seconds = timer % 60;
        
        timerDisplay.textContent = `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
        
        if (--timer < 0) {
            clearInterval(currentGameTimer);
            timerDisplay.textContent = "暗記終了！";
            timerSelect.disabled = false; 
            enterPracticeMode(); // 暗記練習モードへ
        }
    }, 1000);
}

// 6. 暗記練習モード
function enterPracticeMode() {
    // 陣地にあるすべての札を取得
    const allBaFuda = document.querySelectorAll('#jiJin .fuda, #tekiJin .fuda');
    
    allBaFuda.forEach(fuda => {
        fuda.classList.add('back'); // 札を裏返す
        fuda.draggable = false; // ドラッグを最終的に無効化
        fuda.style.cursor = 'pointer'; 
        
        fuda.removeEventListener('click', toggleFudaBack);
        fuda.addEventListener('click', toggleFudaBack);
    });
}

// 札をトグルする関数
function toggleFudaBack(event) {
    event.currentTarget.classList.toggle('back');
}

// --- 空札表示用の関数 ---

// 空札の表示/非表示を切り替える
function toggleKaraFudaVisibility() {
    // このtoggle('hidden')だけで表示/非表示が切り替わります
    const isNowHidden = karaFudaList.classList.toggle('hidden');
    
    // もし「表示」状態になり、かつ中身が空の場合のみ、札を生成する
    if (!isNowHidden && karaFudaList.innerHTML === '') {
        if (currentKaraFudaIds.length > 0) {
            displayKaraFuda(currentKaraFudaIds);
        } else {
            karaFudaList.innerHTML = '<p>まだ試合が開始されていません。</p>';
        }
    }
}

// 空札を表示（番号順の札画像）
function displayKaraFuda(fudaIds) {
    karaFudaList.innerHTML = ''; // 中身をクリア
    
    // h3の見出しを更新 (枚数表示)
    const karaFudaHeader = document.querySelector('#toggleKaraFuda').parentElement;
    karaFudaHeader.firstChild.textContent = `空札 (${fudaIds.length}枚) `; 

    // 該当する札データをID順にソート
    const karaFudaData = fudaIds
        .map(id => allKarutaData.find(fuda => fuda.id === id))
        .filter(fuda => fuda) 
        .sort((a, b) => a.id - b.id); // ID順に並べ替え

    karaFudaData.forEach(fuda => {
        const fudaElement = createFudaElement(fuda);
        fudaElement.style.transform = 'none'; // 逆さま防止
        fudaElement.draggable = false;
        fudaElement.style.cursor = 'default';
        karaFudaList.appendChild(fudaElement);
    });
}


// --- ユーティリティ関数 ---

// 札のHTML要素を作成
function createFudaElement(fuda) {
    const div = document.createElement('div');
    div.className = 'fuda';
    div.style.backgroundImage = `url('${fuda.image_path}')`;
    div.dataset.id = fuda.id; 
    div.draggable = true; // デフォルトでドラッグ可能に
    
    div.title = `[${fuda.id}] ${fuda.kami}\n${fuda.shimo}`;
    
    return div;
}

// --- 起動 ---
initialize();